begin;
alter table public.event_settings add column agenda_notice text not null default '' check (char_length(agenda_notice) <= 500);
alter table public.speakers add column source_url text not null default '' check (source_url = '' or source_url ~ '^https://');

create table public.agenda_import_notes (
  event_id uuid not null,
  session_id uuid not null,
  source_sheet text not null,
  source_row integer not null check (source_row > 0),
  issue text not null default '',
  imported_at timestamptz not null default now(),
  primary key(event_id, session_id),
  foreign key(event_id, session_id) references public.agenda_sessions(event_id, id) on delete cascade
);
alter table public.agenda_import_notes enable row level security;
revoke all on public.agenda_import_notes from public, anon, authenticated;
grant select, update on public.agenda_import_notes to authenticated;
create policy admin_import_notes on public.agenda_import_notes for all to authenticated
  using (public.is_event_admin(event_id)) with check (public.is_event_admin(event_id));

-- A verified attendee whose email was not pre-imported can request review.
-- This never approves registration, publishes a profile, or assigns privileges.
create function public.request_event_access(p_slug text, p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_email text; v_user uuid := auth.uid(); v_event uuid; v_attendee public.attendees;
begin
  select lower(email) into v_email from auth.users where id = v_user and email_confirmed_at is not null;
  if v_email is null then raise exception 'Verify your email before requesting event access' using errcode = '42501'; end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 120 then
    raise exception 'Enter your name' using errcode = '22023';
  end if;
  select id into v_event from public.events where slug = p_slug and published and public_guide;
  if v_event is null then raise exception 'This event is not open for access requests' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('access-request:' || v_event::text || ':' || v_email, 0));
  select * into v_attendee from public.attendees where event_id = v_event and registration_email = v_email for update;
  if found then
    if v_attendee.status = 'disabled' or (v_attendee.user_id is not null and v_attendee.user_id <> v_user) then
      raise exception 'Contact the event team for help with this registration' using errcode = '42501';
    end if;
    if v_attendee.status = 'approved' then return public.claim_attendee(v_event); end if;
    update public.attendees set user_id = v_user where id = v_attendee.id;
  else
    insert into public.attendees(event_id, user_id, registration_name, registration_email, status, access_role)
      values(v_event, v_user, btrim(p_name), v_email, 'pending', 'member') returning * into v_attendee;
  end if;
  insert into public.attendee_profiles(event_id, attendee_id, full_name)
    values(v_event, v_attendee.id, v_attendee.registration_name) on conflict(attendee_id) do nothing;
  insert into public.attendee_preferences(event_id, attendee_id) values(v_event, v_attendee.id) on conflict do nothing;
  return v_attendee.id;
end $$;
revoke all on function public.request_event_access(text,text) from public, anon, authenticated;
grant execute on function public.request_event_access(text,text) to authenticated;
commit;
