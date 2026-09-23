import { z } from 'zod';
import { uuid, secureUrl } from '@/lib/validation';
import { requireAdmin } from '@/lib/server/auth';
import { isDemo } from '@/lib/server/guide';
import { demoProfiles } from '@/lib/demo';
import { ApiError, databaseError, handle, json, parseBody } from '@/lib/server/http';

const schema = z.object({ contact_email: z.union([z.literal(''), z.email().max(254)]), phone: z.string().trim().max(40), website: secureUrl }).strict();
type Context = { params: Promise<{ id: string }> };
export const GET = (_request: Request, context: Context) => handle(async () => {
  const id = uuid.parse((await context.params).id);
  if (isDemo()) {
    const index = demoProfiles.findIndex(p => p.attendee_id === id);
    if (index < 0) throw new ApiError(404, 'Attendee not found.');
    return json({ registration_name: demoProfiles[index].full_name, registration_email: `attendee${index + 1}@example.test`, contact_email: '', phone: '', website: '' });
  }
  const { db, event } = await requireAdmin();
  const [registration, contact] = await Promise.all([
    db.from('attendees').select('registration_name,registration_email').eq('event_id', event.id).eq('id', id).maybeSingle(),
    db.from('attendee_contacts').select('contact_email,phone,website').eq('event_id', event.id).eq('attendee_id', id).maybeSingle(),
  ]);
  databaseError(registration.error); databaseError(contact.error);
  if (!registration.data) throw new ApiError(404, 'Attendee not found.');
  return json({ ...registration.data, contact_email: '', phone: '', website: '', ...contact.data });
});
export const PATCH = (request: Request, context: Context) => handle(async () => {
  const id = uuid.parse((await context.params).id);
  const body = await parseBody(request, schema);
  const { db, event } = await requireAdmin();
  const result = await db.from('attendee_contacts').upsert({ event_id: event.id, attendee_id: id, ...body });
  databaseError(result.error);
  return json({ saved: true });
});
