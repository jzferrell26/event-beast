begin;

-- Composite placement FK prevents a later session edit from moving an ad to
-- a different day accidentally. It also rejects cross-event references.
alter table public.agenda_sessions add constraint agenda_session_day_unique unique(event_id, day_id, id);
alter table public.agenda_sponsor_placements add constraint placement_session_same_day
  foreign key (event_id, day_id, after_session_id) references public.agenda_sessions(event_id, day_id, id);

create function public.update_attendee_access(p_event uuid, p_attendee uuid, p_name text, p_email text, p_status text, p_directory_allowed boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_attendee public.attendees;
begin
  if not public.is_event_admin(p_event) then raise exception 'Organizer access required' using errcode = '42501'; end if;
  select * into v_attendee from public.attendees where event_id = p_event and id = p_attendee for update;
  if not found then raise exception 'This attendee is unavailable' using errcode = '22023'; end if;
  if v_attendee.user_id is not null and lower(btrim(p_email)) <> v_attendee.registration_email then
    raise exception 'A linked registration email cannot be reassigned. The attendee must change their verified login email through account support.' using errcode = '22023';
  end if;
  update public.attendees set registration_name = btrim(p_name), registration_email = lower(btrim(p_email)), status = p_status,
    directory_allowed = p_directory_allowed, updated_at = now() where event_id = p_event and id = p_attendee;
end $$;
revoke all on function public.update_attendee_access(uuid, uuid, text, text, text, boolean) from public;
grant execute on function public.update_attendee_access(uuid, uuid, text, text, text, boolean) to authenticated;

-- Serialize privacy changes against sends. Membership already has shared row
-- locks in send_message; profile consent also receives a shared lock here.
create function public.message_consent_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_a uuid; v_b uuid;
begin
  select attendee_a, attendee_b into v_a, v_b from public.conversations where event_id = new.event_id and id = new.conversation_id;
  perform 1 from public.attendee_profiles where event_id = new.event_id and attendee_id in (v_a, v_b) order by attendee_id for share;
  if (select count(*) from public.attendee_profiles where event_id = new.event_id and attendee_id in (v_a, v_b) and messaging_available) <> 2 then
    raise exception 'Messaging is unavailable for this attendee' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.message_consent_guard() from public;
create trigger enforce_message_consent before insert on public.messages for each row execute function public.message_consent_guard();

commit;
