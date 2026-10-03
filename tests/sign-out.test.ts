import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({server:vi.fn(),signOut:vi.fn()}));
vi.mock('server-only',()=>({}));
vi.mock('../src/lib/supabase/server',()=>({serverSupabase:mocks.server}));
vi.mock('../src/lib/server/guide',()=>({isDemo:()=>false}));
import { POST } from '../src/app/api/auth/route';
const site='https://2026live.momentumbuilder.com';
const request=(origin=site)=>new Request(site+'/api/auth',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({action:'sign-out'})});
describe('explicit local-browser sign-out',()=>{
  beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('NEXT_PUBLIC_SITE_URL',site);vi.stubEnv('EVENT_BEAST_SITE_URL','');mocks.signOut.mockResolvedValue({error:null});mocks.server.mockResolvedValue({auth:{signOut:mocks.signOut}});});
  afterEach(()=>vi.unstubAllEnvs());
  it('revokes the current browser session and never uses global sign-out',async()=>{
    delete process.env.EVENT_BEAST_SITE_URL;
    const response=await POST(request());expect(response.status).toBe(200);expect(mocks.signOut).toHaveBeenCalledExactlyOnceWith({scope:'local'});expect(response.headers.get('cache-control')).toContain('no-store');
  });
  it('rejects cross-origin requests before touching the session',async()=>{
    expect((await POST(request('https://other.example'))).status).toBe(403);expect(mocks.signOut).not.toHaveBeenCalled();
  });
  it('does not claim success when the auth service refuses sign-out',async()=>{
    delete process.env.EVENT_BEAST_SITE_URL;
    mocks.signOut.mockResolvedValue({error:{message:'Temporary outage'}});const response=await POST(request());expect(response.status).toBe(503);expect((await response.json()).error).toContain('not confirmed');
  });
});
