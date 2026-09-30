begin;

-- Pure normalization shared by preview and commit. Not a client-callable RPC.
create function public.normalize_attendee_import(p_rows jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare r jsonb; v_email text; v_rows jsonb := '[]'; v_seen text[] := '{}'; v_index integer := 0;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Import must contain 1 to 1000 attendees' using errcode='22023';
  end if;
  if jsonb_array_length(p_rows) not between 1 and 1000 then
    raise exception 'Import must contain 1 to 1000 attendees' using errcode='22023';
  end if;
  for r in select value from jsonb_array_elements(p_rows) loop
    v_index := v_index + 1;
    if jsonb_typeof(r) <> 'object' or (r - array['email','name','phone']) <> '{}'::jsonb
      or jsonb_typeof(r->'email') is distinct from 'string' or jsonb_typeof(r->'name') is distinct from 'string' then
      raise exception 'Use only email, name and optional phone at row %', v_index using errcode='22023';
    end if;
    v_email := lower(btrim(r->>'email'));
    if char_length(v_email) > 254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
      raise exception 'Invalid email at row %', v_index using errcode='22023';
    end if;
    if v_email = any(v_seen) then raise exception 'Duplicate email at row %', v_index using errcode='22023'; end if;
    if char_length(btrim(r->>'name')) not between 1 and 120 then
      raise exception 'Invalid name at row %', v_index using errcode='22023';
    end if;
    if r ? 'phone' and (jsonb_typeof(r->'phone') is distinct from 'string' or char_length(r->>'phone') > 40) then
      raise exception 'Phone must be text with at most 40 characters at row %', v_index using errcode='22023';
    end if;
    v_seen := array_append(v_seen, v_email);
    v_rows := v_rows || jsonb_build_array(jsonb_build_object('email',v_email,'name',btrim(r->>'name'))
      || case when r ? 'phone' then jsonb_build_object('phone',btrim(r->>'phone')) else '{}'::jsonb end);
  end loop;
  return v_rows;
end $$;

create function public.preview_attendee_import(p_event uuid, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_rows jsonb; v_existing jsonb; v_result jsonb;
begin
  if not public.is_event_admin(p_event) or not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then
    raise exception 'Organizer access required' using errcode='42501';
  end if;
  v_rows := public.normalize_attendee_import(p_rows);
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'email',a.registration_email,'name',a.registration_name,
    'role',a.access_role,'status',a.status,'claimed',a.user_id is not null,'version',a.access_version)
    order by a.registration_email),'[]'::jsonb) into v_existing
    from public.attendees a where a.event_id=p_event and a.registration_email in(select r->>'email' from jsonb_array_elements(v_rows) r);
  select jsonb_build_object('processed',jsonb_array_length(v_rows),'new',jsonb_array_length(v_rows)-count(*),
    'existing',count(*),'claimed',count(*) filter(where (r->>'claimed')::boolean),
    'disabled',count(*) filter(where r->>'status'='disabled'),'pending',count(*) filter(where r->>'status'='pending'),
    'privileged',count(*) filter(where r->>'role' in('admin','sponsor')))
    into v_result from jsonb_array_elements(v_existing) r;
  -- This is an optimistic-concurrency checksum, not an authorization credential.
  -- It binds the exact normalized file and current matched registrations.
  return v_result || jsonb_build_object('preview_token',md5(p_event::text||v_rows::text||v_existing::text),
    'mode','add_missing_only','emails_sent',0);
end $$;

-- Keep the original two-argument integration contract, but make all repeats
-- non-destructive. Names/contact changes belong in explicit organizer editors.
create or replace function public.import_attendees(p_event uuid, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r jsonb; v_rows jsonb; v_attendee uuid; v_created integer := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended('event-access:'||p_event::text,0));
  if not public.is_event_admin(p_event) or not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then
    raise exception 'Organizer access required' using errcode='42501';
  end if;
  v_rows := public.normalize_attendee_import(p_rows);
  for r in select value from jsonb_array_elements(v_rows) loop
    v_attendee := null;
    insert into public.attendees(event_id,registration_email,registration_name,access_role,status,directory_allowed)
      values(p_event,r->>'email',r->>'name','member','approved',true)
      on conflict(event_id,registration_email) do nothing returning id into v_attendee;
    if v_attendee is not null then
      v_created := v_created + 1;
      if coalesce(r->>'phone','') <> '' then
        insert into public.attendee_contacts(event_id,attendee_id,phone) values(p_event,v_attendee,r->>'phone');
      end if;
    end if;
  end loop;
  insert into public.audit_log(event_id,actor_user_id,action,details) values(p_event,auth.uid(),'attendees.import',
    jsonb_build_object('rows',jsonb_array_length(v_rows),'created',v_created,'mode','add_missing_only','emails_sent',0));
  return jsonb_build_object('processed',jsonb_array_length(v_rows),'created',v_created,
    'existing',jsonb_array_length(v_rows)-v_created,'mode','add_missing_only','emails_sent',0);
end $$;

create function public.commit_attendee_import(p_event uuid, p_rows jsonb, p_preview_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_preview jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('event-access:'||p_event::text,0));
  v_preview := public.preview_attendee_import(p_event,p_rows);
  if p_preview_token is distinct from v_preview->>'preview_token' then
    raise exception 'The roster changed since preview. Review the file again; no changes from this request were saved.' using errcode='40001';
  end if;
  return public.import_attendees(p_event,p_rows);
end $$;

revoke all on function public.normalize_attendee_import(jsonb), public.preview_attendee_import(uuid,jsonb),
  public.import_attendees(uuid,jsonb), public.commit_attendee_import(uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.preview_attendee_import(uuid,jsonb), public.import_attendees(uuid,jsonb),
  public.commit_attendee_import(uuid,jsonb,text) to authenticated;
-- The superseded updating helper remains private for migration history only.
revoke all on function public.import_attendee_registrations(uuid,jsonb) from public,anon,authenticated;

commit;
