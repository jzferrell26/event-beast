"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, UserRound, Eye, Bookmark, Users, MessageCircle, Smartphone, Check } from "lucide-react";
import { errorMessage, mutate } from "@/lib/client";
import { useApp } from "./app-provider";
import { Modal } from "./ui";

const steps = [
  { title: "Start with you.", description: "Add your name, a photo and a few words about what you do. Your profile is how the right people recognize you.", icon: UserRound, href: "/more/profile", action: "Complete my profile" },
  { title: "Choose how you show up.", description: "Your directory listing is your choice. Turn it on in My Profile when you are ready. Only event Admins can see attendee emails and phone numbers.", icon: Eye, href: "/more/profile", action: "Review my privacy" },
  { title: "Make a little room for big ideas.", description: "Tap the bookmark beside a session. Your picks stay together in Saved Sessions, ready when you need them.", icon: Bookmark, href: "/agenda", action: "Explore the agenda" },
  { title: "Find your people.", description: "Search the directory by name, company or shared interest. Save someone you would like to catch up with.", icon: Users, href: "/people", action: "Meet the attendees" },
  { title: "Keep the conversation going.", description: "Enable messaging in My Profile, then tap Message on another available attendee. Your one-to-one conversations stay in Inbox. You can block or report someone at any time.", icon: MessageCircle, href: "/inbox", action: "Take a look at Inbox" },
  { title: "One tap away.", description: "Keep this website bookmarked in your usual browser. You stay signed in on your own device. Adding it to your Home Screen is optional; no App Store download is needed.", icon: Smartphone, href: "/more/help", action: "Website access & help" },
];

export function Onboarding({ restart = false }: { restart?: boolean }) {
  const { guide, me } = useApp();
  if (guide.mode !== "demo" && !me?.eligible) return null;
  return <OnboardingCard key={me?.attendeeId ?? "demo"} restart={restart} initialStep={me?.preferences?.onboarding_step ?? 0} initiallyDone={me?.preferences?.onboarding_done ?? false} />;
}
function OnboardingCard({ restart, initialStep, initiallyDone }: { restart: boolean; initialStep: number; initiallyDone: boolean }) {
  const { guide, notify, refreshMe } = useApp();
  const [step, setStep] = useState(Math.min(initialStep, 5));
  const [done, setDone] = useState(initiallyDone);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const localKey = `event-beast:demo:${guide.event.id}:onboarding`;
  useEffect(() => {
    if (guide.mode !== "demo") return;
    Promise.resolve().then(() => { try { const value = JSON.parse(localStorage.getItem(localKey) || "null"); if (value) { setStep(Math.min(Number(value.step) || 0, 5)); setDone(Boolean(value.done)); } } catch { /* Optional browser storage. */ } });
  }, [guide.mode, localKey]);
  const persist = async (next: number, completed: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      if (guide.mode === "demo") { try { localStorage.setItem(localKey, JSON.stringify({ step: next, done: completed })); } catch { /* In-memory progress still works. */ } }
      else await mutate("/api/profile", "PUT", { onboarding_step: next, onboarding_done: completed });
      setStep(Math.min(next, 5)); setDone(completed);
      if (completed) { setOpen(false); void refreshMe(); notify("You’re ready to make the most of the event."); }
    } catch (error) { notify(errorMessage(error), true); }
    finally { setBusy(false); }
  };
  const current = steps[step];
  const Icon = current.icon;
  if (done && !restart) return null;
  return <><button className="onboarding-card" type="button" onClick={() => { if (restart && done) setStep(0); setOpen(true); }}><span className="onboarding-spark"><UserRound size={21} /></span><span><strong>{restart ? "Take the app walkthrough" : "Make this event yours."}</strong><span>{restart ? "A quick tour of profiles, sessions and connections" : `${step} of 6 steps explored · Profile, privacy, and your people`}</span></span><ArrowRight size={20} /></button>
    <Modal open={open} onOpenChange={setOpen} title="Make the event yours." description="A few useful things before you get going."><div className="tour-progress" aria-label={`Step ${step + 1} of 6`}>{steps.map((_, index) => <span className={index <= step ? "complete" : ""} key={index} />)}</div><div className="tour-step"><div className="tour-icon"><Icon size={32} /></div><span className="eyebrow">STEP 0{step + 1} / 06</span><h3>{current.title}</h3><p>{current.description}</p><Link href={current.href} className="button button-outline" onClick={() => setOpen(false)}>{current.action}<ArrowRight size={17} /></Link></div><div className="tour-actions"><button type="button" className="text-button muted" onClick={() => setOpen(false)}>Maybe later</button><button type="button" className="button button-dark" disabled={busy} onClick={() => void persist(step + 1, step === 5)}>{step === 5 ? <>All set<Check size={17} /></> : <>Continue<ArrowRight size={17} /></>}</button></div></Modal>
  </>;
}
