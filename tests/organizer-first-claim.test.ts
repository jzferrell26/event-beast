import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ serverSupabase: vi.fn(), isDemo: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../src/lib/supabase/server', () => ({ serverSupabase: mocks.serverSupabase }));
vi.mock('../src/lib/server/guide', () => ({ eventSlug: () => 'momentum-builder-live-2026', isDemo: mocks.isDemo }));
import { getActor, requireAdmin } from '../src/lib/server/auth';

const eventId = '10000000-0000-4000-8000-000000000001';
const userId = '20000000-0000-4000-8000-000000000001';
const attendeeId = '30000000-0000-4000-8000-000000000001';

function fixture({ role = 'admin', verified = true, claimExists = true, denied = false } = {}) {
  let claimed = false;
  const reads: Record<string, string>[] = [];
  const rpc = vi.fn(async (name: string) => {
    if (name === 'is_event_admin') return { data: false, error: null };
    if (name === 'claim_attendee') {
      claimed = verified && claimExists;
      return { data: claimed ? attendeeId : null, error: null };
    }
    throw new Error(`Unexpected RPC: ${name}`);
  });
  const from = vi.fn((table: string) => {
    const filters: Record<string, string> = {};
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn((column: string, value: string) => { filters[column] = value; return chain; }),
      maybeSingle: vi.fn(async () => {
        if (table === 'events') return { data: { id: eventId, name: 'Event', timezone: 'America/Chicago' }, error: null };
        reads.push({ ...filters });
        // Reproduce the server render's memoized pre-claim GET: asking for the
        // identical user lookup a second time still returns its earlier null.
        if (filters.id !== attendeeId) return { data: null, error: null };
        if (denied) return { data: null, error: { code: '42501', message: 'Denied' } };
        return { data: claimed ? { id: attendeeId, access_role: role, status: 'approved', directory_allowed: false, access_version: 1 } : null, error: null };
      }),
    };
    return chain;
  });
  mocks.serverSupabase.mockResolvedValue({ from, rpc, auth: { getUser: vi.fn(async () => ({ data: { user: { id: userId, email: 'organizer@example.test', email_confirmed_at: verified ? '2026-09-29T00:00:00Z' : null } }, error: null })) } });
  return { reads, rpc };
}

describe('first organizer registration claim', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.isDemo.mockReturnValue(false); });
  it('reads the claimed row by its returned identity, not the memoized pre-claim query', async () => {
    const { reads, rpc } = fixture();
    const actor = await requireAdmin();
    expect(actor.isAdmin).toBe(true);
    expect(actor.attendee?.id).toBe(attendeeId);
    expect(rpc).toHaveBeenCalledWith('claim_attendee', { p_event: eventId });
    expect(reads[1]).toMatchObject({ event_id: eventId, id: attendeeId });
  });
  it('does not elevate a claimed Member or Sponsor', async () => {
    for (const role of ['member', 'sponsor']) { fixture({ role }); await expect(requireAdmin()).rejects.toMatchObject({ status: 403 }); }
  });
  it('does not claim or elevate an unverified account', async () => {
    const { rpc } = fixture({ verified: false });
    expect((await getActor()).isAdmin).toBe(false);
    expect(rpc).not.toHaveBeenCalledWith('claim_attendee', expect.anything());
  });
  it('rejects missing registrations and failed post-claim authorization', async () => {
    fixture({ claimExists: false }); await expect(requireAdmin()).rejects.toMatchObject({ status: 403 });
    fixture({ denied: true }); await expect(requireAdmin()).rejects.toMatchObject({ status: 403 });
  });
});
