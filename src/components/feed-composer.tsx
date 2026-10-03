"use client";
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ImagePlus, Send, X } from 'lucide-react';
import { mutate, request, errorMessage } from '@/lib/client';
import { prepareFeedPhoto, feedPhotoPreview } from '@/lib/prepare-feed-photo';
import { maxFeedPhotos } from '@/lib/feed';
import { useApp } from './app-provider';
import { Busy, ErrorState } from './ui';

type Photo = { file: File; preview: string; key: string };
type Attempt = { clientId: string; body: string; keys: string; uploaded: number };
export function FeedComposer({ onPosted }: { onPosted: () => Promise<void> }) {
  const { guide, notify } = useApp();
  const [draft, setDraft] = useState(''), [photos, setPhotos] = useState<Photo[]>([]);
  const [busy, setBusy] = useState(false), [preparing, setPreparing] = useState(false), [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const attempt = useRef<Attempt | null>(null), sending = useRef(false), photoRef = useRef<Photo[]>([]);
  const conversion = useRef<AbortController | null>(null), mounted = useRef(true);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; conversion.current?.abort(); for (const photo of photoRef.current) URL.revokeObjectURL(photo.preview); };
  }, []);
  const replacePhotos = (next: Photo[]) => {
    for (const photo of photoRef.current) if (!next.includes(photo)) URL.revokeObjectURL(photo.preview);
    photoRef.current = next; setPhotos(next);
  };
  const discardUpload = () => {
    const prior = attempt.current; attempt.current = null;
    if (prior?.keys) void mutate('/api/feed/photos', 'DELETE', { clientId: prior.clientId }).catch(() => {});
  };
  const choose = async (files: File[]) => {
    if (!files.length || sending.current || conversion.current) return;
    if (photos.length + files.length > maxFeedPhotos) { setError(`Choose up to ${maxFeedPhotos} photos per post. Remove a photo before adding another.`); return; }
    const controller = new AbortController(); conversion.current = controller;
    setPreparing(true); setError('');
    const selected: Photo[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        setProgress(`Preparing photo ${i + 1} of ${files.length}…`);
        const prepared = await prepareFeedPhoto(files[i], controller.signal);
        const preview = await feedPhotoPreview(prepared);
        selected.push({ file: prepared, preview, key: crypto.randomUUID() });
        controller.signal.throwIfAborted();
      }
      if (mounted.current) { discardUpload(); replacePhotos([...photoRef.current, ...selected]); }
      else for (const photo of selected) URL.revokeObjectURL(photo.preview);
    } catch (failure) {
      for (const photo of selected) URL.revokeObjectURL(photo.preview);
      if (mounted.current && !controller.signal.aborted) setError(errorMessage(failure));
    } finally {
      conversion.current = null;
      if (mounted.current) { setPreparing(false); setProgress(''); }
    }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (sending.current || preparing || (!draft.trim() && !photos.length)) return;
    if (guide.mode === 'demo') { notify('This preview is read-only. Posts are not published.', true); return; }
    const keys = photos.map(photo => photo.key).join(',');
    if (!attempt.current || attempt.current.body !== draft.trim() || attempt.current.keys !== keys) {
      discardUpload(); attempt.current = { clientId: crypto.randomUUID(), body: draft.trim(), keys, uploaded: 0 };
    }
    const current = attempt.current; sending.current = true; setBusy(true); setError('');
    try {
      // No Promise.all: a phone sends ONE bounded derivative at a time. On retry
      // resume the first unconfirmed slot with the original immutable request ID.
      for (let i = current.uploaded; i < photos.length; i++) {
        setProgress(`Uploading photo ${i + 1} of ${photos.length}…`);
        const form = new FormData(); form.append('clientId', current.clientId); form.append('slot', String(i + 1)); form.append('file', photos[i].file);
        await request('/api/feed/photos', { method: 'POST', body: form }); current.uploaded = i + 1;
      }
      setProgress('Publishing your post…');
      await mutate('/api/feed', 'POST', { clientId: current.clientId, body: current.body, photoCount: photos.length });
      attempt.current = null; setDraft(''); replacePhotos([]);
      await onPosted(); notify('Your post is on the social wall.');
    } catch (failure) {
      const message = errorMessage(failure) + ' Your draft is retained; retrying the same draft will not create a duplicate.';
      if (mounted.current) { setError(message); notify(message, true); }
    } finally { sending.current = false; if (mounted.current) { setBusy(false); setProgress(''); } }
  };
  return <form className="wall-composer" onSubmit={submit}>
    <label className="form-field"><span>Share with the event</span><textarea maxLength={2000} rows={3} disabled={busy} value={draft} onChange={event => setDraft(event.target.value)} placeholder={photos.length ? 'Add a caption (optional)…' : 'Share a moment, a photo or a takeaway…'} /></label>
    {photos.length > 0 && <div className="wall-photo-previews">{photos.map((photo, i) => <div className="wall-photo-preview" key={photo.key}><img src={photo.preview} alt={photos.length === 1 ? 'Your selected photo preview' : `Selected photo ${i + 1} preview`} /><button type="button" className="button button-outline button-small" disabled={busy || preparing} aria-label={`Remove photo ${i + 1}`} onClick={() => { discardUpload(); replacePhotos(photos.filter(item => item !== photo)); }}><X size={16} />Remove</button></div>)}</div>}
    <div className="wall-photo-picker"><input ref={input} className="sr-only" type="file" multiple accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.heic,.heif" aria-label="Choose a photo for your post" disabled={busy || preparing} onChange={event => { void choose(Array.from(event.target.files ?? [])); event.target.value = ''; }} /><button type="button" className="button button-outline" disabled={busy || preparing || photos.length >= maxFeedPhotos} onClick={() => input.current?.click()}><ImagePlus size={19} />{photos.length ? 'Add more photos' : 'Add photos'}</button><span>{photos.length}/{maxFeedPhotos} photos. Captions are optional.</span></div>
    {progress && <p className="wall-photo-progress" role="status"><Busy label={progress} />{preparing && <button type="button" className="text-button" onClick={() => conversion.current?.abort()}>Cancel preparation</button>}</p>}
    {error && <ErrorState message={error} />}
    <div className="wall-composer-footer"><p>Your name, photos and post are shared with the signed-in event community. Private messages stay in Inbox.</p><button type="submit" className="button button-red" disabled={busy || preparing || (!draft.trim() && !photos.length)}>{busy ? <Busy label="Posting…" /> : <><Send size={16} />Post</>}</button></div>
  </form>;
}
