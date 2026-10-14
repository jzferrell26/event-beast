import type Stripe from 'stripe';
import { readWebhookBody } from '@/lib/server/billing/webhook';
import { checkoutSchema, planSchema, planActiveSchema, reconcileSchema, portalSchema, type CheckoutIntent, type OwnerBilling } from '@/lib/billing';
import { uuid } from '@/lib/validation';
import { ApiError, databaseError, handle, json, parseBody } from '@/lib/server/http';
import { platformIdentity, requireAgency, type PlatformActor } from '@/lib/server/platform-auth';
import { assertBillingOrigin, billingEnabled, billingLive, billingOrigin, requireBilling, stripeClient, webhookSecret } from '@/lib/server/billing/config';
import { billingStore } from '@/lib/server/billing/store';
import { billingEventTypes, billingService, pricePlan } from '@/lib/server/billing/service';

export const runtime = 'nodejs';
export const maxDuration = 60;
type Context = { params: Promise<{ segments?: string[] }> };
async function rpc<T>(actor: PlatformActor, name: string, args: Record<string, unknown>): Promise<T> {
  const result = await actor.db.rpc(name, args);
  databaseError(result.error);
  return result.data as T;
}
async function receiveWebhook(request: Request) {
  requireBilling();
  const stripe = stripeClient();
  const secret = webhookSecret();
  const signature = request.headers.get('stripe-signature');
  if (!signature) throw new ApiError(400, 'Notification signature required.');
  const raw = await readWebhookBody(request);
  let event: Stripe.Event;
  try { event = stripe.webhooks.constructEvent(raw, signature, secret, 300); }
  catch { throw new ApiError(400, 'Invalid payment notification signature.'); }
  if (event.livemode !== billingLive() || event.account) throw new ApiError(400, 'Notification environment does not match.');
  if (!billingEventTypes.has(event.type)) return json({ received: true });
  try { await billingService(stripe, billingStore(), billingOrigin(), billingLive()).processEvent(event); }
  catch {
    // Return a failure so Stripe retries. No background work is assumed, and a
    // stored failure is visible in agency diagnostics. Never log payment bodies.
    console.error('Event Beast payment reconciliation needs retry.', { event_id: event.id });
    throw new ApiError(503, 'Payment notification processing will be retried.');
  }
  return json({ received: true });
}
async function run(request: Request, context: Context, method: 'GET' | 'POST' | 'PATCH') {
  const { segments = [] } = await context.params;
  if (segments.length === 1 && segments[0] === 'webhook' && method === 'POST') return receiveWebhook(request);
  const actor = await platformIdentity();
  if (method !== 'GET') assertBillingOrigin(request);
  if (segments.length === 1 && segments[0] === 'plans' && method === 'GET') {
    if (!billingEnabled()) return json({ enabled: false, plans: [] });
    const result = await actor.db.from('billing_plans').select('*').eq('livemode', billingLive()).eq('active', true).order('unit_amount');
    databaseError(result.error);
    return json({ enabled: true, plans: result.data });
  }
  requireBilling();
  if (segments.length === 1 && segments[0] === 'checkouts' && method === 'GET') return json({ checkouts: await rpc(actor, 'billing_recent_checkouts', {}) });
  if (segments.length === 1 && segments[0] === 'agency' && method === 'GET') {
    requireAgency(actor);
    const plans = await actor.db.from('billing_plans').select('*').eq('livemode', billingLive()).order('created_at', { ascending: false });
    databaseError(plans.error);
    const overview = await rpc<Record<string, unknown>>(actor, 'billing_agency_overview', {});
    return json({ ...overview, plans: plans.data, mode: billingLive() ? 'live' : 'test' });
  }
  if (segments.length === 1 && segments[0] === 'plans') {
    requireAgency(actor);
    if (method === 'POST') {
      const input = await parseBody(request, planSchema);
      const stripe = stripeClient();
      const price = await stripe.prices.retrieve(input.stripe_price_id);
      const values = pricePlan(price, input.name, input.event_limit, billingLive());
      return json({ id: await rpc(actor, 'billing_save_plan', { p_values: values }) }, 201);
    }
    if (method === 'PATCH') {
      const input = await parseBody(request, planActiveSchema);
      await rpc(actor, 'billing_set_plan_active', { p_plan: input.id, p_active: input.active });
      return json({ saved: true });
    }
  }
  if (segments.length === 1 && segments[0] === 'checkout' && method === 'POST') {
    const input = await parseBody(request, checkoutSchema);
    const stripe = stripeClient(); const store = billingStore(); const origin = billingOrigin();
    const selected = await actor.db.from('billing_plans').select('livemode').eq('id', input.plan_id).eq('active', true).maybeSingle();
    databaseError(selected.error);
    if (!selected.data || selected.data.livemode !== billingLive()) throw new ApiError(400, 'Choose an available subscription plan.');
    const intent = await rpc<CheckoutIntent>(actor, 'billing_begin_checkout', { p_request: input.request_id, p_plan: input.plan_id, p_name: input.name, p_slug: input.slug, p_target: input.organization_id });
    return json(await billingService(stripe, store, origin, billingLive()).startCheckout(intent));
  }
  if (segments.length === 2 && segments[0] === 'checkout' && method === 'GET') {
    return json(await rpc(actor, 'billing_checkout_status', { p_intent: uuid.parse(segments[1]) }));
  }
  if (segments.length === 1 && segments[0] === 'reconcile' && method === 'POST') {
    const input = await parseBody(request, reconcileSchema);
    // Check access using the caller's RLS/RPC client before the machine role is used.
    await rpc(actor, 'billing_checkout_status', { p_intent: input.intent_id });
    await billingService(stripeClient(), billingStore(), billingOrigin(), billingLive()).reconcileIntent(input.intent_id);
    return json(await rpc(actor, 'billing_checkout_status', { p_intent: input.intent_id }));
  }
  if (segments.length === 2 && segments[0] === 'organizations' && method === 'GET') {
    const found = await actor.db.from('organizations').select('id').eq('slug', segments[1]).maybeSingle();
    databaseError(found.error);
    if (!found.data) throw new ApiError(404, 'This workspace is not available.');
    const summary = await rpc<OwnerBilling>(actor, 'billing_owner_context', { p_organization: found.data.id });
    // Provider customer/subscription identifiers never need to enter customer UI.
    return json({ ...summary, account: summary.account ? { ...summary.account, stripe_customer_id: undefined, stripe_subscription_id: undefined } : null });
  }
  if (segments.length === 1 && ['portal', 'refresh'].includes(segments[0]) && method === 'POST') {
    const input = await parseBody(request, portalSchema);
    const summary = await rpc<OwnerBilling>(actor, 'billing_owner_context', { p_organization: input.organization_id });
    if (!summary.account || summary.account.livemode !== billingLive()) throw new ApiError(409, 'This workspace does not have a subscription in this billing environment.');
    const stripe = stripeClient();
    if (segments[0] === 'refresh') {
      await billingService(stripe, billingStore(), billingOrigin(), billingLive()).reconcileIntent(summary.account.intent_id);
      return json({ refreshed: true });
    }
    const configuration = process.env.EVENT_BEAST_STRIPE_PORTAL_CONFIGURATION;
    if (!configuration?.startsWith('bpc_')) throw new ApiError(503, 'Customer billing management is being configured.');
    const settings = await stripe.billingPortal.configurations.retrieve(configuration);
    if (!settings.active || settings.livemode !== billingLive() || settings.features.subscription_update.enabled) {
      throw new ApiError(503, 'Configure a billing portal for payment methods, invoices and cancellation.');
    }
    const session = await stripe.billingPortal.sessions.create({ customer: summary.account.stripe_customer_id, configuration,
      return_url: `${billingOrigin()}/app/${encodeURIComponent(summary.organization.slug)}/billing` });
    const destination = new URL(session.url);
    if (destination.origin !== 'https://billing.stripe.com') throw new ApiError(503, 'The billing destination could not be verified.');
    return json({ url: session.url });
  }
  throw new ApiError(404, 'This billing action does not exist.');
}
export const GET = (request: Request, context: Context) => handle(() => run(request, context, 'GET'));
export const POST = (request: Request, context: Context) => handle(() => run(request, context, 'POST'));
export const PATCH = (request: Request, context: Context) => handle(() => run(request, context, 'PATCH'));
