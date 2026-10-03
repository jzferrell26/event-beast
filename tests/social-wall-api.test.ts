import { beforeEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
const mocks=vi.hoisted(()=>({member:vi.fn(),admin:vi.fn(),upload:vi.fn(),download:vi.fn(),remove:vi.fn(),rpc:vi.fn(),from:vi.fn()}));
vi.mock('server-only',()=>({}));
vi.mock('../src/lib/server/auth',()=>({requireMember:mocks.member,requireAdmin:mocks.admin}));
vi.mock('../src/lib/server/guide',()=>({isDemo:()=>false}));
import { POST as upload } from '../src/app/api/feed/photos/route';
import { GET as photo } from '../src/app/api/feed/[id]/photo/route';
import { PUT as like } from '../src/app/api/feed/[id]/like/route';
import { POST as publish } from '../src/app/api/feed/route';
import { PATCH as moderateReply } from '../src/app/api/admin/feed/replies/route';
import { ApiError } from '../src/lib/server/http';
const site='https://2026live.momentumbuilder.com',event='10000000-0000-4000-8000-000000000001',attendee='30000000-0000-4000-8000-000000000001',post='71000000-0000-4000-8000-000000000042';
const client='73000000-0000-4000-8000-000000000042';
const context={params:Promise.resolve({id:post})};
const json=(path:string,method:string,body:unknown,origin=site)=>new Request(site+path,{method,headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
const formRequest=(bytes:Uint8Array,origin=site)=>{
  const form=new FormData();form.set('clientId',client);form.set('file',new Blob([new Uint8Array(bytes)],{type:'image/png'}),'phone.png');
  return new Request(site+'/api/feed/photos',{method:'POST',headers:{Origin:origin},body:form});
};
describe('wall HTTP boundary',()=>{
  let saved:Buffer;
  beforeEach(()=>{
    vi.clearAllMocks();saved=Buffer.alloc(0);
    const db={from:mocks.from,rpc:mocks.rpc,storage:{from:()=>({upload:mocks.upload,download:mocks.download,remove:mocks.remove})}};
    mocks.member.mockResolvedValue({db,event:{id:event},attendee:{id:attendee},isAdmin:false});mocks.admin.mockResolvedValue({db,event:{id:event}});
    mocks.from.mockImplementation((table:string)=>{
      const result=table==='event_settings'?{community_enabled:true,feed_enabled:true}:{image_path:`${event}/${attendee}/${client}.webp`,status:'visible'};
      const chain={select:()=>chain,eq:()=>chain,single:async()=>({data:result,error:null}),maybeSingle:async()=>({data:result,error:null})};return chain;
    });
    mocks.upload.mockImplementation(async(_path:string,bytes:Buffer)=>{saved=bytes;return {error:null};});
    mocks.download.mockImplementation(async()=>({data:new Blob([new Uint8Array(saved)]),error:null}));
    mocks.rpc.mockResolvedValue({data:null,error:null});
  });
  it('re-encodes and verifies an upload under the caller identity, with no public/signed URL',async()=>{
    const input=await sharp({create:{width:24,height:40,channels:3,background:'#445566'}}).png().toBuffer();
    const first=await upload(formRequest(input));expect(first.status).toBe(200);expect(await first.json()).toEqual({uploaded:true,clientId:client});
    expect(mocks.upload.mock.calls[0][0]).toBe(`${event}/${attendee}/${client}.webp`);expect((await sharp(saved).metadata()).format).toBe('webp');
    mocks.upload.mockResolvedValue({error:{message:'Already exists'}});
    expect((await upload(formRequest(input))).status).toBe(200);
  });
  it('rejects a different image at an already-used key rather than overwriting it',async()=>{
    const input=await sharp({create:{width:10,height:10,channels:3,background:'#223344'}}).png().toBuffer();await upload(formRequest(input));
    mocks.upload.mockResolvedValue({error:{message:'Already exists'}});
    const different=await sharp({create:{width:10,height:10,channels:3,background:'#ff7755'}}).png().toBuffer();
    expect((await upload(formRequest(different))).status).toBe(409);
  });
  it('does not read or upload bytes for an anonymous or cross-origin caller',async()=>{
    mocks.member.mockRejectedValue(new ApiError(401,'Sign in'));
    expect((await upload(formRequest(Buffer.from('fake')))).status).toBe(401);
    expect((await upload(formRequest(Buffer.from('fake'),'https://other.example'))).status).toBe(403);
    expect(mocks.upload).not.toHaveBeenCalled();expect(mocks.download).not.toHaveBeenCalled();
  });
  it('serves image bytes uncached and does not serve hidden parent photos to Members',async()=>{
    saved=await sharp({create:{width:12,height:12,channels:3,background:'#556677'}}).webp().toBuffer();
    const response=await photo(new Request(site+`/api/feed/${post}/photo`),context);expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('private, no-store');expect(response.headers.get('content-type')).toBe('image/webp');expect(response.headers.get('cross-origin-resource-policy')).toBe('same-origin');
    mocks.from.mockImplementation((table:string)=>{const data=table==='event_settings'?{community_enabled:true,feed_enabled:true}:{image_path:'hidden.webp',status:'hidden'};const chain={select:()=>chain,eq:()=>chain,single:async()=>({data,error:null}),maybeSingle:async()=>({data,error:null})};return chain;});
    mocks.download.mockClear();expect((await photo(new Request(site+`/api/feed/${post}/photo`),context)).status).toBe(404);expect(mocks.download).not.toHaveBeenCalled();
  });
  it('passes only scoped desired-state likes and rejects forged author/media fields',async()=>{
    mocks.rpc.mockResolvedValue({data:[],error:null});const response=await like(json(`/api/feed/${post}/like`,'PUT',{liked:true}),context);expect(response.status).toBe(200);expect(mocks.rpc).toHaveBeenCalledWith('set_feed_like',{p_event:event,p_post:post,p_liked:true});
    expect((await publish(json('/api/feed','POST',{clientId:client,body:'No',image:true,author_id:attendee}))).status).toBe(400);
  });
  it('refuses Member reply moderation before any database write',async()=>{
    mocks.admin.mockRejectedValue(new ApiError(403,'Organizer access required'));
    const response=await moderateReply(json('/api/admin/feed/replies','PATCH',{replyId:post,status:'hidden'}));expect(response.status).toBe(403);expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
