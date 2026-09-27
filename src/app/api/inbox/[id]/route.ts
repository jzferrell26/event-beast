import { z } from "zod";
import { demoConversations, demoMessages } from "@/lib/demo";
import { messageSchema, uuid } from "@/lib/validation";
import { requireMember } from "@/lib/server/auth";
import { isDemo } from "@/lib/server/guide";
import { ApiError, databaseError, handle, json, parseBody } from "@/lib/server/http";

type Context = { params: Promise<{ id: string }> };
export const GET = (request: Request, context: Context) => handle(async () => {
  const id = uuid.parse((await context.params).id);
  if (isDemo()) {
    const conversation = demoConversations.find((c) => c.id === id);
    if (!conversation) throw new ApiError(404, "Conversation not found.");
    return json({ messages: demoMessages(id), hasMore: false, peer: { id: conversation.peer_id, name: conversation.peer_name }, blockedByMe: false, peerReadId: 2 });
  }
  const { db, event, attendee } = await requireMember();
  const conversation = await db.from("conversations").select("id,attendee_a,attendee_b").eq("event_id", event.id).eq("id", id).maybeSingle();
  databaseError(conversation.error);
  if (!conversation.data) throw new ApiError(404, "Conversation not found.");
  const peerId = conversation.data.attendee_a === attendee.id ? conversation.data.attendee_b : conversation.data.attendee_a;
  const params = new URL(request.url).searchParams;
  const before = params.get("before"), after = params.get("after");
  if (before && after) throw new ApiError(400, "Use one message cursor at a time.");
  const cursorSchema = z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
  let query = db.from("messages").select("*").eq("event_id", event.id).eq("conversation_id", id).order("id", { ascending: Boolean(after) }).limit(51);
  if (before) query = query.lt("id", cursorSchema.parse(before));
  if (after) query = query.gt("id", cursorSchema.parse(after));
  const [messages, profile, block, read] = await Promise.all([
    query,
    db.from("attendee_profiles").select("full_name").eq("event_id", event.id).eq("attendee_id", peerId).maybeSingle(),
    db.from("blocks").select("blocked_id").eq("event_id", event.id).eq("blocker_id", attendee.id).eq("blocked_id", peerId).maybeSingle(),
    db.from("conversation_reads").select("last_read_id").eq("event_id", event.id).eq("conversation_id", id).eq("attendee_id", peerId).maybeSingle(),
  ]);
  [messages, profile, block, read].forEach((r) => databaseError(r.error));
  const rows = (messages.data ?? []).slice(0, 50);
  return json({ messages: after ? rows : rows.reverse(), hasMore: (messages.data?.length ?? 0) > 50,
    peer: { id: peerId, name: profile.data?.full_name ?? "Private attendee" }, blockedByMe: Boolean(block.data), peerReadId: read.data?.last_read_id ?? 0 });
});
export const POST = (request: Request, context: Context) => handle(async () => {
  const id = uuid.parse((await context.params).id);
  const body = await parseBody(request, messageSchema);
  const { db, event } = await requireMember();
  const result = await db.rpc("send_message", { p_event: event.id, p_conversation: id, p_client_id: body.client_id, p_body: body.body });
  databaseError(result.error);
  return json({ message: result.data }, 201);
});
export const PATCH = (request: Request, context: Context) => handle(async () => {
  const id = uuid.parse((await context.params).id);
  const body = await parseBody(request, z.object({ lastReadId: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER) }).strict());
  const { db, event } = await requireMember();
  const result = await db.rpc("mark_conversation_read", { p_event: event.id, p_conversation: id, p_message_id: body.lastReadId });
  databaseError(result.error);
  return json({ saved: true });
});
