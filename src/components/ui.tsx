"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowRight, X, AlertCircle, LoaderCircle, Compass } from "lucide-react";
import { initials } from "@/lib/format";

export function Brand({ compact = false }: { compact?: boolean }) {
  return <Link href="/" className="brand" aria-label="Momentum Builder home"><span className="brand-mark" aria-hidden="true">M<span>B</span></span>{!compact && <span className="brand-type">MOMENTUM<span>BUILDER <b>LIVE</b></span></span>}</Link>;
}
export function Avatar({ name, src, large = false }: { name: string; src?: string | null; large?: boolean }) {
  const [failed, setFailed] = useState("");
  const tone = name.charCodeAt(0) % 3;
  return <span className={`avatar tone-${tone}${large ? " avatar-large" : ""}`} aria-hidden="true">
    {src && failed !== src ? <img src={src} alt="" loading="lazy" onError={() => setFailed(src)} /> : initials(name)}
  </span>;
}
export function PageTitle({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <header className="page-title"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1>{description && <p className="page-description">{description}</p>}</div>{action}</header>;
}
export function SectionTitle({ title, href, action = "View all" }: { title: string; href?: string; action?: string }) {
  return <div className="section-title"><h2>{title}</h2>{href && <Link href={href}>{action}<ArrowRight size={16} /></Link>}</div>;
}
export function EmptyState({ title, children, action, icon }: { title: string; children?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return <div className="empty-state"><div className="empty-icon">{icon ?? <Compass size={28} />}</div><h2>{title}</h2>{children && <p>{children}</p>}{action}</div>;
}
export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return <div className="error-state" role="alert"><AlertCircle size={22} /><div><strong>Let’s try that again.</strong><p>{message}</p>{retry && <button type="button" className="text-button" onClick={retry}>Retry</button>}</div></div>;
}
export function LoadingCards({ count = 3 }: { count?: number }) {
  return <div className="skeleton-stack" role="status" aria-label="Loading"><span className="sr-only">Loading…</span>{Array.from({ length: count }, (_, i) => <div className="skeleton-card" key={i}><div className="skeleton skeleton-dot" /><div className="skeleton-lines"><div className="skeleton" /><div className="skeleton short" /></div></div>)}</div>;
}
export function Busy({ label = "Saving…" }: { label?: string }) { return <><LoaderCircle size={17} className="spin" aria-hidden="true" />{label}</>; }
export function Modal({ open, onOpenChange, title, description, children }: { open: boolean; onOpenChange: (value: boolean) => void; title: string; description?: string; children: ReactNode }) {
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Overlay className="modal-overlay" /><Dialog.Content className="modal-content" {...(!description ? { "aria-describedby": undefined } : {})}>
    <div className="modal-heading"><Dialog.Title>{title}</Dialog.Title><Dialog.Close className="icon-button" aria-label="Close dialog"><X size={22} /></Dialog.Close></div>
    {description && <Dialog.Description className="muted">{description}</Dialog.Description>}{children}
  </Dialog.Content></Dialog.Portal></Dialog.Root>;
}
