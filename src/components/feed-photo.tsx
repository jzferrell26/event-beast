"use client";
import { useState } from 'react';
import { ChevronLeft, ChevronRight, Expand } from 'lucide-react';
import { Modal } from './ui';
export function FeedPhoto({ src, author = 'Event attendee', count = 1 }: { src?: string | null; author?: string; count?: number }) {
  const [open, setOpen] = useState(false), [index, setIndex] = useState(1), [failed, setFailed] = useState('');
  const total = Math.max(1, Math.min(5, count));
  const slot = Math.min(index, total);
  if (!src) return null;
  const url = slot === 1 ? src : `${src}${src.includes('?') ? '&' : '?'}slot=${slot}`;
  const navigation = <div className="wall-album-controls"><button type="button" className="button button-outline button-small" aria-label="Previous photo" disabled={slot === 1} onClick={() => setIndex(slot - 1)}><ChevronLeft size={18} /></button><span role="status">Photo {slot} of {total}</span><button type="button" className="button button-outline button-small" aria-label="Next photo" disabled={slot === total} onClick={() => setIndex(slot + 1)}><ChevronRight size={18} /></button></div>;
  return <div className="wall-album">
    {failed === url ? <p className="fine-print">This photo is unavailable. <button type="button" className="text-button" onClick={() => setFailed('')}>Retry photo</button></p> : <button type="button" className="wall-photo" onClick={() => setOpen(true)} aria-label={`View full photo by ${author}`}><img key={url} src={url} alt={`Photo shared by ${author}`} loading="lazy" decoding="async" onError={() => setFailed(url)} /><span><Expand size={15} />{total > 1 ? `${slot} / ${total} · View photo` : 'View photo'}</span></button>}
    {total > 1 && navigation}
    <Modal open={open} onOpenChange={setOpen} title={`Photo by ${author}`} description="Shared with the event community."><img className="wall-photo-full" src={url} alt={`Full photo shared by ${author}`} />{total > 1 && navigation}</Modal>
  </div>;
}
