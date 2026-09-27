begin;

-- Contact information is never part of an attendee directory row. Preserve
-- earlier optional contact values in an Admin-only table before removing them.
create table public.attendee_contacts (
  event_id uuid not null,
  attendee_id uuid not null,
  contact_email text not null default '' check (char_length(contact_email) <= 254),
  phone text not null default '' check (char_length(phone) <= 40),
  website text not null default '' check (website = '' or website ~ '^https://'),
  updated_at timestamptz not null default now(),
  primary key (event_id, attendee_id),
  foreign key (event_id, attendee_id) references public.attendees(event_id, id) on delete cascade
);
alter table public.attendee_contacts enable row level security;
revoke all on public.attendee_contacts from anon, authenticated;
grant select, insert, update, delete on public.attendee_contacts to authenticated;
create policy admin_contacts on public.attendee_contacts for all to authenticated
  using (public.is_event_admin(event_id)) with check (public.is_event_admin(event_id));

insert into public.attendee_contacts(event_id, attendee_id, contact_email, phone, website)
  select event_id, attendee_id, public_email, public_phone, website
  from public.attendee_profiles where public_email <> '' or public_phone <> '' or website <> '';
alter table public.attendee_profiles drop column public_email;
alter table public.attendee_profiles drop column public_phone;
alter table public.attendee_profiles drop column website;

create function public.stamp_contact_update()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
revoke all on function public.stamp_contact_update() from public, anon, authenticated;
create trigger stamp_contacts before update on public.attendee_contacts
  for each row execute function public.stamp_contact_update();
create trigger contact_audit after insert or update or delete on public.attendee_contacts
  for each row execute function public.record_organizer_audit();

-- Retain the validated, transactional registration importer and enrich only
-- Admin-private contact records when an optional phone column is supplied.
alter function public.import_attendees(uuid,jsonb) rename to import_attendee_registrations;
revoke all on function public.import_attendee_registrations(uuid,jsonb) from public, anon, authenticated;
create function public.import_attendees(p_event uuid, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_result jsonb; r jsonb; v_attendee uuid;
begin
  if not public.is_event_admin(p_event) then raise exception 'Organizer access required' using errcode = '42501'; end if;
  v_result := public.import_attendee_registrations(p_event, p_rows);
  for r in select value from jsonb_array_elements(p_rows) loop
    if r ? 'phone' then
      if jsonb_typeof(r->'phone') <> 'string' or char_length(r->>'phone') > 40 then
        raise exception 'Phone must be text with at most 40 characters' using errcode = '22023';
      end if;
      select id into v_attendee from public.attendees where event_id = p_event and registration_email = lower(btrim(r->>'email'));
      insert into public.attendee_contacts(event_id, attendee_id, phone)
        values (p_event, v_attendee, btrim(r->>'phone'))
        on conflict(event_id, attendee_id) do update set phone = excluded.phone;
    end if;
  end loop;
  return v_result;
end $$;
revoke all on function public.import_attendees(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.import_attendees(uuid,jsonb) to authenticated;

commit;
