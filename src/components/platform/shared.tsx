'use client';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { useResource } from '@/lib/hooks';
import { errorMessage, mutate } from '@/lib/client';
import type { WorkspaceHome } from '@/lib/platform';

export function PlatformShell({ children, organizationSlug, agency = false }: { children: ReactNode; organizationSlug?: string; agency?: boolean }) {
  const identity = useResource<WorkspaceHome>('/api/platform');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const signOut = async () => {
    setBusy(true); setError('');
    try { await mutate('/api/auth', 'POST', { action: 'sign-out' }); window.location.assign('/platform/auth'); }
    catch (cause) { setError(errorMessage(cause)); setBusy(false); }
  };
  return <div className="platform"><a className="platform-skip" href="#workspace-content">Skip to workspace</a><header className="platform-topbar"><Link href="/app" className="platform-brand"><span aria-hidden="true">EB</span>EVENT BEAST</Link><div className="platform-top-actions">{identity.data?.agency && <Link href="/agency">Agency</Link>}<Link href="/app">Workspaces</Link>{identity.data && <button type="button" onClick={() => void signOut()} disabled={busy}>{busy ? 'Signing out…' : 'Sign out'}</button>}</div></header><div className="platform-frame"><aside className="platform-sidebar"><p className="platform-eyebrow">{agency ? 'AGENCY CONTROL' : 'YOUR WORKSPACE'}</p><nav aria-label="Workspace navigation"><Link className={!organizationSlug ? 'selected' : ''} href={agency ? '/agency' : '/app'}>{agency ? 'Subaccounts' : 'All workspaces'}</Link>{organizationSlug && <><Link className="selected" href={`/app/${encodeURIComponent(organizationSlug)}`}>Events & team</Link><Link href={`/app/${encodeURIComponent(organizationSlug)}#settings`}>Workspace settings</Link></>}</nav>{identity.data && <div className="platform-identity"><strong>{identity.data.user.email}</strong><span>{identity.data.agency ? 'Platform owner' : 'Signed in'}</span></div>}</aside><main id="workspace-content" className="platform-main">{error && <Alert>{error}</Alert>}{children}</main></div></div>;
}
export function Alert({ children, success = false }: { children: ReactNode; success?: boolean }) { return <div className={`platform-alert ${success ? 'success' : ''}`} role={success ? 'status' : 'alert'}>{children}</div>; }
export function Heading({ eyebrow, title, children, action }: { eyebrow: string; title: string; children?: ReactNode; action?: ReactNode }) { return <div className="platform-heading"><div><p className="platform-eyebrow">{eyebrow}</p><h1>{title}</h1>{children && <p>{children}</p>}</div>{action}</div>; }
export function LoadState({ loading, error, refresh, children }: { loading: boolean; error: string; refresh: () => Promise<void>; children?: ReactNode }) {
  if (loading) return <div className="platform-loading" role="status">Opening your workspace…</div>;
  if (error) return <Alert><p>{error}</p><div className="platform-actions"><button type="button" onClick={() => void refresh()}>Try again</button><Link href="/platform/auth">Sign in</Link></div></Alert>;
  return children;
}
export function Field({ label, children, wide = false, hint }: { label: string; children: ReactNode; wide?: boolean; hint?: string }) { return <label className={`platform-field ${wide ? 'wide' : ''}`}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>; }
export function Status({ children }: { children: ReactNode }) { return <span className="platform-status">{children}</span>; }
export function PendingRequest() {
  // A factory called once by useState; distinct bodies get distinct keys, while
  // retries after a lost response retain the original creation request.
  let previous = ''; let id = '';
  return (body: unknown) => { const serialized = JSON.stringify(body); if (serialized !== previous || !id) { previous = serialized; id = crypto.randomUUID(); } return id; };
}
