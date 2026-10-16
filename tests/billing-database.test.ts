import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { asUser, createDatabase, ids, seedSecurityFixture } from './db-harness';

let db: PGlite;
let plan: string;
let org: string;
let event: string;
let originalAttendees: number;
const request = (n: number) => `b0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const paidUntil = () => new Date(Date.now() + 30 * 86400000).toISOString();
const values = (slug: string) => ({ name: slug, slug, tagline: 'Test event', timezone: 'America/Chicago', start_date: '2027-04-02', end_date: '2027-04-03', brand_logo_url: '' });
async function scalar<T = string>(sql: string, params: unknown[] = []): Promise<T> {
  const result = await db.query<Record<string, T>>(sql, params);
  return result.rows.length ? Object.values(result.rows[0])[0] : null as T;
}
async function machine<T>(run: () => Promise<T>): Promise<T> {
  await db.exec('set role event_beast_billing');
  try { return await run(); } finally { await db.exec('reset role'); }
}
function snapshot(extra: Record<string, unknown> = {}) {
  return { subscription_id: 'sub_alpha', customer_id: 'cus_alpha', price_id: 'price_alpha', status: 'active',
    livemode: false, paid_until: paidUntil(), paid_invoice_id: 'in_alpha', cancel_at_period_end: false, ...extra };
}
async function begin(n: number, name = 'Alpha Events', slug = 'alpha-paid', target: string | null = null, user = ids.alice, planId = plan) {
  return asUser(db, user, () => scalar<Record<string, unknown>>('select public.billing_begin_checkout($1,$2,$3,$4,$5)', [request(n), planId, name, slug, target]));
}
async function apply(n: number, extra: Record<string, unknown> = {}) {
  return machine(() => scalar<Record<string, string>>('select billing.apply_subscription($1,$2)', [request(n), snapshot(extra)]));
}
async function bind(n: number, session = 'cs_test_alpha', customer = 'cus_alpha', subscription = 'sub_alpha') {
  return machine(() => scalar('select billing.bind_checkout($1,$2,$3,$4,$5)', [request(n), session, customer, subscription, 'https://checkout.stripe.com/c/pay/test']));
}

describe('subscription account lifecycle against actual migrations', () => {
  beforeAll(async () => {
    db = await createDatabase({ hostedFunctionGrants: true });
    await seedSecurityFixture(db);
    originalAttendees = await scalar<number>('select count(*)::int from public.attendees');
    await db.query('insert into private.platform_owner(user_id) values($1)', [ids.admin]);
    plan = await asUser(db, ids.admin, () => scalar('select public.billing_save_plan($1)', [{ name: 'Test monthly', stripe_price_id: 'price_alpha', stripe_product_id: 'prod_alpha', unit_amount: 1000, currency: 'usd', billing_interval: 'month', event_limit: 2, livemode: false }]));
  }, 60000);
  afterAll(async () => { await db?.close(); });

  it('restricts billing catalog changes and checkout to verified identities', async () => {
    await expect(asUser(db, ids.alice, () => scalar('select public.billing_save_plan($1)', [{}]))).rejects.toThrow(/Agency access/);
    await expect(begin(100, 'Bad', 'bad-user', null, ids.unverified)).rejects.toThrow(/Verify your email/);
    await expect(asUser(db, null, () => scalar('select public.billing_begin_checkout($1,$2,$3,$4,null)', [request(101), plan, 'Bad', 'bad-anon']))).rejects.toThrow(/permission denied/);
  });
  it('keeps the payment writer out of all application tables and user actions', async () => {
    for (const table of ['public.organizations', 'public.messages', 'auth.users', 'public.organization_memberships', 'billing.accounts', 'billing.checkout_intents']) {
      await expect(machine(() => db.query(`select * from ${table}`))).rejects.toThrow(/permission denied/);
    }
    await expect(machine(() => scalar('select public.platform_create_organization($1,$2,$3,$4,null)', [request(102), 'No', 'nope', 'alice@example.test']))).rejects.toThrow(/permission denied/);
    await expect(asUser(db, ids.alice, () => scalar('select billing.apply_subscription($1,$2)', [request(1), snapshot()]))).rejects.toThrow(/permission denied/);
    await expect(asUser(db, ids.alice, () => scalar('select billing.bind_checkout($1,$2,null,null,null)', [request(1), 'cs_test_fake']))).rejects.toThrow(/permission denied/);
  });
  it('creates a durable checkout intent without creating an account or charging', async () => {
    const intent = await begin(1);
    expect(intent.status).toBe('pending');
    expect(intent.buyer_id).toBe(ids.alice);
    expect(await scalar<number>('select count(*)::int from public.organizations')).toBe(0);
    expect(await begin(1)).toEqual(intent);
    expect((await begin(2)).id).toBe(request(1));
    await expect(begin(1, 'Changed')).rejects.toThrow(/different details/);
    await expect(asUser(db, ids.bob, () => scalar('select public.billing_checkout_status($1)', [request(1)]))).rejects.toThrow(/not available/);
  });
  it('requires a bound provider identity and a future paid invoice before activation', async () => {
    await expect(apply(1)).rejects.toThrow(/not bound/);
    await bind(1);
    expect((await apply(1, { paid_until: null, paid_invoice_id: null })).status).toBe('awaiting_payment');
    expect((await apply(1, { status: 'incomplete' })).status).toBe('awaiting_payment');
    expect((await apply(1, { paid_until: new Date(Date.now() - 1000).toISOString() })).status).toBe('awaiting_payment');
    await expect(apply(1, { customer_id: 'cus_other' })).rejects.toThrow(/not bound/);
    await expect(apply(1, { livemode: true })).rejects.toThrow(/not bound/);
    await expect(apply(1, { paid_invoice_id: null })).rejects.toThrow(/paid invoice/);
    expect(await scalar<number>('select count(*)::int from public.organizations')).toBe(0);
  });
  it('provisions exactly one account and owner without publishing attendee information', async () => {
    const result = await apply(1);
    org = result.organization_id;
    expect(result.organization_slug).toBe('alpha-paid');
    expect((await apply(1)).organization_id).toBe(org);
    expect(await scalar<number>('select count(*)::int from public.organizations')).toBe(1);
    expect(await scalar<number>('select count(*)::int from public.organization_memberships where organization_id=$1 and user_id=$2 and role=$3', [org, ids.alice, 'owner'])).toBe(1);
    expect(await scalar<number>('select count(*)::int from public.attendees')).toBe(originalAttendees);
    expect(await asUser(db, ids.alice, () => scalar<boolean>('select public.platform_access()'))).toBe(false);
    const status = await asUser(db, ids.alice, () => scalar<Record<string, unknown>>('select public.billing_checkout_status($1)', [request(1)]));
    expect(status.status).toBe('provisioned');
    expect(status.organization_slug).toBe('alpha-paid');
  });
  it('enforces the paid event allowance in database writes and retains ordinary publishing', async () => {
    event = await asUser(db, ids.alice, () => scalar('select public.platform_create_event($1,$2,$3)', [org, request(20), values('paid-event-one')]));
    await asUser(db, ids.alice, () => scalar('select public.platform_create_event($1,$2,$3)', [org, request(21), values('paid-event-two')]));
    await expect(asUser(db, ids.alice, () => scalar('select public.platform_create_event($1,$2,$3)', [org, request(22), values('paid-event-three')]))).rejects.toThrow(/allowance/);
    await asUser(db, ids.alice, () => scalar('select public.platform_publish_event($1,$2,0,true)', [org, event]));
    expect((await asUser(db, null, () => db.query('select id from public.events where id=$1', [event]))).rows).toHaveLength(1);
  });
  it('denies another customer billing access and subscription replacement', async () => {
    await expect(asUser(db, ids.bob, () => scalar('select public.billing_owner_context($1)', [org]))).rejects.toThrow(/owner access/);
    await expect(begin(3, 'Alpha Events', 'alpha-paid', org, ids.bob)).rejects.toThrow(/owner access/);
    await expect(begin(3, 'Alpha Events', 'alpha-paid', org)).rejects.toThrow(/existing subscription/);
    await expect(asUser(db, ids.alice, () => db.query('update public.organizations set billing_event_limit=999 where id=$1', [org]))).rejects.toThrow(/permission denied/);
  });
  it('does not extend paid access from an unpaid renewal', async () => {
    const before = await scalar<string>('select paid_until::text from billing.accounts where organization_id=$1', [org]);
    await apply(1, { status: 'past_due', paid_until: null, paid_invoice_id: null });
    expect(await scalar<string>('select paid_until::text from billing.accounts where organization_id=$1', [org])).toBe(before);
    expect(await asUser(db, ids.alice, () => scalar<boolean>('select public.platform_can_manage_organization($1)', [org]))).toBe(true);
  });
  it('retains owner billing recovery and published history when access expires', async () => {
    await db.query("update billing.accounts set paid_until=now()-interval '1 day' where organization_id=$1", [org]);
    expect(await asUser(db, ids.alice, () => scalar<boolean>('select public.is_event_admin($1)', [event]))).toBe(false);
    await expect(asUser(db, ids.alice, () => scalar('select public.platform_publish_event($1,$2,1,false)', [org, event]))).rejects.toThrow(/Workspace access/);
    const summary = await asUser(db, ids.alice, () => scalar<{ has_access: boolean }>('select public.billing_owner_context($1)', [org]));
    expect(summary.has_access).toBe(false);
    expect((await asUser(db, null, () => db.query('select id from public.events where id=$1', [event]))).rows).toHaveLength(1);
    await apply(1);
    expect(await asUser(db, ids.alice, () => scalar<boolean>('select public.is_event_admin($1)', [event]))).toBe(true);
  });
  it('does not reactivate agency suspension when a renewal succeeds', async () => {
    await asUser(db, ids.admin, () => scalar('select public.platform_update_organization($1,$2,0,$3)', [org, 'Alpha Events', 'suspended']));
    await apply(1);
    expect(await asUser(db, ids.alice, () => scalar<boolean>('select public.is_event_admin($1)', [event]))).toBe(false);
    expect((await asUser(db, ids.alice, () => scalar<{ account: unknown }>('select public.billing_owner_context($1)', [org]))).account).not.toBeNull();
    await asUser(db, ids.admin, () => scalar('select public.platform_update_organization($1,$2,1,$3)', [org, 'Alpha Events', 'active']));
  });
  it('preserves agency allowances over subscription defaults', async () => {
    await asUser(db, ids.admin, () => scalar('select public.platform_update_organization($1,$2,2,null,4,true)', [org, 'Alpha Events']));
    await apply(1);
    expect(await scalar<number>('select event_limit from public.organizations where id=$1', [org])).toBe(4);
    await asUser(db, ids.alice, () => scalar('select public.platform_create_event($1,$2,$3)', [org, request(23), values('paid-event-three')]));
  });
  it('keeps the same account on cancellation and a deliberate replacement subscription', async () => {
    await apply(1, { status: 'canceled', cancel_at_period_end: true });
    expect(await scalar<number>('select count(*)::int from public.events where organization_id=$1', [org])).toBe(3);
    const intent = await begin(4, 'Alpha Events', 'alpha-paid', org);
    expect(intent.stripe_customer_id).toBe('cus_alpha');
    await bind(4, 'cs_test_replacement', 'cus_alpha', 'sub_replacement');
    const result = await apply(4, { subscription_id: 'sub_replacement', paid_invoice_id: 'in_replacement' });
    expect(result.organization_id).toBe(org);
    expect((await apply(1, { status: 'canceled', paid_until: null, paid_invoice_id: null })).status).toBe('superseded');
    expect(await scalar('select stripe_subscription_id from billing.accounts where organization_id=$1', [org])).toBe('sub_replacement');
    expect(await scalar<number>('select count(*)::int from public.organizations')).toBe(1);
  });
  it('records failed processing for retry and treats completed notifications as idempotent', async () => {
    const args = ['evt_test', 'invoice.paid', 'in_alpha', false, 'a'.repeat(64)];
    expect(await machine(() => scalar('select billing.receive_event($1,$2,$3,$4,$5)', args))).toBe('received');
    await machine(() => scalar('select billing.fail_event($1,$2)', ['evt_test', 'provider_unavailable']));
    expect(await machine(() => scalar('select billing.receive_event($1,$2,$3,$4,$5)', args))).toBe('failed');
    await machine(() => scalar('select billing.finish_event($1)', ['evt_test']));
    await machine(() => scalar('select billing.fail_event($1,$2)', ['evt_test', 'late_failure']));
    expect(await machine(() => scalar('select billing.receive_event($1,$2,$3,$4,$5)', args))).toBe('processed');
    await expect(machine(() => scalar('select billing.receive_event($1,$2,$3,$4,$5)', ['evt_test', 'invoice.paid', 'in_forged', false, 'a'.repeat(64)]))).rejects.toThrow(/identity mismatch/);
  });
  it('expires a verified checkout without creating or deleting an account', async () => {
    await begin(5, 'Beta Events', 'beta-paid', null, ids.bob);
    await bind(5, 'cs_test_beta', 'cus_beta', 'sub_beta');
    await machine(() => scalar('select billing.expire_checkout($1,$2)', [request(5), 'cs_test_beta']));
    expect((await begin(6, 'Beta Events', 'beta-paid', null, ids.bob)).id).toBe(request(6));
    expect(await scalar<number>('select count(*)::int from public.organizations')).toBe(1);
  });
});
