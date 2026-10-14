import 'server-only';
import { createHash } from 'node:crypto';
import Stripe from 'stripe';
import { z } from 'zod';
import type { BillingPlan, CheckoutIntent } from '@/lib/billing';
import { ApiError } from '../http';
import { checkoutDestination } from './config';
import type { BillingStore, BillingTransaction, SubscriptionSnapshot } from './store';

export const billingEventTypes = new Set([
  'checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.expired',
  'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted',
  'customer.subscription.paused', 'customer.subscription.resumed', 'invoice.paid', 'invoice.payment_failed',
  'invoice.payment_action_required',
]);
const intentId = z.uuid();
export function stripeId(value: string | { id: string } | null | undefined): string | null { return typeof value === 'string' ? value : value?.id ?? null; }
export class BillingFailure extends Error { constructor(public code: string) { super(code); } }
export function pricePlan(price: Stripe.Price, name: string, eventLimit: number, live: boolean): Omit<BillingPlan, 'id' | 'active'> {
  if (!price.active || price.livemode !== live || price.type !== 'recurring' || price.billing_scheme !== 'per_unit'
    || !price.unit_amount || price.unit_amount < 1 || price.transform_quantity || price.recurring?.usage_type !== 'licensed'
    || price.recurring.interval_count !== 1 || !['month', 'year'].includes(price.recurring.interval)) {
    throw new ApiError(400, 'Choose an active fixed monthly or annual price with one licensed unit in this billing environment.');
  }
  return { name, stripe_price_id: price.id, stripe_product_id: stripeId(price.product)!, unit_amount: price.unit_amount,
    currency: price.currency, billing_interval: price.recurring.interval as 'month' | 'year', event_limit: eventLimit, livemode: live };
}
export function subscriptionSnapshot(subscription: Stripe.Subscription, invoice: Stripe.Invoice | null): SubscriptionSnapshot {
  const items = subscription.items.data;
  if (subscription.items.has_more || items.length !== 1 || items[0].quantity !== 1 || subscription.collection_method !== 'charge_automatically') {
    throw new BillingFailure('unsupported_subscription_items');
  }
  const item = items[0];
  let paidUntil: number | null = null;
  if (invoice?.status === 'paid' && !invoice.lines.has_more && invoice.livemode === subscription.livemode
    && stripeId(invoice.customer) === stripeId(subscription.customer)
    && stripeId(invoice.parent?.subscription_details?.subscription) === subscription.id) {
    const matching = invoice.lines.data.filter(line => line.parent?.subscription_item_details?.subscription_item === item.id
      && stripeId(line.pricing?.price_details?.price) === item.price.id && line.quantity === 1 && line.amount >= 0
      && line.period.start >= item.current_period_start && line.period.end > line.period.start);
    if (matching.length) paidUntil = Math.min(item.current_period_end, Math.max(...matching.map(line => line.period.end)));
  }
  return { subscription_id: subscription.id, customer_id: stripeId(subscription.customer)!, price_id: item.price.id,
    status: subscription.status, livemode: subscription.livemode, cancel_at_period_end: subscription.cancel_at_period_end,
    paid_until: paidUntil ? new Date(paidUntil * 1000).toISOString() : null, paid_invoice_id: paidUntil ? invoice!.id : null };
}
function assertSession(session: Stripe.Checkout.Session, intent: CheckoutIntent, live: boolean) {
  if (session.livemode !== live || session.mode !== 'subscription' || session.client_reference_id !== intent.id
    || session.metadata?.event_beast_intent !== intent.id || intent.livemode !== live
    || (intent.stripe_session_id && session.id !== intent.stripe_session_id)
    || (intent.stripe_customer_id && stripeId(session.customer) && stripeId(session.customer) !== intent.stripe_customer_id)) {
    throw new BillingFailure('checkout_identity_mismatch');
  }
}
export function billingService(stripe: Stripe, store: BillingStore, origin: string, live: boolean) {
  async function startCheckout(intent: CheckoutIntent) {
    if (intent.livemode !== live) throw new BillingFailure('billing_mode_mismatch');
    if (intent.status === 'provisioned') return { intent_id: intent.id, url: `${origin}/platform/subscribe?checkout=${intent.id}` };
    if (intent.status === 'expired') throw new ApiError(409, 'This checkout expired. Start a new subscription request.');
    if (intent.stripe_session_id) {
      const session = await stripe.checkout.sessions.retrieve(intent.stripe_session_id);
      assertSession(session, intent, live);
      if (session.status !== 'open') return { intent_id: intent.id, url: `${origin}/platform/subscribe?checkout=${intent.id}` };
      return { intent_id: intent.id, url: checkoutDestination(session.url) };
    }
    const expires = Math.floor(new Date(intent.expires_at).getTime() / 1000);
    if (expires < Math.floor(Date.now() / 1000) + 1800) {
      await reconcileIntent(intent.id);
      return { intent_id: intent.id, url: `${origin}/platform/subscribe?checkout=${intent.id}` };
    }
    const price = await stripe.prices.retrieve(intent.stripe_price_id);
    pricePlan(price, '', intent.event_limit, live);
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription', line_items: [{ price: intent.stripe_price_id, quantity: 1 }],
      client_reference_id: intent.id, metadata: { event_beast_intent: intent.id },
      subscription_data: { metadata: { event_beast_intent: intent.id } },
      ...(intent.stripe_customer_id ? { customer: intent.stripe_customer_id } : { customer_email: intent.buyer_email }),
      expires_at: expires,
      success_url: `${origin}/platform/subscribe?checkout=${intent.id}`,
      cancel_url: `${origin}/platform/subscribe?checkout=${intent.id}&returned=1`,
    }, { idempotencyKey: `event-beast-checkout:${intent.id}` });
    assertSession(session, intent, live);
    const url = checkoutDestination(session.url);
    await store.transaction(tx => tx.bindCheckout(intent.id, session.id, stripeId(session.customer), stripeId(session.subscription), url));
    return { intent_id: intent.id, url };
  }
  async function reconcileSubscription(tx: BillingTransaction, subscriptionId: string, knownSession?: Stripe.Checkout.Session) {
    // Lock before reading Stripe so concurrent/delayed notifications cannot
    // apply an older fetched snapshot after a newer one. Transaction pooling is safe.
    await tx.lockSubscription(subscriptionId);
    const subscription = await stripe.subscriptions.retrieve(subscriptionId, { expand: ['latest_invoice'] });
    if (subscription.livemode !== live) throw new BillingFailure('billing_mode_mismatch');
    const boundId = await tx.subscriptionIntent(subscription.id);
    const parsed = intentId.safeParse(boundId ?? subscription.metadata.event_beast_intent);
    if (!parsed.success) return;
    const intent = await tx.intent(parsed.data);
    if (!intent) return;
    let session = knownSession;
    if (!session && intent.stripe_session_id) session = await stripe.checkout.sessions.retrieve(intent.stripe_session_id);
    if (!session) {
      const sessions = await stripe.checkout.sessions.list({ subscription: subscription.id, limit: 10 });
      session = sessions.data.find(candidate => candidate.client_reference_id === intent.id && candidate.metadata?.event_beast_intent === intent.id);
    }
    if (!session) throw new BillingFailure('checkout_session_not_found');
    assertSession(session, intent, live);
    if (stripeId(session.subscription) !== subscription.id || stripeId(session.customer) !== stripeId(subscription.customer)) throw new BillingFailure('subscription_identity_mismatch');
    if (session.status !== 'complete') return;
    if (!(await tx.plan(subscription.items.data[0]?.price.id ?? '', live))) throw new BillingFailure('unconfigured_subscription_price');
    await tx.bindCheckout(intent.id, session.id, stripeId(session.customer), subscription.id, null);
    const latest = subscription.latest_invoice;
    const invoice = typeof latest === 'string' ? await stripe.invoices.retrieve(latest) : latest;
    if (invoice?.lines.has_more) {
      const lines = await stripe.invoices.listLineItems(invoice.id, { limit: 100 });
      if (lines.has_more) throw new BillingFailure('invoice_lines_need_review');
      invoice.lines = lines;
    }
    return tx.apply(intent.id, subscriptionSnapshot(subscription, invoice));
  }
  async function reconcileSession(tx: BillingTransaction, sessionId: string) {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const parsed = intentId.safeParse(session.metadata?.event_beast_intent);
    if (!parsed.success) return;
    const intent = await tx.intent(parsed.data);
    if (!intent) return;
    assertSession(session, intent, live);
    if (session.status === 'expired') {
      await tx.bindCheckout(intent.id, session.id, stripeId(session.customer), stripeId(session.subscription), null);
      await tx.expireCheckout(intent.id, session.id);
      return;
    }
    const subscription = stripeId(session.subscription);
    if (subscription) return reconcileSubscription(tx, subscription, session);
  }
  async function reconcileIntent(id: string) {
    return store.transaction(async tx => {
      const intent = await tx.intent(id);
      if (!intent) return;
      if (intent.stripe_session_id) return reconcileSession(tx, intent.stripe_session_id);
      // Recover a lost Checkout API response by scanning only the intent's time
      // window. Never create a second charge after Stripe's idempotency window.
      let cursor: string | undefined;
      for (let page = 0; page < 5; page += 1) {
        const sessions = await stripe.checkout.sessions.list({ limit: 100,
          created: { gte: Math.floor(new Date(intent.created_at).getTime() / 1000) - 5, lte: Math.floor(new Date(intent.expires_at).getTime() / 1000) },
          ...(cursor ? { starting_after: cursor } : {}) });
        const match = sessions.data.find(session => session.metadata?.event_beast_intent === intent.id && session.client_reference_id === intent.id);
        if (match) {
          assertSession(match, intent, live);
          await tx.bindCheckout(intent.id, match.id, stripeId(match.customer), stripeId(match.subscription), match.status === 'open' ? checkoutDestination(match.url) : null);
          return reconcileSession(tx, match.id);
        }
        if (!sessions.has_more) { await tx.expireUnbound(intent.id); return; }
        cursor = sessions.data.at(-1)?.id;
        if (!cursor) break;
      }
      throw new BillingFailure('checkout_recovery_needs_review');
    });
  }
  async function processEvent(event: Stripe.Event) {
    if (!billingEventTypes.has(event.type)) return;
    if (event.livemode !== live || event.account) throw new BillingFailure('billing_mode_or_account_mismatch');
    const object = event.data.object;
    const resource = 'id' in object && typeof object.id === 'string' ? object.id : null;
    if (!resource) throw new BillingFailure('missing_event_resource');
    const hash = createHash('sha256').update(JSON.stringify([event.id, event.type, resource, event.livemode])).digest('hex');
    const state = await store.transaction(tx => tx.receive(event.id, event.type, resource, live, hash));
    if (state === 'processed') return;
    try {
      await store.transaction(async tx => {
        if (event.type.startsWith('checkout.session.')) await reconcileSession(tx, resource);
        else if (event.type.startsWith('customer.subscription.')) await reconcileSubscription(tx, resource);
        else {
          const invoice = await stripe.invoices.retrieve(resource);
          if (invoice.livemode !== live) throw new BillingFailure('billing_mode_mismatch');
          const subscription = stripeId(invoice.parent?.subscription_details?.subscription);
          if (subscription) await reconcileSubscription(tx, subscription);
        }
        await tx.finish(event.id);
      });
    } catch (error) {
      const code = error instanceof BillingFailure ? error.code : 'reconciliation_failed';
      await store.transaction(tx => tx.fail(event.id, code)).catch(() => undefined);
      throw error;
    }
  }
  return { startCheckout, reconcileIntent, processEvent };
}
