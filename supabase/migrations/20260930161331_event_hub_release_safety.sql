begin;

alter table public.event_settings
  add column community_enabled boolean not null default false,
  add column feed_enabled boolean not null default false,
  add column announcements_enabled boolean not null default true;
alter table public.agenda_sessions add column end_time_confirmed boolean not null default true;
alter table public.lunch_locations
  add column event_date date,
  add column category text not null default 'Lunch' check (category in ('VIP','Breakout','Seating','Food Truck','Lunch')),
  add column menu_url text not null default '' check (length(menu_url)<=2048 and (menu_url='' or menu_url ~ '^https://'));

alter table public.feed_posts
  add column client_id uuid not null default gen_random_uuid(),
  add column author_name text not null default 'Event attendee' check (char_length(author_name) between 1 and 120),
  add column version integer not null default 0,
  add constraint feed_client_once unique(event_id,author_id,client_id);
create index feed_posts_author_rate_idx on public.feed_posts(event_id,author_id,created_at desc);
create index feed_reports_author_rate_idx on public.feed_reports(event_id,reporter_id,created_at desc);

create schema if not exists private;
revoke all on schema private from public,anon;
grant usage on schema private to authenticated;
create function private.feed_member(p_event uuid) returns uuid language sql stable security definer set search_path='' as $$
  select a.id from public.attendees a join auth.users u on u.id=a.user_id
    join public.event_settings s on s.event_id=a.event_id
  where a.event_id=p_event and u.id=auth.uid() and u.email_confirmed_at is not null
    and a.status='approved' and s.community_enabled and s.feed_enabled;
$$;
create function private.feed_visible(p_event uuid,p_author uuid) returns boolean language sql stable security definer set search_path='' as $$
  select public.is_event_admin(p_event) or (
    private.feed_member(p_event) is not null
    and exists(select 1 from public.attendees where event_id=p_event and id=p_author and status='approved')
    and not exists(select 1 from public.blocks where event_id=p_event and
      ((blocker_id=private.feed_member(p_event) and blocked_id=p_author)
        or (blocked_id=private.feed_member(p_event) and blocker_id=p_author)))
  );
$$;
revoke all on function private.feed_member(uuid),private.feed_visible(uuid,uuid) from public,anon,authenticated;
grant execute on function private.feed_member(uuid),private.feed_visible(uuid,uuid) to authenticated;

-- All writes go through guarded RPCs. Direct INSERT would bypass rate limits;
-- direct UPDATE would let an author undo moderator hiding or alter timestamps.
revoke all on public.feed_posts,public.feed_reports from anon,authenticated;
revoke update(status) on public.feed_reports from authenticated;
grant select on public.feed_posts,public.feed_reports to authenticated;
drop policy feed_read on public.feed_posts;
drop policy feed_own_read on public.feed_posts;
drop policy feed_insert on public.feed_posts;
drop policy feed_update_own on public.feed_posts;
drop policy feed_admin_update on public.feed_posts;
drop policy feed_reports_insert on public.feed_reports;
drop policy feed_reports_admin_update on public.feed_reports;
create policy feed_read on public.feed_posts for select to authenticated
 using(status='visible' and private.feed_visible(event_id,author_id));
create policy feed_own_read on public.feed_posts for select to authenticated
 using(author_id=private.feed_member(event_id));
revoke all on function public.create_feed_post(uuid,text) from public,anon,authenticated;

create function public.publish_feed_post(p_event uuid,p_client uuid,p_body text)
returns public.feed_posts language plpgsql security definer set search_path='' as $$
declare v_me uuid:=private.feed_member(p_event); v_post public.feed_posts; v_name text;
begin
 if v_me is null then raise exception 'The event social wall is not available for this account' using errcode='42501'; end if;
 if p_client is null or p_body is null or char_length(btrim(p_body)) not between 1 and 2000 then raise exception 'Add 1 to 2000 characters and a request ID' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('feed:'||v_me::text,0));
 select * into v_post from public.feed_posts where event_id=p_event and author_id=v_me and client_id=p_client;
 if found then
   if v_post.body<>btrim(p_body) then raise exception 'This request ID was used for another post' using errcode='22023'; end if;
   return v_post;
 end if;
 if (select count(*) from public.feed_posts where event_id=p_event and author_id=v_me and created_at>clock_timestamp()-interval '1 minute')>=10 then raise exception 'Please wait a minute before posting again' using errcode='P0001'; end if;
 select full_name into v_name from public.attendee_profiles where event_id=p_event and attendee_id=v_me;
 insert into public.feed_posts(event_id,author_id,client_id,body,author_name) values(p_event,v_me,p_client,btrim(p_body),coalesce(nullif(v_name,''),'Event attendee')) returning * into v_post;
 return v_post;
