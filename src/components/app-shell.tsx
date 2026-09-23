"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { House, CalendarDays, Users, MessageCircle, MoreHorizontal, Bell, ArrowUpRight, MapPin } from "lucide-react";
import { useApp } from "./app-provider";
import { Avatar, Brand } from "./ui";

const navigation = [
  { href: "/", label: "Home", icon: House }, { href: "/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/people", label: "People", icon: Users }, { href: "/inbox", label: "Inbox", icon: MessageCircle },
  { href: "/more", label: "More", icon: MoreHorizontal },
];
export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { guide, me } = useApp();
  const isActive = (href: string) => href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`);
  const nav = (mobile: boolean) => navigation.map(({ href, label, icon: Icon }) => <Link key={href} href={href} prefetch={false} className={isActive(href) ? "active" : ""} aria-current={isActive(href) ? "page" : undefined}><Icon size={mobile ? 23 : 21} strokeWidth={1.8} /><span>{label}</span>{!mobile && <span className="nav-indicator" />}</Link>);
  return <div className="app-shell">
    <a className="skip-link" href="#main">Skip to content</a>
    <aside className="desktop-sidebar"><Brand /><div className="sidebar-event"><span className="live-dot" />THE LIVE EXPERIENCE <span>2026</span></div><nav aria-label="Main navigation">{nav(false)}</nav><div className="sidebar-bottom"><p>Good people.<br />Big momentum.</p><Link href="/more/venue"><MapPin size={17} />Find your way<ArrowUpRight size={15} /></Link>{guide.settings.technology_attribution && <span className="sidebar-credit">EVENT TECHNOLOGY BY<br /><strong>CUANTICO AI</strong></span>}</div></aside>
    <div className="app-column"><header className="topbar"><div className="mobile-brand"><Brand /></div><div className="desktop-title">MOMENTUM BUILDER <b>LIVE 2026</b><span className="topbar-divider" />YOUR EVENT COMPANION</div><div className="topbar-actions"><Link href="/more/notifications" className="icon-button" aria-label="Event announcements"><Bell size={21} /></Link><Link href={me?.eligible ? "/more/profile" : "/auth"} className="profile-shortcut" aria-label={me?.eligible ? "My profile" : "Sign in"}><Avatar name={me?.profile?.full_name ?? "Momentum Builder"} src={me?.profile?.avatar_url} /></Link></div></header>
      {guide.mode === "demo" && <div className="demo-strip"><span>DEMO PREVIEW</span><p>Sample program, dates & attendees</p><Link href="/admin">Organizer view<ArrowUpRight size={13} /></Link></div>}
      <main id="main" className={`main-content${path.startsWith("/inbox/") ? " main-thread" : ""}`} tabIndex={-1}>{children}</main>
      <footer className="app-footer"><span>MOMENTUM BUILDER LIVE 2026</span>{guide.settings.technology_attribution && <span>Event technology by <strong>Cuantico AI</strong></span>}</footer>
    </div><nav className="bottom-nav" aria-label="Mobile navigation">{nav(true)}</nav>
  </div>;
}
