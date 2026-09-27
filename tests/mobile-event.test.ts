import { describe, expect, it } from 'vitest';
import { demoGuide } from '../src/lib/demo';
import { eventMoment, mobileKeyboardOpen, mobileSessionDate, threadViewportHeight, type ViewportMetrics } from '../src/lib/mobile-event';

const instant = (value: string) => Date.parse(value);

describe('the public mobile now/next agenda', () => {
  it('shows the first real published session before the event, without mutating source order', () => {
    const guide = structuredClone(demoGuide);
    guide.sessions.reverse();
    const order = guide.sessions.map(session => session.id);
    const moment = eventMoment(guide, instant('2026-10-07T12:00:00Z'));
    expect(moment.phase).toBe('before');
    expect(moment.current).toEqual([]);
    expect(moment.next?.id).toBe(demoGuide.sessions[0].id);
    expect(guide.sessions.map(session => session.id)).toEqual(order);
  });
  it('uses inclusive starts and exclusive ends, including gaps', () => {
    const start = eventMoment(demoGuide, instant('2026-10-08T14:00:00Z'));
    expect(start.phase).toBe('live');
    expect(start.current.map(session => session.id)).toEqual([demoGuide.sessions[0].id]);
    const end = eventMoment(demoGuide, instant('2026-10-08T14:45:00Z'));
    expect(end.phase).toBe('between');
    expect(end.current).toEqual([]);
    expect(end.next?.id).toBe(demoGuide.sessions[1].id);
  });
  it('retains concurrent sessions without claiming one is the whole program', () => {
    const guide = structuredClone(demoGuide);
    guide.sessions.push({ ...guide.sessions[0], id: 'parallel-session', title: 'Parallel workshop' });
    const result = eventMoment(guide, instant('2026-10-08T14:15:00Z'));
    expect(result.current).toHaveLength(2);
    expect(result.next?.id).toBe(guide.sessions[1].id);
  });
  it('never promotes held rows, unpublished days or malformed durations', () => {
    const guide = structuredClone(demoGuide);
    guide.sessions = [
      { ...guide.sessions[0], published: false },
      { ...guide.sessions[0], id: 'hidden-day', day_id: 'not-published' },
      { ...guide.sessions[0], id: 'bad-start', starts_at: 'not-a-date' },
      { ...guide.sessions[0], id: 'bad-end', ends_at: 'not-a-date' },
      { ...guide.sessions[0], id: 'backwards', ends_at: '2026-10-08T13:00:00Z' },
      { ...guide.sessions[0], id: 'zero-duration', ends_at: guide.sessions[0].starts_at },
    ];
    guide.days.push({ ...guide.days[0], id: 'not-published', published: false });
    expect(eventMoment(guide, instant('2026-10-08T14:15:00Z'))).toEqual({ phase: 'empty', current: [], next: null });
  });
  it('distinguishes a finished event from an empty program', () => {
    expect(eventMoment(demoGuide, instant('2026-10-10T12:00:00Z')).phase).toBe('ended');
    expect(eventMoment({ days: [], sessions: [] }, Date.now()).phase).toBe('empty');
    expect(eventMoment(demoGuide, Number.NaN).phase).toBe('empty');
  });
  it('labels dates using event time, not browser or UTC midnight', () => {
    const now = instant('2026-10-09T04:55:00Z'); // Still Oct 8 in Chicago.
    expect(mobileSessionDate('2026-10-09T04:00:00Z', now, 'America/Chicago')).toBe('Today');
    expect(mobileSessionDate('2026-10-09T05:05:00Z', now, 'America/Chicago')).toBe('Fri, Oct 9');
    expect(mobileSessionDate('2026-10-09T05:05:00Z', now, 'UTC')).toBe('Today');
  });
});

describe('keyboard and viewport geometry', () => {
  const metrics: ViewportMetrics = { layoutHeight: 844, baselineHeight: 844, visualHeight: 490, visualTop: 0, scale: 1, editing: true };
  it('recognizes a reduced visual viewport while editing', () => {
    expect(mobileKeyboardOpen(metrics)).toBe(true);
    expect(mobileKeyboardOpen({ ...metrics, layoutHeight: 490 })).toBe(true);
  });
  it.each([
    { editing: false }, { scale: 2 }, { visualHeight: 780 }, { visualHeight: 724 },
    { scale: Number.NaN }, { visualHeight: Number.NaN }, { layoutHeight: Number.POSITIVE_INFINITY },
  ])('does not mistake address bars, zoom or invalid metrics for a keyboard (%j)', (override) => {
    expect(mobileKeyboardOpen({ ...metrics, ...override })).toBe(false);
  });
  it('keeps the composer above navigation or the keyboard including visual panning', () => {
    expect(threadViewportHeight(844, 0, 76, 72)).toBe(696);
    expect(threadViewportHeight(490, 0, 76, 0)).toBe(414);
    expect(threadViewportHeight(490, 35, 76, 0)).toBe(449);
    expect(threadViewportHeight(490, 0, 140, 72)).toBe(278);
  });
  it('never assigns negative or nonfinite CSS dimensions', () => {
    expect(threadViewportHeight(80, 0, 140, 72)).toBe(0);
    expect(threadViewportHeight(Number.NaN, 0, 76, 72)).toBe(0);
    expect(threadViewportHeight(844, 0, 76, Number.POSITIVE_INFINITY)).toBe(0);
  });
});
