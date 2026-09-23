"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, CheckCircle2, Eye, EyeOff, Mail, ShieldCheck, Ticket } from "lucide-react";
import { errorMessage, mutate } from "@/lib/client";
import { Brand, Busy, ErrorState } from "./ui";
import { useApp } from "./app-provider";

type Mode = "sign-in" | "sign-up" | "recover" | "update-password";
export function AuthScreen({ initialMode = "sign-in", next = "/", demo = false, linkError = false }: { initialMode?: Mode; next?: string; demo?: boolean; linkError?: boolean }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(linkError ? "This email link could not be verified. It may have expired or already been used. Request a new reset link, or sign in with your verified account." : "");
  const [success, setSuccess] = useState("");
  const router = useRouter();
  const switchMode = (nextMode: Mode) => { setMode(nextMode); setPassword(""); setConfirm(""); setError(""); setSuccess(""); };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(""); setSuccess("");
    if ((mode === "update-password" || mode === "sign-up") && password !== confirm) { setError("Your passwords do not match."); return; }
    if (demo) { setError("This is a sample preview. Attendee sign-in opens after the event team connects registration."); return; }
    setBusy(true);
    try {
      const payload = mode === "recover" ? { action: mode, email } : mode === "update-password" ? { action: mode, password } : mode === "sign-up" ? { action: mode, email, password } : { action: mode, email, password, next };
      const data = await mutate<{ message?: string; next?: string }>("/api/auth", "POST", payload);
      if (data.next) { router.replace(data.next); router.refresh(); }
      else setSuccess(data.message ?? "Check your email for the next step.");
    } catch (error) { setError(errorMessage(error)); }
    finally { setBusy(false); }
  };
  const title = mode === "sign-in" ? "Your people are here." : mode === "sign-up" ? "Make your entrance." : mode === "recover" ? "Let’s get you back in." : "A fresh start.";
  const description = mode === "sign-in" ? "Sign in to connect with attendees and build your own event agenda." : mode === "sign-up" ? "Use the email you registered with. We’ll match your verified account to your event registration." : mode === "recover" ? "Enter your account email and we’ll help you reset your password." : "Choose a new password with at least 12 characters.";
  return <main className="auth-layout"><aside className="auth-story"><Brand /><div><span className="eyebrow">MOMENTUM BUILDER LIVE 2026</span><h2>BIG IDEAS.<br />REAL PEOPLE.<br /><span>YOUR NEXT MOVE.</span></h2><p>The conversations you start here could change what comes next.</p></div><span className="auth-credit">EVENT TECHNOLOGY POWERED BY CUANTICO AI</span></aside><section className="auth-panel"><div className="auth-mobile-brand"><Brand /></div><Link href="/" className="back-link"><ArrowLeft size={16} />Back to the event guide</Link><span className="eyebrow">WELCOME TO THE LIVE EXPERIENCE</span><h1>{title}</h1><p className="auth-description">{description}</p>{demo && <p className="demo-notice">Demo preview · sign-in is not connected yet.</p>}{success ? <div className="auth-success" role="status"><CheckCircle2 size={32} /><h2>Check your inbox.</h2><p>{success}</p><button type="button" className="button button-dark" onClick={() => switchMode("sign-in")}>Back to sign in<ArrowRight size={17} /></button></div> : <form onSubmit={submit} className="auth-form">{mode !== "update-password" && <label className="form-field"><span>Email address</span><input type="email" autoComplete="email" inputMode="email" required value={email} maxLength={254} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" /></label>}{mode !== "recover" && <><label className="form-field"><span>{mode === "update-password" ? "New password" : "Password"}</span><div className="password-field"><input type={visible ? "text" : "password"} autoComplete={mode === "sign-in" ? "current-password" : "new-password"} required minLength={mode === "sign-in" ? 1 : 12} maxLength={256} value={password} onChange={(e) => setPassword(e.target.value)} /><button type="button" className="icon-button" aria-label={visible ? "Hide password" : "Show password"} onClick={() => setVisible((v) => !v)}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>{mode !== "sign-in" && <small>At least 12 characters.</small>}</label>{mode !== "sign-in" && <label className="form-field"><span>Confirm password</span><input type={visible ? "text" : "password"} autoComplete="new-password" required minLength={12} maxLength={256} value={confirm} onChange={(e) => setConfirm(e.target.value)} /></label>}</>}{mode === "sign-in" && <button className="text-button forgot-password" type="button" onClick={() => switchMode("recover")}>Forgot your password?</button>}{error && <ErrorState message={error} />}<button className="button button-red button-full" type="submit" disabled={busy}>{busy ? <Busy label={mode === "sign-in" ? "Signing in…" : "Please wait…"} /> : <>{mode === "sign-in" ? "Sign in" : mode === "sign-up" ? "Create my account" : mode === "recover" ? "Send reset link" : "Update password"}<ArrowRight size={17} /></>}</button></form>}<div className="auth-switch">{mode === "sign-in" ? <>First time here?<button type="button" onClick={() => switchMode("sign-up")}>Create an account</button></> : <button type="button" onClick={() => switchMode("sign-in")}>Already have an account? Sign in</button>}</div><div className="auth-assurance"><ShieldCheck size={18} /><p>Your registration and your public profile are separate. You choose what to share.</p></div></section></main>;
}

export function AccessScreen() {
  const { guide, me, refreshMe, notify } = useApp();
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return <div className="access-card"><div className="access-icon"><Ticket size={35} /></div><span className="eyebrow">LET’S FIND YOUR REGISTRATION</span><h1>{me?.eligible ? "Your event access is ready." : "One more thing before you’re in."}</h1><p>{me?.eligible ? "Your account is matched to an approved event registration." : "Your login needs to match an approved registration. Use the same email you registered with and confirm your email address."}</p>{me?.email && <div className="access-email"><Mail size={17} />{me.email}</div>}{me?.status === "disabled" && <p className="demo-notice">Your event access has been paused. Please contact the event team.</p>}<div className="access-actions">{me?.eligible ? <Link href="/more/profile" className="button button-red">Complete my profile<ArrowRight size={17} /></Link> : me?.authenticated ? <><button type="button" className="button button-dark" disabled={busy} onClick={async () => { setBusy(true); await refreshMe(); setBusy(false); }}>Check access again</button><button type="button" className="button button-outline" disabled={busy} onClick={async () => { setBusy(true); try { await mutate("/api/auth", "POST", { action: "sign-out" }); router.replace("/auth"); router.refresh(); } catch (error) { notify(errorMessage(error), true); setBusy(false); } }}>Use another email</button></> : <Link href="/auth" className="button button-red">Sign in with my registration email<ArrowRight size={17} /></Link>}</div><div className="access-help"><h2>The event team can help.</h2><p>{guide.settings.support_location}</p>{guide.settings.support_email && <a className="text-button" href={`mailto:${encodeURIComponent(guide.settings.support_email)}`}>{guide.settings.support_email}</a>}</div><Link href="/agenda" className="text-button">Browse the public agenda<ArrowRight size={15} /></Link></div>;
}
