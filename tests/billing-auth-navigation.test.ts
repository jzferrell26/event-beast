import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ server: vi.fn(), signUp: vi.fn(), resend: vi.fn(), verifyOtp: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../src/lib/supabase/server', () => ({ serverSupabase: mocks.server }));
vi.mock('../src/lib/server/guide', () => ({ isDemo: () => false }));
import { POST } from '../src/app/api/auth/route';
const site = 'https://event-beast.example.test';
const next = '/platform/subscribe?checkout=10000000-0000-4000-8000-000000000001';
const send = (body: Record<string, unknown>) => POST(new Request(`${site}/api/auth`, {
  method: 'POST', headers: { Origin: site, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'buyer@example.test', context: 'workspace', ...body }),
}));

describe('subscription signup and email verification return', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', site);
    vi.stubEnv('EVENT_BEAST_SITE_URL', site);
    vi.stubEnv('EVENT_BEAST_PLATFORM_URL', site);
    vi.stubEnv('EVENT_BEAST_PLATFORM_ENABLED', 'true');
    vi.stubEnv('EVENT_BEAST_EMAIL_READY', 'true');
    for (const method of [mocks.signUp, mocks.resend, mocks.verifyOtp]) method.mockResolvedValue({ error: null });
    mocks.server.mockResolvedValue({ auth: { signUp: mocks.signUp, resend: mocks.resend, verifyOtp: mocks.verifyOtp } });
  });
  afterEach(() => vi.unstubAllEnvs());
  it('keeps the checkout request as one encoded callback parameter during signup', async () => {
    const response = await send({ action: 'sign-up', password: 'synthetic-password', next });
    expect(response.status).toBe(200);
    const redirect = new URL(mocks.signUp.mock.calls[0][0].options.emailRedirectTo);
    expect(redirect.origin).toBe(site);
    expect(redirect.searchParams.get('next')).toBe(next);
    expect(redirect.searchParams.get('context')).toBe('workspace');
    expect([...redirect.searchParams.keys()]).toEqual(['next', 'context']);
  });
  it('keeps the same verified destination when resending the confirmation', async () => {
    expect((await send({ action: 'resend', next })).status).toBe(200);
    expect(new URL(mocks.resend.mock.calls[0][0].options.emailRedirectTo).searchParams.get('next')).toBe(next);
  });
  it('returns to subscription selection after a successful code verification', async () => {
    const response = await send({ action: 'verify-email', token: '123456', next: '/platform/subscribe' });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ next: '/platform/subscribe' });
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ email: 'buyer@example.test', token: '123456', type: 'signup' });
  });
  it('does not forward an external destination or navigate on a failed verification', async () => {
    const response = await send({ action: 'verify-email', token: '123456', next: '//untrusted.example' });
    expect(await response.json()).toEqual({ next: '/' });
    mocks.verifyOtp.mockResolvedValue({ error: { code: 'otp_expired', status: 400 } });
    const denied = await send({ action: 'verify-email', token: '123456', next });
    expect(denied.status).toBe(400);
    expect(await denied.json()).not.toHaveProperty('next');
  });
  it('retains invitation and legacy attendee defaults', async () => {
    const workspace = await send({ action: 'verify-email', token: '123456' });
    expect(await workspace.json()).toEqual({ next: '/app' });
    const attendee = await send({ action: 'verify-email', token: '123456', context: undefined, next });
    expect(await attendee.json()).toEqual({ next: '/account-ready' });
  });
});
