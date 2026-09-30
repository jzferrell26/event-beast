import {beforeEach,describe,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({requireAdmin:vi.fn(),isDemo:vi.fn(),rpc:vi.fn()}));
vi.mock('server-only',()=>({}));
vi.mock('../src/lib/server/auth',()=>({requireAdmin:mock.requireAdmin}));
vi.mock('../src/lib/server/guide',()=>({isDemo:mock.isDemo}));
import {POST} from '../src/app/api/admin/import/route';
import {ApiError} from '../src/lib/server/http';
const site='https://event-beast.vercel.app',event='10000000-0000-4000-8000-000000000001';
const csv='email,name\na@example.test,Example Attendee';
const token='a'.repeat(32);
const request=(body:unknown,origin=site)=>new Request(site+'/api/admin/import',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
describe('preview before roster commit',()=>{
 beforeEach(()=>{vi.clearAllMocks();mock.isDemo.mockReturnValue(false);mock.requireAdmin.mockResolvedValue({db:{rpc:mock.rpc},event:{id:event}});mock.rpc.mockResolvedValue({data:{new:1,existing:0,preview_token:token},error:null});});
 it('performs an Admin-only read preview and binds commit to its exact token',async()=>{
  const response=await POST(request({csv,commit:false}));expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toContain('no-store');expect(await response.json()).toMatchObject({committed:false,summary:{preview_token:token}});
  expect(mock.rpc).toHaveBeenLastCalledWith('preview_attendee_import',{p_event:event,p_rows:[{email:'a@example.test',name:'Example Attendee'}]});
  mock.rpc.mockResolvedValue({data:{created:1,existing:0,emails_sent:0},error:null});
  const saved=await POST(request({csv,commit:true,previewToken:token}));expect(await saved.json()).toMatchObject({committed:true,emails_sent:0});
  expect(mock.rpc).toHaveBeenLastCalledWith('commit_attendee_import',{p_event:event,p_rows:[{email:'a@example.test',name:'Example Attendee'}],p_preview_token:token});
 });
 it('refuses a missing preview, mismatched origins and a stale preview without implying success',async()=>{
  expect((await POST(request({csv,commit:true}))).status).toBe(409);expect(mock.rpc).not.toHaveBeenCalled();
  expect((await POST(request({csv,commit:true,previewToken:token},'https://wrong.example'))).status).toBe(403);
  mock.rpc.mockResolvedValue({data:null,error:{code:'PT409',message:'The roster changed since preview.'}});
  const r=await POST(request({csv,commit:true,previewToken:token}));expect(r.status).toBe(409);expect(await r.json()).not.toHaveProperty('committed');
 });
 it('does not use the database for invalid or duplicated CSV rows',async()=>{await POST(request({csv:csv+'\nA@example.test,Duplicate',commit:false}));expect(mock.rpc).not.toHaveBeenCalled();});
 it('refuses anonymous and non-Admin preview/commit while demo remains read-only',async()=>{
  for(const status of [401,403]){mock.requireAdmin.mockRejectedValue(new ApiError(status,'Access required'));expect((await POST(request({csv,commit:false}))).status).toBe(status);expect((await POST(request({csv,commit:true,previewToken:token}))).status).toBe(status);}
  mock.isDemo.mockReturnValue(true);expect(await (await POST(request({csv,commit:false}))).json()).toMatchObject({demo:true,committed:false});
  mock.requireAdmin.mockRejectedValue(new ApiError(409,'Preview only'));expect((await POST(request({csv,commit:true,previewToken:token}))).status).toBe(409);
  expect(mock.rpc).not.toHaveBeenCalled();
 });
});
