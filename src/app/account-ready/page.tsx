import { redirect } from 'next/navigation';
import { getActor } from '@/lib/server/auth';
import { ApiError } from '@/lib/server/http';
import { isDemo } from '@/lib/server/guide';
export const dynamic = 'force-dynamic';
export default async function AccountReady() {
  if (isDemo()) redirect('/');
  let destination = '/access';
  try { const actor = await getActor(); destination = actor.isAdmin ? '/admin' : actor.attendee?.status === 'approved' ? '/more/profile' : '/access'; }
  catch (error) { if (error instanceof ApiError && error.status === 401) redirect('/auth?force=1'); throw error; }
  redirect(destination);
}
