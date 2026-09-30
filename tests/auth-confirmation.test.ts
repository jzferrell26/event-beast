import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ server: vi.fn(), verify: vi.fn(), signOut: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../src/lib/supabase/server', () => ({ serverSupabase: mocks.server }));
import { GET, POST } from '../src/app/auth/confirm/route';
const site = 'https://event-beast.vercel.app';
const hash = 'a'.repeat(64);
const link = `${site}/auth/confirm?token_hash=${hash}&type=invite&next=/admin`;
const post = (origin=site) => new Request(site+'/auth/confirm', { method:'POST', headers:{ Origin:origin,'Content-Type':'application/x-www-form-urlencoded' }, body:new URLSearchParams({token_hash:hash,type:'invite',next:'/admin'}) });
describe('recipient-confirmed email activation', () => {
 beforeEach(() => { vi.clearAllMocks(); process.env.NEXT_PUBLIC_SITE_URL=site; delete process.env.EVENT_BEAST_SITE_URL; mocks.verify.mockResolvedValue({error:null}); mocks.server.mockResolvedValue({auth:{verifyOtp:mocks.verify,signOut:mocks.signOut}}); });
 it('a scanner can GET the link repeatedly without consuming it or ending a current session',async()=>{
  for(let count=0;count<3;count++){const response=await GET(new Request(link));expect(response.status).toBe(200);expect(await response.text()).toContain('Continue securely');expect(response.headers.get('cache-control')).toContain('no-store');expect(response.headers.get('referrer-policy')).toBe('strict-origin');}
  expect(mocks.server).not.toHaveBeenCalled();expect(mocks.verify).not.toHaveBeenCalled();expect(mocks.signOut).not.toHaveBeenCalled();
 });
 it('moves to the canonical host before issuing cookies or consuming the token',async()=>{
  const response=await GET(new Request(link.replace('event-beast.vercel.app','eventapp.momentumbuilder.com')));expect(response.status).toBe(307);expect(response.headers.get('location')).toBe(link);expect(mocks.server).not.toHaveBeenCalled();
 });
 it('consumes the link only from an explicit same-origin confirmation and forces password setup',async()=>{
  const response=await POST(post());expect(response.status).toBe(303);expect(response.headers.get('location')).toBe(site+'/reset-password');expect(mocks.verify).toHaveBeenCalledOnce();expect(mocks.signOut).not.toHaveBeenCalled();
 });
 it('rejects cross-origin submission without using the credential',async()=>{expect((await POST(post('https://untrusted.example'))).status).toBe(403);expect(mocks.verify).not.toHaveBeenCalled();});
 it('a used link is actionable but cannot sign out the existing account',async()=>{mocks.verify.mockResolvedValue({error:{code:'otp_expired'}});const response=await POST(post());expect(response.headers.get('location')).toBe(site+'/auth?error=link&force=1');expect(mocks.signOut).not.toHaveBeenCalled();});
 it('does not accept malformed token markup',async()=>{const response=await GET(new Request(site+'/auth/confirm?token_hash=%22%3E%3Cscript%3E&type=invite'));expect(response.status).toBe(303);expect(mocks.server).not.toHaveBeenCalled();});
});
