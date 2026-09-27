-- Event Beast owns this database. Apply only to its dedicated project.
begin;

create table public.events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,100}$'),
  name text not null check (char_length(name) between 1 and 160),
  tagline text not null default '',
  timezone text not null default 'America/Chicago',
  start_date date,
  end_date date,
  published boolean not null default false,
  public_guide boolean not null default true,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);

create table public.event_settings (
  event_id uuid primary key references public.events(id) on delete cascade,
  welcome_title text not null default 'Welcome to Momentum Builder LIVE 2026',
  welcome_body text not null default 'Your people. Your next move. All in one place.',
  support_email text not null default '',
  support_location text not null default 'Visit the event welcome desk.',
  technology_attribution boolean not null default true,
  directory_enabled boolean not null default true,
  messaging_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.event_admins (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'organizer' check (role in ('owner', 'organizer')),
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index event_admins_user_idx on public.event_admins(user_id, event_id);

-- This is the PRIVATE registration/eligibility table, never a public directory.
create table public.attendees (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  registration_email text not null check (
    registration_email = lower(btrim(registration_email)) and
    char_length(registration_email) <= 254 and registration_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  registration_name text not null check (char_length(registration_name) between 1 and 120),
  status text not null default 'approved' check (status in ('approved', 'pending', 'disabled')),
  directory_allowed boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, id),
  unique (event_id, registration_email),
  unique (event_id, user_id)
);
create index attendees_user_idx on public.attendees(user_id, event_id, status);
create index attendees_event_status_idx on public.attendees(event_id, status);

create table public.attendee_profiles (
  attendee_id uuid primary key,
  event_id uuid not null,
  full_name text not null check (char_length(full_name) between 1 and 120),
  company text not null default '' check (char_length(company) <= 120),
  title text not null default '' check (char_length(title) <= 120),
  city text not null default '' check (char_length(city) <= 80),
  state text not null default '' check (char_length(state) <= 80),
  bio text not null default '' check (char_length(bio) <= 1000),
  interests text[] not null default '{}' check (cardinality(interests) <= 12),
  headshot_path text,
  public_email text not null default '' check (char_length(public_email) <= 254),
  public_phone text not null default '' check (char_length(public_phone) <= 40),
  website text not null default '' check (website = '' or website ~ '^https://'),
  directory_visible boolean not null default false,
  messaging_available boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (event_id, attendee_id),
  foreign key (event_id, attendee_id) references public.attendees(event_id, id) on delete cascade,
  check (headshot_path is null or headshot_path like event_id::text || '/' || attendee_id::text || '/%')
);
create index profiles_directory_idx on public.attendee_profiles(event_id, directory_visible, full_name);
create index profiles_interests_idx on public.attendee_profiles using gin(interests);

create table public.attendee_preferences (
  event_id uuid not null,
  attendee_id uuid not null,
  onboarding_step integer not null default 0 check (onboarding_step between 0 and 6),
  onboarding_done boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (event_id, attendee_id),
  foreign key (event_id, attendee_id) references public.attendees(event_id, id) on delete cascade
);

create table public.sponsor_tiers (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  sort_order integer not null default 100,
  unique (event_id, id),
  unique (event_id, name)
);

create table public.sponsors (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  tier_id uuid,
  name text not null check (char_length(name) between 1 and 120),
  description text not null default '' check (char_length(description) <= 3000),
  logo_url text not null default '' check (logo_url = '' or logo_url ~ '^https://'),
  booth text not null default '',
  cta_label text not null default 'Learn more',
  cta_url text not null default '' check (cta_url = '' or cta_url ~ '^https://'),
  featured boolean not null default false,
  sort_order integer not null default 100,
  published boolean not null default false,
  is_demo boolean not null default false,
  unique (event_id, id),
  foreign key (event_id, tier_id) references public.sponsor_tiers(event_id, id)
);
create index sponsors_tier_idx on public.sponsors(event_id, tier_id);

create table public.sponsor_representatives (
  event_id uuid not null,
  sponsor_id uuid not null,
  attendee_id uuid not null,
  primary key (event_id, sponsor_id, attendee_id),
  foreign key (event_id, sponsor_id) references public.sponsors(event_id, id) on delete cascade,
  foreign key (event_id, attendee_id) references public.attendees(event_id, id) on delete cascade
);
create index representatives_attendee_idx on public.sponsor_representatives(event_id, attendee_id);

create table public.speakers (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 1 and 120),
  title text not null default '',
  bio text not null default '',
  headshot_url text not null default '' check (headshot_url = '' or headshot_url ~ '^https://'),
  published boolean not null default false,
  is_demo boolean not null default false,
  unique (event_id, id)
);

create table public.agenda_days (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 80),
  date date not null,
  sort_order integer not null default 0,
  published boolean not null default false,
  unique (event_id, id),
  unique (event_id, date)
);

