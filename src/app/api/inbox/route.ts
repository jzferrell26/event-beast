import { z } from "zod";
import { demoConversations } from "@/lib/demo";
import { uuid } from "@/lib/validation";
import type { ConversationSummary } from "@/lib/types";
import { requireMember } from "@/lib/server/auth";
import { isDemo } from "@/lib/server/guide";
import { ApiError, databaseError, handle, json, parseBody } from "@/lib/server/http";

export const GET = (request: Request) => handle(async () => {
  if (isDemo()) return json({ conversations: demoConversations, hasMore: false });
  const { db, event } = await requireMember();
  const offset = Math.max(0, Math.min(Number(new URL(request.url).searchParams.get("offset")) || 0, 10000));
  const result = await db.rpc("list_inbox", { p_event: event.id, p_offset: offset, p_limit: 31 });
  databaseError(result.error);
  const conversations = (result.data ?? []).slice(0, 30) as ConversationSummary[];
  const paths = conversations.map((c) => c.peer_headshot_path).filter((p): p is string => Boolean(p));
  const { data } = paths.length ? await db.storage.from("event-headshots").createSignedUrls(paths, 120) : { data: [] };
  const photos = new Map((data ?? []).filter((d) => d.signedUrl && !d.error).map((d) => [d.path, d.signedUrl]));
  return json({ conversations: conversations.map((c) => ({ ...c, avatar_url: c.peer_headshot_path ? photos.get(c.peer_headshot_path) : undefined })), hasMore: (result.data?.length ?? 0) > 30 });
});
export const POST = (request: Request) => handle(async () => {
  const body = await parseBody(request, z.object({ recipient: uuid }).strict());
  if (isDemo()) throw new ApiError(409, "Messaging is read-only in the demo preview.");
  const { db, event } = await requireMember();
  const result = await db.rpc("open_conversation", { p_event: event.id, p_recipient: body.recipient });
  databaseError(result.error);
  return json({ id: result.data }, 201);
});
