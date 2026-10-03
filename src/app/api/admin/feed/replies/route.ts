import { z } from 'zod';
import { requireAdmin } from '@/lib/server/auth';
import { isDemo } from '@/lib/server/guide';
import { databaseError, handle, json, parseBody } from '@/lib/server/http';
import { replySelect } from '@/lib/feed';
export const GET = (request: Request) => handle(async () => {
  if (isDemo()) return json({ replies: [], reportedReplies: [], reports: [], hasMore: false });
  const { db, event } = await requireAdmin();
  const offset = Math.max(0, Math.min(Number(new URL(request.url).searchParams.get('offset')) || 0,10000));
  const [replies, reports] = await Promise.all([
    db.from('feed_replies').select(replySelect).eq('event_id', event.id).order('created_at', { ascending: false }).order('id').range(offset, offset+50),
    db.from('feed_reply_reports').select('id,reply_id,reason,status').eq('event_id', event.id).eq('status','open').order('created_at').limit(100),
  ]);
  databaseError(replies.error); databaseError(reports.error);
  const missing = [...new Set((reports.data ?? []).map(report => report.reply_id))].filter(id => !(replies.data ?? []).some(reply => reply.id===id));
  const reported = missing.length ? await db.from('feed_replies').select(replySelect).eq('event_id',event.id).in('id',missing) : { data: [], error: null };
  databaseError(reported.error);
  return json({ replies: (replies.data ?? []).slice(0,50), reportedReplies: reported.data, reports: reports.data, hasMore: (replies.data?.length ?? 0)>50 });
});
export const PATCH = (request: Request) => handle(async () => {
  const body = await parseBody(request,z.object({ replyId: z.uuid(), status: z.enum(['visible','hidden','deleted']), reportId: z.uuid().nullable().default(null), reportStatus: z.enum(['reviewed','dismissed']).default('reviewed') }).strict());
  const { db, event } = await requireAdmin();
  const result = await db.rpc('moderate_feed_reply', { p_event:event.id, p_reply:body.replyId, p_status:body.status, p_report:body.reportId, p_report_status:body.reportStatus });
  databaseError(result.error); return json({ saved:true });
});
