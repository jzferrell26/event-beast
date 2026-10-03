"use client";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { House, CalendarDays, Users, MessageCircle, MoreHorizontal, Bell, ArrowUpRight, MapPin, Handshake, Mic2, MessagesSquare } from 'lucide-react';
import { useApp } from './app-provider';
import { Avatar, Brand } from './ui';
import { MemberBoundary } from './member-boundary';
import { PageSponsorAds } from './page-sponsor-ads';
import { isCommunityPath } from '@/lib/public-site';
import { InboxSignalProvider } from './realtime';
import { MessageAttentionProvider, MessageCount, useMessageAttention } from './message-attention';
import { messageCountLabel } from '@/lib/message-attention';
import { SignOutButton } from './sign-out';

const home = { href: '/', label: 'Home', icon: House }, agenda = { href: '/agenda', label: 'Agenda', icon: CalendarDays }, more = { href: '/more', label: 'More', icon: MoreHorizontal };
const people = { href: '/people', label: 'People', icon: Users }, inbox = { href: '/inbox', label: 'Inbox', icon: MessageCircle };
const wall = { href: '/feed', label: 'Feed', icon: MessagesSquare }, sponsors = { href: '/sponsors', label: 'Sponsors', icon: Handshake }, speakers = { href: '/more/speakers', label: 'Speakers', icon: Mic2 };
export function AppShell({ children }: { children: ReactNode }) {
  return <InboxSignalProvider><MessageAttentionProvider><ShellBody>{children}</ShellBody></MessageAttentionProvider></InboxSignalProvider>;
}
function ShellBody({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { guide, me } = useApp();
  const { unread } = useMessageAttention();
  const hub = Boolean(guide.publicSite && guide.communityEnabled);
  const navigation = !guide.publicSite ? [home, agenda, people, inbox, more] : hub ? [home, agenda, wall, inbox, sponsors, more] : [home, agenda, speakers, sponsors, more];
  const privateView = (isCommunityPath(path) && !path.startsWith('/access')) || (!guide.publicSite && path === '/more/saved');
  const active = (href: string) => href === '/' ? path === '/' : href === '/more' && path.startsWith('/more/speakers') && !hub ? false : path === href || path.startsWith(href + '/');
  const nav = (mobile: boolean) => (hub && !mobile ? [home, agenda, wall, people, inbox, speakers, sponsors, more] : navigation).map(({ href, label, icon: Icon }) => <Link key={href} href={href} prefetch={false} aria-label={href === '/inbox' && unread > 0 ? `Inbox, ${messageCountLabel(unread)}` : undefined} className={active(href) ? 'active' : ''} aria-current={active(href) ? 'page' : undefined}><Icon size={mobile ? 23 : 21} strokeWidth={1.8} /><span>{label}</span>{href === '/inbox' && <MessageCount count={unread} />}{!mobile && <span className="nav-indicator" />}</Link>);
  return <div className={'app-shell' + (hub ? ' event-hub' : '')}>
    <a className="skip-link" href="#main">Skip to content</a>
    <aside className="desktop-sidebar"><Brand /><div className="sidebar-event"><span className="live-dot" />THE LIVE EXPERIENCE <span>2026</span></div><nav aria-label="Main navigation">{nav(false)}</nav><div className="sidebar-bottom"><p>Good people.<br />Big momentum.</p><Link href="/more/venue"><MapPin size={17} />Find your way<ArrowUpRight size={15} /></Link>{guide.settings.technology_attribution && <span className="sidebar-credit">EVENT TECHNOLOGY BY<br /><strong>CUANTICO AI</strong></span>}</div></aside>
    <div className="app-column"><header className="topbar"><div className="mobile-brand"><Brand /></div><div className="desktop-title">MOMENTUM BUILDER <b>LIVE 2026</b><span className="topbar-divider" />YOUR EVENT COMPANION</div><div className="topbar-actions">{hub && me?.eligible && <Link href="/inbox" className="icon-button message-shortcut" aria-label={unread > 0 ? `Private messages, ${messageCountLabel(unread)}` : "Private messages"}><MessageCircle size={22} /><MessageCount count={unread} /></Link>}{guide.settings.announcements_enabled !== false && <Link href="/more/notifications" className="icon-button" aria-label="Event announcements"><Bell size={21} /></Link>}{(hub || !guide.publicSite) && <Link href={me?.eligible ? '/more/profile' : '/auth'} className="profile-shortcut" aria-label={me?.eligible ? 'My profile' : 'Sign in'}><Avatar name={me?.profile?.full_name ?? 'Momentum Builder'} src={me?.profile?.avatar_url} /></Link>}<SignOutButton compact /></div></header>
      {guide.mode === 'demo' && <div className="demo-strip"><span>DEMO PREVIEW</span><p>{guide.publicSite ? 'Sample program & event information' : 'Sample program, dates & attendees'}</p><Link href="/admin">Organizer view<ArrowUpRight size={13} /></Link></div>}
      <main id="main" className={'main-content' + (path.startsWith('/inbox/') ? ' main-thread' : '')} tabIndex={-1}>{privateView ? <MemberBoundary>{children}</MemberBoundary> : children}{guide.publicSite && (path === '/' ? <PageSponsorAds surface="home" /> : path === '/sponsors' ? <PageSponsorAds surface="sponsors" /> : path.startsWith('/more/speakers') ? <PageSponsorAds surface="speakers" /> : path === '/more/lunch' ? <PageSponsorAds surface="lunch" /> : path === '/more/venue' ? <PageSponsorAds surface="venue" /> : null)}</main>
      <footer className="app-footer"><span>MOMENTUM BUILDER LIVE 2026</span>{guide.settings.technology_attribution && <span>Event technology by <strong>Cuantico AI</strong></span>}</footer>
    </div><nav className="bottom-nav" aria-label="Mobile navigation">{nav(true)}</nav>
  </div>;
}
