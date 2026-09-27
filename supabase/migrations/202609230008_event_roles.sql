begin;

-- Roles are attached to the private registration. Email verification/claim
-- remains the only way to bind that registration to an authentication account.
alter table public.attendees add column access_role text not null default 'member'
  check (access_role in ('admin', 'sponsor', 'member'));
alter table public.attendees add column access_version integer not null default 0;

create table public.sponsor_editors (
  event_id uuid not null,
  sponsor_id uuid not null,
  attendee_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (event_id, sponsor_id, attendee_id),
  foreign key (event_id, sponsor_id) references public.sponsors(event_id, id) on delete cascade,
  foreign key (event_id, attendee_id) references public.attendees(event_id, id) on delete cascade
);
create index sponsor_editors_attendee_idx on public.sponsor_editors(event_id, attendee_id);
alter table public.sponsor_editors enable row level security;

create or replace function public.is_event_admin(p_event uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.attendees a where a.event_id = p_event and a.user_id = auth.uid()
      and a.status = 'approved' and a.access_role = 'admin'
  ) or exists (
    select 1 from public.event_admins a where a.event_id = p_event and a.user_id = auth.uid()
      and not exists (select 1 from public.attendees r where r.event_id = a.event_id
        and r.user_id = a.user_id and r.status <> 'approved')
  );
$$;

create function public.active_event_admin_count(p_event uuid)
returns bigint language sql stable security definer set search_path = '' as $$
  select count(*) from (
    select a.user_id from public.attendees a where a.event_id = p_event
      and a.user_id is not null and a.status = 'approved' and a.access_role = 'admin'
    union
    select a.user_id from public.event_admins a where a.event_id = p_event
      and not exists (select 1 from public.attendees r where r.event_id = a.event_id
        and r.user_id = a.user_id and r.status <> 'approved')
  ) admins;
$$;

