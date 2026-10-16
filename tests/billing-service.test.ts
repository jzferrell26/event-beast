import { beforeEach, describe, expect, it, vi } from 'vitest';
import Stripe from 'stripe';
import type { CheckoutIntent, BillingPlan } from '../src/lib/billing';
import { planPrice } from '../src/lib/billing';
import { billingService, pricePlan, subscriptionSnapshot } from '../src/lib/server/billing/service';
import { billingPoolConfig, type BillingTransaction, type BillingStore } from '../src/lib/server/billing/store';
import { readWebhookBody } from '../src/lib/server/billing/webhook';
vi.mock('server-only', () => ({}));
const origin = 'https://events.example.test';
const id = 'c0000000-0000-4000-8000-000000000001';
const now = Math.floor(Date.now() / 1000);
const price = { id: 'price_standard', product: 'prod_standard', active: true, livemode: false, type: 'recurring', billing_scheme: 'per_unit', unit_amount: 4900, currency: 'usd', recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' }, transform_quantity: null } as Stripe.Price;
const plan = { ...pricePlan(price, 'Test plan', 2, false), id, active: true } as BillingPlan;
function intent(extra: Partial<CheckoutIntent> = {}): CheckoutIntent {
  return { id, buyer_id: id, buyer_email: 'buyer@example.test', requested_name: 'Test organizer', requested_slug: 'test-organizer', target_organization_id: null, organization_id: null, plan_id: id, stripe_price_id: price.id, event_limit: 2, livemode: false, status: 'pending', stripe_session_id: null, stripe_customer_id: null, stripe_subscription_id: null, checkout_url: null, created_at: new Date(now*1000).toISOString(), expires_at: new Date((now+82800)*1000).toISOString(), ...extra };
}
function session(extra: Record<string, unknown> = {}) {
  return { id: 'cs_test_order', mode: 'subscription', status: 'complete', livemode: false, client_reference_id: id, metadata: { event_beast_intent: id }, customer: 'cus_buyer', subscription: 'sub_order', url: 'https://checkout.stripe.com/c/pay/cs_test_order', ...extra } as unknown as Stripe.Checkout.Session;
}
function invoice(extra: Record<string, unknown> = {}) {
  return { id: 'in_paid', status: 'paid', livemode: false, customer: 'cus_buyer', parent: { subscription_details: { subscription: 'sub_order' } }, lines: { has_more: false, data: [{ parent: { subscription_item_details: { subscription_item: 'si_order' } }, pricing: { price_details: { price: price.id } }, quantity: 1, amount: 4900, period: { start: now, end: now+2592000 } }] }, ...extra } as Stripe.Invoice;
}
function subscription(extra: Record<string, unknown> = {}) {
  return { id: 'sub_order', customer: 'cus_buyer', status: 'active', livemode: false, collection_method: 'charge_automatically', cancel_at_period_end: false, metadata: { event_beast_intent: id }, items: { has_more: false, data: [{ id: 'si_order', price, quantity: 1, current_period_start: now, current_period_end: now+2592000 }] }, latest_invoice: invoice(), ...extra } as unknown as Stripe.Subscription;
}
function paymentEvent(type: string = 'checkout.session.completed', object = session()) {
  return { id: 'evt_paid', type, livemode: false, data: { object } } as Stripe.Event;
}
function fixture() {
  const tx = {
    intent: vi.fn().mockResolvedValue(intent()), subscriptionIntent: vi.fn().mockResolvedValue(null), plan: vi.fn().mockResolvedValue(plan),
    lockSubscription: vi.fn().mockResolvedValue(undefined), bindCheckout: vi.fn().mockResolvedValue(undefined), expireCheckout: vi.fn().mockResolvedValue(undefined), expireUnbound: vi.fn().mockResolvedValue(undefined),
    apply: vi.fn().mockResolvedValue({ status: 'provisioned', organization_id: id }), receive: vi.fn().mockResolvedValue('received'), finish: vi.fn().mockResolvedValue(undefined), fail: vi.fn().mockResolvedValue(undefined),
  } satisfies BillingTransaction;
  const store: BillingStore = { transaction: run => run(tx) };
  const stripe = { prices: { retrieve: vi.fn().mockResolvedValue(price) }, checkout: { sessions: { retrieve: vi.fn().mockResolvedValue(session()), create: vi.fn().mockResolvedValue(session({ status: 'open', subscription: null })), list: vi.fn().mockResolvedValue({ data: [session()], has_more: false }) } }, subscriptions: { retrieve: vi.fn().mockResolvedValue(subscription()) }, invoices: { retrieve: vi.fn().mockResolvedValue(invoice()), listLineItems: vi.fn() } };
  return { tx, stripe, service: billingService(stripe as unknown as Stripe, store, origin, false) };
}
beforeEach(() => vi.clearAllMocks());
describe('subscription provider contracts', () => {
  it('uses the persisted checkout identity and fixed provider price on retries', async () => {
    const { service, stripe, tx } = fixture();
    await service.startCheckout(intent()); await service.startCheckout(intent());
    const [values, options] = stripe.checkout.sessions.create.mock.calls[0];
    expect(values).toMatchObject({ client_reference_id: id, line_items: [{ price: price.id, quantity: 1 }], customer_email: 'buyer@example.test', success_url: `${origin}/platform/subscribe?checkout=${id}` });
    expect(options).toEqual({ idempotencyKey: `event-beast-checkout:${id}` });
    expect(stripe.checkout.sessions.create.mock.calls[1]).toEqual(stripe.checkout.sessions.create.mock.calls[0]);
    expect(tx.bindCheckout).toHaveBeenCalledWith(id, 'cs_test_order', 'cus_buyer', null, 'https://checkout.stripe.com/c/pay/cs_test_order');
  });
  it('resumes the existing provider checkout without creating a new purchase', async () => {
    const { service, stripe } = fixture();
    stripe.checkout.sessions.retrieve.mockResolvedValue(session({ status: 'open' }));
    await service.startCheckout(intent({ stripe_session_id: 'cs_test_order' }));
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });
  it('does not activate from an unpaid invoice, an unrelated customer, or old invoice periods', () => {
    expect(subscriptionSnapshot(subscription(), invoice({ status: 'open' })).paid_until).toBeNull();
    expect(subscriptionSnapshot(subscription(), invoice({ customer: 'cus_other' })).paid_until).toBeNull();
    expect(subscriptionSnapshot(subscription(), invoice({ parent: { subscription_details: { subscription: 'sub_other' } } })).paid_until).toBeNull();
    const old = invoice(); old.lines.data[0].period.start = now-2592000;
    expect(subscriptionSnapshot(subscription(), old).paid_until).toBeNull();
    expect(subscriptionSnapshot(subscription(), invoice()).paid_invoice_id).toBe('in_paid');
  });
  it('locks before fetching current subscription state and ignores stale notification bodies', async () => {
    const { service, tx, stripe } = fixture();
    await service.processEvent(paymentEvent('customer.subscription.deleted', { id: 'sub_order', status: 'canceled' } as unknown as Stripe.Checkout.Session));
    expect(tx.lockSubscription.mock.invocationCallOrder[0]).toBeLessThan(stripe.subscriptions.retrieve.mock.invocationCallOrder[0]);
    expect(tx.apply).toHaveBeenCalledWith(id, expect.objectContaining({ status: 'active', paid_invoice_id: 'in_paid' }));
    expect(tx.finish).toHaveBeenCalledWith('evt_paid');
  });
  it('does not reprocess a durably completed event', async () => {
    const { service, tx, stripe } = fixture(); tx.receive.mockResolvedValue('processed');
    await service.processEvent(paymentEvent());
    expect(stripe.checkout.sessions.retrieve).not.toHaveBeenCalled(); expect(tx.apply).not.toHaveBeenCalled();
  });
  it('records a retryable failure without logging or persisting raw payment data', async () => {
    const { service, tx, stripe } = fixture(); stripe.subscriptions.retrieve.mockRejectedValue(new Error('provider unavailable: secret data'));
    await expect(service.processEvent(paymentEvent())).rejects.toThrow('provider unavailable');
    expect(tx.fail).toHaveBeenCalledWith('evt_paid', 'reconciliation_failed'); expect(tx.finish).not.toHaveBeenCalled();
    expect(tx.receive.mock.calls[0][4]).toMatch(/^[a-f0-9]{64}$/);
  });
  it('rejects mismatched checkout ownership and environment before writes', async () => {
    const { service, tx, stripe } = fixture();
    stripe.checkout.sessions.retrieve.mockResolvedValue(session({ client_reference_id: 'other' }));
    await expect(service.processEvent(paymentEvent())).rejects.toThrow('checkout_identity_mismatch'); expect(tx.apply).not.toHaveBeenCalled();
    await expect(service.processEvent({ ...paymentEvent(), livemode: true })).rejects.toThrow('billing_mode_or_account');
    await expect(service.processEvent({ ...paymentEvent(), account: 'acct_external' })).rejects.toThrow('billing_mode_or_account');
  });
  it('rejects unsupported quantities and unknown paid plan changes', async () => {
    const sub = subscription(); sub.items.data[0].quantity = 2;
    expect(() => subscriptionSnapshot(sub, invoice())).toThrow('unsupported_subscription_items');
    const { service, tx } = fixture(); tx.plan.mockResolvedValue(null);
    await expect(service.processEvent(paymentEvent())).rejects.toThrow('unconfigured_subscription_price'); expect(tx.apply).not.toHaveBeenCalled();
  });
  it('recovers a lost checkout response by provider identity without starting another purchase', async () => {
    const { service, tx, stripe } = fixture();
    await service.reconcileIntent(id);
    expect(stripe.checkout.sessions.list).toHaveBeenCalled();
    expect(tx.bindCheckout).toHaveBeenCalledWith(id, 'cs_test_order', 'cus_buyer', 'sub_order', null);
    expect(tx.apply).toHaveBeenCalled(); expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });
  it('bounds recovery scans and requires review rather than risking a second purchase', async () => {
    const { service, tx, stripe } = fixture();
    stripe.checkout.sessions.list.mockResolvedValue({ data: [session({ id: 'cs_other', metadata: {}, client_reference_id: 'other' })], has_more: true });
    await expect(service.reconcileIntent(id)).rejects.toThrow('checkout_recovery_needs_review');
    expect(stripe.checkout.sessions.list).toHaveBeenCalledTimes(5); expect(tx.expireUnbound).not.toHaveBeenCalled();
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });
  it('expires a verified expired session without treating cancellation as payment', async () => {
    const { service, tx, stripe } = fixture();
    stripe.checkout.sessions.retrieve.mockResolvedValue(session({ status: 'expired', subscription: null }));
    await service.processEvent(paymentEvent('checkout.session.expired'));
    expect(tx.expireCheckout).toHaveBeenCalledWith(id, 'cs_test_order'); expect(tx.apply).not.toHaveBeenCalled();
  });
});
describe('billing input boundaries', () => {
  it('requires a fixed monthly or annual active price in the expected environment', () => {
    expect(pricePlan(price, 'Standard', 2, false).unit_amount).toBe(4900);
    expect(() => pricePlan({ ...price, livemode: true }, 'X', 2, false)).toThrow('fixed monthly');
    expect(() => pricePlan({ ...price, active: false }, 'X', 2, false)).toThrow('fixed monthly');
    expect(() => pricePlan({ ...price, unit_amount: null }, 'X', 2, false)).toThrow('fixed monthly');
  });
  it('formats provider currency minor units including Stripe UGX compatibility', () => {
    expect(planPrice(plan)).toBe('$49.00 / month');
    expect(planPrice({ ...plan, currency: 'jpy', unit_amount: 500 })).toBe('¥500 / month');
    expect(planPrice({ ...plan, currency: 'ugx', unit_amount: 50000 })).toContain('500');
    expect(planPrice({ ...plan, currency: 'ugx', unit_amount: 50000 })).not.toContain('50,000');
  });
  it('refuses broad database credentials and preserves remote TLS verification', () => {
    expect(() => billingPoolConfig('postgres://postgres:secret@db.example.test:5432/postgres')).toThrow('restricted');
    expect(() => billingPoolConfig('postgres://event_beast_billing:secret@db.example.test/postgres?sslmode=no-verify')).toThrow('TLS');
    expect(billingPoolConfig('postgres://event_beast_billing.ref:secret@db.example.test/postgres').ssl).toEqual({ rejectUnauthorized: true });
    expect(billingPoolConfig('postgres://event_beast_billing:secret@127.0.0.1:54322/postgres').ssl).toBe(false);
  });
  it('preserves raw webhook bytes and rejects oversized streaming bodies without content-length', async () => {
    const raw = '{ "type" : "invoice.paid" }';
    expect(await readWebhookBody(new Request(origin, { method: 'POST', body: raw }))).toBe(raw);
    await expect(readWebhookBody(new Request(origin, { method: 'POST', body: 'a'.repeat(33) }), 32)).rejects.toThrow('too large');
  });
});
