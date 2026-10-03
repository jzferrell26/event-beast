"use client";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { ImagePlus, Send, X } from 'lucide-react';
import { mutate, request, errorMessage } from '@/lib/client';
import { prepareFeedPhoto } from '@/lib/prepare-feed-photo';
import { useApp } from './app-provider';
import { Busy, ErrorState } from './ui';

type Photo = { file: File; preview: string; key: string };
type Attempt = { clientId: string; body: string; photoKey: string | null; uploaded: boolean };
export function FeedComposer({ onPosted }: { onPosted: () => Promise<void> }) {
  const { guide, notify } = useApp();
  const [draft, setDraft] = useState(''), [photo, setPhoto] = useState<Photo | null>(null);
  const [busy, setBusy] = useState(false), [preparing, setPreparing] = useState(false), [error, setError] = useState('');
  const attempt = useRef<Attempt | null>(null), sending = useRef(false), selection = useRef(0);
  const conversion = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.preview); }, [photo]);
  useEffect(() => () => { selection.current++; conversion.current?.abort(); }, []);
  const discardUpload = () => {
    const prior = attempt.current; attempt.current = null;
    if (prior?.photoKey) void mutate('/api/feed/photos', 'DELETE', { clientId: prior.clientId }).catch(() => {});
  };
  const choose = async (file?: File) => {
    if (!file || sending.current) return;
    conversion.current?.abort();
    const controller = new AbortController(); conversion.current = controller;
    const current = ++selection.current; setPreparing(true); setError('');
    try {
      const prepared = await prepareFeedPhoto(file, controller.signal);
      if (current !== selection.current) return;
      discardUpload(); setPhoto({ file: prepared, preview: URL.createObjectURL(prepared), key: crypto.randomUUID() });
    } catch (failure) { if (current === selection.current && !controller.signal.aborted) setError(errorMessage(failure)); }
    finally { if (conversion.current === controller) conversion.current = null; if (current === selection.current) setPreparing(false); }
  };
  const chooseFromInput = async (event: ChangeEvent<HTMLInputElement>) => {
    const picker = event.currentTarget;
    const file = picker.files?.[0];
    try { await choose(file); }
    finally {
      // Android photo providers may revoke File access when the picker resets.
      // Keep it intact until preparation has consumed the original bytes. Then
      // allow the same file to be selected again, including after a failed read.
      if (picker.files?.[0] === file) picker.value = '';
    }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (sending.current || preparing || (!draft.trim() && !photo)) return;
    if (guide.mode === 'demo') { notify('This preview is read-only. Posts are not published.', true); return; }
    if (!attempt.current || attempt.current.body !== draft.trim() || attempt.current.photoKey !== (photo?.key ?? null)) {
      discardUpload(); attempt.current = { clientId: crypto.randomUUID(), body: draft.trim(), photoKey: photo?.key ?? null, uploaded: false };
    }
    const current = attempt.current; sending.current = true; setBusy(true); setError('');
    try {
      if (photo && !current.uploaded) {
        const form = new FormData(); form.append('clientId', current.clientId); form.append('file', photo.file);
        await request('/api/feed/photos', { method: 'POST', body: form }); current.uploaded = true;
      }
      await mutate('/api/feed', 'POST', { clientId: current.clientId, body: current.body, image: Boolean(photo) });
      attempt.current = null; setDraft(''); setPhoto(null);
      await onPosted(); notify('Your post is on the social wall.');
    } catch (failure) {
      const message = errorMessage(failure) + ' Your draft is retained; retrying the same draft will not create a duplicate.';
      setError(message); notify(message, true);
    } finally { sending.current = false; setBusy(false); }
  };
  return <form className="wall-composer" onSubmit={submit}>
    <label className="form-field"><span>Share with the event</span><textarea maxLength={2000} rows={3} disabled={busy} value={draft} onChange={event => setDraft(event.target.value)} placeholder={photo ? 'Add a caption (optional)…' : 'Share a moment, a photo or a takeaway…'} /></label>
    {photo && <div className="wall-photo-preview"><img src={photo.preview} alt="Your selected photo preview" /><button type="button" className="button button-outline button-small" disabled={busy} onClick={() => { discardUpload(); setPhoto(null); }}><X size={16} />Remove photo</button></div>}
    <div className="wall-photo-picker"><input ref={input} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif" aria-label="Choose a photo for your post" disabled={busy || preparing} onChange={event => { void chooseFromInput(event); }} /><button type="button" className="button button-outline" disabled={busy || preparing} onClick={() => input.current?.click()}>{preparing ? <Busy label="Preparing photo…" /> : <><ImagePlus size={19} />{photo ? 'Change photo' : 'Add photo'}</>}</button><span>One photo per post. JPG, JPEG, PNG, HEIC and WebP supported.</span></div>
    {error && <ErrorState message={error} />}
    <div className="wall-composer-footer"><p>Your name, photo and post are shared with the signed-in event community. Private messages stay in Inbox.</p><button type="submit" className="button button-red" disabled={busy || preparing || (!draft.trim() && !photo)}>{busy ? <Busy label="Posting…" /> : <><Send size={16} />Post</>}</button></div>
  </form>;
}
