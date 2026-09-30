"use client";
import { useEffect, useState, type FormEvent } from "react";
import { MessageSquareText, Send, ShieldCheck } from "lucide-react";
import type { FeedPost } from "@/lib/types";
import { mutate, request, errorMessage } from "@/lib/client";
import { useApp } from "./app-provider";
import { Avatar, Busy, EmptyState, ErrorState, PageTitle } from "./ui";

export function FeedScreen() {
  const { notify } = useApp();
  const [posts,setPosts]=useState<FeedPost[]>([]);
  const [draft,setDraft]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const load=async()=>{try{const data=await request<{posts:FeedPost[]}>("/api/feed");setPosts(data.posts);setError("");}catch(e){setError(errorMessage(e));}};
  useEffect(()=>{void load();},[]);
  const submit=async(event:FormEvent)=>{event.preventDefault();const body=draft.trim();if(!body||busy)return;setBusy(true);try{await mutate("/api/feed","POST",{body});setDraft("");await load();}catch(e){notify(errorMessage(e),true);}finally{setBusy(false);}};
  return <><PageTitle eyebrow="WHAT'S HAPPENING NOW" title="The event feed." description="Share a thought, a takeaway or where the momentum is happening." />
    <form className="resource-editor" onSubmit={submit}><label className="form-field"><span>Share with the event</span><textarea maxLength={2000} rows={3} value={draft} onChange={e=>setDraft(e.target.value)} placeholder="What’s worth sharing?" /></label><button className="button button-red" disabled={busy||!draft.trim()}>{busy?<Busy label="Posting…"/>:<><Send size={16}/>Post</>}</button></form>
    <p className="fine-print"><ShieldCheck size={13}/> Event-only feed. Report concerns to the organizer.</p>
    {error && <ErrorState message={error} retry={()=>void load()}/>}
    {!error && !posts.length ? <EmptyState title="Be the first to get it moving." icon={<MessageSquareText size={28}/>}>Posts from approved attendees will appear here.</EmptyState> :
      <div className="conversation-list">{posts.map(post=><article className="conversation-row" key={post.id}><Avatar name={post.author_name??"Event attendee"} src={post.avatar_url}/><div className="conversation-copy"><div><h2>{post.author_name??"Event attendee"}</h2><time>{new Date(post.created_at).toLocaleString()}</time></div><p>{post.body}</p><span>{post.author_title||post.author_company||""}</span></div></article>)}</div>}
  </>;
}