create function public.can_edit_sponsor(p_event uuid, p_sponsor uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_event_admin(p_event) or exists (
    select 1 from public.sponsor_editors e join public.attendees a
      on a.event_id = e.event_id and a.id = e.attendee_id
    where e.event_id = p_event and e.sponsor_id = p_sponsor
      and a.user_id = auth.uid() and a.status = 'approved' and a.access_role = 'sponsor'
  );
$$;

create policy assigned_editor_read on public.sponsor_editors for select to authenticated
  using (public.is_event_admin(event_id) or attendee_id = public.current_attendee(event_id));
create policy sponsor_editor_draft_read on public.sponsors for select to authenticated
  using (public.can_edit_sponsor(event_id, id));
revoke all on public.sponsor_editors from anon, authenticated;
grant select on public.sponsor_editors to authenticated;
-- No direct grants for role/assignment changes or sponsor-editor table writes.

create function public.guard_attendee_access_version()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_was_admin boolean; v_still_admin boolean;
begin
  if row(new.access_role, new.status, new.registration_name, new.registration_email, new.directory_allowed, new.user_id)
      is distinct from row(old.access_role, old.status, old.registration_name, old.registration_email, old.directory_allowed, old.user_id) then
    perform pg_advisory_xact_lock(hashtextextended('event-access:' || old.event_id::text, 0));
    v_was_admin := old.user_id is not null and old.status = 'approved' and (
      old.access_role = 'admin' or exists (select 1 from public.event_admins where event_id = old.event_id and user_id = old.user_id));
    v_still_admin := new.user_id is not null and new.status = 'approved' and (
      new.access_role = 'admin' or exists (select 1 from public.event_admins where event_id = old.event_id and user_id = new.user_id));
    if v_was_admin and not v_still_admin and public.active_event_admin_count(old.event_id) <= 1 then
      raise exception 'Keep at least one active, signed-in admin for this event' using errcode = '22023';
    end if;
    new.access_version := old.access_version + 1;
    new.updated_at := now();
  end if;
  return new;
end $$;
create trigger attendee_access_version before update on public.attendees
  for each row execute function public.guard_attendee_access_version();
-- Access is disabled with an audited update. A direct delete must not bypass
-- last-admin protection or erase registration/permission history.
revoke delete on public.attendees from authenticated;

create function public.admin_save_event_user(
  p_event uuid, p_id uuid, p_name text, p_email text, p_role text, p_status text,
  p_directory_allowed boolean, p_sponsors uuid[], p_expected_version integer
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_attendee public.attendees; v_sponsor uuid; v_old_admin boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended('event-access:' || p_event::text, 0));
  if not public.is_event_admin(p_event) then raise exception 'Admin access required' using errcode = '42501'; end if;
  if p_role is null or p_role not in ('admin','sponsor','member') or p_status is null or p_status not in ('approved','pending','disabled') then
    raise exception 'Choose a valid role and access status' using errcode = '22023';
  end if;
  if p_sponsors is null or cardinality(p_sponsors) > 20 or array_position(p_sponsors, null) is not null
    or (p_role = 'sponsor' and cardinality(p_sponsors) = 0)
    or (p_role <> 'sponsor' and cardinality(p_sponsors) <> 0) then
    raise exception 'Assign one or more sponsor pages only for the Sponsor role' using errcode = '22023';
  end if;
  if (select count(distinct x) from unnest(p_sponsors) x) <> cardinality(p_sponsors) then
    raise exception 'Sponsor page assignments must be unique' using errcode = '22023';
  end if;
  foreach v_sponsor in array p_sponsors loop
    if not exists (select 1 from public.sponsors where event_id = p_event and id = v_sponsor) then
      raise exception 'Sponsor page does not belong to this event' using errcode = '22023';
    end if;
  end loop;
  if p_id is null then
    insert into public.attendees(event_id, registration_name, registration_email, status, directory_allowed, access_role)
      values (p_event, btrim(p_name), lower(btrim(p_email)), p_status, p_directory_allowed, p_role) returning * into v_attendee;
  else
    select * into v_attendee from public.attendees where event_id = p_event and id = p_id for update;
    if not found then raise exception 'This event user is unavailable' using errcode = '22023'; end if;
    if p_expected_version is distinct from v_attendee.access_version then
      raise exception 'This user was updated by another admin. Reload before saving' using errcode = '40001';
    end if;
    if v_attendee.user_id is not null and lower(btrim(p_email)) is distinct from v_attendee.registration_email then
      raise exception 'A verified account email cannot be reassigned here' using errcode = '22023';
    end if;
    v_old_admin := v_attendee.user_id is not null and v_attendee.status = 'approved' and (
      v_attendee.access_role = 'admin' or exists (select 1 from public.event_admins where event_id = p_event and user_id = v_attendee.user_id));
    if v_old_admin and (p_role <> 'admin' or p_status <> 'approved') and public.active_event_admin_count(p_event) <= 1 then
      raise exception 'Keep at least one active, signed-in admin for this event' using errcode = '22023';
    end if;
    if p_role <> 'admin' and v_attendee.user_id is not null then
      delete from public.event_admins where event_id = p_event and user_id = v_attendee.user_id;
    end if;
    update public.attendees set registration_name = btrim(p_name), registration_email = lower(btrim(p_email)),
      status = p_status, directory_allowed = p_directory_allowed, access_role = p_role,
      access_version = access_version + 1, updated_at = now()
      where event_id = p_event and id = p_id returning * into v_attendee;
  end if;
  delete from public.sponsor_editors where event_id = p_event and attendee_id = v_attendee.id;
  insert into public.sponsor_editors(event_id, sponsor_id, attendee_id)
    select p_event, x, v_attendee.id from unnest(p_sponsors) x;
  insert into public.audit_log(event_id, actor_user_id, action, entity_id, details)
    values (p_event, auth.uid(), 'event_user.permissions', v_attendee.id::text,
      jsonb_build_object('role', p_role, 'status', p_status, 'sponsor_ids', p_sponsors));
  return v_attendee.id;
end $$;

alter table public.sponsors add column content_version integer not null default 0;
alter table public.sponsors add column updated_at timestamptz not null default now();
create function public.bump_sponsor_version()
returns trigger language plpgsql set search_path = '' as $$
begin new.content_version := old.content_version + 1; new.updated_at := now(); return new; end $$;
create trigger sponsor_content_version before update on public.sponsors for each row execute function public.bump_sponsor_version();

create function public.save_sponsor_page(p_event uuid, p_sponsor uuid, p_expected_version integer, p_values jsonb)
returns public.sponsors language plpgsql security definer set search_path = '' as $$
declare v_sponsor public.sponsors;
begin
  perform pg_advisory_xact_lock(hashtextextended('event-access:' || p_event::text, 0));
  if not public.can_edit_sponsor(p_event, p_sponsor) then raise exception 'You do not have access to edit this sponsor page' using errcode = '42501'; end if;
  if p_values is null or jsonb_typeof(p_values) <> 'object' or (p_values - array['name','description','logo_url','booth','cta_label','cta_url']) <> '{}'::jsonb
    or not (p_values ?& array['name','description','logo_url','booth','cta_label','cta_url']) then
    raise exception 'Only sponsor page content can be updated here' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_each(p_values) x where jsonb_typeof(x.value) <> 'string') then
    raise exception 'Sponsor page fields must be text' using errcode = '22023';
  end if;
  if char_length(p_values->>'booth') > 240 or char_length(p_values->>'cta_label') > 80 or char_length(p_values->>'logo_url') > 2048 or char_length(p_values->>'cta_url') > 2048 then
    raise exception 'Sponsor page field is too long' using errcode = '22023';
  end if;
  select * into v_sponsor from public.sponsors where event_id = p_event and id = p_sponsor for update;
  if not found then raise exception 'Sponsor page not found' using errcode = '22023'; end if;
  if p_expected_version is distinct from v_sponsor.content_version then
    raise exception 'This sponsor page has changed. Reload before saving your update' using errcode = '40001';
  end if;
  update public.sponsors set name = btrim(p_values->>'name'), description = btrim(p_values->>'description'),
    logo_url = btrim(p_values->>'logo_url'), booth = btrim(p_values->>'booth'), cta_label = btrim(p_values->>'cta_label'),
    cta_url = btrim(p_values->>'cta_url') where event_id = p_event and id = p_sponsor returning * into v_sponsor;
  return v_sponsor;
