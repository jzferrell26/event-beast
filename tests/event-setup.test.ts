import { describe, expect, it } from 'vitest';
import { buildEventSetup, setupResources, type SetupContent, type SetupCount, type SetupResource } from '../src/lib/event-setup';

const event = { id: '10000000-0000-4000-8000-000000000001', name: 'Sample event', timezone: 'America/Chicago', start_date: null, end_date: null, brand_logo_url: '' };
function empty(): SetupContent {
  return { counts: Object.fromEntries(setupResources.map(key => [key, { total: 0, included: 0 }])) as Record<SetupResource, SetupCount>, welcomeAdded: false, sessionsOnHiddenDays: 0 };
}
describe('event setup from saved content', () => {
  it('requires dates but does not turn optional sections into publishing requirements', () => {
    const initial = buildEventSetup(event, empty());
    expect(initial.canPublish).toBe(false);
    expect(initial.checks.filter(check => check.required).map(check => check.id)).toEqual(['dates']);
    expect(initial.completed).toBe(0);
    const ready = buildEventSetup({ ...event, start_date: '2027-04-02', end_date: '2027-04-02' }, empty());
    expect(ready.canPublish).toBe(true);
    expect(ready.completed).toBe(1);
    expect(ready.checks.find(check => check.id === 'sponsors')).toMatchObject({ complete: false, required: false, attention: false });
  });
  it('does not count drafts or sessions on unpublished days as ready', () => {
    const content = empty();
    content.counts.agenda_days = { total: 1, included: 0 };
    content.counts.agenda_sessions = { total: 3, included: 0 };
    content.counts.speakers = { total: 2, included: 0 };
    content.sessionsOnHiddenDays = 2;
    const result = buildEventSetup(event, content);
    expect(result.checks.find(check => check.id === 'agenda_sessions')).toMatchObject({ complete: false, attention: true });
    expect(result.checks.find(check => check.id === 'agenda_sessions')?.description).toContain('2 marked Published sessions are hidden');
    expect(result.checks.find(check => check.id === 'speakers')?.description).toContain('2 saved speakers are not included yet');
  });
  it('keeps partially published sections in review and handles counts beyond editor pagination', () => {
    const content = empty();
    content.counts.sponsors = { total: 1501, included: 1500 };
    const result = buildEventSetup(event, content);
    const sponsors = result.checks.find(check => check.id === 'sponsors');
    expect(sponsors).toMatchObject({ complete: false, attention: true });
    expect(sponsors?.description).toContain('1500 sponsors included');
    expect(sponsors?.description).toContain('1 saved sponsor is not included');
  });
  it('recomputes progress when saved content is removed or unpublished', () => {
    const content = empty();
    content.counts.speakers = { total: 1, included: 1 };
    expect(buildEventSetup(event, content).completed).toBe(1);
    content.counts.speakers.included = 0;
    expect(buildEventSetup(event, content).completed).toBe(0);
    content.counts.speakers.total = 0;
    expect(buildEventSetup(event, content).checks.find(check => check.id === 'speakers')?.attention).toBe(false);
  });
  it('reports all checks complete only when saved details and included sections are present', () => {
    const content = empty();
    for (const resource of setupResources) content.counts[resource] = { total: 1, included: 1 };
    content.welcomeAdded = true;
    const result = buildEventSetup({ ...event, start_date: '2027-04-02', end_date: '2027-04-02', brand_logo_url: 'https://assets.example/logo.png' }, content, '2026-10-17T12:00:00Z');
    expect(result.completed).toBe(result.total);
    expect(result.checkedAt).toBe('2026-10-17T12:00:00Z');
    expect(result.checks.some(check => check.attention)).toBe(false);
  });
});
