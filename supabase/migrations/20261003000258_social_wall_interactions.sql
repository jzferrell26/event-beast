begin;

-- Additive: the old text-post RPC and every existing post remain compatible.
alter table public.feed_posts add column image_path text;
alter table public.feed_posts drop constraint feed_posts_body_check;
alter table public.feed_posts add constraint feed_post_content_check check (
  char_length(btrim(body)) <= 2000 and (char_length(btrim(body)) > 0 or image_path is not null)
);
alter table public.feed_posts add constraint feed_post_photo_owner_check check (
  image_path is null or image_path = event_id::text || '/' || author_id::text || '/' || client_id::text || '.webp'
);
create unique index feed_photo_once on public.feed_posts(image_path) where image_path is not null;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('event-feed-photos','event-feed-photos',false,3145728,array['image/webp'])
on conflict(id) do nothing;

create function private.feed_post_available(p_event uuid,p_post uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.feed_posts p where p.event_id=p_event and p.id=p_post
   and p.status='visible' and private.feed_visible(p.event_id,p.author_id));
$$;
create function private.feed_photo_owner(p_path text)
returns boolean language sql stable security definer set search_path='' as $$
 select p_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$'
   and exists(select 1 from public.attendees a where a.event_id::text=split_part(p_path,'/',1)
     and a.id::text=split_part(p_path,'/',2) and a.id=private.feed_member(a.event_id));
$$;
create function private.feed_photo_read(p_path text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.feed_posts p where p.image_path=p_path
   and (public.is_event_admin(p.event_id) or (p.status='visible' and private.feed_visible(p.event_id,p.author_id))))
   or (private.feed_photo_owner(p_path) and not exists(select 1 from public.feed_posts where image_path=p_path));
