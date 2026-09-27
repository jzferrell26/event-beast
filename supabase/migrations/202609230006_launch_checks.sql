begin;

create table public.launch_checks (
  event_id uuid not null references public.events(id) on delete cascade,
  check_key text not null check (check_key in (
    'content_review', 'email_delivery', 'two_account_messaging',
    'mobile_offline', 'shared_network', 'production_environment'
  )),
  verified boolean not null default false,
  notes text not null default '' check (char_length(notes) <= 2000),
  verified_at timestamptz,
  verified_by uuid references auth.users(id) on delete set null,
  version integer not null default 1 check (version > 0),
  updated_at timestamptz not null default now(),
  primary key (event_id, check_key),
  check ((verified and verified_at is not null and char_length(btrim(notes)) >= 3)
    or (not verified and verified_at is null))
);
create index launch_checks_actor_idx on public.launch_checks(verified_by);
alter table public.launch_checks enable row level security;
revoke all on public.launch_checks from anon, authenticated;
grant select on public.launch_checks to authenticated;
create policy launch_checks_organizer_read on public.launch_checks for select to authenticated
  using (public.is_event_admin(event_id));

create function public.record_launch_check(
  p_event uuid, p_key text, p_verified boolean, p_notes text, p_expected_version integer
) returns public.launch_checks language plpgsql security definer set search_path = '' as $$
declare v_row public.launch_checks;
begin
  if not public.is_event_admin(p_event) then
    raise exception 'Organizer access required' using errcode = '42501';
  end if;
  if p_key is null or p_key not in ('content_review','email_delivery','two_account_messaging','mobile_offline','shared_network','production_environment')
    or p_verified is null or p_notes is null or char_length(p_notes) > 2000
    or (p_verified and char_length(btrim(p_notes)) < 3) or p_expected_version is null or p_expected_version < 0 then
    raise exception 'Choose a valid check and include a note describing the completed verification' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('launch:' || p_event::text || ':' || p_key, 0));
  select * into v_row from public.launch_checks where event_id = p_event and check_key = p_key for update;
  if coalesce(v_row.version, 0) <> p_expected_version then
    raise exception 'Another organizer updated this check. Refresh it before saving.' using errcode = '40001';
  end if;
  insert into public.launch_checks(event_id,check_key,verified,notes,verified_at,verified_by,version)
    values (p_event,p_key,p_verified,btrim(p_notes),case when p_verified then now() else null end,auth.uid(),1)
    on conflict (event_id,check_key) do update set
      verified = excluded.verified, notes = excluded.notes, verified_at = excluded.verified_at,
      verified_by = auth.uid(), version = public.launch_checks.version + 1, updated_at = now()
    returning * into v_row;
  insert into public.audit_log(event_id,actor_user_id,action,entity_id,details)
    values (p_event,auth.uid(),'launch_check.record',p_key,jsonb_build_object('verified',p_verified,'version',v_row.version));
  return v_row;
end $$;
revoke all on function public.record_launch_check(uuid,text,boolean,text,integer) from public;
grant execute on function public.record_launch_check(uuid,text,boolean,text,integer) to authenticated;

commit;
