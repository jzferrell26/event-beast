begin;
-- An expected stale preview is an application conflict, not a database
-- serialization failure. Surface HTTP 409 directly through PostgREST.
create or replace function public.commit_attendee_import(p_event uuid, p_rows jsonb, p_preview_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_preview jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('event-access:'||p_event::text,0));
  v_preview := public.preview_attendee_import(p_event,p_rows);
  if p_preview_token is distinct from v_preview->>'preview_token' then
    raise exception 'The roster changed since preview. Review the file again; no changes from this request were saved.' using errcode='PT409';
  end if;
  return public.import_attendees(p_event,p_rows);
end $$;
revoke all on function public.commit_attendee_import(uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.commit_attendee_import(uuid,jsonb,text) to authenticated;
commit;
