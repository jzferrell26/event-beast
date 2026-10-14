import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { billingService, pricePlan } from '../../src/lib/server/billing/service';
import { billingPoolConfig, postgresBillingStore } from '../../src/lib/server/billing/store';
import type { CheckoutIntent } from '../../src/lib/billing';
vi.mock('server-only', () => ({}));

// Only scripts/qualify-billing-local.mjs supplies these ephemeral loopback values.
// Stripe's HTTP boundary is a controlled local fixture; Auth, Postgres, RLS,
// transactions and the restricted billing connection are real Supabase services.
const api = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const password = process.env.BILLING_TEST_PASSWORD!;
const accounts = ['agency','buyer','other'].map(name => ({ name, client: createClient(api || 'http://127.0.0.1:54361', key || 'missing', { auth: { persistSession: false, autoRefreshToken: false } }) }));
const [agency,buyer,other] = accounts.map(a => a.client);
let poolA: Pool; let poolB: Pool; let provider: Server;
let serviceA: ReturnType<typeof billingService>; let serviceB: ReturnType<typeof billingService>;
let intent: CheckoutIntent; let orgId: string; let planId: string;
let checkoutCreations = 0;
let storedSession: Stripe.Checkout.Session | undefined;
let currentSubscription: Stripe.Subscription | undefined;
const periodStart = Math.floor(Date.now()/1000);
const fixturePrice = { id:'price_localstandard', object:'price', product:'prod_localstandard', active:true, livemode:false, type:'recurring', billing_scheme:'per_unit', unit_amount:4900, currency:'usd', recurring:{ interval:'month',interval_count:1,usage_type:'licensed' }, transform_quantity:null } as Stripe.Price;
async function rpc<T>(client: typeof buyer, name: string, values: Record<string,unknown> = {}): Promise<T> {
  const result = await client.rpc(name, values); if (result.error) throw new Error(result.error.message); return result.data as T;
}
function paid() {
  if (!storedSession) throw new Error('No checkout fixture');
  storedSession = { ...storedSession, status:'complete', customer:'cus_localbuyer', subscription:'sub_localbuyer', payment_status:'paid', url:null };
  const invoice = { id:'in_localpaid', status:'paid', customer:'cus_localbuyer', livemode:false, parent:{ subscription_details:{ subscription:'sub_localbuyer' } }, lines:{ has_more:false, data:[{ parent:{ subscription_item_details:{ subscription_item:'si_local' } }, pricing:{ price_details:{ price:fixturePrice.id } }, quantity:1, amount:4900, period:{start:periodStart,end:periodStart+2592000} }] } };
  currentSubscription = { id:'sub_localbuyer',customer:'cus_localbuyer',status:'active',livemode:false,collection_method:'charge_automatically',cancel_at_period_end:false,metadata:{event_beast_intent:intent.id},items:{has_more:false,data:[{id:'si_local',price:fixturePrice,quantity:1,current_period_start:periodStart,current_period_end:periodStart+2592000}]},latest_invoice:invoice } as unknown as Stripe.Subscription;
}
function notification(eventId: string, type = 'checkout.session.completed') {
  const payload = JSON.stringify({ id:eventId, type, livemode:false, data:{object:type.startsWith('checkout.') ? storedSession : { id:'sub_localbuyer',status:'canceled' }} });
  const stripe = new Stripe('sk_test_local_fixture'); const secret = 'whsec_local_fixture_only';
  return stripe.webhooks.constructEvent(payload, stripe.webhooks.generateTestHeaderString({payload,secret}), secret);
}
beforeAll(async () => {
  if (api !== 'http://127.0.0.1:54361' || !password || !process.env.EVENT_BEAST_BILLING_DATABASE_URL) throw new Error('Use the isolated billing qualification script.');
  for (const account of accounts) {
    const response = await account.client.auth.signInWithPassword({ email:`${account.name}@billing.example.test`,password });
    if (response.error) throw response.error;
  }
  provider = createServer(async (request,response) => {
    const url = new URL(request.url!, 'http://127.0.0.1');
    const send = (value: unknown, status = 200) => { response.writeHead(status, {'content-type':'application/json'}); response.end(JSON.stringify(value)); };
    if (url.pathname === `/v1/prices/${fixturePrice.id}`) return send(fixturePrice);
    if (url.pathname === '/v1/checkout/sessions' && request.method === 'POST') {
      let raw = ''; for await (const chunk of request) raw += chunk;
      const form = new URLSearchParams(raw);
      if (form.get('client_reference_id') !== intent.id || form.get('metadata[event_beast_intent]') !== intent.id || form.get('line_items[0][price]') !== fixturePrice.id || request.headers['idempotency-key'] !== `event-beast-checkout:${intent.id}`) return send({error:{message:'Checkout contract mismatch'}},400);
      if (!storedSession) checkoutCreations += 1;
      storedSession ??= { id:'cs_test_localbuyer',object:'checkout.session',mode:'subscription',status:'open',livemode:false,client_reference_id:intent.id,metadata:{event_beast_intent:intent.id},customer:null,subscription:null,url:'https://checkout.stripe.com/c/pay/cs_test_localbuyer' } as unknown as Stripe.Checkout.Session;
      return send(storedSession);
    }
    if (url.pathname === '/v1/checkout/sessions' && request.method === 'GET') return send({object:'list',data:storedSession ? [storedSession] : [],has_more:false});
    if (url.pathname === '/v1/checkout/sessions/cs_test_localbuyer' && storedSession) return send(storedSession);
    if (url.pathname === '/v1/subscriptions/sub_localbuyer' && currentSubscription) return send(currentSubscription);
    return send({error:{message:'Unexpected provider fixture request'}},404);
  });
  await new Promise<void>(resolve => provider.listen(3198,'127.0.0.1',resolve));
  const stripe = new Stripe('sk_test_local_fixture', { host:'127.0.0.1',port:3198,protocol:'http',maxNetworkRetries:0 });
  poolA = new Pool(billingPoolConfig(process.env.EVENT_BEAST_BILLING_DATABASE_URL));
  poolB = new Pool(billingPoolConfig(process.env.EVENT_BEAST_BILLING_DATABASE_URL));
  serviceA = billingService(stripe,postgresBillingStore(poolA),'http://127.0.0.1:3191',false);
  serviceB = billingService(stripe,postgresBillingStore(poolB),'http://127.0.0.1:3191',false);
});
afterAll(async () => { await Promise.all([poolA?.end(),poolB?.end()]); if (provider) await new Promise<void>(resolve=>provider.close(()=>resolve())); });
describe('real Auth and Postgres with a local Stripe HTTP fixture', () => {
  it('verifies the connection role and denies access to customer records', async () => {
    expect((await poolA.query('select current_user')).rows[0].current_user).toBe('event_beast_billing');
    for (const table of ['public.organizations','public.organization_memberships','auth.users','public.messages','billing.accounts']) {
      await expect(poolA.query(`select * from ${table}`)).rejects.toThrow(/permission denied/);
    }
  });
  it('creates a checkout through the real Stripe SDK and stores its verified identity', async () => {
    planId = await rpc(agency,'billing_save_plan',{p_values:pricePlan(fixturePrice,'Sample Subscription',2,false)});
    const request = {p_request:randomUUID(),p_plan:planId,p_name:'Sample Paid Organizer',p_slug:'sample-paid-organizer',p_target:null};
    const results = await Promise.all([rpc<CheckoutIntent>(buyer,'billing_begin_checkout',request),rpc<CheckoutIntent>(buyer,'billing_begin_checkout',request)]);
    expect(results[0].id).toBe(results[1].id); intent = results[0];
    const checkout = await serviceA.startCheckout(intent); expect(checkout.url).toBe('https://checkout.stripe.com/c/pay/cs_test_localbuyer');
    expect((await rpc<{status:string}>(buyer,'billing_checkout_status',{p_intent:intent.id})).status).toBe('open');
    expect((await buyer.from('organizations').select('id')).data).toEqual([]); expect(checkoutCreations).toBe(1);
  });
  it('provisions once under concurrent duplicate notifications using two real connections', async () => {
    paid(); const event = notification('evt_localpaid');
    await Promise.all([serviceA.processEvent(event),serviceB.processEvent(event),serviceA.processEvent(event)]);
    const organizations = await buyer.from('organizations').select('*'); expect(organizations.error).toBeNull(); expect(organizations.data).toHaveLength(1);
    orgId = organizations.data![0].id; expect(organizations.data![0].billing_event_limit).toBe(2);
    const membership = await buyer.from('organization_memberships').select('role').eq('organization_id',orgId); expect(membership.data).toEqual([{role:'owner'}]);
    expect(await rpc(buyer,'platform_access')).toBe(false);
    expect((await rpc<{status:string}>(buyer,'billing_checkout_status',{p_intent:intent.id})).status).toBe('provisioned');
    expect((await other.from('organizations').select('*')).data).toEqual([]);
    await expect(rpc(other,'billing_owner_context',{p_organization:orgId})).rejects.toThrow(/owner access/);
  });
  it('lets the provisioned owner create events and refuses an extra event atomically', async () => {
    const values = {name:'Sample Subscription Event',slug:'sample-paid-event',tagline:'Synthetic event used for billing qualification.',timezone:'America/Chicago',start_date:'2027-04-02',end_date:'2027-04-02',brand_logo_url:''};
    await rpc(buyer,'platform_create_event',{p_organization:orgId,p_request:randomUUID(),p_values:values});
    const attempts = await Promise.allSettled([1,2].map(n=>rpc(buyer,'platform_create_event',{p_organization:orgId,p_request:randomUUID(),p_values:{...values,slug:`last-allowance-${n}`}})));
    expect(attempts.filter(result=>result.status==='fulfilled')).toHaveLength(1);
    expect((await buyer.from('events').select('id').eq('organization_id',orgId)).data).toHaveLength(2);
    expect((await agency.from('attendees').select('id')).data).toEqual([]);
  });
  it('uses the current provider state even when the incoming notification says canceled', async () => {
    await serviceA.processEvent(notification('evt_localstale','customer.subscription.deleted'));
    const owner = await rpc<{account:{status:string};has_access:boolean}>(buyer,'billing_owner_context',{p_organization:orgId});
    expect(owner.account.status).toBe('active'); expect(owner.has_access).toBe(true);
    expect((await rpc<{checkouts?:unknown}[]>(other,'billing_recent_checkouts'))).toEqual([]);
  });
});
