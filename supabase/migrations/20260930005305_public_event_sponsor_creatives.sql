begin;

-- Additive fields retain text-only placements and existing event-scoped RLS/FKs.
alter table public.agenda_sponsor_placements
  add column image_url text not null default '' check (length(image_url) <= 2048 and (image_url = '' or image_url ~ '^https://')),
  add column image_alt text not null default '' check (length(image_alt) <= 500),
  add column image_format text not null default 'banner' check (image_format in ('square', 'banner')),
  add column link_url text not null default '' check (length(link_url) <= 2048 and (link_url = '' or link_url ~ '^https://')),
  add column surface text not null default 'agenda' check (surface in ('agenda','home','speakers','sponsors','lunch','venue'));
alter table public.agenda_sponsor_placements alter column day_id drop not null;
alter table public.agenda_sponsor_placements add constraint placement_surface_anchor
  check ((surface = 'agenda' and day_id is not null) or (surface <> 'agenda' and day_id is null and after_session_id is null));

-- The event's community lives elsewhere. This only affects the named Event Beast
-- event; the old records are retained privately rather than destroyed.
update public.event_settings
set directory_enabled = false, messaging_enabled = false
where event_id in (select id from public.events where slug = 'momentum-builder-live-2026');

commit;