end $$;

create function public.edit_feed_post(p_event uuid,p_post uuid,p_version integer,p_body text,p_delete boolean default false)
returns public.feed_posts language plpgsql security definer set search_path='' as $$
declare v_me uuid:=private.feed_member(p_event); v_post public.feed_posts;
begin
 if v_me is null then raise exception 'Event access required' using errcode='42501'; end if;
 select * into v_post from public.feed_posts where event_id=p_event and id=p_post for update;
 if not found or v_post.author_id<>v_me or v_post.status<>'visible' then raise exception 'This post cannot be edited by this account' using errcode='42501'; end if;
 if p_version is distinct from v_post.version then raise exception 'The post changed. Refresh before editing' using errcode='40001'; end if;
 if p_delete is null or (not p_delete and (p_body is null or char_length(btrim(p_body)) not between 1 and 2000)) then raise exception 'Add 1 to 2000 characters' using errcode='22023'; end if;
 update public.feed_posts set body=case when p_delete then body else btrim(p_body) end,
   status=case when p_delete then 'deleted' else 'visible' end,version=version+1,updated_at=clock_timestamp()
 where event_id=p_event and id=p_post returning * into v_post;
 return v_post;
end $$;

create or replace function public.report_feed_post(p_event uuid,p_post uuid,p_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_me uuid:=private.feed_member(p_event); v_post public.feed_posts; v_id uuid;
begin
 if v_me is null then raise exception 'Event access required' using errcode='42501'; end if;
 if p_reason is null or char_length(btrim(p_reason)) not between 3 and 1000 then raise exception 'Add a report reason' using errcode='22023'; end if;
 select * into v_post from public.feed_posts where event_id=p_event and id=p_post;
 if not found or v_post.status<>'visible' or v_post.author_id=v_me or not private.feed_visible(p_event,v_post.author_id) then raise exception 'Post unavailable' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('feed-report:'||v_me::text,0));
 select id into v_id from public.feed_reports where event_id=p_event and post_id=p_post and reporter_id=v_me and status='open' limit 1;
 if found then return v_id; end if;
 if (select count(*) from public.feed_reports where event_id=p_event and reporter_id=v_me and created_at>clock_timestamp()-interval '1 hour')>=10 then raise exception 'Please contact the event team for further help' using errcode='P0001'; end if;
 insert into public.feed_reports(event_id,post_id,reporter_id,reason) values(p_event,p_post,v_me,btrim(p_reason)) returning id into v_id;
 return v_id;
end $$;

create function public.moderate_feed_post(p_event uuid,p_post uuid,p_status text,p_report uuid default null,p_report_status text default 'reviewed')
returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_event_admin(p_event) then raise exception 'Organizer access required' using errcode='42501'; end if;
 if p_status is null or p_status not in ('visible','hidden','deleted') or p_report_status is null or p_report_status not in ('open','reviewed','dismissed') then raise exception 'Invalid moderation action' using errcode='22023'; end if;
 update public.feed_posts set status=p_status,version=version+1,updated_at=clock_timestamp() where event_id=p_event and id=p_post;
 if not found then raise exception 'Post unavailable' using errcode='22023'; end if;
 if p_report is not null then
  update public.feed_reports set status=p_report_status where event_id=p_event and id=p_report and post_id=p_post;
  if not found then raise exception 'Report unavailable' using errcode='22023'; end if;
 end if;
 insert into public.audit_log(event_id,actor_user_id,action,entity_id,details) values(p_event,auth.uid(),'feed.moderated',p_post::text,jsonb_build_object('status',p_status,'report',p_report));
end $$;

