begin;

-- Organizers manage eligibility, not account ownership. Table-level grants
-- would allow direct API calls to reassign a registration's auth user and
-- impersonate a conversation member despite the constrained organizer UI.
revoke insert, update on public.attendees from authenticated;
grant insert (event_id, registration_email, registration_name, status, directory_allowed)
  on public.attendees to authenticated;
grant update (registration_name, status, directory_allowed) on public.attendees to authenticated;
-- Registration-email corrections use update_attendee_access, which refuses
-- reassignment after claim. claim_attendee alone binds a verified auth user.

revoke update on public.events from authenticated;
grant update (name, tagline, start_date, end_date, published, is_demo) on public.events to authenticated;

-- Message inserts lock the messaging switch and both consent records. A
-- concurrent pause/opt-out therefore takes effect at a transaction boundary.
create or replace function public.message_consent_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_a uuid; v_b uuid; v_enabled boolean;
begin
  select messaging_enabled into v_enabled from public.event_settings where event_id = new.event_id for share;
  if v_enabled is distinct from true then
    raise exception 'Messaging is unavailable for this event' using errcode = '42501';
  end if;
  select attendee_a, attendee_b into v_a, v_b from public.conversations where event_id = new.event_id and id = new.conversation_id;
  perform 1 from public.attendee_profiles where event_id = new.event_id and attendee_id in (v_a, v_b) order by attendee_id for share;
  if (select count(*) from public.attendee_profiles where event_id = new.event_id and attendee_id in (v_a, v_b) and messaging_available) <> 2 then
    raise exception 'Messaging is unavailable for this attendee' using errcode = '42501';
  end if;
  return new;
end $$;

create or replace function public.mark_conversation_read(p_event uuid, p_conversation uuid, p_message_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare v_me uuid := public.current_attendee(p_event); v_last bigint;
begin
  if not public.can_read_conversation(p_event, p_conversation) then
    raise exception 'Conversation access denied' using errcode = '42501';
  end if;
  select max(id) into v_last from public.messages where event_id = p_event and conversation_id = p_conversation and id <= p_message_id;
  if v_last is null then return; end if;
  insert into public.conversation_reads(event_id, conversation_id, attendee_id, last_read_id)
    values (p_event, p_conversation, v_me, v_last)
    on conflict (event_id, conversation_id, attendee_id) do update
      set last_read_id = excluded.last_read_id, updated_at = now()
      where excluded.last_read_id > public.conversation_reads.last_read_id;
end $$;

commit;
