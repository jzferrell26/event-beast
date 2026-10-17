import 'server-only';
import { buildEventSetup, setupResources, type SetupCount, type SetupResource } from '../event-setup';
import type { platformEvent } from './platform-auth';
import { ApiError, databaseError } from './http';

type EventScope = Awaited<ReturnType<typeof platformEvent>>;
function checkedCount(result: { count: number | null; error: { code?: string; message: string } | null }): number {
  databaseError(result.error);
  if (result.count === null) throw new ApiError(503, 'Setup progress is temporarily unavailable. Refresh to try again.');
  return result.count;
}

/** Counts use the authorized event scope, never the capped editor lookup lists. */
export async function getEventSetup({ db, event }: EventScope) {
  const [entries, visibleSessions, settings] = await Promise.all([
    Promise.all(setupResources.map(async table => {
      const [all, included] = await Promise.all([
        db.from(table).select('id', { count: 'exact', head: true }).eq('event_id', event.id),
        db.from(table).select('id', { count: 'exact', head: true }).eq('event_id', event.id).eq('published', true),
      ]);
      return [table, { total: checkedCount(all), included: checkedCount(included) }] as const;
    })),
    // Match the public guide's rule: both the session and its day are published.
    db.from('agenda_sessions').select('id,agenda_days!inner(id)', { count: 'exact', head: true })
      .eq('event_id', event.id).eq('published', true).eq('agenda_days.event_id', event.id).eq('agenda_days.published', true),
    db.from('event_settings').select('welcome_body').eq('event_id', event.id).single(),
  ]);
  databaseError(settings.error);
  const counts = Object.fromEntries(entries) as Record<SetupResource, SetupCount>;
  const visible = checkedCount(visibleSessions);
  const sessionsOnHiddenDays = Math.max(0, counts.agenda_sessions.included - visible);
  counts.agenda_sessions.included = visible;
  return buildEventSetup(event, { counts, sessionsOnHiddenDays, welcomeAdded: Boolean(settings.data?.welcome_body?.trim()) });
}
