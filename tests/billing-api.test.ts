import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Stripe from 'stripe';
const mocks = vi.hoisted(() => ({ identity: vi.fn(), store: vi.fn(), process: vi.fn(), reconcile: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../src/lib/server/platform-auth', async importOriginal => ({ ...await importOriginal<typeof import('../src/lib/server/platform-auth')>(), platformIdentity: mocks.identity }));
vi.mock('../src/lib/server/billing/store', () => ({ billingStore: mocks.store }));
vi.mock('../src/lib/server/billing/service', async importOriginal => ({ ...await importOriginal<typeof import('../src/lib/server/billing/service')>(), billingService: () => ({ processEvent: mocks.process, reconcileIntent: mocks.reconcile }) }));
import { GET, POST, PATCH } from '../src/app/api/billing/[[...segments]]/route';
import { ApiError } from '../src/lib/server/http';
const origin = 'https://event-beast.example.test';
const id = 'd0000000-0000-4000-8000-000000000001';
const context = (segments: string[]) => ({ params: Promise.resolve({ segments }) });
const request = (segments: string[], body: unknown, source = origin) => new Request(`${origin}/api/billing/${segments.join('/')}`, { method: 'POST', headers: { Origin: source, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const secret = 'whsec_synthetic_signature_test';
const stripe = new Stripe('sk_test_synthetic_signature_test');
function signed(payload: string, options: { timestamp?: number; signature?: string } = {}) {
  return new Request(`${origin}/api/billing/webhook`, { method: 'POST', headers: { 'stripe-signature': options.signature ?? stripe.webhooks.generateTestHeaderString({ payload, secret, timestamp: options.timestamp }) }, body: payload });
}
const event = (extra = {}) => JSON.stringify({ id: 'evt_test', type: 'invoice.paid', livemode: false, data: { object: { id: 'in_test' } }, ...extra });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('EVENT_BEAST_PLATFORM_ENABLED','true'); vi.stubEnv('EVENT_BEAST_BILLING_ENABLED','true'); vi.stubEnv('EVENT_BEAST_DEMO_MODE','false');
  vi.stubEnv('EVENT_BEAST_BILLING_MODE','test'); vi.stubEnv('EVENT_BEAST_PLATFORM_URL', origin); vi.stubEnv('EVENT_BEAST_STRIPE_SECRET_KEY','sk_test_synthetic'); vi.stubEnv('EVENT_BEAST_STRIPE_WEBHOOK_SECRET',secret);
  mocks.identity.mockResolvedValue({ agency: false, user: { id, email: 'owner@example.test' }, db: { rpc: vi.fn() } });
  mocks.process.mockResolvedValue(undefined); mocks.reconcile.mockResolvedValue(undefined); mocks.store.mockReturnValue({});
});
afterEach(() => vi.unstubAllEnvs());
describe('billing HTTP authority and provider signatures', () => {
  it('disables subscription discovery without requiring payment credentials', async () => {
    vi.stubEnv('EVENT_BEAST_BILLING_ENABLED','false');
    expect(await (await GET(new Request(`${origin}/api/billing/plans`), context(['plans']))).json()).toEqual({ enabled: false, plans: [] });
    expect((await POST(request(['checkout'], {}), context(['checkout']))).status).toBe(404);
    expect(mocks.store).not.toHaveBeenCalled();
  });
  it('rejects an unsigned, altered, and stale notification before privileged processing', async () => {
    const payload = event();
    expect((await POST(request(['webhook'], {}), context(['webhook']))).status).toBe(400);
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
    expect((await POST(signed(payload+' ', { signature: header }), context(['webhook']))).status).toBe(400);
    expect((await POST(signed(payload, { timestamp: Math.floor(Date.now()/1000)-600 }), context(['webhook']))).status).toBe(400);
    expect(mocks.process).not.toHaveBeenCalled(); expect(mocks.store).not.toHaveBeenCalled();
  });
  it('accepts a valid signed notification without a browser session or Origin', async () => {
    mocks.identity.mockRejectedValue(new Error('Must not authenticate a webhook as a customer'));
    const response = await POST(signed(event()), context(['webhook']));
    expect(response.status).toBe(200); expect(mocks.process).toHaveBeenCalledOnce(); expect(mocks.identity).not.toHaveBeenCalled();
    expect(response.headers.get('cache-control')).toContain('no-store');
  });
  it('rejects another environment or Connect account and ignores unrelated event types', async () => {
    expect((await POST(signed(event({ livemode: true })), context(['webhook']))).status).toBe(400);
    expect((await POST(signed(event({ account: 'acct_other' })), context(['webhook']))).status).toBe(400);
    expect((await POST(signed(event({ type: 'charge.succeeded' })), context(['webhook']))).status).toBe(200);
    expect(mocks.process).not.toHaveBeenCalled();
  });
  it('returns a retryable error if durable processing fails', async () => {
    mocks.process.mockRejectedValue(new Error('private provider error'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await POST(signed(event()), context(['webhook']));
    expect(response.status).toBe(503); expect(JSON.stringify(await response.json())).not.toContain('private provider error'); spy.mockRestore();
  });
  it('requires an authenticated caller for plans and checkout status', async () => {
    mocks.identity.mockRejectedValue(new ApiError(401, 'Sign in'));
    expect((await GET(new Request(`${origin}/api/billing/plans`), context(['plans']))).status).toBe(401);
    expect((await GET(new Request(`${origin}/api/billing/checkout/${id}`), context(['checkout',id]))).status).toBe(401);
  });
  it('refuses cross-origin billing mutations before database or provider use', async () => {
    expect((await POST(request(['reconcile'], { intent_id: id }, 'https://attacker.example.test'), context(['reconcile']))).status).toBe(403);
    expect(mocks.store).not.toHaveBeenCalled();
  });
  it('reserves agency billing operations for the platform owner', async () => {
    expect((await GET(new Request(`${origin}/api/billing/agency`), context(['agency']))).status).toBe(403);
    expect((await PATCH(request(['plans'], { id, active: false }), context(['plans']))).status).toBe(403);
    expect((await POST(request(['plans'], { name: 'Forged', stripe_price_id: 'price_other', event_limit: 100 }), context(['plans']))).status).toBe(403);
  });
  it('checks purchaser and workspace-owner RPC authorization before using the machine credential', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: { code: '42501', message: 'Not your account' }, data: null });
    mocks.identity.mockResolvedValue({ agency: false, user: { id }, db: { rpc } });
    expect((await POST(request(['reconcile'], { intent_id: id }), context(['reconcile']))).status).toBe(403);
    expect((await POST(request(['portal'], { organization_id: id }), context(['portal']))).status).toBe(403);
    expect((await POST(request(['refresh'], { organization_id: id }), context(['refresh']))).status).toBe(403);
    expect(mocks.store).not.toHaveBeenCalled(); expect(mocks.reconcile).not.toHaveBeenCalled();
  });
  it('validates request identifiers instead of forwarding arbitrary database input', async () => {
    const rpc = vi.fn(); mocks.identity.mockResolvedValue({ agency: false, user: { id }, db: { rpc } });
    expect((await POST(request(['reconcile'], { intent_id: 'invalid', role: 'owner' }), context(['reconcile']))).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled(); expect(mocks.store).not.toHaveBeenCalled();
  });
});
