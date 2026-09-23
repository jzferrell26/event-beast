"use client";
import { useState, type FormEvent } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useResource } from '@/lib/hooks';
import { errorMessage, mutate } from '@/lib/client';
import { useApp } from './app-provider';
import { Busy, ErrorState, LoadingCards, Modal } from './ui';

type Contact = { registration_name: string; registration_email: string; contact_email: string; phone: string; website: string };
export function AdminContactButton({ attendeeId, name }: { attendeeId: string; name: string }) {
  const [open, setOpen] = useState(false);
  return <><button className="button button-outline button-small" type="button" aria-label={`Private contact information for ${name}`} onClick={() => setOpen(true)}>Contact info</button>
    <Modal open={open} onOpenChange={setOpen} title="Private contact information" description="Visible only to event Admins. Sponsors and members cannot access these details.">{open && <ContactLoader id={attendeeId} onSaved={() => setOpen(false)} />}</Modal></>;
}
function ContactLoader({ id, onSaved }: { id: string; onSaved: () => void }) {
  const { data, error, loading, refresh } = useResource<Contact>(`/api/admin/contacts/${id}`);
  if (error) return <ErrorState message={error} retry={() => void refresh()} />;
  if (loading || !data) return <LoadingCards count={1} />;
  return <ContactForm id={id} initial={data} onSaved={onSaved} />;
}
function ContactForm({ id, initial, onSaved }: { id: string; initial: Contact; onSaved: () => void }) {
  const [values, setValues] = useState({ contact_email: initial.contact_email, phone: initial.phone, website: initial.website });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { notify } = useApp();
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { await mutate(`/api/admin/contacts/${id}`, 'PATCH', values); notify('Private contact information saved.'); onSaved(); }
    catch (error) { setError(errorMessage(error)); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit}>
    <p className="privacy-hint"><ShieldCheck size={17} />{initial.registration_name}</p>
    <label className="form-field"><span>Verified registration email</span><input value={initial.registration_email} readOnly type="email" /><small>Manage registration access separately. This address is never included in the attendee directory.</small></label>
    <label className="form-field"><span>Additional contact email</span><input type="email" maxLength={254} value={values.contact_email} onChange={e => setValues({ ...values, contact_email: e.target.value })} /></label>
    <label className="form-field"><span>Phone number</span><input type="tel" maxLength={40} value={values.phone} onChange={e => setValues({ ...values, phone: e.target.value })} /></label>
    <label className="form-field"><span>Contact website</span><input type="url" value={values.website} placeholder="https://" onChange={e => setValues({ ...values, website: e.target.value })} /></label>
    {error && <ErrorState message={error} />}<div className="dialog-actions"><button type="submit" className="button button-red" disabled={busy}>{busy ? <Busy /> : 'Save private contact'}</button></div>
  </form>;
}
