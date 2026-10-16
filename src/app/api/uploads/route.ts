import { requireAdmin, requireMember, requireSponsor } from '@/lib/server/auth';
import { uuid } from '@/lib/validation';
import { ApiError, assertSameOrigin, handle, json } from '@/lib/server/http';
import { saveEventImage } from '@/lib/server/image-upload';

export const POST = (request: Request) => handle(async () => {
  assertSameOrigin(request);
  if (Number(request.headers.get('content-length') ?? 0) > 3.5 * 1024 * 1024) throw new ApiError(413, 'Choose a JPG, PNG or WebP under 3 MB.');
  const form = await request.formData();
  const kind = form.get('kind') === 'sponsor' ? 'sponsor' : form.get('kind') === 'asset' ? 'asset' : 'headshot';
  const sponsorId = kind === 'sponsor' ? uuid.parse(form.get('sponsor_id')) : null;
  const actor = kind === 'sponsor' ? await requireSponsor(sponsorId!) : kind === 'asset' ? await requireAdmin() : await requireMember();
  const owner = kind === 'sponsor' ? `sponsors/${sponsorId}` : kind === 'asset' ? 'organizer' : actor.attendee?.id;
  if (!owner) throw new ApiError(403, 'Attendee access is required.');
  return json(await saveEventImage(actor.db, actor.event.id, owner, form.get('file'), kind === 'headshot'));
});
