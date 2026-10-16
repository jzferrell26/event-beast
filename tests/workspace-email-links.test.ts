import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ server: vi.fn(), verify: vi.fn(), exchange: vi.fn(), signOut: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../src/lib/supabase/server', () => ({ serverSupabase: mocks.server }));
import { GET, POST } from '../src/app/auth/confirm/route';
import { GET as callback } from '../src/app/auth/callback/route';

const platform = 'https://workspace.example.test';
const legacy = 'https://event.example.test';
const hash = 'a'.repeat(64);
const values = (extra: Record<string, string> = {}) => new URLSearchParams({ token_hash: hash, type: 'invite', context: 'workspace', ...extra });
const confirm = (extra: Record<string, string> = {}, origin = platform) => POST(new Request(`${origin}/auth/confirm`, {
  method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' }, body: values(extra),
}));

describe('workspace email link handoff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', legacy);
    vi.stubEnv('EVENT_BEAST_SITE_URL', legacy);
    vi.stubEnv('EVENT_BEAST_PLATFORM_URL', platform);
    vi.stubEnv('EVENT_BEAST_PLATFORM_ENABLED', 'true');
    mocks.verify.mockResolvedValue({ error: null });
    mocks.exchange.mockResolvedValue({ error: null });
    mocks.server.mockResolvedValue({ auth: { verifyOtp: mocks.verify, exchangeCodeForSession: mocks.exchange, signOut: mocks.signOut } });
  });
  afterEach(() => vi.unstubAllEnvs());

  it('renders a scanner-safe Event Beast confirmation and preserves workspace context in the form', async () => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await GET(new Request(`${platform}/auth/confirm?${values()}`));
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain('Continue securely | Event Beast');
      expect(html).not.toContain('MOMENTUM BUILDER');
      expect(html).toContain('name="context" value="workspace"');
      expect(html).toContain('href="/platform/auth"');
      expect(response.headers.get('cache-control')).toContain('no-store');
    }
    expect(mocks.server).not.toHaveBeenCalled();
  });

  it.each(['invite', 'recovery'])('takes a verified %s link to workspace password setup', async type => {
    const response = await confirm({ type });
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(`${platform}/platform/auth?mode=reset`);
    expect(mocks.verify).toHaveBeenCalledWith({ token_hash: hash, type });
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it('recognizes workspace destinations in already-issued links without a context parameter', async () => {
    const response = await confirm({ context: '', next: '/agency' });
    expect(response.headers.get('location')).toBe(`${platform}/platform/auth?mode=reset`);
  });

  it('rejects a same-origin form on the wrong configured website before verification', async () => {
    expect((await confirm({}, legacy)).status).toBe(403);
    expect(mocks.verify).not.toHaveBeenCalled();
  });

  it('does not forward an external next destination after workspace signup verification', async () => {
    const response = await confirm({ type: 'signup', next: 'https://untrusted.example/agency' });
    expect(response.headers.get('location')).toBe(`${platform}/`);
  });

  it('sends expired links back to workspace sign-in without clearing an existing session', async () => {
    mocks.verify.mockResolvedValue({ error: { code: 'otp_expired' } });
    const response = await confirm();
    expect(response.headers.get('location')).toBe(`${platform}/platform/auth?error=link`);
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it('rejects disabled workspace confirmation and callback flows before consuming credentials', async () => {
    vi.stubEnv('EVENT_BEAST_PLATFORM_ENABLED', 'false');
    expect((await GET(new Request(`${platform}/auth/confirm?${values()}`))).status).toBe(404);
    expect((await confirm()).status).toBe(404);
    expect((await callback(new Request(`${platform}/auth/callback?context=workspace&code=sample`))).status).toBe(404);
    expect(mocks.server).not.toHaveBeenCalled();
  });

  it('exchanges a workspace callback on its configured host and preserves its destination', async () => {
    const response = await callback(new Request(`${platform}/auth/callback?code=sample&next=%2Fapp`));
    expect(response.headers.get('location')).toBe(`${platform}/app`);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(mocks.exchange).toHaveBeenCalledWith('sample');
  });

  it('moves a callback to its canonical host before issuing session cookies', async () => {
    const response = await callback(new Request(`${legacy}/auth/callback?context=workspace&code=sample&next=%2Fapp`));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(`${platform}/auth/callback?context=workspace&code=sample&next=%2Fapp`);
    expect(mocks.server).not.toHaveBeenCalled();
  });

  it('recognizes the public host supplied by the deployment proxy', async () => {
    const response = await callback(new Request('http://localhost:3000/auth/callback?context=workspace&code=sample&next=%2Fapp', {
      headers: { 'x-forwarded-host': 'workspace.example.test' },
    }));
    expect(response.status).toBe(303);
    expect(mocks.exchange).toHaveBeenCalledOnce();
  });

  it('returns failed workspace callbacks to the correct sign-in page', async () => {
    mocks.exchange.mockResolvedValue({ error: { code: 'invalid_code' } });
    const response = await callback(new Request(`${platform}/auth/callback?context=workspace&code=sample`));
    expect(response.headers.get('location')).toBe(`${platform}/platform/auth?error=link`);
  });

  it('retains the legacy callback default and legacy error destination', async () => {
    const response = await callback(new Request(`${legacy}/auth/callback?code=sample`));
    expect(response.headers.get('location')).toBe(`${legacy}/`);
    const failed = await callback(new Request(`${legacy}/auth/callback`));
    expect(failed.headers.get('location')).toBe(`${legacy}/auth?error=link`);
  });
});