$$;
create function private.feed_photo_insert(p_path text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if not private.feed_photo_owner(p_path) then return false; end if;
 perform pg_advisory_xact_lock(hashtextextended('feed:'||split_part(p_path,'/',2),0));
 return not exists(select 1 from public.feed_posts where image_path=p_path)
   -- Serialize the per-attendee quota, including unattached objects.
   and (select count(*) from storage.objects o where o.bucket_id='event-feed-photos'
     and split_part(o.name,'/',1)=split_part(p_path,'/',1)
     and split_part(o.name,'/',2)=split_part(p_path,'/',2)) < 200;
end;
$$;
create function private.feed_photo_remove(p_path text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if not private.feed_photo_owner(p_path) then return false; end if;
 -- The same lock as publication prevents canceled-draft cleanup from deleting
 -- an image while a slow/lost-response post is being committed.
 perform pg_advisory_xact_lock(hashtextextended('feed:'||split_part(p_path,'/',2),0));
 return not exists(select 1 from public.feed_posts where image_path=p_path);
end;
$$;
revoke all on function private.feed_post_available(uuid,uuid),private.feed_photo_owner(text),private.feed_photo_read(text),private.feed_photo_insert(text),private.feed_photo_remove(text) from public,anon,authenticated;
grant execute on function private.feed_post_available(uuid,uuid),private.feed_photo_owner(text),private.feed_photo_read(text),private.feed_photo_insert(text),private.feed_photo_remove(text) to authenticated;
create policy feed_photo_read on storage.objects for select to authenticated
  using(bucket_id='event-feed-photos' and private.feed_photo_read(name));
create policy feed_photo_insert on storage.objects for insert to authenticated
  with check(bucket_id='event-feed-photos' and private.feed_photo_insert(name));
create policy feed_photo_remove on storage.objects for delete to authenticated
  using(bucket_id='event-feed-photos' and private.feed_photo_remove(name));
-- No UPDATE policy: photo bytes cannot be replaced after being attached.

create function public.publish_feed_post_with_photo(p_event uuid,p_client uuid,p_body text,p_image boolean)
returns public.feed_posts language plpgsql security definer set search_path='' as $$
declare v_me uuid:=private.feed_member(p_event); v_post public.feed_posts; v_name text; v_path text;
begin
 if v_me is null then raise exception 'The event social wall is not available for this account' using errcode='42501'; end if;
 if p_client is null or p_body is null or p_image is null or char_length(btrim(p_body))>2000
   or (btrim(p_body)='' and not p_image) then raise exception 'Add a photo or 1 to 2000 characters and a request ID' using errcode='22023'; end if;
 if p_image then v_path:=p_event::text||'/'||v_me::text||'/'||p_client::text||'.webp'; end if;
 perform pg_advisory_xact_lock(hashtextextended('feed:'||v_me::text,0));
 select * into v_post from public.feed_posts where event_id=p_event and author_id=v_me and client_id=p_client;
 if found then
   if v_post.body<>btrim(p_body) or v_post.image_path is distinct from v_path then raise exception 'This request ID was used for another post' using errcode='22023'; end if;
   return v_post;
 end if;
 if p_image and not exists(select 1 from storage.objects where bucket_id='event-feed-photos' and name=v_path) then
   raise exception 'Upload your photo before posting' using errcode='22023'; end if;
 if (select count(*) from public.feed_posts where event_id=p_event and author_id=v_me and created_at>clock_timestamp()-interval '1 minute')>=10 then
   raise exception 'Please wait a minute before posting again' using errcode='P0001'; end if;
 select full_name into v_name from public.attendee_profiles where event_id=p_event and attendee_id=v_me;
 insert into public.feed_posts(event_id,author_id,client_id,body,author_name,image_path)
 values(p_event,v_me,p_client,btrim(p_body),coalesce(nullif(v_name,''),'Event attendee'),v_path) returning * into v_post;
 return v_post;
end $$;
create or replace function public.publish_feed_post(p_event uuid,p_client uuid,p_body text)
returns public.feed_posts language sql security definer set search_path='' as $$
 select public.publish_feed_post_with_photo(p_event,p_client,p_body,false);
$$;
create or replace function public.edit_feed_post(p_event uuid,p_post uuid,p_version integer,p_body text,p_delete boolean default false)
returns public.feed_posts language plpgsql security definer set search_path='' as $$
declare v_me uuid:=private.feed_member(p_event); v_post public.feed_posts;
begin
 if v_me is null then raise exception 'Event access required' using errcode='42501'; end if;
 select * into v_post from public.feed_posts where event_id=p_event and id=p_post for update;
 if not found or v_post.author_id<>v_me or v_post.status<>'visible' then raise exception 'This post cannot be edited by this account' using errcode='42501'; end if;
 if p_version is distinct from v_post.version then raise exception 'The post changed. Refresh before editing' using errcode='40001'; end if;
 if p_delete is null or (not p_delete and (p_body is null or char_length(btrim(p_body))>2000
   or (btrim(p_body)='' and v_post.image_path is null))) then raise exception 'Add a caption or keep the attached photo' using errcode='22023'; end if;
 update public.feed_posts set body=case when p_delete then body else btrim(p_body) end,
 status=case when p_delete then 'deleted' else 'visible' end,version=version+1,updated_at=clock_timestamp()
 where event_id=p_event and id=p_post returning * into v_post;
 return v_post;
end $$;
revoke all on function public.publish_feed_post_with_photo(uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.publish_feed_post_with_photo(uuid,uuid,text,boolean) to authenticated;

create table public.feed_replies (
 id uuid primary key default gen_random_uuid(), event_id uuid not null, post_id uuid not null,
 author_id uuid not null, client_id uuid not null, author_name text not null check(char_length(author_name) between 1 and 120),
 body text not null check(char_length(btrim(body)) between 1 and 2000),
 status text not null default 'visible' check(status in('visible','hidden','deleted')),
 version integer not null default 0, created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 unique(event_id,id), unique(event_id,author_id,client_id),
 foreign key(event_id,post_id) references public.feed_posts(event_id,id) on delete cascade,
 foreign key(event_id,author_id) references public.attendees(event_id,id) on delete cascade
);
create index feed_replies_thread_idx on public.feed_replies(event_id,post_id,created_at,id);
create index feed_replies_author_rate_idx on public.feed_replies(event_id,author_id,created_at desc);
create table public.feed_likes (
 event_id uuid not null, post_id uuid not null, attendee_id uuid not null, created_at timestamptz not null default clock_timestamp(),
 primary key(event_id,post_id,attendee_id),
 foreign key(event_id,post_id) references public.feed_posts(event_id,id) on delete cascade,
 foreign key(event_id,attendee_id) references public.attendees(event_id,id) on delete cascade
);
create index feed_likes_attendee_idx on public.feed_likes(event_id,attendee_id,created_at desc);
create table public.feed_reply_reports (
 id uuid primary key default gen_random_uuid(), event_id uuid not null, reply_id uuid not null, reporter_id uuid not null,
 reason text not null check(char_length(btrim(reason)) between 3 and 1000),
 status text not null default 'open' check(status in('open','reviewed','dismissed')), created_at timestamptz not null default now(),
 foreign key(event_id,reply_id) references public.feed_replies(event_id,id) on delete cascade,
 foreign key(event_id,reporter_id) references public.attendees(event_id,id) on delete cascade
);
create index feed_reply_reports_queue_idx on public.feed_reply_reports(event_id,status,created_at);
create index feed_reply_reports_author_idx on public.feed_reply_reports(event_id,reporter_id,created_at desc);
alter table public.feed_replies enable row level security;
alter table public.feed_likes enable row level security;
alter table public.feed_reply_reports enable row level security;
revoke all on public.feed_replies,public.feed_likes,public.feed_reply_reports from public,anon,authenticated;
grant select on public.feed_replies,public.feed_likes,public.feed_reply_reports to authenticated;
create policy feed_reply_read on public.feed_replies for select to authenticated using (
 public.is_event_admin(event_id) or (status='visible' and private.feed_post_available(event_id,post_id) and private.feed_visible(event_id,author_id))
);
create policy feed_like_read on public.feed_likes for select to authenticated using (
 private.feed_post_available(event_id,post_id) and private.feed_visible(event_id,attendee_id)
);
create policy feed_reply_report_read on public.feed_reply_reports for select to authenticated using (
 public.is_event_admin(event_id) or reporter_id=private.feed_member(event_id)
);

create function public.publish_feed_reply(p_event uuid,p_post uuid,p_client uuid,p_body text)
returns public.feed_replies language plpgsql security definer set search_path='' as $$
declare v_me uuid:=private.feed_member(p_event); v_reply public.feed_replies; v_name text;
begin
 if v_me is null or not private.feed_post_available(p_event,p_post) then raise exception 'This post is unavailable' using errcode='42501'; end if;
 if p_client is null or p_body is null or char_length(btrim(p_body)) not between 1 and 2000 then raise exception 'Add 1 to 2000 characters and a request ID' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('feed-reply:'||v_me::text,0));
 perform 1 from public.feed_posts where event_id=p_event and id=p_post and status='visible' for share;
 if not found then raise exception 'This post is unavailable' using errcode='42501'; end if;
 select * into v_reply from public.feed_replies where event_id=p_event and author_id=v_me and client_id=p_client;
 if found then
   if v_reply.post_id<>p_post or v_reply.body<>btrim(p_body) then raise exception 'This request ID was used for another reply' using errcode='22023'; end if;
   return v_reply;
 end if;
 if (select count(*) from public.feed_replies where event_id=p_event and author_id=v_me and created_at>clock_timestamp()-interval '1 minute')>=30 then
   raise exception 'Please wait a minute before replying again' using errcode='P0001'; end if;
 select full_name into v_name from public.attendee_profiles where event_id=p_event and attendee_id=v_me;
 insert into public.feed_replies(event_id,post_id,author_id,client_id,author_name,body)
 values(p_event,p_post,v_me,p_client,coalesce(nullif(v_name,''),'Event attendee'),btrim(p_body)) returning * into v_reply;
 return v_reply;
end $$;
create function public.edit_feed_reply(p_event uuid,p_reply uuid,p_version integer,p_body text,p_delete boolean default false)
returns void language plpgsql security definer set search_path='' as $$
declare v_me uuid:=private.feed_member(p_event); v_reply public.feed_replies;
begin
 if v_me is null then raise exception 'Event access required' using errcode='42501'; end if;
 select * into v_reply from public.feed_replies where event_id=p_event and id=p_reply for update;
 if not found or v_reply.author_id<>v_me or v_reply.status<>'visible' or not private.feed_post_available(p_event,v_reply.post_id) then
   raise exception 'This reply cannot be edited by this account' using errcode='42501'; end if;
 if p_version is distinct from v_reply.version then raise exception 'The reply changed. Refresh before editing' using errcode='40001'; end if;
 if p_delete is null or (not p_delete and (p_body is null or char_length(btrim(p_body)) not between 1 and 2000)) then raise exception 'Add 1 to 2000 characters' using errcode='22023'; end if;
 update public.feed_replies set body=case when p_delete then body else btrim(p_body) end,
 status=case when p_delete then 'deleted' else 'visible' end,version=version+1,updated_at=clock_timestamp() where event_id=p_event and id=p_reply;
end $$;
create function public.set_feed_like(p_event uuid,p_post uuid,p_liked boolean)
returns void language plpgsql security definer set search_path='' as $$
declare v_me uuid:=private.feed_member(p_event);
begin
 if v_me is null or not private.feed_post_available(p_event,p_post) then raise exception 'This post is unavailable' using errcode='42501'; end if;
 if p_liked is null then raise exception 'Choose like or unlike' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('feed-like:'||v_me::text,0));
 perform 1 from public.feed_posts where event_id=p_event and id=p_post and status='visible' for share;
 if not found then raise exception 'This post is unavailable' using errcode='42501'; end if;
 if p_liked then
   if not exists(select 1 from public.feed_likes where event_id=p_event and post_id=p_post and attendee_id=v_me)
     and (select count(*) from public.feed_likes where event_id=p_event and attendee_id=v_me and created_at>clock_timestamp()-interval '1 minute')>=60 then
     raise exception 'Please wait before liking more posts' using errcode='P0001'; end if;
   insert into public.feed_likes(event_id,post_id,attendee_id) values(p_event,p_post,v_me) on conflict do nothing;
 else delete from public.feed_likes where event_id=p_event and post_id=p_post and attendee_id=v_me;
 end if;
end $$;
create function public.feed_engagement(p_event uuid,p_posts uuid[])
returns table(post_id uuid,like_count bigint,liked_by_me boolean,reply_count bigint)
language sql stable security invoker set search_path='' as $$
 select p.id,
   (select count(*) from public.feed_likes l where l.event_id=p_event and l.post_id=p.id),
   exists(select 1 from public.feed_likes l where l.event_id=p_event and l.post_id=p.id and l.attendee_id=public.current_attendee(p_event)),
   (select count(*) from public.feed_replies r where r.event_id=p_event and r.post_id=p.id and r.status='visible')
 from public.feed_posts p where p.event_id=p_event and p.id=any(p_posts) and cardinality(p_posts)<=100;
$$;

create function public.report_feed_reply(p_event uuid,p_reply uuid,p_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_me uuid:=private.feed_member(p_event); v_reply public.feed_replies; v_id uuid;
begin
 if v_me is null then raise exception 'Event access required' using errcode='42501'; end if;
 select * into v_reply from public.feed_replies where event_id=p_event and id=p_reply;
 if not found or v_reply.status<>'visible' or v_reply.author_id=v_me or not private.feed_post_available(p_event,v_reply.post_id)
   or not private.feed_visible(p_event,v_reply.author_id) then raise exception 'Reply unavailable' using errcode='42501'; end if;
 if p_reason is null or char_length(btrim(p_reason)) not between 3 and 1000 then raise exception 'Add a report reason' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('feed-reply-report:'||v_me::text,0));
 select id into v_id from public.feed_reply_reports where event_id=p_event and reply_id=p_reply and reporter_id=v_me and status='open' limit 1;
 if found then return v_id; end if;
 if (select count(*) from public.feed_reply_reports where event_id=p_event and reporter_id=v_me and created_at>now()-interval '1 hour')>=10 then
   raise exception 'Please contact the event team for further help' using errcode='P0001'; end if;
 insert into public.feed_reply_reports(event_id,reply_id,reporter_id,reason) values(p_event,p_reply,v_me,btrim(p_reason)) returning id into v_id;
 return v_id;
end $$;
create function public.moderate_feed_reply(p_event uuid,p_reply uuid,p_status text,p_report uuid default null,p_report_status text default 'reviewed')
returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_event_admin(p_event) then raise exception 'Organizer access required' using errcode='42501'; end if;
 if p_status is null or p_status not in('visible','hidden','deleted') or p_report_status is null or p_report_status not in('reviewed','dismissed') then
   raise exception 'Invalid moderation action' using errcode='22023'; end if;
 update public.feed_replies set status=p_status,version=version+1,updated_at=clock_timestamp() where event_id=p_event and id=p_reply;
 if not found then raise exception 'Reply unavailable' using errcode='22023'; end if;
 if p_report is not null then
   update public.feed_reply_reports set status=p_report_status where event_id=p_event and id=p_report and reply_id=p_reply;
   if not found then raise exception 'Report unavailable' using errcode='22023'; end if;
 end if;
 insert into public.audit_log(event_id,actor_user_id,action,entity_id,details)
 values(p_event,auth.uid(),'feed.reply_moderated',p_reply::text,jsonb_build_object('status',p_status,'report',p_report));
end $$;
revoke all on function public.publish_feed_reply(uuid,uuid,uuid,text),public.edit_feed_reply(uuid,uuid,integer,text,boolean),public.set_feed_like(uuid,uuid,boolean),public.feed_engagement(uuid,uuid[]),public.report_feed_reply(uuid,uuid,text),public.moderate_feed_reply(uuid,uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.publish_feed_reply(uuid,uuid,uuid,text),public.edit_feed_reply(uuid,uuid,integer,text,boolean),public.set_feed_like(uuid,uuid,boolean),public.feed_engagement(uuid,uuid[]),public.report_feed_reply(uuid,uuid,text),public.moderate_feed_reply(uuid,uuid,text,uuid,text) to authenticated;

commit;