create table public.agenda_sessions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  day_id uuid not null,
  title text not null check (char_length(title) between 1 and 160),
  description text not null default '' check (char_length(description) <= 5000),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  room text not null default '',
  session_type text not null default 'Session' check (session_type in ('Keynote', 'Workshop', 'Panel', 'Networking', 'Break', 'Session')),
  sponsor_id uuid,
  published boolean not null default false,
  is_demo boolean not null default false,
  unique (event_id, id),
  foreign key (event_id, day_id) references public.agenda_days(event_id, id),
  foreign key (event_id, sponsor_id) references public.sponsors(event_id, id),
  check (ends_at > starts_at)
);
create index agenda_sessions_day_idx on public.agenda_sessions(event_id, day_id, starts_at);
create index agenda_sessions_sponsor_idx on public.agenda_sessions(event_id, sponsor_id);

create table public.session_speakers (
  event_id uuid not null,
  session_id uuid not null,
  speaker_id uuid not null,
  primary key (event_id, session_id, speaker_id),
  foreign key (event_id, session_id) references public.agenda_sessions(event_id, id) on delete cascade,
  foreign key (event_id, speaker_id) references public.speakers(event_id, id) on delete cascade
);
create index session_speakers_speaker_idx on public.session_speakers(event_id, speaker_id);

create table public.agenda_sponsor_placements (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  day_id uuid not null,
  after_session_id uuid,
  sponsor_id uuid not null,
  headline text not null default '',
  body text not null default '',
  sort_order integer not null default 0,
  published boolean not null default false,
  unique (event_id, id),
  foreign key (event_id, day_id) references public.agenda_days(event_id, id),
  foreign key (event_id, after_session_id) references public.agenda_sessions(event_id, id),
  foreign key (event_id, sponsor_id) references public.sponsors(event_id, id)
);
create index placements_day_idx on public.agenda_sponsor_placements(event_id, day_id);
create index placements_session_idx on public.agenda_sponsor_placements(event_id, after_session_id);
create index placements_sponsor_idx on public.agenda_sponsor_placements(event_id, sponsor_id);

create table public.lunch_locations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  title text not null,
  location text not null default '',
  hours text not null default '',
  description text not null default '',
  dietary_info text not null default '',
  directions_url text not null default '' check (directions_url = '' or directions_url ~ '^https://'),
  image_url text not null default '' check (image_url = '' or image_url ~ '^https://'),
  sort_order integer not null default 0,
  published boolean not null default false,
  is_demo boolean not null default false,
  unique (event_id, id)
);

create table public.venue_locations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  title text not null,
  location text not null default '',
  description text not null default '',
  directions_url text not null default '' check (directions_url = '' or directions_url ~ '^https://'),
  map_url text not null default '' check (map_url = '' or map_url ~ '^https://'),
  sort_order integer not null default 0,
  published boolean not null default false,
  is_demo boolean not null default false,
  unique (event_id, id)
);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  body text not null check (char_length(body) between 1 and 4000),
  severity text not null default 'info' check (severity in ('info', 'important', 'urgent')),
  starts_at timestamptz,
  expires_at timestamptz,
  published boolean not null default false,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  unique (event_id, id),
  check (expires_at is null or starts_at is null or expires_at > starts_at)
);

