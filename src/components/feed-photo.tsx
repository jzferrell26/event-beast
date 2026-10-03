"use client";
import { useState } from 'react';
import { Expand } from 'lucide-react';
import { Modal } from './ui';
export function FeedPhoto({ src, author = 'Event attendee' }: { src?: string | null; author?: string }) {
  const [open, setOpen] = useState(false), [failed, setFailed] = useState(false);
  if (!src) return null;
  if (failed) return <p className="fine-print">This photo is unavailable. Refresh the wall to check for updates.</p>;
  return <><button type="button" className="wall-photo" onClick={() => setOpen(true)} aria-label={`View full photo by ${author}`}><img src={src} alt={`Photo shared by ${author}`} loading="lazy" decoding="async" onError={() => setFailed(true)} /><span><Expand size={15} />View photo</span></button><Modal open={open} onOpenChange={setOpen} title={`Photo by ${author}`} description="Shared with the event community."><img className="wall-photo-full" src={src} alt={`Full photo shared by ${author}`} /></Modal></>;
}
