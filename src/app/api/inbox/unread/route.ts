import { requireMember } from '@/lib/server/auth';
import { isDemo } from '@/lib/server/guide';
import { databaseError, handle, json } from '@/lib/server/http';

export const GET = () => handle(async () => {
  if (isDemo()) return json({ unread: 0, latestId: null, conversationId: null, demo: true });
  const { db, event } = await requireMember();
  const response = await db.rpc('message_attention', { p_event: event.id });
  databaseError(response.error);
  const row = response.data?.[0];
  return json({ unread: Number(row?.unread_count ?? 0), latestId: row?.latest_id ?? null, conversationId: row?.conversation_id ?? null });
});
