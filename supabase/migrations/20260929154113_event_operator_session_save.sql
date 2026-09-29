begin;

-- The operator form commits session content and its existing speaker links as
-- one unit. No new content store, role bypass, or public-guide field is needed.
create function public.admin_save_agenda_session(
  p_event uuid, p_session uuid, p_values jsonb, p_speaker_ids uuid[]
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid;
  v_values public.agenda_sessions;
  v_fields text[] := array['day_id','title','description','starts_at','ends_at','room','session_type','sponsor_id','published','is_demo'];
begin
  if auth.uid() is null or not public.is_event_admin(p_event) then
    raise exception 'Organizer access is required' using errcode = '42501';
  end if;
  if p_values is null or jsonb_typeof(p_values) <> 'object' then
    raise exception 'Provide the session fields' using errcode = '22023';
  end if;
  if not (p_values ?& v_fields) or exists (
    select 1 from jsonb_object_keys(p_values) as field(key) where not (key = any(v_fields))
  ) then
    raise exception 'Provide only the editable session fields' using errcode = '22023';
  end if;
  if p_speaker_ids is null or cardinality(p_speaker_ids) > 100 or array_ndims(p_speaker_ids) > 1 then
    raise exception 'Choose up to 100 speakers from this event' using errcode = '22023';
  end if;
  if array_position(p_speaker_ids, null) is not null then
    raise exception 'Choose valid speakers from this event' using errcode = '22023';
  end if;
  select * into v_values from jsonb_populate_record(null::public.agenda_sessions, p_values);
  if v_values.day_id is null or v_values.title is null or char_length(btrim(v_values.title)) not between 1 and 160
    or v_values.description is null or char_length(v_values.description) > 5000
    or v_values.room is null or char_length(v_values.room) > 160
    or v_values.starts_at is null or v_values.ends_at is null
    or v_values.session_type is null or v_values.session_type not in ('Keynote','Workshop','Panel','Networking','Break','Session')
    or jsonb_typeof(p_values->'published') is distinct from 'boolean'
    or jsonb_typeof(p_values->'is_demo') is distinct from 'boolean' then
    raise exception 'Provide valid session fields' using errcode = '22023';
  end if;
  if v_values.ends_at <= v_values.starts_at then
    raise exception 'End time must be after start time' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(p_speaker_ids) as selected(id)
    where not exists (select 1 from public.speakers s where s.event_id = p_event and s.id = selected.id)
  ) then
    raise exception 'A selected speaker is no longer available in this event. Refresh the session and try again.' using errcode = '22023';
  end if;

  if p_session is not null then
    -- Serialize operator saves on the same parent row. Existing RLS, composite
    -- foreign keys, organizer audit and review-reopen triggers remain active.
    select id into v_id from public.agenda_sessions where event_id = p_event and id = p_session for update;
    if not found then
      raise exception 'This session is no longer available in this event. Refresh the section and try again.' using errcode = '22023';
    end if;
    update public.agenda_sessions set day_id = v_values.day_id, title = btrim(v_values.title),
      description = v_values.description, starts_at = v_values.starts_at, ends_at = v_values.ends_at,
      room = v_values.room, session_type = v_values.session_type, sponsor_id = v_values.sponsor_id,
      published = v_values.published, is_demo = v_values.is_demo
      where event_id = p_event and id = v_id;
  else
    insert into public.agenda_sessions(event_id,day_id,title,description,starts_at,ends_at,room,session_type,sponsor_id,published,is_demo)
      values (p_event,v_values.day_id,btrim(v_values.title),v_values.description,v_values.starts_at,v_values.ends_at,
        v_values.room,v_values.session_type,v_values.sponsor_id,v_values.published,v_values.is_demo)
      returning id into v_id;
  end if;

  delete from public.session_speakers where event_id = p_event and session_id = v_id and not (speaker_id = any(p_speaker_ids));
  insert into public.session_speakers(event_id,session_id,speaker_id)
    select p_event,v_id,id from (select distinct unnest(p_speaker_ids) as id) selected
    on conflict (event_id,session_id,speaker_id) do nothing;
  return v_id;
end $$;

-- Also revoke explicit hosted default grants, not only the PUBLIC grant.
revoke all on function public.admin_save_agenda_session(uuid,uuid,jsonb,uuid[]) from public, anon, authenticated;
grant execute on function public.admin_save_agenda_session(uuid,uuid,jsonb,uuid[]) to authenticated;

commit;
