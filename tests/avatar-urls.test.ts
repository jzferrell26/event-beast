import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { signAvatarRows, attendeeAvatarUrls } from '../src/lib/server/avatar-urls';

describe('authorized profile photo projection', () => {
  it('signs only exact event/attendee paths, deduplicates and omits denied storage responses', async () => {
    const signed = vi.fn(async () => ({ data: [
      { path: 'event/person/head.webp', signedUrl: 'https://storage.example/signed.webp', error: null },
      { path: 'event/hidden/head.webp', signedUrl: null, error: 'denied' },
    ] }));
    const db = { storage: { from: vi.fn(() => ({ createSignedUrls: signed })) } };
    const result = await signAvatarRows(db as never, 'event', [
      { attendee_id: 'person', headshot_path: 'event/person/head.webp' },
      { attendee_id: 'person', headshot_path: 'event/person/head.webp' },
      { attendee_id: 'hidden', headshot_path: 'event/hidden/head.webp' },
      { attendee_id: 'foreign', headshot_path: 'other/foreign/head.webp' },
      { attendee_id: 'owner', headshot_path: 'event/person/head.webp' },
      { attendee_id: 'none', headshot_path: null },
    ]);
    expect(signed).toHaveBeenCalledWith(['event/person/head.webp','event/hidden/head.webp'],120);
    expect([...result]).toEqual([['person','https://storage.example/signed.webp']]);
  });
  it('looks up only the page authors under the session RLS and never returns private profile fields', async () => {
    const where = vi.fn(), authors = vi.fn(async () => ({ data: [], error: null }));
    const select = vi.fn(() => ({ eq: where })); where.mockReturnValue({ in: authors });
    const db = { from: vi.fn(() => ({ select })), storage: { from: vi.fn() } };
    expect([...(await attendeeAvatarUrls(db as never,'event',['one','one','two']))]).toEqual([]);
    expect(select).toHaveBeenCalledWith('attendee_id,headshot_path'); expect(where).toHaveBeenCalledWith('event_id','event'); expect(authors).toHaveBeenCalledWith('attendee_id',['one','two']); expect(db.storage.from).not.toHaveBeenCalled();
  });
});
