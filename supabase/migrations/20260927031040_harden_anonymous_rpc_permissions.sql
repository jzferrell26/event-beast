begin;

-- Hosted Supabase can give anon/authenticated explicit default EXECUTE grants.
-- Revoking only PUBLIC does not remove those grants. Keep the two boolean
-- helpers required by anonymous public-guide RLS; all private API entrypoints
-- still enforce their own verified membership/organizer authorization.
revoke all on function
  public.current_attendee(uuid),
  public.can_view_profile(uuid,uuid),
  public.can_read_conversation(uuid,uuid),
  public.can_receive_event_realtime(text),
  public.can_write_event_asset(text),
  public.can_write_headshot(text),
  public.claim_attendee(uuid),
  public.open_conversation(uuid,uuid),
  public.send_message(uuid,uuid,uuid,text),
  public.mark_conversation_read(uuid,uuid,bigint),
  public.set_attendee_block(uuid,uuid,boolean),
  public.report_attendee(uuid,uuid,text,bigint),
  public.moderation_queue(uuid,integer),
  public.list_inbox(uuid,integer,integer),
  public.record_launch_check(uuid,text,boolean,text,integer),
  public.update_attendee_access(uuid,uuid,text,text,text,boolean)
from public, anon;

-- Trigger execution does not need a client-callable RPC. This does not remove
-- the triggers or change the privileges of their database-owned bodies.
revoke all on function
  public.message_consent_guard(),
  public.notify_conversation_change(),
  public.record_organizer_audit()
from public, anon, authenticated;

-- Public event visibility uses these functions in anonymous SELECT policies.
-- They return only the current caller's authorization boolean, never contacts.
grant execute on function public.can_read_event(uuid), public.is_event_admin(uuid) to anon, authenticated;

commit;
