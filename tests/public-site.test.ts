import { describe, expect, it } from 'vitest';
import { demoGuide } from '../src/lib/demo';
import { deviceBookmarkKey, parseDeviceBookmarks, publicRouteDecision, publicSiteEnabled, publicSiteGuide } from '../src/lib/public-site';
import { adminDefaults, adminResources, resourceSchema } from '../src/lib/admin-resources';

describe('account-free event guide', () => {
  it('defaults to public mode and requires an explicit legacy rollback', () => {
    expect(publicSiteEnabled('')).toBe(true); expect(publicSiteEnabled('true')).toBe(true); expect(publicSiteEnabled('false')).toBe(false);
  });
  it('keeps member/community pages available while retaining public sponsor simplification', () => {
    for (const path of ['/people', '/people/abc', '/inbox/abc', '/join', '/access', '/more/profile', '/api/people', '/api/inbox/123', '/api/profile', '/api/saved', '/api/moderation', '/api/access-request']) expect(publicRouteDecision(path)).toEqual({});
    for (const path of ['/sponsor', '/sponsor/id', '/more/sponsors', '/more/sponsors/id']) expect(publicRouteDecision(path)).toEqual({ redirect: '/sponsors' });
    for (const path of ['/api/sponsor/123', '/api/sponsors/123/representatives']) expect(publicRouteDecision(path)).toEqual({ disabled: true });
    for (const path of ['/admin', '/api/admin/content/sponsors', '/api/auth', '/api/me', '/sponsors', '/more/saved', '/api/guide']) expect(publicRouteDecision(path)).toEqual({});
  });
  it('strips public booth/profile/source copy without mutating organizer data', () => {
    const guide = structuredClone(demoGuide); guide.speakers[0].source_url = 'https://speaker.example';
    const projected = publicSiteGuide(guide, true);
    expect(projected.publicSite).toBe(true);
    expect(projected.sponsors.every(sponsor => !sponsor.booth && !sponsor.description)).toBe(true);
    expect(projected.speakers.every(speaker => !speaker.source_url)).toBe(true);
    expect(projected.settings.directory_enabled).toBe(guide.settings.directory_enabled); expect(projected.settings.messaging_enabled).toBe(guide.settings.messaging_enabled);
    expect(guide.speakers[0].source_url).toBe('https://speaker.example'); expect(publicSiteGuide(guide, false).settings).toEqual(guide.settings);
  });
  it('isolates device favorites per event and accepts bounded identifiers, never contacts', () => {
    expect(deviceBookmarkKey('one')).not.toBe(deviceBookmarkKey('two'));
    expect(parseDeviceBookmarks('["id-1","id-1",null,{},"someone@example.test","<script>"]')).toEqual({ sessions: ['id-1'], attendees: [] });
    for (const raw of [null, '{', '{}', '"id"']) expect(parseDeviceBookmarks(raw)).toEqual({ sessions: [], attendees: [] });
    expect(parseDeviceBookmarks(JSON.stringify(Array.from({ length: 1005 }, (_, index) => `id-${index}`))).sessions).toHaveLength(1000);
  });
});
describe('sponsor creative validation', () => {
  const definition = adminResources.agenda_sponsor_placements;
  const base = { ...adminDefaults(definition), sponsor_id: '60000000-0000-4000-8000-000000000001', surface: 'home' };
  it('supports both creative shapes on each public page', () => {
    for (const surface of ['home', 'speakers', 'sponsors', 'lunch', 'venue']) for (const image_format of ['square', 'banner']) expect(resourceSchema(definition).safeParse({ ...base, surface, image_format, image_url: 'https://cdn.example/ad.webp' }).success).toBe(true);
  });
  it('rejects unsafe links, invalid shapes and missing or inappropriate agenda anchors', () => {
    for (const patch of [{ image_url: 'javascript:alert(1)' }, { link_url: 'http://unsafe.example' }, { image_format: 'crop' }, { surface: 'agenda' }, { day_id: base.sponsor_id }]) expect(resourceSchema(definition).safeParse({ ...base, ...patch }).success).toBe(false);
    expect(resourceSchema(definition).safeParse({ ...base, surface: 'agenda', day_id: base.sponsor_id }).success).toBe(true);
  });
});