revoke all on function public.publish_feed_post(uuid,uuid,text),public.edit_feed_post(uuid,uuid,integer,text,boolean),public.report_feed_post(uuid,uuid,text),public.moderate_feed_post(uuid,uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.publish_feed_post(uuid,uuid,text),public.edit_feed_post(uuid,uuid,integer,text,boolean),public.report_feed_post(uuid,uuid,text),public.moderate_feed_post(uuid,uuid,text,uuid,text) to authenticated;

-- Existing events stay unchanged except for the explicitly requested event's
-- no-notifications scope. Community enablement is a separate release action.
update public.event_settings set announcements_enabled=false
 where event_id in(select id from public.events where slug='momentum-builder-live-2026');

create or replace function public.admin_save_agenda_session(
  p_event uuid, p_session uuid, p_values jsonb, p_speaker_ids uuid[]
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid;
  v_values public.agenda_sessions;
  v_fields text[] := array['day_id','title','description','starts_at','ends_at','room','session_type','sponsor_id','published','is_demo'];
begin
  if auth.uid() is null or not public.is_event_admin(p_event) then
    raise exception 'Organizer access is required' using errcode = '42501';
  end if;
  if p_values is null or jsonb_typeof(p_values) <> 'object' then
    raise exception 'Provide the session fields' using errcode = '22023';
  end if;
  if not (p_values ?& v_fields) or exists (
    select 1 from jsonb_object_keys(p_values) as field(key) where not (key = any(v_fields)) and key <> 'end_time_confirmed'
  ) then
    raise exception 'Provide only the editable session fields' using errcode = '22023';
  end if;
  if p_speaker_ids is null or cardinality(p_speaker_ids) > 100 or array_ndims(p_speaker_ids) > 1 then
    raise exception 'Choose up to 100 speakers from this event' using errcode = '22023';
  end if;
  if array_position(p_speaker_ids, null) is not null then
    raise exception 'Choose valid speakers from this event' using errcode = '22023';
  end if;
  if p_values ? 'end_time_confirmed' and jsonb_typeof(p_values->'end_time_confirmed') is distinct from 'boolean' then raise exception 'Confirm whether the end time is known' using errcode='22023'; end if;
  select * into v_values from jsonb_populate_record(null::public.agenda_sessions, p_values);
  if v_values.day_id is null or v_values.title is null or char_length(btrim(v_values.title)) not between 1 and 160
    or v_values.description is null or char_length(v_values.description) > 5000
    or v_values.room is null or char_length(v_values.room) > 160
    or v_values.starts_at is null or v_values.ends_at is null
    or v_values.session_type is null or v_values.session_type not in ('Keynote','Workshop','Panel','Networking','Break','Session')
    or jsonb_typeof(p_values->'published') is distinct from 'boolean'
    or jsonb_typeof(p_values->'is_demo') is distinct from 'boolean' then
    raise exception 'Provide valid session fields' using errcode = '22023';
  end if;
  if v_values.ends_at <= v_values.starts_at then
    raise exception 'End time must be after start time' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(p_speaker_ids) as selected(id)
    where not exists (select 1 from public.speakers s where s.event_id = p_event and s.id = selected.id)
  ) then
    raise exception 'A selected speaker is no longer available in this event. Refresh the session and try again.' using errcode = '22023';
  end if;

  if p_session is not null then
    -- Serialize operator saves on the same parent row. Existing RLS, composite
    -- foreign keys, organizer audit and review-reopen triggers remain active.
    select id into v_id from public.agenda_sessions where event_id = p_event and id = p_session for update;
    if not found then
      raise exception 'This session is no longer available in this event. Refresh the section and try again.' using errcode = '22023';
    end if;
    update public.agenda_sessions set day_id = v_values.day_id, title = btrim(v_values.title),
      description = v_values.description, starts_at = v_values.starts_at, ends_at = v_values.ends_at,
      room = v_values.room, session_type = v_values.session_type, sponsor_id = v_values.sponsor_id,
      published = v_values.published, is_demo = v_values.is_demo, end_time_confirmed = coalesce(v_values.end_time_confirmed,true)
      where event_id = p_event and id = v_id;
  else
    insert into public.agenda_sessions(event_id,day_id,title,description,starts_at,ends_at,room,session_type,sponsor_id,published,is_demo,end_time_confirmed)
      values (p_event,v_values.day_id,btrim(v_values.title),v_values.description,v_values.starts_at,v_values.ends_at,
        v_values.room,v_values.session_type,v_values.sponsor_id,v_values.published,v_values.is_demo,coalesce(v_values.end_time_confirmed,true))
      returning id into v_id;
  end if;

  delete from public.session_speakers where event_id = p_event and session_id = v_id and not (speaker_id = any(p_speaker_ids));
  insert into public.session_speakers(event_id,session_id,speaker_id)
    select p_event,v_id,id from (select distinct unnest(p_speaker_ids) as id) selected
    on conflict (event_id,session_id,speaker_id) do nothing;
  return v_id;
end $$;


commit;
