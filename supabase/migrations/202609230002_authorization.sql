begin;

create function public.is_event_admin(p_event uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.event_admins where event_id = p_event and user_id = (select auth.uid()));
$$;

create function public.current_attendee(p_event uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.attendees where event_id = p_event and user_id = (select auth.uid()) and status = 'approved';
$$;

create function public.can_read_event(p_event uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.events where id = p_event and published and public_guide)
    or public.current_attendee(p_event) is not null or public.is_event_admin(p_event);
$$;

create function public.can_view_profile(p_event uuid, p_attendee uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_event_admin(p_event) or (
    public.current_attendee(p_event) is not null and (
      public.current_attendee(p_event) = p_attendee or (
        exists (select 1 from public.event_settings where event_id = p_event and directory_enabled)
        and exists (
          select 1 from public.attendees a join public.attendee_profiles p on p.attendee_id = a.id and p.event_id = a.event_id
          where a.event_id = p_event and a.id = p_attendee and a.status = 'approved'
            and a.directory_allowed and p.directory_visible
        ) and not exists (
          select 1 from public.blocks b where b.event_id = p_event and (
            (b.blocker_id = public.current_attendee(p_event) and b.blocked_id = p_attendee)
            or (b.blocked_id = public.current_attendee(p_event) and b.blocker_id = p_attendee)
          )
        )
      )
    )
  );
$$;

create function public.can_read_conversation(p_event uuid, p_conversation uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.conversations where event_id = p_event and id = p_conversation
    and public.current_attendee(p_event) in (attendee_a, attendee_b));
$$;

create policy event_read on public.events for select using (public.can_read_event(id));
create policy event_admin_update on public.events for update to authenticated
  using (public.is_event_admin(id)) with check (public.is_event_admin(id));
create policy settings_read on public.event_settings for select using (public.can_read_event(event_id));
create policy settings_write on public.event_settings for all to authenticated
  using (public.is_event_admin(event_id)) with check (public.is_event_admin(event_id));
create policy admin_read on public.event_admins for select to authenticated
  using (user_id = (select auth.uid()) or public.is_event_admin(event_id));
-- Admin grants are deliberately bootstrapped by a database owner, not an attendee API.

create policy attendee_read on public.attendees for select to authenticated
  using (user_id = (select auth.uid()) or public.is_event_admin(event_id));
create policy attendee_admin_write on public.attendees for all to authenticated
  using (public.is_event_admin(event_id)) with check (public.is_event_admin(event_id));
create policy profile_read on public.attendee_profiles for select to authenticated
  using (public.can_view_profile(event_id, attendee_id));
create policy profile_update on public.attendee_profiles for update to authenticated
  using (attendee_id = public.current_attendee(event_id))
  with check (attendee_id = public.current_attendee(event_id));
create policy preferences_read on public.attendee_preferences for select to authenticated
  using (attendee_id = public.current_attendee(event_id));
create policy preferences_update on public.attendee_preferences for update to authenticated
  using (attendee_id = public.current_attendee(event_id)) with check (attendee_id = public.current_attendee(event_id));

do $$
declare t text;
begin
  foreach t in array array['sponsors','speakers','agenda_days','agenda_sessions','agenda_sponsor_placements','lunch_locations','venue_locations','announcements'] loop
    execute format('create policy guide_read on public.%I for select using ((published and public.can_read_event(event_id)) or public.is_event_admin(event_id))', t);
    execute format('create policy organizer_write on public.%I for all to authenticated using (public.is_event_admin(event_id)) with check (public.is_event_admin(event_id))', t);
  end loop;
end $$;
create policy tiers_read on public.sponsor_tiers for select using (public.can_read_event(event_id));
create policy tiers_admin on public.sponsor_tiers for all to authenticated
  using (public.is_event_admin(event_id)) with check (public.is_event_admin(event_id));
create policy session_speakers_read on public.session_speakers for select using (
  exists (select 1 from public.agenda_sessions s where s.event_id = session_speakers.event_id and s.id = session_speakers.session_id)
  and exists (select 1 from public.speakers s where s.event_id = session_speakers.event_id and s.id = session_speakers.speaker_id)
);
create policy session_speakers_admin on public.session_speakers for all to authenticated
  using (public.is_event_admin(event_id)) with check (public.is_event_admin(event_id));
create policy representatives_read on public.sponsor_representatives for select to authenticated
  using (public.can_view_profile(event_id, attendee_id) and exists (
    select 1 from public.sponsors s where s.event_id = sponsor_representatives.event_id and s.id = sponsor_representatives.sponsor_id
  ));
create policy representatives_admin on public.sponsor_representatives for all to authenticated
  using (public.is_event_admin(event_id)) with check (public.is_event_admin(event_id));

create policy saved_sessions_read on public.saved_sessions for select to authenticated
  using (attendee_id = public.current_attendee(event_id));
create policy saved_sessions_insert on public.saved_sessions for insert to authenticated with check (
  attendee_id = public.current_attendee(event_id) and exists (
    select 1 from public.agenda_sessions s where s.event_id = saved_sessions.event_id and s.id = saved_sessions.session_id and s.published
  )
);
create policy saved_sessions_delete on public.saved_sessions for delete to authenticated using (attendee_id = public.current_attendee(event_id));
create policy saved_people_read on public.saved_attendees for select to authenticated using (attendee_id = public.current_attendee(event_id));
create policy saved_people_insert on public.saved_attendees for insert to authenticated
  with check (attendee_id = public.current_attendee(event_id) and public.can_view_profile(event_id, target_id));
create policy saved_people_delete on public.saved_attendees for delete to authenticated using (attendee_id = public.current_attendee(event_id));

create policy conversations_read on public.conversations for select to authenticated using (public.can_read_conversation(event_id, id));
create policy messages_read on public.messages for select to authenticated using (public.can_read_conversation(event_id, conversation_id));
create policy receipts_read on public.conversation_reads for select to authenticated using (public.can_read_conversation(event_id, conversation_id));
create policy blocks_read on public.blocks for select to authenticated using (blocker_id = public.current_attendee(event_id));
create policy reports_read on public.reports for select to authenticated
  using (reporter_id = public.current_attendee(event_id) or public.is_event_admin(event_id));
create policy reports_admin_update on public.reports for update to authenticated
  using (public.is_event_admin(event_id)) with check (public.is_event_admin(event_id));
create policy audit_admin_read on public.audit_log for select to authenticated using (public.is_event_admin(event_id));

-- Explicit grants complement RLS. Message/conversation writes are RPC-only.
revoke all on all tables in schema public from anon, authenticated;
grant usage on schema public to anon, authenticated;
grant select on public.events, public.event_settings, public.sponsor_tiers, public.sponsors,
  public.speakers, public.agenda_days, public.agenda_sessions, public.session_speakers,
  public.agenda_sponsor_placements, public.lunch_locations, public.venue_locations, public.announcements to anon, authenticated;
grant select on public.event_admins, public.attendees, public.attendee_profiles, public.attendee_preferences,
  public.sponsor_representatives, public.saved_sessions, public.saved_attendees, public.conversations,
  public.messages, public.conversation_reads, public.blocks, public.reports, public.audit_log to authenticated;
grant update on public.events to authenticated;
grant insert, update, delete on public.event_settings, public.attendees, public.sponsor_tiers, public.sponsors,
  public.speakers, public.agenda_days, public.agenda_sessions, public.session_speakers,
  public.agenda_sponsor_placements, public.lunch_locations, public.venue_locations,
  public.announcements, public.sponsor_representatives to authenticated;
grant insert, delete on public.saved_sessions, public.saved_attendees to authenticated;
grant update (full_name, company, title, city, state, bio, interests, headshot_path,
  public_email, public_phone, website, directory_visible, messaging_available) on public.attendee_profiles to authenticated;
grant update (onboarding_step, onboarding_done) on public.attendee_preferences to authenticated;
grant update (status) on public.reports to authenticated;

create function public.claim_attendee(p_event uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_email text; v_attendee public.attendees;
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select lower(email) into v_email from auth.users where id = v_user and email_confirmed_at is not null;
  if v_email is null then raise exception 'Verify your email before claiming event access' using errcode = '42501'; end if;
  select * into v_attendee from public.attendees where event_id = p_event and registration_email = v_email
    and status = 'approved' and (user_id is null or user_id = v_user) for update;
  if not found then return null; end if;
  if v_attendee.user_id is null then
    update public.attendees set user_id = v_user, updated_at = now() where id = v_attendee.id;
  end if;
  insert into public.attendee_profiles (event_id, attendee_id, full_name)
    values (p_event, v_attendee.id, v_attendee.registration_name) on conflict (attendee_id) do nothing;
  insert into public.attendee_preferences(event_id, attendee_id) values (p_event, v_attendee.id) on conflict do nothing;
  return v_attendee.id;
end $$;

create function public.open_conversation(p_event uuid, p_recipient uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_me uuid := public.current_attendee(p_event); v_id uuid; v_a uuid; v_b uuid;
begin
  if v_me is null or v_me = p_recipient then raise exception 'Event access and a different recipient are required' using errcode = '42501'; end if;
  v_a := least(v_me, p_recipient); v_b := greatest(v_me, p_recipient);
  perform pg_advisory_xact_lock(hashtextextended(p_event::text || v_a::text || v_b::text, 0));
  select id into v_id from public.conversations where event_id = p_event and attendee_a = v_a and attendee_b = v_b;
  if (v_id is null and not public.can_view_profile(p_event, p_recipient)) or
    not exists (select 1 from public.event_settings where event_id = p_event and messaging_enabled) or
    (select count(*) from public.attendees a join public.attendee_profiles p on p.attendee_id = a.id and p.event_id = a.event_id
      where a.event_id = p_event and a.id in (v_me, p_recipient) and a.status = 'approved' and p.messaging_available) <> 2 or
    exists (select 1 from public.blocks where event_id = p_event and
      ((blocker_id = v_me and blocked_id = p_recipient) or (blocker_id = p_recipient and blocked_id = v_me)))
  then raise exception 'Messaging is unavailable for this attendee' using errcode = '42501'; end if;
  if v_id is not null then return v_id; end if;
  insert into public.conversations(event_id, attendee_a, attendee_b) values (p_event, v_a, v_b)
    on conflict (event_id, attendee_a, attendee_b) do update set updated_at = public.conversations.updated_at returning id into v_id;
  return v_id;
end $$;

create function public.send_message(p_event uuid, p_conversation uuid, p_client_id uuid, p_body text)
returns public.messages language plpgsql security definer set search_path = '' as $$
declare v_me uuid := public.current_attendee(p_event); v_peer uuid; v_convo public.conversations; v_message public.messages;
begin
  if v_me is null then raise exception 'Event access required' using errcode = '42501'; end if;
  if p_client_id is null or p_body is null or char_length(btrim(p_body)) not between 1 and 4000 then
    raise exception 'Message must contain 1 to 4000 characters and a client ID' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('sender:' || v_me::text, 0));
  select * into v_convo from public.conversations where event_id = p_event and id = p_conversation for update;
  if not found or v_me not in (v_convo.attendee_a, v_convo.attendee_b) then raise exception 'Conversation access denied' using errcode = '42501'; end if;
  select * into v_message from public.messages where event_id = p_event and conversation_id = p_conversation and sender_id = v_me and client_id = p_client_id;
  if found then
    if v_message.body <> btrim(p_body) then raise exception 'Idempotency key already used for a different message' using errcode = '22023'; end if;
    return v_message;
  end if;
  v_peer := case when v_convo.attendee_a = v_me then v_convo.attendee_b else v_convo.attendee_a end;
  perform pg_advisory_xact_lock(hashtextextended(p_event::text || least(v_me, v_peer)::text || greatest(v_me, v_peer)::text, 0));
  -- Membership updates cannot race a send after these shared locks are held.
  perform 1 from public.attendees where event_id = p_event and id in (v_me, v_peer) order by id for share;
  if not exists (select 1 from public.event_settings where event_id = p_event and messaging_enabled) or
    (select count(*) from public.attendees a join public.attendee_profiles p on p.attendee_id = a.id and p.event_id = a.event_id
      where a.event_id = p_event and a.id in (v_me, v_peer) and a.status = 'approved' and p.messaging_available) <> 2 or
    exists (select 1 from public.blocks where event_id = p_event and
      ((blocker_id = v_me and blocked_id = v_peer) or (blocker_id = v_peer and blocked_id = v_me)))
  then raise exception 'Messaging is unavailable for this attendee' using errcode = '42501'; end if;
  if (select count(*) from public.messages where sender_id = v_me and created_at > clock_timestamp() - interval '1 minute') >= 30 then
    raise exception 'Please wait a minute before sending more messages' using errcode = 'P0001';
  end if;
  insert into public.messages(event_id, conversation_id, sender_id, client_id, body)
    values (p_event, p_conversation, v_me, p_client_id, btrim(p_body)) returning * into v_message;
  update public.conversations set updated_at = v_message.created_at where id = p_conversation;
  return v_message;
end $$;

create function public.mark_conversation_read(p_event uuid, p_conversation uuid, p_message_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare v_me uuid := public.current_attendee(p_event); v_last bigint;
begin
  if not public.can_read_conversation(p_event, p_conversation) then raise exception 'Conversation access denied' using errcode = '42501'; end if;
  select max(id) into v_last from public.messages where event_id = p_event and conversation_id = p_conversation and id <= p_message_id;
  if v_last is null then return; end if;
  insert into public.conversation_reads(event_id, conversation_id, attendee_id, last_read_id)
    values (p_event, p_conversation, v_me, v_last)
    on conflict (event_id, conversation_id, attendee_id) do update
      set last_read_id = greatest(public.conversation_reads.last_read_id, excluded.last_read_id), updated_at = now();
end $$;

create function public.set_attendee_block(p_event uuid, p_target uuid, p_blocked boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_me uuid := public.current_attendee(p_event);
begin
  if v_me is null or v_me = p_target or not exists (select 1 from public.attendees where event_id = p_event and id = p_target) then
    raise exception 'Invalid attendee' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_event::text || least(v_me, p_target)::text || greatest(v_me, p_target)::text, 0));
  if p_blocked then
    insert into public.blocks(event_id, blocker_id, blocked_id) values (p_event, v_me, p_target) on conflict do nothing;
  else
    delete from public.blocks where event_id = p_event and blocker_id = v_me and blocked_id = p_target;
  end if;
end $$;

create function public.report_attendee(p_event uuid, p_target uuid, p_reason text, p_message_id bigint default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_me uuid := public.current_attendee(p_event); v_id uuid;
begin
  if v_me is null or v_me = p_target or not exists (select 1 from public.attendees where event_id = p_event and id = p_target) then
    raise exception 'Invalid attendee' using errcode = '42501';
  end if;
  if not public.can_view_profile(p_event, p_target) and not exists (
    select 1 from public.conversations where event_id = p_event and v_me in (attendee_a, attendee_b) and p_target in (attendee_a, attendee_b)
  ) then raise exception 'Attendee access denied' using errcode = '42501'; end if;
  if p_message_id is not null and not exists (
    select 1 from public.messages where event_id = p_event and id = p_message_id and sender_id = p_target
      and public.can_read_conversation(event_id, conversation_id)
  ) then raise exception 'Message access denied' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('report:' || v_me::text, 0));
  if (select count(*) from public.reports where reporter_id = v_me and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Please contact the welcome desk for further help' using errcode = 'P0001';
  end if;
  insert into public.reports(event_id, reporter_id, target_id, message_id, reason)
    values (p_event, v_me, p_target, p_message_id, btrim(p_reason)) returning id into v_id;
  return v_id;
end $$;

create function public.import_attendees(p_event uuid, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r jsonb; v_email text; v_total integer := 0; v_created integer := 0; v_seen text[] := '{}';
begin
  if not public.is_event_admin(p_event) then raise exception 'Organizer access required' using errcode = '42501'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) not between 1 and 1000 then
    raise exception 'Import must contain 1 to 1000 attendees' using errcode = '22023';
  end if;
  for r in select value from jsonb_array_elements(p_rows) loop
    v_total := v_total + 1;
    v_email := lower(btrim(r->>'email'));
    if v_email is null or v_email = any(v_seen) then raise exception 'Missing or duplicate email at row %', v_total using errcode = '22023'; end if;
    if r->>'name' is null or char_length(btrim(r->>'name')) not between 1 and 120 then raise exception 'Invalid name at row %', v_total using errcode = '22023'; end if;
    v_seen := array_append(v_seen, v_email);
    insert into public.attendees(event_id, registration_email, registration_name)
      values (p_event, v_email, btrim(r->>'name')) on conflict (event_id, registration_email) do nothing;
    if found then v_created := v_created + 1; end if;
    -- Re-import never reactivates a disabled person, changes ownership or publishes a profile.
    update public.attendees set registration_name = btrim(r->>'name'), updated_at = now()
      where event_id = p_event and registration_email = v_email and registration_name <> btrim(r->>'name');
  end loop;
  insert into public.audit_log(event_id, actor_user_id, action, details)
    values (p_event, auth.uid(), 'attendees.import', jsonb_build_object('rows', v_total, 'created', v_created));
  return jsonb_build_object('processed', v_total, 'created', v_created, 'existing', v_total - v_created);
end $$;

create function public.validate_agenda_binding()
returns trigger language plpgsql set search_path = '' as $$
declare v_date date; v_zone text; v_session_day uuid;
begin
  if tg_table_name = 'agenda_sessions' then
    select d.date, e.timezone into v_date, v_zone from public.agenda_days d join public.events e on e.id = d.event_id
      where d.id = new.day_id and d.event_id = new.event_id;
    if v_date is not null and (new.starts_at at time zone v_zone)::date <> v_date then
      raise exception 'Session start must belong to its agenda day in the event timezone' using errcode = '23514';
    end if;
  elsif new.after_session_id is not null then
    select day_id into v_session_day from public.agenda_sessions where id = new.after_session_id and event_id = new.event_id;
    if v_session_day is distinct from new.day_id then raise exception 'Sponsor placement must use a session from the same day' using errcode = '23514'; end if;
  end if;
  return new;
end $$;
create trigger validate_session_day before insert or update on public.agenda_sessions for each row execute function public.validate_agenda_binding();
create trigger validate_placement_day before insert or update on public.agenda_sponsor_placements for each row execute function public.validate_agenda_binding();

create function public.record_organizer_audit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_record jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end; v_event uuid;
begin
  v_event := (v_record->>'event_id')::uuid;
  insert into public.audit_log(event_id, actor_user_id, action, entity_id)
    values (v_event, auth.uid(), tg_table_name || '.' || lower(tg_op), coalesce(v_record->>'id', v_record->>'event_id'));
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
do $$
declare t text;
begin
  foreach t in array array['event_settings','attendees','sponsor_tiers','sponsors','speakers','agenda_days','agenda_sessions','session_speakers','agenda_sponsor_placements','lunch_locations','venue_locations','announcements','sponsor_representatives','reports'] loop
    execute format('create trigger organizer_audit after insert or update or delete on public.%I for each row execute function public.record_organizer_audit()', t);
  end loop;
end $$;

revoke all on all functions in schema public from public;
grant execute on function public.can_read_event(uuid), public.is_event_admin(uuid), public.current_attendee(uuid) to anon, authenticated;
grant execute on function public.can_view_profile(uuid, uuid), public.can_read_conversation(uuid, uuid),
  public.claim_attendee(uuid), public.open_conversation(uuid, uuid), public.send_message(uuid, uuid, uuid, text),
  public.mark_conversation_read(uuid, uuid, bigint), public.set_attendee_block(uuid, uuid, boolean),
  public.report_attendee(uuid, uuid, text, bigint), public.import_attendees(uuid, jsonb) to authenticated;

commit;
