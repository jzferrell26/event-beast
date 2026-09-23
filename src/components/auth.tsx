"use client";
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Mail, Ticket } from 'lucide-react';
import { errorMessage, mutate } from '@/lib/client';
import { useApp } from './app-provider';
import { AccessRequest } from './access-request';
export { AuthScreen } from './website-auth';

export function AccessScreen() {
  const { guide, me, refreshMe, notify } = useApp();
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return <div className="access-card"><div className="access-icon"><Ticket size={35} /></div><span className="eyebrow">LET’S FIND YOUR REGISTRATION</span><h1>{me?.eligible ? "Your event access is ready." : "One more thing before you’re in."}</h1><p>{me?.eligible ? "Your account is matched to an approved event registration." : "Your login needs to match an approved registration. Use the same email you registered with and confirm your email address."}</p>{me?.email && <div className="access-email"><Mail size={17} />{me.email}</div>}{me?.status === "disabled" && <p className="demo-notice">Your event access has been paused. Please contact the event team.</p>}<div className="access-actions">{me?.eligible ? <Link href="/more/profile" className="button button-red">Complete my profile<ArrowRight size={17} /></Link> : me?.authenticated ? <><button type="button" className="button button-dark" disabled={busy} onClick={async () => { setBusy(true); await refreshMe(); setBusy(false); }}>Check access again</button><button type="button" className="button button-outline" disabled={busy} onClick={async () => { setBusy(true); try { await mutate("/api/auth", "POST", { action: "sign-out" }); router.replace("/auth"); router.refresh(); } catch (error) { notify(errorMessage(error), true); setBusy(false); } }}>Use another email</button></> : <Link href="/auth" className="button button-red">Sign in with my registration email<ArrowRight size={17} /></Link>}</div><AccessRequest /><div className="access-help"><h2>The event team can help.</h2><p>{guide.settings.support_location}</p>{guide.settings.support_email && <a className="text-button" href={`mailto:${encodeURIComponent(guide.settings.support_email)}`}>{guide.settings.support_email}</a>}</div><Link href="/agenda" className="text-button">Browse the public agenda<ArrowRight size={15} /></Link></div>;
}
