import { describe, expect, it } from 'vitest';
import { safeNext } from '../src/lib/format';
const eventId = '10000000-0000-4000-8000-000000000001';
describe('platform authentication destinations', () => {
  it('preserves agency, customer, event, preview and public event destinations', () => {
    for (const path of ['/agency', '/app', '/app/sample-alpha', `/app/sample-alpha/events/${eventId}`, `/app/sample-alpha/events/${eventId}/preview`, '/e/sample-alpha/sample-summit']) expect(safeNext(path)).toBe(path);
  });
  it('preserves workspace verification and the exact password recovery destination', () => {
    expect(safeNext('/app')).toBe('/app');
    expect(safeNext('/platform/auth?mode=reset')).toBe('/platform/auth?mode=reset');
    expect(safeNext('/reset-password')).toBe('/reset-password');
    expect(safeNext('/account-ready')).toBe('/account-ready');
  });
  it('rejects external, encoded, traversal and arbitrary query destinations', () => {
    for (const path of ['https://evil.example/app', '//evil.example', '/\\evil.example', '/app/../../evil', '/app/%2f%2fevil.example', '/app/sample-alpha?next=https://evil.example', '/platform/auth?mode=reset&next=//evil.example', '/api/platform/agency', '/agency\n']) expect(safeNext(path)).toBe('/');
  });
});
