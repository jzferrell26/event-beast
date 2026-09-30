begin;

-- This helper returns only a permission boolean. Reverse blocks must be checked
-- inside the database, not through a caller's own-rows-only blocks policy.
create function private.message_attention_allowed(p_event uuid,p_peer uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(
   select 1 from public.attendees me join auth.users u on u.id=me.user_id
   join public.event_settings s on s.event_id=me.event_id
   join public.attendees peer on peer.event_id=me.event_id and peer.id=p_peer
   where me.event_id=p_event and u.id=auth.uid() and u.email_confirmed_at is not null
     and me.status='approved' and peer.status='approved'
     and s.community_enabled and s.messaging_enabled
     and not exists(select 1 from public.blocks b where b.event_id=p_event and
       ((b.blocker_id=me.id and b.blocked_id=peer.id) or (b.blocker_id=peer.id and b.blocked_id=me.id)))
 );
$$;
revoke all on function private.message_attention_allowed(uuid,uuid) from public,anon,authenticated;
grant execute on function private.message_attention_allowed(uuid,uuid) to authenticated;

-- Count all unread conversations, not just the first inbox page. No message
-- text, sender contacts, photos or other attendee's summary is returned.
create function public.message_attention(p_event uuid)
returns table(unread_count bigint,latest_id text,conversation_id uuid)
language plpgsql stable security invoker set search_path='' as $$
declare v_me uuid:=public.current_attendee(p_event);
begin
 if v_me is null or not private.message_attention_allowed(p_event,v_me) then
   raise exception 'Verified event messaging access is required' using errcode='42501';
 end if;
 return query with unread as materialized (
   select m.id,m.conversation_id from public.messages m
   join public.conversations c on c.event_id=m.event_id and c.id=m.conversation_id
   left join public.conversation_reads r on r.event_id=c.event_id and r.conversation_id=c.id and r.attendee_id=v_me
   where c.event_id=p_event and v_me in(c.attendee_a,c.attendee_b)
     and m.sender_id<>v_me and m.id>coalesce(r.last_read_id,0)
     and private.message_attention_allowed(p_event,m.sender_id)
 ) select count(*),(select u.id::text from unread u order by u.id desc limit 1),
   (select u.conversation_id from unread u order by u.id desc limit 1) from unread;
end $$;
revoke all on function public.message_attention(uuid) from public,anon,authenticated;
grant execute on function public.message_attention(uuid) to authenticated;

commit;