create table public.saved_sessions (
  event_id uuid not null,
  attendee_id uuid not null,
  session_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (event_id, attendee_id, session_id),
  foreign key (event_id, attendee_id) references public.attendees(event_id, id) on delete cascade,
  foreign key (event_id, session_id) references public.agenda_sessions(event_id, id) on delete cascade
);
create index saved_sessions_session_idx on public.saved_sessions(event_id, session_id);

create table public.saved_attendees (
  event_id uuid not null,
  attendee_id uuid not null,
  target_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (event_id, attendee_id, target_id),
  foreign key (event_id, attendee_id) references public.attendees(event_id, id) on delete cascade,
  foreign key (event_id, target_id) references public.attendees(event_id, id) on delete cascade,
  check (attendee_id <> target_id)
);
create index saved_attendees_target_idx on public.saved_attendees(event_id, target_id);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  attendee_a uuid not null,
  attendee_b uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, id),
  unique (event_id, attendee_a, attendee_b),
  foreign key (event_id, attendee_a) references public.attendees(event_id, id),
  foreign key (event_id, attendee_b) references public.attendees(event_id, id),
  check (attendee_a < attendee_b)
);
create index conversations_a_idx on public.conversations(event_id, attendee_a, updated_at desc);
create index conversations_b_idx on public.conversations(event_id, attendee_b, updated_at desc);

create table public.messages (
  id bigint generated always as identity primary key,
  event_id uuid not null,
  conversation_id uuid not null,
  sender_id uuid not null,
  client_id uuid not null,
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default clock_timestamp(),
  unique (event_id, id),
  unique (event_id, conversation_id, sender_id, client_id),
  foreign key (event_id, conversation_id) references public.conversations(event_id, id),
  foreign key (event_id, sender_id) references public.attendees(event_id, id)
);
create index messages_conversation_idx on public.messages(event_id, conversation_id, id desc);
create index messages_sender_rate_idx on public.messages(sender_id, created_at desc);

create table public.conversation_reads (
  event_id uuid not null,
  conversation_id uuid not null,
  attendee_id uuid not null,
  last_read_id bigint not null default 0 check (last_read_id >= 0),
  updated_at timestamptz not null default now(),
  primary key (event_id, conversation_id, attendee_id),
  foreign key (event_id, conversation_id) references public.conversations(event_id, id) on delete cascade,
  foreign key (event_id, attendee_id) references public.attendees(event_id, id) on delete cascade
);
create index conversation_reads_attendee_idx on public.conversation_reads(event_id, attendee_id);

create table public.blocks (
  event_id uuid not null,
  blocker_id uuid not null,
  blocked_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (event_id, blocker_id, blocked_id),
  foreign key (event_id, blocker_id) references public.attendees(event_id, id),
  foreign key (event_id, blocked_id) references public.attendees(event_id, id),
  check (blocker_id <> blocked_id)
);
create index blocks_reverse_idx on public.blocks(event_id, blocked_id, blocker_id);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  reporter_id uuid not null,
  target_id uuid not null,
  message_id bigint,
  reason text not null check (char_length(btrim(reason)) between 3 and 2000),
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  created_at timestamptz not null default now(),
  foreign key (event_id, reporter_id) references public.attendees(event_id, id),
  foreign key (event_id, target_id) references public.attendees(event_id, id),
  foreign key (event_id, message_id) references public.messages(event_id, id),
  check (reporter_id <> target_id)
);
create index reports_queue_idx on public.reports(event_id, status, created_at);
create index reports_reporter_idx on public.reports(event_id, reporter_id);
create index reports_target_idx on public.reports(event_id, target_id);
create index reports_message_idx on public.reports(event_id, message_id);

create table public.audit_log (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events(id),
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_id text,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_log_event_idx on public.audit_log(event_id, created_at desc);
create index audit_log_actor_idx on public.audit_log(actor_user_id);

-- RLS is enabled on every application table before granting any API access.
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

commit;
