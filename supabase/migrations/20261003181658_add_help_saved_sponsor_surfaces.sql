begin;

alter table public.agenda_sponsor_placements
  drop constraint agenda_sponsor_placements_surface_check;
alter table public.agenda_sponsor_placements
  add constraint agenda_sponsor_placements_surface_check
  check (surface in ('agenda','home','speakers','sponsors','lunch','venue','help','saved'));

commit;
