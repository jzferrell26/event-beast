import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ identity: vi.fn(), organization: vi.fn(), event: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('../src/lib/server/platform-auth', () => ({ platformIdentity: mocks.identity, platformOrganization: mocks.organization, platformEvent: mocks.event, requireAgency: vi.fn() }));
vi.mock('../src/lib/server/guide', () => ({ invalidatePublicGuide: vi.fn() }));
import { GET } from '../src/app/api/platform/[[...segments]]/route';
import { ApiError } from '../src/lib/server/http';

const id = '10000000-0000-4000-8000-000000000001';
const event = { id, name: 'Sample', start_date: '2027-04-02', end_date: '2027-04-02', timezone: 'America/Chicago', brand_logo_url: '' };
const context = { params: Promise.resolve({ segments: ['organizations', 'sample-alpha', 'events', id, 'setup'] }) };
const request = () => new Request(`https://event.example/api/platform/organizations/sample-alpha/events/${id}/setup`);
function client(failure = false) {
  const queries: { table: string; columns: string; options: unknown; filters: Record<string, unknown> }[] = [];
  const db = { from: vi.fn((table: string) => {
    const query = { table, columns: '', options: {} as unknown, filters: {} as Record<string, unknown> };
    queries.push(query);
    const chain = {
      select: (columns: string, options: unknown) => { query.columns = columns; query.options = options; return chain; },
      eq: (column: string, value: unknown) => { query.filters[column] = value; return chain; },
      single: () => chain,
      then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => Promise.resolve({
        data: table === 'event_settings' ? { welcome_body: 'Welcome to the sample.' } : null,
        count: failure ? null : query.columns.includes('!inner') ? 0 : 1,
        error: failure ? { code: '42501', message: 'Permission denied' } : null,
      }).then(resolve, reject),
    };
    return chain;
  }) };
  return { db, queries };
}
describe('private event setup HTTP endpoint', () => {
  beforeEach(() => vi.clearAllMocks());
  it('uses authorized event counts, including the published-day filter, without sending record contents', async () => {
    const { db, queries } = client();
    const actor = { db, agency: false, user: { id: 'sample-owner' } };
    mocks.identity.mockResolvedValue(actor);
    mocks.organization.mockResolvedValue({ ...actor, organization: { id: 'sample-organization', slug: 'sample-alpha' } });
    mocks.event.mockResolvedValue({ ...actor, event });
    const response = await GET(request(), context);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    const body = await response.json();
    expect(body).toMatchObject({ eventId: id, canPublish: true, sessionsOnHiddenDays: 1 });
    expect(body).not.toHaveProperty('rows');
    expect(queries.every(query => query.filters.event_id === id)).toBe(true);
    const joined = queries.find(query => query.columns.includes('!inner'))!;
    expect(joined.options).toEqual({ count: 'exact', head: true });
    expect(joined.filters).toMatchObject({ published: true, 'agenda_days.event_id': id, 'agenda_days.published': true });
    expect(mocks.event).toHaveBeenCalledWith(actor, 'sample-alpha', id);
  });
  it('does not query content for anonymous callers or another customer’s event', async () => {
    const { db } = client();
    mocks.identity.mockRejectedValueOnce(new ApiError(401, 'Sign in'));
    expect((await GET(request(), context)).status).toBe(401);
    const actor = { db, user: { id: 'sample-owner' } };
    mocks.identity.mockResolvedValue(actor);
    mocks.organization.mockResolvedValue({ ...actor, organization: { slug: 'sample-alpha' } });
    mocks.event.mockRejectedValue(new ApiError(404, 'This event is not in your workspace.'));
    expect((await GET(request(), context)).status).toBe(404);
    expect(db.from).not.toHaveBeenCalled();
  });
  it('reports a database denial instead of treating unavailable content as an empty, ready event', async () => {
    const { db } = client(true);
    mocks.identity.mockResolvedValue({ db });
    mocks.organization.mockResolvedValue({ db, organization: { slug: 'sample-alpha' } });
    mocks.event.mockResolvedValue({ db, event });
    const response = await GET(request(), context);
    expect(response.status).toBe(403);
    expect(await response.json()).not.toHaveProperty('canPublish');
  });
});
