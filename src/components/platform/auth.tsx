'use client';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { errorMessage, mutate } from '@/lib/client';
import { safeNext } from '@/lib/format';
import { useResource } from '@/lib/hooks';
import type { WorkspaceHome } from '@/lib/platform';
import { Alert, Field } from './shared';

type Mode = 'sign-in' | 'sign-up' | 'verify-email' | 'recover' | 'reset';
export function PlatformAuth({ next, reset = false, linkError = false }: { next: string; reset?: boolean; linkError?: boolean }) {
  const [mode, setMode] = useState<Mode>(reset ? 'reset' : 'sign-in');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [token, setToken] = useState('');
  const [error, setError] = useState(linkError ? 'This email link has expired or was already used. Sign in or request a new password reset link.' : ''); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  const identity = useResource<WorkspaceHome>(mode === 'reset' ? '/api/platform' : null);
  const titles = { 'sign-in': 'Welcome back.', 'sign-up': 'Create your account.', 'verify-email': 'Verify your email.', recover: 'Reset your password.', reset: 'Choose a new password.' };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const body = mode === 'sign-in' ? { action: mode, email, password, next: safeNext(next) } : mode === 'sign-up' ? { action: mode, email, password, context: 'workspace', next: safeNext(next) } : mode === 'verify-email' ? { action: mode, email, token, context: 'workspace', next: safeNext(next) } : mode === 'recover' ? { action: mode, email, context: 'workspace' } : { action: 'update-password', expectedUserId: identity.data?.user.id, password, context: 'workspace' };
      const result = await mutate<{ next?: string; message?: string }>('/api/auth', 'POST', body);
      if (result.next) { window.location.assign(safeNext(result.next)); return; }
      setMessage(result.message ?? 'Check your email to continue.');
      if (mode === 'sign-up') { setPassword(''); setMode('verify-email'); }
    } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  };
  const resend = async () => { setBusy(true); setError(''); try { const result = await mutate<{ message: string }>('/api/auth', 'POST', { action: 'resend', email, context: 'workspace', next: safeNext(next) }); setMessage(result.message); } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); } };
  return <div className="platform"><main className="platform-auth"><Link href="/app" className="platform-brand"><span aria-hidden="true">EB</span>EVENT BEAST</Link><section className="platform-card"><p className="platform-eyebrow">YOUR EVENT WORKSPACE</p><h1>{titles[mode]}</h1><p>{mode === 'sign-in' || mode === 'sign-up' ? 'Sign in or create an account to manage your event workspaces and subscriptions.' : mode === 'verify-email' ? 'Enter the code from your latest verification email.' : 'Your account and workspace access stay with the same email.'}</p>{error && <Alert>{error}</Alert>}{message && <Alert success>{message}</Alert>}{mode === 'reset' && identity.error && <Alert>{identity.error} Open the reset link from your email again.</Alert>}<form onSubmit={submit}>{mode !== 'reset' && <Field label="Email address"><input type="email" required autoComplete="email" value={email} onChange={input => setEmail(input.target.value)} /></Field>}{['sign-in', 'sign-up', 'reset'].includes(mode) && <Field label={mode === 'reset' ? 'New password' : 'Password'}><input type="password" required minLength={mode === 'sign-in' ? 1 : 8} maxLength={256} autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'} value={password} onChange={input => setPassword(input.target.value)} /></Field>}{mode === 'verify-email' && <Field label="Verification code"><input required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,10}" value={token} onChange={input => setToken(input.target.value)} /></Field>}<button className="platform-primary" disabled={busy || (mode === 'reset' && !identity.data)}>{busy ? 'Working…' : mode === 'sign-in' ? 'Sign in' : mode === 'sign-up' ? 'Create account' : mode === 'verify-email' ? 'Verify email' : mode === 'recover' ? 'Send reset link' : 'Save new password'}</button></form><div className="platform-actions">{mode !== 'sign-in' && <button type="button" disabled={busy} onClick={() => { setMode('sign-in'); setError(''); setMessage(''); }}>Back to sign in</button>}{mode === 'sign-in' && <><button type="button" onClick={() => { setMode('sign-up'); setError(''); }}>Create account</button><button type="button" onClick={() => { setMode('recover'); setError(''); }}>Forgot password?</button><button type="button" onClick={() => { setMode('verify-email'); setError(''); }}>Enter verification code</button></>}{mode === 'verify-email' && <button type="button" disabled={busy || !email} onClick={() => void resend()}>Send another code</button>}</div></section></main></div>;
}
