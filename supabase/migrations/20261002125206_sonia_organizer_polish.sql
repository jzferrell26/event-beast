begin;
alter table public.event_settings
  add column sponsor_page_title text not null default 'Impact Partners' check (char_length(sponsor_page_title) between 1 and 160),
  add column sponsor_page_description text not null default 'Thank you to the partners making Momentum Builder LIVE possible.' check (char_length(sponsor_page_description) <= 600),
  add column wifi_network text not null default '' check (char_length(wifi_network) <= 120),
  add column wifi_password text not null default '' check (char_length(wifi_password) <= 120),
  add column support_sms text not null default '' check (char_length(support_sms) <= 40),
  add column venue_floor_plan_url text not null default '' check (venue_floor_plan_url = '' or venue_floor_plan_url ~ '^https://');
alter table public.sponsors add column sponsorship_note text not null default '' check (char_length(sponsorship_note) <= 240);
-- Existing event-scoped RLS, role policies and audited writes still apply.
-- These are expressly public event details, never authentication credentials.
commit;
