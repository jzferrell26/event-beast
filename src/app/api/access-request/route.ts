import { z } from 'zod';
import { getActor } from '@/lib/server/auth';
import { eventSlug, isDemo } from '@/lib/server/guide';
import { ApiError, databaseError, handle, json, parseBody } from '@/lib/server/http';
export const POST = (request: Request) => handle(async () => {
  const body = await parseBody(request, z.object({ name: z.string().trim().min(1).max(120) }).strict());
  if (isDemo()) throw new ApiError(409, 'This preview does not submit access requests.');
  const { db } = await getActor();
  const result = await db.rpc('request_event_access', { p_slug: eventSlug(), p_name: body.name });
  databaseError(result.error);
  return json({ requested: true });
});
