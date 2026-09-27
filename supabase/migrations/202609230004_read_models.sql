begin;

alter table public.session_speakers add column id uuid not null default gen_random_uuid() unique;
alter table public.sponsor_representatives add column id uuid not null default gen_random_uuid() unique;

-- SECURITY INVOKER keeps profile and message RLS in effect for every joined row.
create function public.list_inbox(p_event uuid, p_offset integer default 0, p_limit integer default 30)
returns table (
  id uuid, peer_id uuid, peer_name text, peer_company text, peer_headshot_path text, updated_at timestamptz,
  last_message text, last_message_id bigint, last_sender_id uuid, unread_count bigint, blocked_by_me boolean, peer_read_id bigint
) language sql stable security invoker set search_path = '' as $$
  select c.id, peer.attendee_id, coalesce(p.full_name, 'Private attendee'), coalesce(p.company, ''), p.headshot_path, c.updated_at,
    last_msg.body, last_msg.id, last_msg.sender_id,
    (select count(*) from public.messages m where m.event_id = p_event and m.conversation_id = c.id
      and m.sender_id <> public.current_attendee(p_event) and m.id > coalesce(own_read.last_read_id, 0)),
    exists (select 1 from public.blocks b where b.event_id = p_event and b.blocker_id = public.current_attendee(p_event) and b.blocked_id = peer.attendee_id),
    coalesce(peer_read.last_read_id, 0)
  from public.conversations c
  cross join lateral (select case when c.attendee_a = public.current_attendee(p_event) then c.attendee_b else c.attendee_a end as attendee_id) peer
  left join public.attendee_profiles p on p.event_id = c.event_id and p.attendee_id = peer.attendee_id
  left join lateral (select m.id, m.body, m.sender_id from public.messages m where m.event_id = c.event_id and m.conversation_id = c.id order by m.id desc limit 1) last_msg on true
  left join public.conversation_reads own_read on own_read.event_id = c.event_id and own_read.conversation_id = c.id and own_read.attendee_id = public.current_attendee(p_event)
  left join public.conversation_reads peer_read on peer_read.event_id = c.event_id and peer_read.conversation_id = c.id and peer_read.attendee_id = peer.attendee_id
  where c.event_id = p_event
  order by c.updated_at desc, c.id
  limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0);
$$;

create function public.moderation_queue(p_event uuid, p_offset integer default 0)
returns table (id uuid, reason text, status text, created_at timestamptz, reporter_name text, target_name text, target_id uuid, message_id bigint, reported_message text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_event_admin(p_event) then raise exception 'Organizer access required' using errcode = '42501'; end if;
  return query
    select r.id, r.reason, r.status, r.created_at, reporter.registration_name, target.registration_name, r.target_id, r.message_id, m.body
      from public.reports r
      join public.attendees reporter on reporter.event_id = r.event_id and reporter.id = r.reporter_id
      join public.attendees target on target.event_id = r.event_id and target.id = r.target_id
      left join public.messages m on m.event_id = r.event_id and m.id = r.message_id
      where r.event_id = p_event order by (r.status = 'open') desc, r.created_at desc limit 50 offset greatest(p_offset, 0);
end $$;

revoke all on function public.list_inbox(uuid, integer, integer), public.moderation_queue(uuid, integer) from public;
grant execute on function public.list_inbox(uuid, integer, integer), public.moderation_queue(uuid, integer) to authenticated;

commit;
