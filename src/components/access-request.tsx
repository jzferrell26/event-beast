"use client";
import { useState } from 'react';
import { useApp } from './app-provider';
import { Busy, ErrorState } from './ui';
import { errorMessage, mutate } from '@/lib/client';

export function AccessRequest() {
  const { me, refreshMe } = useApp();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!me?.authenticated || me.eligible || me.status === 'disabled') return null;
  if (me.status === 'pending') return <p className="demo-notice" role="status">Your access request is with the event team. Check access again after they approve it.</p>;
  return <form onSubmit={async event => { event.preventDefault(); setBusy(true); setError(''); try { await mutate('/api/access-request', 'POST', { name }); await refreshMe(); } catch (error) { setError(errorMessage(error)); } finally { setBusy(false); } }}>
    <label className="form-field"><span>Your name</span><input required autoComplete="name" value={name} maxLength={120} onChange={event => setName(event.target.value)} /></label>
    <p className="fine-print">The event team can check your registration. Your email stays private.</p>
    {error && <ErrorState message={error} />}
    <button type="submit" className="button button-outline" disabled={busy}>{busy ? <Busy /> : 'Ask the event team to check my access'}</button>
  </form>;
}
