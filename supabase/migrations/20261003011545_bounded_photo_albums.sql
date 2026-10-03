begin;

alter table public.feed_posts add column photo_count integer not null default 0;
update public.feed_posts set photo_count=1 where image_path is not null;
alter table public.feed_posts add constraint feed_photo_count_check check (
  photo_count between 0 and 5 and ((image_path is null and photo_count=0) or (image_path is not null and photo_count between 1 and 5))
);

-- The first slot retains the previous path for old clients and old posts.
create function private.feed_photo_base(p_path text)
returns text language sql immutable set search_path='' as $$
 select regexp_replace(p_path,'-[2-5]\.webp$','.webp');
$$;
create function private.feed_photo_slot(p_path text)
returns integer language sql immutable set search_path='' as $$
 select case when p_path ~ '-[2-5]\.webp$' then substring(p_path from '-([2-5])\.webp$')::integer else 1 end;
$$;
create or replace function private.feed_photo_owner(p_path text)
returns boolean language sql stable security definer set search_path='' as $$
 select p_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}(-[2-5])?\.webp$'
   and exists(select 1 from public.attendees a where a.event_id::text=split_part(p_path,'/',1)
     and a.id::text=split_part(p_path,'/',2) and a.id=private.feed_member(a.event_id));
$$;
create or replace function private.feed_photo_read(p_path text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.feed_posts p where p.image_path=private.feed_photo_base(p_path)
   and p.photo_count>=private.feed_photo_slot(p_path)
   and (public.is_event_admin(p.event_id) or (p.status='visible' and private.feed_visible(p.event_id,p.author_id))))
   or (private.feed_photo_owner(p_path) and not exists(select 1 from public.feed_posts where image_path=private.feed_photo_base(p_path) and photo_count>=private.feed_photo_slot(p_path)));
$$;
create or replace function private.feed_photo_insert(p_path text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if not private.feed_photo_owner(p_path) then return false; end if;
 perform pg_advisory_xact_lock(hashtextextended('feed:'||split_part(p_path,'/',2),0));
 return not exists(select 1 from public.feed_posts where image_path=private.feed_photo_base(p_path))
   and (select count(*) from storage.objects o where o.bucket_id='event-feed-photos'
     and split_part(o.name,'/',1)=split_part(p_path,'/',1)
     and split_part(o.name,'/',2)=split_part(p_path,'/',2)) < 200;
end $$;
create or replace function private.feed_photo_remove(p_path text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if not private.feed_photo_owner(p_path) then return false; end if;
 perform pg_advisory_xact_lock(hashtextextended('feed:'||split_part(p_path,'/',2),0));
 return not exists(select 1 from public.feed_posts where image_path=private.feed_photo_base(p_path)
   and photo_count>=private.feed_photo_slot(p_path));
end $$;

create function public.publish_feed_post_with_photos(p_event uuid,p_client uuid,p_body text,p_count integer)
returns public.feed_posts language plpgsql security definer set search_path='' as $$
declare v_me uuid:=private.feed_member(p_event); v_post public.feed_posts; v_name text; v_path text; v_slot text; i integer;
begin
 if v_me is null then raise exception 'The event social wall is not available for this account' using errcode='42501'; end if;
 if p_client is null or p_body is null or p_count is null or p_count not between 0 and 5
   or char_length(btrim(p_body))>2000 or (btrim(p_body)='' and p_count=0) then
   raise exception 'Add text or up to five photos and a request ID' using errcode='22023'; end if;
 if p_count>0 then v_path:=p_event::text||'/'||v_me::text||'/'||p_client::text||'.webp'; end if;
 perform pg_advisory_xact_lock(hashtextextended('feed:'||v_me::text,0));
 select * into v_post from public.feed_posts where event_id=p_event and author_id=v_me and client_id=p_client;
 if found then
   if v_post.body<>btrim(p_body) or v_post.photo_count<>p_count or v_post.image_path is distinct from v_path then
     raise exception 'This request ID was used for another post' using errcode='22023'; end if;
   return v_post;
 end if;
 for i in 1..p_count loop
   v_slot:=case when i=1 then v_path else regexp_replace(v_path,'\.webp$','-'||i::text||'.webp') end;
   if not exists(select 1 from storage.objects where bucket_id='event-feed-photos' and name=v_slot) then
     raise exception 'Upload every selected photo before posting' using errcode='22023'; end if;
 end loop;
 if (select count(*) from public.feed_posts where event_id=p_event and author_id=v_me and created_at>clock_timestamp()-interval '1 minute')>=10 then
   raise exception 'Please wait a minute before posting again' using errcode='P0001'; end if;
 select full_name into v_name from public.attendee_profiles where event_id=p_event and attendee_id=v_me;
 insert into public.feed_posts(event_id,author_id,client_id,body,author_name,image_path,photo_count)
 values(p_event,v_me,p_client,btrim(p_body),coalesce(nullif(v_name,''),'Event attendee'),v_path,p_count) returning * into v_post;
 return v_post;
end $$;
create or replace function public.publish_feed_post_with_photo(p_event uuid,p_client uuid,p_body text,p_image boolean)
returns public.feed_posts language sql security definer set search_path='' as $$
 select public.publish_feed_post_with_photos(p_event,p_client,p_body,case when p_image is null then null when p_image then 1 else 0 end);
$$;
revoke all on function private.feed_photo_base(text),private.feed_photo_slot(text),public.publish_feed_post_with_photos(uuid,uuid,text,integer) from public,anon,authenticated;
grant execute on function public.publish_feed_post_with_photos(uuid,uuid,text,integer) to authenticated;

commit;
