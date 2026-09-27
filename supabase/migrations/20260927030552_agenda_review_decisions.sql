begin;

-- Keep the original source question. Organizer decisions are separate,
-- versioned, private and audited; publication alone never approves a question.
alter table public.agenda_import_notes
  add column review_status text not null default 'pending'
    check (review_status in ('pending', 'confirmed', 'excluded')),
  add column resolution_notes text not null default ''
    check (char_length(resolution_notes) <= 2000),
  add column review_version integer not null default 0,
  add column reviewed_at timestamptz,
  add column reviewed_by uuid references auth.users(id) on delete set null;

revoke update on public.agenda_import_notes from authenticated;

create function public.record_agenda_review(
  p_event uuid, p_session uuid, p_status text, p_notes text, p_expected_version integer
) returns public.agenda_import_notes
language plpgsql security definer set search_path = '' as $$
declare v_session public.agenda_sessions; v_review public.agenda_import_notes; v_previous text;
begin
  if auth.uid() is null or not public.is_event_admin(p_event) then
    raise exception 'Organizer access is required' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('pending', 'confirmed', 'excluded')
    or p_notes is null or char_length(btrim(p_notes)) > 2000
    or (p_status <> 'pending' and char_length(btrim(p_notes)) < 3) then
    raise exception 'Choose a review decision and describe the organizer confirmation' using errcode = '22023';
  end if;
  -- Lock in the same order as content updates and their review-reopen trigger.
  select * into v_session from public.agenda_sessions
    where event_id = p_event and id = p_session for update;
  if not found then raise exception 'Session not found in this event' using errcode = '22023'; end if;
  select * into v_review from public.agenda_import_notes
    where event_id = p_event and session_id = p_session and btrim(issue) <> '' for update;
  if not found then raise exception 'There is no source question to review for this session' using errcode = '22023'; end if;
  if p_expected_version is distinct from v_review.review_version then
    raise exception 'This review changed. Refresh before recording a decision' using errcode = '40001';
  end if;
  if p_status = 'confirmed' and not v_session.published then
    raise exception 'Correct and publish the session before confirming it for attendees' using errcode = '22023';
  end if;
  if p_status = 'excluded' and v_session.published then
    raise exception 'Unpublish the session before recording that it is excluded' using errcode = '22023';
  end if;
  v_previous := v_review.review_status;
  update public.agenda_import_notes set review_status = p_status, resolution_notes = btrim(p_notes),
    review_version = review_version + 1,
    reviewed_at = case when p_status = 'pending' then null else now() end,
    reviewed_by = case when p_status = 'pending' then null else auth.uid() end
    where event_id = p_event and session_id = p_session returning * into v_review;
  insert into public.audit_log(event_id, actor_user_id, action, entity_id, details)
    values (p_event, auth.uid(), 'agenda_review.record', p_session::text,
      jsonb_build_object('previous_status', v_previous, 'status', p_status,
        'resolution', btrim(p_notes), 'version', v_review.review_version));
  return v_review;
end $$;
revoke all on function public.record_agenda_review(uuid,uuid,text,text,integer) from public, anon, authenticated;
grant execute on function public.record_agenda_review(uuid,uuid,text,text,integer) to authenticated;

-- A previously approved or excluded session must be reviewed again when its
-- attendee-facing content changes. The audit log retains the old decision.
create function public.reopen_agenda_review()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_review public.agenda_import_notes;
begin
  if row(new.day_id,new.title,new.description,new.starts_at,new.ends_at,new.room,new.session_type,new.sponsor_id,new.published)
    is distinct from row(old.day_id,old.title,old.description,old.starts_at,old.ends_at,old.room,old.session_type,old.sponsor_id,old.published) then
    select * into v_review from public.agenda_import_notes where event_id = new.event_id
      and session_id = new.id and review_status <> 'pending' and btrim(issue) <> '' for update;
    if found then
      update public.agenda_import_notes set review_status = 'pending', review_version = review_version + 1,
        reviewed_at = null, reviewed_by = null where event_id = new.event_id and session_id = new.id;
      insert into public.audit_log(event_id, actor_user_id, action, entity_id, details)
        values (new.event_id, auth.uid(), 'agenda_review.reopened', new.id::text,
          jsonb_build_object('previous_status', v_review.review_status,
            'previous_resolution', v_review.resolution_notes, 'reason', 'Session content changed'));
    end if;
  end if;
  return new;
end $$;
revoke all on function public.reopen_agenda_review() from public, anon, authenticated;
create trigger reopen_agenda_review after update on public.agenda_sessions
  for each row execute function public.reopen_agenda_review();

commit;
