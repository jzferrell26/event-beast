import type { AgendaSession, Guide } from './types';

export interface EventMoment {
  phase: 'empty' | 'before' | 'live' | 'between' | 'ended';
  current: AgendaSession[];
  next: AgendaSession | null;
}

/** Derive the phone's now/next view from the public guide, never from a timer
 * guess or unpublished working rows. The source array is not mutated. */
export function eventMoment(guide: Pick<Guide, 'days' | 'sessions'>, now: number): EventMoment {
  const days = new Set(guide.days.filter(day => day.published).map(day => day.id));
  const sessions = guide.sessions.filter(session => session.published && days.has(session.day_id)
    && Number.isFinite(Date.parse(session.starts_at)) && Date.parse(session.ends_at) > Date.parse(session.starts_at))
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at) || a.id.localeCompare(b.id));
  if (!sessions.length || !Number.isFinite(now)) return { phase: 'empty', current: [], next: null };
  const current = sessions.filter(session => Date.parse(session.starts_at) <= now && now < Date.parse(session.ends_at));
  const next = sessions.find(session => Date.parse(session.starts_at) > now) ?? null;
  const phase = current.length ? 'live' : !next ? 'ended' : now < Date.parse(sessions[0].starts_at) ? 'before' : 'between';
  return { phase, current, next };
}

export function mobileSessionDate(iso: string, now: number, timezone: string): string {
  const day = (value: number) => new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
  return day(Date.parse(iso)) === day(now) ? 'Today' : new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(iso));
}

export interface ViewportMetrics {
  layoutHeight: number; visualHeight: number; visualTop: number; scale: number;
  baselineHeight: number; editing: boolean;
}

/** Zoom is not a keyboard. Address-bar movement alone is not a keyboard. */
export function mobileKeyboardOpen(metrics: ViewportMetrics): boolean {
  return [metrics.layoutHeight, metrics.visualHeight, metrics.baselineHeight, metrics.scale].every(Number.isFinite)
    && metrics.visualHeight > 0 && metrics.editing && Math.abs(metrics.scale - 1) < 0.05
    && Math.max(metrics.layoutHeight, metrics.baselineHeight) - metrics.visualHeight > 120;
}

export function threadViewportHeight(visualHeight: number, visualTop: number, threadTop: number, navigationHeight: number): number {
  if (![visualHeight, visualTop, threadTop, navigationHeight].every(Number.isFinite)) return 0;
  return Math.max(0, Math.round(visualHeight + visualTop - threadTop - navigationHeight));
}
