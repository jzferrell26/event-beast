begin;

alter table public.event_settings
  add column self_service_access_enabled boolean not null default false;

-- Momentum Builder LIVE uses the event link itself as the attendee access gate.
-- Verified emails may join as Members even when the organizer has not preloaded
-- that exact email. Explicitly disabled registrations remain blocked, and
-- non-Member roles can still only be assigned by an organizer.
update public.event_settings s
set self_service_access_enabled = true
from public.events e
where e.id = s.event_id
  and e.slug = 'momentum-builder-live-2026';

create or replace function public.claim_attendee(p_event uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_email text;
  v_name text;
  v_open boolean := false;
  v_attendee public.attendees;
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select lower(email),
         left(split_part(lower(email), '@', 1), 120)
    into v_email, v_name
  from auth.users
  where id = v_user and email_confirmed_at is not null;
  if v_email is null then raise exception 'Verify your email before claiming event access' using errcode = '42501'; end if;

  select coalesce(s.self_service_access_enabled, false)
    into v_open
  from public.event_settings s
  join public.events e on e.id = s.event_id
  where s.event_id = p_event and e.published and e.public_guide;
  v_open := coalesce(v_open, false);

  -- Preserve an already-linked row even if the user's verified email later changed.
  select * into v_attendee
  from public.attendees
  where event_id = p_event and user_id = v_user
  for update;

  if found then
    if v_attendee.status = 'disabled' then return null; end if;
    if v_attendee.status <> 'approved' then
      if not v_open or v_attendee.access_role <> 'member' then return null; end if;
      update public.attendees
      set status = 'approved', updated_at = now()
      where id = v_attendee.id
      returning * into v_attendee;
    end if;
  else
    select * into v_attendee
    from public.attendees
    where event_id = p_event and registration_email = v_email
    for update;

    if found then
      if v_attendee.status = 'disabled' or (v_attendee.user_id is not null and v_attendee.user_id <> v_user) then return null; end if;
      if v_attendee.status <> 'approved' then
        if not v_open or v_attendee.access_role <> 'member' then return null; end if;
      end if;
      update public.attendees
      set user_id = v_user,
          status = case when status = 'pending' and access_role = 'member' and v_open then 'approved' else status end,
          updated_at = now()
      where id = v_attendee.id
      returning * into v_attendee;
      if v_attendee.status <> 'approved' then return null; end if;
    else
      if not v_open then return null; end if;
      insert into public.attendees(event_id, user_id, registration_email, registration_name, status, access_role, directory_allowed)
      values (p_event, v_user, v_email, v_name, 'approved', 'member', true)
      returning * into v_attendee;
    end if;
  end if;

  insert into public.attendee_profiles(event_id, attendee_id, full_name)
    values (p_event, v_attendee.id, v_attendee.registration_name)
    on conflict(attendee_id) do nothing;
  insert into public.attendee_preferences(event_id, attendee_id)
    values (p_event, v_attendee.id)
    on conflict do nothing;
  return v_attendee.id;
end $$;

commit;
