begin;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('event-headshots', 'event-headshots', false, 8388608, array['image/jpeg','image/png','image/webp']),
       ('event-assets', 'event-assets', true, 8388608, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create function public.can_write_headshot(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.attendees where user_id = auth.uid() and status = 'approved'
    and event_id::text = split_part(p_path, '/', 1) and id::text = split_part(p_path, '/', 2)
    and split_part(p_path, '/', 3) <> '' and split_part(p_path, '/', 4) = '');
$$;
create function public.can_write_event_asset(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.event_admins where user_id = auth.uid() and event_id::text = split_part(p_path, '/', 1));
$$;

create policy headshot_read on storage.objects for select to authenticated using (
  bucket_id = 'event-headshots' and (
    public.can_write_headshot(name) or exists (
      select 1 from public.attendee_profiles p where p.headshot_path = name and public.can_view_profile(p.event_id, p.attendee_id)
    )
  )
);
create policy headshot_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'event-headshots' and public.can_write_headshot(name));
create policy headshot_delete on storage.objects for delete to authenticated
  using (bucket_id = 'event-headshots' and public.can_write_headshot(name));
create policy event_asset_read on storage.objects for select to anon, authenticated using (bucket_id = 'event-assets');
create policy event_asset_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'event-assets' and public.can_write_event_asset(name));
create policy event_asset_delete on storage.objects for delete to authenticated
  using (bucket_id = 'event-assets' and public.can_write_event_asset(name));

create function public.can_receive_event_realtime(p_topic text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.attendees where user_id = auth.uid() and status = 'approved'
    and p_topic = 'event:' || event_id::text || ':attendee:' || id::text);
$$;
create policy event_private_inbox_receive on realtime.messages for select to authenticated using (
  extension = 'broadcast' and public.can_receive_event_realtime((select realtime.topic()))
);
-- No client broadcast INSERT policy: only database triggers publish notifications.

create function public.notify_conversation_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_attendee uuid;
begin
  for v_attendee in
    select a.id from public.conversations c join public.attendees a on a.event_id = c.event_id and a.id in (c.attendee_a, c.attendee_b)
      where c.event_id = new.event_id and c.id = new.conversation_id and a.status = 'approved'
  loop
    begin
      perform realtime.send(
        jsonb_build_object('conversation_id', new.conversation_id, 'kind', tg_table_name),
        'changed', 'event:' || new.event_id::text || ':attendee:' || v_attendee::text, true
      );
    exception when others then
      -- Realtime outages must not roll back a durable message/read receipt.
      raise warning 'Realtime notification unavailable; clients will reconcile from Postgres';
    end;
  end loop;
  return new;
end $$;
create trigger message_invalidation after insert on public.messages for each row execute function public.notify_conversation_change();
create trigger read_invalidation after insert or update on public.conversation_reads for each row execute function public.notify_conversation_change();

revoke all on function public.can_write_headshot(text), public.can_write_event_asset(text),
  public.can_receive_event_realtime(text), public.notify_conversation_change() from public;
grant execute on function public.can_write_headshot(text), public.can_write_event_asset(text),
  public.can_receive_event_realtime(text) to authenticated;

commit;
