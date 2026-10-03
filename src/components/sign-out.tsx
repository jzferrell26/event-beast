"use client";
import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { useApp } from './app-provider';
import { Busy } from './ui';
import { errorMessage } from '@/lib/client';

export function SignOutButton({ compact = false }: { compact?: boolean }) {
  const { guide, me, signOut, notify } = useApp();
  const [busy, setBusy] = useState(false);
  if (!me?.authenticated || guide.mode === 'demo') return null;
  return <button type="button" className={compact ? 'account-sign-out compact' : 'button button-outline account-sign-out'} disabled={busy} onClick={async () => {
    setBusy(true); try { await signOut(); } catch (failure) { notify(errorMessage(failure), true); setBusy(false); }
  }}>{busy ? <Busy label="Signing out…" /> : <><LogOut size={compact ? 17 : 19} /><span>Sign out</span></>}</button>;
}
