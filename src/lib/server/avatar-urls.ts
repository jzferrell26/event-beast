import 'server-only';
import type { serverSupabase } from '../supabase/server';
import { databaseError } from './http';

type Database = NonNullable<Awaited<ReturnType<typeof serverSupabase>>>;
type Photo = { attendee_id: string; headshot_path: string | null };

/** Only rows read with the caller's RLS session. Storage independently
 * authorizes short-lived URLs; never use a service key or public bucket. */
export async function signAvatarRows(db: Database, eventId: string, rows: Photo[]) {
  const valid = rows.filter(row => {
    const parts = row.headshot_path?.split('/');
    return parts?.length === 3 && parts[0] === eventId && parts[1] === row.attendee_id && Boolean(parts[2]);
  });
  const paths = [...new Set(valid.map(row => row.headshot_path!))];
  const urls = new Map<string, string>();
  if (!paths.length) return urls;
  const { data } = await db.storage.from('event-headshots').createSignedUrls(paths, 120);
  const signed = new Map((data ?? []).filter(item => item.signedUrl && !item.error).map(item => [item.path, item.signedUrl]));
  for (const row of valid) { const url = signed.get(row.headshot_path!); if (url) urls.set(row.attendee_id, url); }
  return urls;
}

export async function attendeeAvatarUrls(db: Database, eventId: string, attendees: string[]) {
  if (!attendees.length) return new Map<string, string>();
  const profiles = await db.from('attendee_profiles').select('attendee_id,headshot_path')
    .eq('event_id', eventId).in('attendee_id', [...new Set(attendees)]);
  databaseError(profiles.error);
  return signAvatarRows(db, eventId, profiles.data ?? []);
}
