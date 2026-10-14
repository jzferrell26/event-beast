import 'server-only';
import { Pool, type PoolClient, type PoolConfig } from 'pg';
import type { BillingPlan, CheckoutIntent } from '@/lib/billing';
import { ApiError } from '../http';

export interface SubscriptionSnapshot {
  subscription_id: string; customer_id: string; price_id: string; status: string;
  livemode: boolean; paid_until: string | null; paid_invoice_id: string | null; cancel_at_period_end: boolean;
}
export interface ProvisioningResult { status: 'provisioned' | 'awaiting_payment' | 'superseded'; organization_id?: string; organization_slug?: string }
export interface BillingTransaction {
  intent(id: string): Promise<CheckoutIntent | null>;
  subscriptionIntent(id: string): Promise<string | null>;
  plan(price: string, live: boolean): Promise<BillingPlan | null>;
  lockSubscription(id: string): Promise<void>;
  bindCheckout(id: string, session: string, customer: string | null, subscription: string | null, url: string | null): Promise<void>;
  expireCheckout(id: string, session: string): Promise<void>;
  expireUnbound(id: string): Promise<void>;
  apply(id: string, snapshot: SubscriptionSnapshot): Promise<ProvisioningResult>;
  receive(id: string, type: string, resource: string, live: boolean, hash: string): Promise<string>;
  finish(id: string): Promise<void>;
  fail(id: string, code: string): Promise<void>;
}
export interface BillingStore { transaction<T>(run: (tx: BillingTransaction) => Promise<T>): Promise<T> }

export function billingPoolConfig(raw: string | undefined, ca?: string): PoolConfig {
  let url: URL;
  try { url = new URL(raw ?? ''); } catch { throw new ApiError(503, 'The payment provisioner is being configured.'); }
  const user = decodeURIComponent(url.username).split('.')[0];
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || user !== 'event_beast_billing' || !url.password) {
    throw new ApiError(503, 'Configure the restricted billing database credential.');
  }
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  // node-postgres lets connection-string SSL options override the explicit TLS
  // object. Accept no such overrides; remote certificate checks stay enabled.
  for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'ssl']) {
    if (url.searchParams.has(key)) throw new ApiError(503, 'Configure billing TLS through the server settings.');
  }
  return { connectionString: url.toString(), max: 1, connectionTimeoutMillis: 5000, idleTimeoutMillis: 10000,
    maxLifetimeSeconds: 60, application_name: 'event-beast-billing',
    ssl: local ? false : { rejectUnauthorized: true, ...(ca ? { ca } : {}) } };
}
function transactionApi(client: PoolClient): BillingTransaction {
  async function value<T>(sql: string, params: unknown[]): Promise<T> {
    const result = await client.query<{ value: T }>(sql, params);
    return result.rows[0]?.value;
  }
  return {
    intent: id => value('select billing.intent($1) as value', [id]),
    subscriptionIntent: id => value('select billing.subscription_intent($1) as value', [id]),
    plan: (price, live) => value('select billing.plan_for_price($1,$2) as value', [price, live]),
    lockSubscription: id => value('select billing.lock_subscription($1) as value', [id]),
    bindCheckout: (id, session, customer, subscription, url) => value('select billing.bind_checkout($1,$2,$3,$4,$5) as value', [id, session, customer, subscription, url]),
    expireUnbound: id => value('select billing.expire_unbound($1) as value', [id]),
    expireCheckout: (id, session) => value('select billing.expire_checkout($1,$2) as value', [id, session]),
    apply: (id, snapshot) => value('select billing.apply_subscription($1,$2) as value', [id, snapshot]),
    receive: (id, type, resource, live, hash) => value('select billing.receive_event($1,$2,$3,$4,$5) as value', [id, type, resource, live, hash]),
    finish: id => value('select billing.finish_event($1) as value', [id]),
    fail: (id, code) => value('select billing.fail_event($1,$2) as value', [id, code]),
  };
}
export function postgresBillingStore(pool: Pool): BillingStore {
  return { async transaction<T>(run: (tx: BillingTransaction) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      const identity = await client.query<{ current_user: string }>('select current_user');
      if (identity.rows[0]?.current_user !== 'event_beast_billing') throw new ApiError(503, 'The billing database role is not restricted.');
      await client.query('begin');
      await client.query("set local lock_timeout='5s'");
      await client.query("set local statement_timeout='15s'");
      await client.query("set local idle_in_transaction_session_timeout='45s'");
      const result = await run(transactionApi(client));
      await client.query('commit');
      return result;
    } catch (error) { await client.query('rollback').catch(() => undefined); throw error; }
    finally { client.release(); }
  } };
}
let pool: Pool | undefined;
export function billingStore(): BillingStore {
  if (!pool) {
    pool = new Pool(billingPoolConfig(process.env.EVENT_BEAST_BILLING_DATABASE_URL, process.env.EVENT_BEAST_BILLING_DATABASE_CA));
    pool.on('error', () => console.error('Event Beast billing database connection closed.'));
  }
  return postgresBillingStore(pool);
}
