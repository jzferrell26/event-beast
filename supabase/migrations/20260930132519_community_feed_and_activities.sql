begin;

create table public.event_activities (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  activity_type text not null default 'Activity' check (activity_type in ('Activity','Party','Breakout','Book Signing','Fitness','Wellness','Networking','Other')),
  starts_at timestamptz,
  ends_at timestamptz,
  location text not null default '' check (char_length(location) <= 240),
  description text not null default '' check (char_length(description) <= 4000),
  host text not null default '' check (char_length(host) <= 240),
  capacity_note text not null default '' check (char_length(capacity_note) <= 500),
  sort_order integer not null default 100 check (sort_order between 0 and 100000),
  published boolean not null default false,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(event_id,id),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);
create index event_activities_event_time_idx on public.event_activities(event_id,starts_at,sort_order);
alter table public.event_activities enable row level security;

create table public.feed_posts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  author_id uuid not null,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  status text not null default 'visible' check (status in ('visible','hidden','deleted')),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique(event_id,id),
  foreign key (event_id,author_id) references public.attendees(event_id,id) on delete cascade
);
create index feed_posts_event_created_idx on public.feed_posts(event_id,created_at desc,id desc);
alter table public.feed_posts enable row level security;

create table public.feed_reports (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  post_id uuid not null,
  reporter_id uuid not null,
  reason text not null check (char_length(btrim(reason)) between 3 and 1000),
  status text not null default 'open' check (status in ('open','reviewed','dismissed')),
  created_at timestamptz not null default now(),
  unique(event_id,id),
  foreign key (event_id,post_id) references public.feed_posts(event_id,id) on delete cascade,
  foreign key (event_id,reporter_id) references public.attendees(event_id,id) on delete cascade
);
create index feed_reports_queue_idx on public.feed_reports(event_id,status,created_at desc);
alter table public.feed_reports enable row level security;

create policy activities_read on public.event_activities for select using ((published and public.can_read_event(event_id)) or public.is_event_admin(event_id));
create policy activities_admin on public.event_activities for all to authenticated using (public.is_event_admin(event_id)) with check (public.is_event_admin(event_id));

create policy feed_read on public.feed_posts for select to authenticated using (
  public.current_attendee(event_id) is not null and status='visible'
  and not exists (
    select 1 from public.blocks b where b.event_id=feed_posts.event_id and (
      (b.blocker_id=public.current_attendee(feed_posts.event_id) and b.blocked_id=feed_posts.author_id)
      or (b.blocked_id=public.current_attendee(feed_posts.event_id) and b.blocker_id=feed_posts.author_id)
    )
  )
);
create policy feed_own_read on public.feed_posts for select to authenticated using (author_id=public.current_attendee(event_id));
create policy feed_admin_read on public.feed_posts for select to authenticated using (public.is_event_admin(event_id));
create policy feed_insert on public.feed_posts for insert to authenticated with check (
  author_id=public.current_attendee(event_id)
  and exists(select 1 from public.attendees a where a.event_id=feed_posts.event_id and a.id=author_id and a.status='approved')
);
create policy feed_update_own on public.feed_posts for update to authenticated
  using (author_id=public.current_attendee(event_id) and status<>'deleted')
  with check (author_id=public.current_attendee(event_id) and status in ('visible','deleted'));
create policy feed_admin_update on public.feed_posts for update to authenticated
  using (public.is_event_admin(event_id)) with check (public.is_event_admin(event_id));

create policy feed_reports_read on public.feed_reports for select to authenticated
  using (reporter_id=public.current_attendee(event_id) or public.is_event_admin(event_id));
create policy feed_reports_insert on public.feed_reports for insert to authenticated with check (
  reporter_id=public.current_attendee(event_id)
  and exists(select 1 from public.feed_posts p where p.event_id=feed_reports.event_id and p.id=feed_reports.post_id and p.author_id<>reporter_id)
);
create policy feed_reports_admin_update on public.feed_reports for update to authenticated
  using (public.is_event_admin(event_id)) with check (public.is_event_admin(event_id));

revoke all on public.event_activities, public.feed_posts, public.feed_reports from anon,authenticated;
grant select on public.event_activities to anon,authenticated;
grant insert,update,delete on public.event_activities to authenticated;
grant select,insert,update on public.feed_posts to authenticated;
grant select,insert on public.feed_reports to authenticated;
grant update(status) on public.feed_reports to authenticated;

create function public.create_feed_post(p_event uuid,p_body text)
returns public.feed_posts language plpgsql security definer set search_path='' as $$
declare v_me uuid:=public.current_attendee(p_event); v_post public.feed_posts;
begin
  if v_me is null then raise exception 'Event access required' using errcode='42501'; end if;
  if p_body is null or char_length(btrim(p_body)) not between 1 and 2000 then raise exception 'Post must contain 1 to 2000 characters' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('feed:'||v_me::text,0));
  if (select count(*) from public.feed_posts where event_id=p_event and author_id=v_me and created_at>clock_timestamp()-interval '1 minute')>=10 then
    raise exception 'Please wait before posting again' using errcode='P0001';
  end if;
  insert into public.feed_posts(event_id,author_id,body) values(p_event,v_me,btrim(p_body)) returning * into v_post;
  return v_post;
end $$;

create function public.report_feed_post(p_event uuid,p_post uuid,p_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_me uuid:=public.current_attendee(p_event); v_author uuid; v_id uuid;
begin
  if v_me is null then raise exception 'Event access required' using errcode='42501'; end if;
  select author_id into v_author from public.feed_posts where event_id=p_event and id=p_post and status='visible';
  if v_author is null or v_author=v_me then raise exception 'Post unavailable' using errcode='42501'; end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 3 and 1000 then raise exception 'Add a report reason' using errcode='22023'; end if;
  if (select count(*) from public.feed_reports where event_id=p_event and reporter_id=v_me and created_at>now()-interval '1 hour')>=10 then
    raise exception 'Please contact the event team for help' using errcode='P0001';
  end if;
  insert into public.feed_reports(event_id,post_id,reporter_id,reason) values(p_event,p_post,v_me,btrim(p_reason)) returning id into v_id;
  return v_id;
end $$;

revoke all on function public.create_feed_post(uuid,text), public.report_feed_post(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.create_feed_post(uuid,text), public.report_feed_post(uuid,uuid,text) to authenticated;

create trigger organizer_audit_activity after insert or update or delete on public.event_activities
  for each row execute function public.record_organizer_audit();

commit;