end $$;

create function public.can_write_sponsor_asset(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select split_part(p_path, '/', 2) = 'sponsors' and split_part(p_path, '/', 4) <> '' and split_part(p_path, '/', 5) = ''
    and exists (select 1 from public.sponsors s where s.event_id::text = split_part(p_path, '/', 1)
      and s.id::text = split_part(p_path, '/', 3) and public.can_edit_sponsor(s.event_id, s.id));
$$;
create policy sponsor_asset_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'event-assets' and public.can_write_sponsor_asset(name));
create policy sponsor_asset_delete on storage.objects for delete to authenticated
  using (bucket_id = 'event-assets' and public.can_write_sponsor_asset(name));

-- Sponsors can prepare their assigned pages before the event is published.
-- The only information returned is the eligible event ID after verified claim.
create function public.claim_event_access(p_slug text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_event uuid; v_email text; v_claim uuid;
begin
  select lower(email) into v_email from auth.users where id = auth.uid() and email_confirmed_at is not null;
  if v_email is null then return null; end if;
  select id into v_event from public.events where slug = p_slug;
  if v_event is null then return null; end if;
  if public.is_event_admin(v_event) then return v_event; end if;
  v_claim := public.claim_attendee(v_event);
  return case when v_claim is not null then v_event else null end;
end $$;

create function public.claim_admin_attendee(p_event uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_email text;
begin
  if not public.is_event_admin(p_event) then raise exception 'Admin access required' using errcode = '42501'; end if;
  select lower(email) into v_email from auth.users where id = auth.uid() and email_confirmed_at is not null;
  if v_email is null then raise exception 'Verify your email before using event access' using errcode = '42501'; end if;
  insert into public.attendees(event_id, registration_name, registration_email, access_role)
    values (p_event, left(split_part(v_email, '@', 1), 120), v_email, 'admin')
    on conflict (event_id, registration_email) do nothing;
  return public.claim_attendee(p_event);
end $$;

revoke all on function public.active_event_admin_count(uuid), public.can_edit_sponsor(uuid,uuid),
  public.guard_attendee_access_version(), public.admin_save_event_user(uuid,uuid,text,text,text,text,boolean,uuid[],integer),
  public.bump_sponsor_version(), public.save_sponsor_page(uuid,uuid,integer,jsonb), public.can_write_sponsor_asset(text) from public, anon, authenticated;
revoke all on function public.claim_event_access(text), public.claim_admin_attendee(uuid) from public, anon, authenticated;
grant execute on function public.can_edit_sponsor(uuid,uuid),
  public.admin_save_event_user(uuid,uuid,text,text,text,text,boolean,uuid[],integer),
  public.save_sponsor_page(uuid,uuid,integer,jsonb), public.can_write_sponsor_asset(text) to authenticated;
grant execute on function public.claim_event_access(text), public.claim_admin_attendee(uuid) to authenticated;

commit;
