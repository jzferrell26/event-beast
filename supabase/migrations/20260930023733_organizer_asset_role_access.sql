begin;

-- The original storage helper predated attendee.access_role and only recognized
-- legacy event_admins rows. Reuse the canonical, current event authorization
-- predicate; do not create another privileged identity or weaken object RLS.
create or replace function public.can_write_event_asset(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and exists (select 1 from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null)
    and exists (
      select 1 from public.events e
      where e.id::text = split_part(p_path, '/', 1)
        and split_part(p_path, '/', 2) <> ''
        and public.is_event_admin(e.id)
    );
$$;
revoke all on function public.can_write_event_asset(text) from public, anon, authenticated;
grant execute on function public.can_write_event_asset(text) to authenticated;

commit;
