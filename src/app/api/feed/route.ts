import { z } from "zod";
import { PROFILE_SELECT } from "@/lib/profile-fields";
import type { FeedPost, Profile } from "@/lib/types";
import { requireMember, signProfilePhotos } from "@/lib/server/auth";
import { databaseError, handle, json, parseBody } from "@/lib/server/http";

export const GET = () => handle(async () => {
  const { db, event } = await requireMember();
  const result = await db.from("feed_posts").select("*").eq("event_id",event.id).order("created_at",{ascending:false}).limit(100);
  databaseError(result.error);
  const rows=(result.data??[]) as FeedPost[];
  const authors=[...new Set(rows.map(r=>r.author_id))];
  const profiles = authors.length ? await db.from("attendee_profiles").select(PROFILE_SELECT).eq("event_id",event.id).in("attendee_id",authors) : {data:[],error:null};
  databaseError(profiles.error);
  const signed=await signProfilePhotos(db,(profiles.data??[]) as Profile[]);
  const map=new Map(signed.map(p=>[p.attendee_id,p]));
  return json({posts:rows.map(row=>{const p=map.get(row.author_id);return {...row,author_name:p?.full_name??"Event attendee",author_company:p?.company??"",author_title:p?.title??"",avatar_url:p?.avatar_url};})});
});
export const POST = (request:Request) => handle(async()=>{
  const body=await parseBody(request,z.object({body:z.string().trim().min(1).max(2000)}).strict());
  const {db,event}=await requireMember();
  const result=await db.rpc("create_feed_post",{p_event:event.id,p_body:body.body});
  databaseError(result.error);
  return json({post:result.data},201);
});
