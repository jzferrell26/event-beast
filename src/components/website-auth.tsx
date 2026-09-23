"use client";
import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, CheckCircle2, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { authRequest } from '@/lib/auth-request';
import { errorMessage } from '@/lib/client';
import { Brand, Busy, ErrorState } from './ui';

type Mode = 'sign-in' | 'sign-up' | 'recover' | 'update-password';
export function AuthScreen({ initialMode = 'sign-in', next = '/', demo = false, linkError = false, emailReady = false }: { initialMode?: Mode; next?: string; demo?: boolean; linkError?: boolean; emailReady?: boolean }) {
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [code, setCode] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(0);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState(linkError ? 'This link could not be verified. It may have expired or already been used. Sign in or request a new email.' : '');
  const [success, setSuccess] = useState('');
  const active = useRef<AbortController | null>(null);
  const router = useRouter();
  useEffect(() => () => active.current?.abort(), []);
  useEffect(() => { if (!cooldown) return; const timer = setTimeout(() => setCooldown(cooldown - 1), 1000); return () => clearTimeout(timer); }, [cooldown]);
  const switchMode = (value: Mode) => { active.current?.abort(); active.current = null; setBusy(false); setWaiting(0); setMode(value); setPassword(''); setConfirm(''); setSuccess(''); setError(''); setCode(''); };
  const run = async (payload: unknown, kind: 'submit' | 'verify' | 'resend') => {
    if (active.current) return;
    if (demo) { setError('This is a sample preview. No account or email is created here.'); return; }
    const controller = new AbortController(); active.current = controller;
    setBusy(true); setError('');
    try {
      const data = await authRequest<{ next?: string; message?: string }>(payload, setWaiting, controller.signal);
      if (controller.signal.aborted) return;
      if (data.next) { router.replace(data.next); router.refresh(); }
      else { setSuccess(data.message ?? 'Check your email for the next step.'); setPassword(''); setConfirm(''); if (mode === 'sign-up' || kind === 'resend') setCooldown(60); }
    } catch (error) { if (!controller.signal.aborted) setError(errorMessage(error)); }
    finally { if (active.current === controller) { active.current = null; setBusy(false); setWaiting(0); } }
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (['sign-up', 'update-password'].includes(mode) && password !== confirm) { setError('Your passwords do not match.'); return; }
    const payload = mode === 'recover' ? { action: mode, email } : mode === 'update-password' ? { action: mode, password } : mode === 'sign-up' ? { action: mode, email, password } : { action: mode, email, password, next };
    void run(payload, 'submit');
  };
  const title = mode === 'sign-in' ? 'Your people are here.' : mode === 'sign-up' ? 'Make your entrance.' : mode === 'recover' ? 'Let’s get you back in.' : 'A fresh start.';
  const description = mode === 'sign-in' ? 'Sign in once on this browser, then come back to your event, saved sessions and conversations.' : mode === 'sign-up' ? 'Use your event registration email, choose a password and verify your email once. No app download needed.' : mode === 'recover' ? 'Enter your account email. Your reset link opens right here on the website.' : 'Choose a new password with at least 12 characters.';
  const needsEmail = mode === 'sign-up' || mode === 'recover';
  return <main className="auth-layout"><aside className="auth-story"><Brand /><div><span className="eyebrow">MOMENTUM BUILDER LIVE 2026</span><h2>BIG IDEAS.<br />REAL PEOPLE.<br /><span>YOUR NEXT MOVE.</span></h2><p>Your event website. Open it in Safari, Chrome or your usual browser and stay connected.</p></div><span className="auth-credit">EVENT TECHNOLOGY POWERED BY CUANTICO AI</span></aside>
    <section className="auth-panel"><div className="auth-mobile-brand"><Brand /></div><Link href="/" className="back-link"><ArrowLeft size={16} />Back to the event guide</Link><span className="eyebrow">WELCOME TO THE LIVE EXPERIENCE</span><h1>{title}</h1><p className="auth-description">{description}</p>
      {demo && <p className="demo-notice">Demo preview · no live accounts or emails.</p>}
      {!demo && !emailReady && needsEmail && <p className="demo-notice" role="status">Account email delivery is being prepared by the event team. You can browse the public agenda now.</p>}
      {success && mode === 'sign-up' ? <div className="auth-success"><CheckCircle2 size={30} /><h2>Check your inbox.</h2><p>{success}</p><form onSubmit={event => { event.preventDefault(); void run({ action: 'verify-email', email, token: code }, 'verify'); }}><label className="form-field"><span>Email verification code</span><input autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6,10}" minLength={6} maxLength={10} required value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ''))} /><small>Enter the code from the latest email, or use its verification link.</small></label><button type="submit" className="button button-red button-full" disabled={busy}>{busy ? <Busy label="Verifying…" /> : <>Verify and continue<ArrowRight size={17} /></>}</button></form><button type="button" className="text-button" disabled={busy || cooldown > 0} onClick={() => void run({ action: 'resend', email }, 'resend')}>{cooldown ? `Resend available in ${cooldown}s` : 'Resend verification email'}</button></div>
        : success ? <div className="auth-success" role="status"><CheckCircle2 size={32} /><h2>Check your inbox.</h2><p>{success}</p><button type="button" className="button button-dark" onClick={() => switchMode('sign-in')}>Back to sign in<ArrowRight size={17} /></button></div>
        : <form onSubmit={submit} className="auth-form">
          {mode !== 'update-password' && <label className="form-field"><span>Email address</span><input type="email" autoComplete="email" inputMode="email" required value={email} maxLength={254} onChange={event => setEmail(event.target.value)} placeholder="you@company.com" /></label>}
          {mode !== 'recover' && <><label className="form-field"><span>{mode === 'update-password' ? 'New password' : 'Password'}</span><div className="password-field"><input type={visible ? 'text' : 'password'} autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'} required minLength={mode === 'sign-in' ? 1 : 12} maxLength={256} value={password} onChange={event => setPassword(event.target.value)} /><button type="button" className="icon-button" aria-label={visible ? 'Hide password' : 'Show password'} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>{mode !== 'sign-in' && <small>At least 12 characters. Your password manager can remember it.</small>}</label>{mode !== 'sign-in' && <label className="form-field"><span>Confirm password</span><input type={visible ? 'text' : 'password'} autoComplete="new-password" required minLength={12} maxLength={256} value={confirm} onChange={event => setConfirm(event.target.value)} /></label>}</>}
          {mode === 'sign-in' && <button className="text-button forgot-password" type="button" onClick={() => switchMode('recover')}>Forgot your password?</button>}
          <p className="fine-print" style={{ marginTop: 18 }}>Stay signed in on this browser. Use your own device and a regular browser tab; private browsing does not retain your session.</p>
          <button className="button button-red button-full" type="submit" disabled={busy || (!demo && needsEmail && !emailReady)}>{busy ? <Busy label={waiting ? 'Joining the event…' : 'Please wait…'} /> : <>{mode === 'sign-in' ? 'Sign in' : mode === 'sign-up' ? 'Create my account' : mode === 'recover' ? 'Send reset link' : 'Update password'}<ArrowRight size={17} /></>}</button>
        </form>}
      {waiting > 0 && <p className="demo-notice" role="status">A lot of attendees are joining. Retrying in about {waiting} seconds. Keep this page open.</p>}
      {error && <ErrorState message={error} />}
      <div className="auth-switch">{mode === 'sign-in' ? <>First time here?<button type="button" disabled={busy} onClick={() => switchMode('sign-up')}>Create an account</button></> : <button type="button" disabled={busy} onClick={() => switchMode('sign-in')}>Already have an account? Sign in</button>}</div>
      <div className="auth-assurance"><ShieldCheck size={18} /><p>Only event Admins can access attendee emails and phone numbers. Other attendees and sponsors connect with you through private chat.</p></div>
    </section></main>;
}
