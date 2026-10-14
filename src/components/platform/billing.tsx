"use client";
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useResource } from '@/lib/hooks';
import { errorMessage, mutate } from '@/lib/client';
import { planPrice, type BillingPlan, type BillingOverview, type CheckoutStatus, type OwnerBilling } from '@/lib/billing';
import { Alert, Field, Heading, LoadState, PendingRequest, PlatformShell, Status } from './shared';

type Plans = { enabled: boolean; plans: BillingPlan[] };
function dateLabel(value: string | null) { return value ? new Date(value).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'No paid period confirmed'; }
function useBillingDestination() {
  const router = useRouter();
  return (raw: string) => {
    const url = new URL(raw, window.location.origin);
    if (url.origin === window.location.origin) { router.push(`${url.pathname}${url.search}`); return; }
    if (!['https://checkout.stripe.com', 'https://billing.stripe.com'].includes(url.origin) || url.username || url.password) throw new Error('The billing destination could not be verified.');
    window.location.assign(url.href);
  };
}
function PlanCards({ plans, selected, onSelect }: { plans: BillingPlan[]; selected: string; onSelect: (id: string) => void }) {
  return <fieldset className="billing-plans"><legend>Choose your subscription</legend><div className="platform-card-grid">{plans.map(plan => <label className={`platform-card billing-plan ${selected === plan.id ? 'chosen' : ''}`} key={plan.id}><input type="radio" name="plan_id" value={plan.id} required checked={selected === plan.id} onChange={() => onSelect(plan.id)} /><span className="billing-plan-name">{plan.name}</span><strong className="billing-price">{planPrice(plan)}</strong><span>Up to {plan.event_limit} events in this workspace.</span></label>)}</div></fieldset>;
}
function CheckoutForm({ plans, workspace }: { plans: BillingPlan[]; workspace?: OwnerBilling['organization'] }) {
  const [selected, setSelected] = useState(plans[0]?.id ?? '');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [keyFor] = useState(PendingRequest); const navigate = useBillingDestination();
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError(''); const form = new FormData(event.currentTarget);
    const input = { plan_id: selected, name: workspace?.name ?? String(form.get('name')), slug: workspace?.slug ?? String(form.get('slug')), organization_id: workspace?.id ?? null };
    try { const result = await mutate<{ url: string }>('/api/billing/checkout', 'POST', { ...input, request_id: keyFor(input) }); navigate(result.url); }
    catch (cause) { setError(errorMessage(cause)); setBusy(false); }
  };
  if (!plans.length) return <section className="platform-card"><h2>Subscriptions are being prepared.</h2><p>There are no subscription plans available to purchase yet. Your existing workspaces remain available from Workspaces.</p><Link href="/app">Go to your workspaces</Link></section>;
  return <form onSubmit={submit}><fieldset className="billing-fields" disabled={busy}><PlanCards plans={plans} selected={selected} onSelect={setSelected} /><section className="platform-card"><h2>{workspace ? `Subscribe ${workspace.name}` : 'Give your workspace a name.'}</h2>{workspace ? <p>This subscription uses your existing workspace and keeps its events and team.</p> : <div className="platform-form-grid"><Field label="Organizer or business name"><input name="name" required maxLength={160} autoComplete="organization" /></Field><Field label="Workspace URL" hint="3–64 lowercase letters, numbers or hyphens. Your event URLs will use this name."><input name="slug" required minLength={3} maxLength={64} pattern="[a-z0-9](?:[a-z0-9]|-){2,63}" autoCapitalize="none" /></Field></div>}<p>Review the recurring total and payment details in Stripe before confirming. Your workspace opens after payment is confirmed.</p>{error && <Alert>{error}</Alert>}<button className="platform-primary" disabled={busy}>{busy ? 'Opening secure checkout…' : 'Continue to checkout'}</button></section></fieldset></form>;
}
export function Subscribe({ checkout }: { checkout?: string }) {
  const plans = useResource<Plans>('/api/billing/plans');
  return <PlatformShell><Heading eyebrow="YOUR NEXT EVENT STARTS HERE" title={checkout ? 'Your workspace is on its way.' : 'Make room for your next big event.'}>Choose a subscription, set up your workspace, and bring your events together.</Heading><LoadState {...plans}>{plans.data && (!plans.data.enabled ? <section className="platform-card"><h2>Subscriptions are not open yet.</h2><p>Open an existing workspace or accept an organizer invitation to get started.</p><Link href="/app">Your workspaces</Link></section> : checkout ? <CheckoutProgress key={checkout} id={checkout} /> : <><CheckoutForm plans={plans.data.plans} /><RecentCheckouts /></>)}</LoadState></PlatformShell>;
}
function RecentCheckouts() {
  const state = useResource<{ checkouts: CheckoutStatus[] }>('/api/billing/checkouts');
  if (!state.data?.checkouts.length) return null;
  return <section className="platform-card"><h2>Your recent checkout requests</h2><p>Return to a request to check payment or open its workspace.</p>{state.data.checkouts.map(item => <div className="platform-record" key={item.id}><div><strong>{item.name}</strong> <Status>{item.status === 'provisioned' ? 'Workspace ready' : item.status}</Status></div><Link href={`/platform/subscribe?checkout=${item.id}`}>View request</Link></div>)}</section>;
}
function CheckoutProgress({ id }: { id: string }) {
  const state = useResource<CheckoutStatus>(`/api/billing/checkout/${encodeURIComponent(id)}`);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [checked, setChecked] = useState(false);
  const navigate = useBillingDestination();
  const { refresh } = state;
  const check = useCallback(async () => {
    setBusy(true); setError('');
    try { await mutate('/api/billing/reconcile', 'POST', { intent_id: id }); await refresh(); setChecked(true); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }, [id, refresh]);
  // One return-page reconciliation, then an explicit retry. Stripe notifications
  // complete provisioning independently when the customer closes the browser.
  useEffect(() => { void check(); }, [check]);
  return <LoadState {...state}>{state.data && <section className="platform-card"><Status>{state.data.status === 'provisioned' ? 'Workspace ready' : state.data.status === 'expired' ? 'Checkout expired' : 'Confirming payment'}</Status><h2>{state.data.name}</h2>{state.data.status === 'provisioned' && state.data.organization_slug ? <><p>Your subscription is confirmed. Start adding your event details.</p><Link className="platform-primary" href={`/app/${encodeURIComponent(state.data.organization_slug)}`}>Open your workspace</Link></> : state.data.status === 'expired' ? <><p>This checkout is closed. Start a new request when you are ready.</p><Link className="platform-primary" href="/platform/subscribe">Choose a subscription</Link></> : <><p>{checked ? 'Payment confirmation is still pending. Complete your checkout or check again after the payment finishes.' : 'Checking the payment provider for your subscription.'}</p><p>Your request is saved. Reopening this page continues the same purchase.</p><div className="platform-actions">{state.data.checkout_url && <button type="button" disabled={busy} className="platform-primary" onClick={() => { try { navigate(state.data!.checkout_url!); } catch (cause) { setError(errorMessage(cause)); } }}>Return to checkout</button>}<button type="button" disabled={busy} onClick={() => void check()}>{busy ? 'Checking…' : 'Check payment status'}</button></div></>}{error && <Alert>{error}</Alert>}</section>}</LoadState>;
}
export function CustomerBilling({ slug }: { slug: string }) {
  const state = useResource<OwnerBilling>(`/api/billing/organizations/${encodeURIComponent(slug)}`);
  const plans = useResource<Plans>('/api/billing/plans');
  const [busy, setBusy] = useState(''); const [error, setError] = useState(''); const navigate = useBillingDestination();
  const action = async (kind: 'portal' | 'refresh') => {
    if (!state.data) return; setBusy(kind); setError('');
    try { const result = await mutate<{ url?: string }>(`/api/billing/${kind}`, 'POST', { organization_id: state.data.organization.id }); if (result.url) navigate(result.url); else await state.refresh(); }
    catch (cause) { setError(errorMessage(cause)); } finally { setBusy(''); }
  };
  const data = state.data;
  return <PlatformShell organizationSlug={slug}><Heading eyebrow="WORKSPACE OWNER" title="Your subscription.">Manage payment details, view invoices, and keep your events moving.</Heading>{plans.data?.enabled === false ? <section className="platform-card"><h2>Billing is managed by your agency.</h2><p>Subscriptions have not been activated on this workspace service.</p></section> : <LoadState {...state}>{data && <>{error && <Alert>{error}</Alert>}{data.organization.status === 'suspended' && <Alert>Workspace management is paused by the agency. Updating payment does not remove this pause; contact Event Beast support.</Alert>}<section className="platform-card"><h2>{data.organization.name}</h2>{data.account ? <><Status>{data.account.status.replaceAll('_', ' ')}</Status><p>{data.plan?.name} {data.plan && <strong>{planPrice(data.plan)}</strong>}</p><p>Paid event access through: <strong>{dateLabel(data.account.paid_until)}</strong>.</p>{data.account.cancel_at_period_end && <p>Your subscription is scheduled to end after its current period.</p>}{!data.has_access && <Alert>The confirmed paid period has ended. Your events and history are retained. Update payment, then refresh the subscription status to restore editing.</Alert>}<p>Event allowance: {data.organization.event_limit ?? data.organization.billing_event_limit ?? 'Managed by the agency'}.</p><div className="platform-actions"><button className="platform-primary" type="button" disabled={!!busy} onClick={() => void action('portal')}>{busy === 'portal' ? 'Opening billing…' : 'Manage payment & invoices'}</button><button type="button" disabled={!!busy} onClick={() => void action('refresh')}>{busy === 'refresh' ? 'Refreshing…' : 'Refresh subscription status'}</button></div></> : <p>This workspace was set up by your agency and does not have a connected subscription.</p>}</section>{(!data.account || ['canceled','incomplete_expired'].includes(data.account.status)) && data.organization.status === 'active' && plans.data?.enabled && <CheckoutForm plans={plans.data.plans} workspace={data.organization} />}</>}</LoadState>}</PlatformShell>;
}
export function AgencyBilling() {
  const state = useResource<BillingOverview & { plans: BillingPlan[]; mode: string }>('/api/billing/agency');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError(''); setMessage(''); const form = new FormData(event.currentTarget);
    try { await mutate('/api/billing/plans', 'POST', { name: String(form.get('name')), stripe_price_id: String(form.get('stripe_price_id')), event_limit: Number(form.get('event_limit')) }); await state.refresh(); setMessage('Subscription plan added. Its price and currency were verified with Stripe.'); }
    catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  };
  const toggle = async (plan: BillingPlan) => {
    setBusy(true); setError('');
    try { await mutate('/api/billing/plans', 'PATCH', { id: plan.id, active: !plan.active }); await state.refresh(); }
    catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  };
  return <PlatformShell agency><Heading eyebrow="AGENCY BILLING" title="Turn subscriptions into workspaces.">Connect your subscription offers and see which accounts need attention.</Heading><LoadState {...state}>{state.data && <><Alert success>{state.data.mode === 'test' ? 'Stripe test mode. These subscriptions do not charge real payment methods.' : 'Stripe live mode. Published plans are available for real purchases.'}</Alert>{error && <Alert>{error}</Alert>}{message && <Alert success>{message}</Alert>}<section className="platform-card"><h2>Add a subscription offer</h2><p>Use an existing fixed monthly or annual Stripe price. A new price gets a new offer; existing customers keep their recorded terms.</p><form onSubmit={save}><fieldset className="platform-form-grid" disabled={busy}><Field label="Plan name"><input name="name" required maxLength={80} /></Field><Field label="Stripe price ID"><input name="stripe_price_id" required pattern="price_[A-Za-z0-9]+" placeholder="price_…" /></Field><Field label="Included events"><input name="event_limit" type="number" min={1} max={10000} required /></Field></fieldset><button className="platform-primary" disabled={busy}>{busy ? 'Saving…' : 'Verify price & add plan'}</button></form></section><section className="platform-card"><h2>Your subscription offers</h2>{!state.data.plans.length && <p>No offers are configured yet.</p>}{state.data.plans.map(plan => <div className="platform-record" key={plan.id}><div><strong>{plan.name}</strong> <Status>{plan.active ? 'Available' : 'Closed to new purchases'}</Status><p>{planPrice(plan)} · {plan.event_limit} events</p></div><button type="button" disabled={busy} onClick={() => void toggle(plan)}>{plan.active ? 'Close offer' : 'Reopen offer'}</button></div>)}</section><section className="platform-card"><h2>Customer subscriptions</h2>{!state.data.accounts.length && <p>Subscribed customers will appear here after their first confirmed payment.</p>}{state.data.accounts.map(account => <div className="platform-record" key={account.id}><div><strong>{account.name}</strong> <Status>{account.status.replaceAll('_',' ')}</Status><p>{account.plan_name} · Paid through {dateLabel(account.paid_until)}</p></div><Link href={`/app/${encodeURIComponent(account.slug)}/billing`}>Open customer billing</Link></div>)}</section><section className="platform-card"><h2>Payment notifications needing attention</h2>{!state.data.failures.length ? <p>No failed notifications are waiting for reconciliation.</p> : state.data.failures.map(failure => <div className="platform-record" key={failure.event_id}><div><strong>{failure.event_type}</strong><p>{failure.event_id} · {failure.error_code} · {failure.attempts} attempts</p><small>Correct the configuration issue, then retry delivery in Stripe.</small></div></div>)}</section></>}</LoadState></PlatformShell>;
}
