import { z } from 'zod';
import { uuid } from './validation';
import type { Organization } from './platform';

export interface BillingPlan {
  id: string; name: string; stripe_price_id: string; stripe_product_id: string;
  unit_amount: number; currency: string; billing_interval: 'month' | 'year';
  event_limit: number; livemode: boolean; active: boolean;
}
export interface CheckoutIntent {
  id: string; buyer_id: string; buyer_email: string; requested_name: string; requested_slug: string;
  target_organization_id: string | null; organization_id: string | null;
  plan_id: string; stripe_price_id: string; event_limit: number; livemode: boolean;
  status: 'pending' | 'open' | 'provisioned' | 'expired'; stripe_session_id: string | null;
  stripe_customer_id: string | null; stripe_subscription_id: string | null; checkout_url: string | null;
  created_at: string; expires_at: string;
}
export interface CheckoutStatus {
  id: string; name: string; status: CheckoutIntent['status']; organization_slug: string | null;
  organization_id: string | null; expires_at: string; checkout_url: string | null;
}
export interface BillingAccount {
  organization_id: string; stripe_customer_id: string; stripe_subscription_id: string; intent_id: string;
  plan_id: string; stripe_price_id: string; status: string; paid_until: string | null;
  cancel_at_period_end: boolean; livemode: boolean; checked_at: string;
}
export interface OwnerBilling { organization: Organization; account: BillingAccount | null; plan: BillingPlan | null; has_access: boolean }
export interface BillingOverview {
  accounts: { id: string; name: string; slug: string; status: string; paid_until: string | null; checked_at: string; plan_name: string }[];
  failures: { event_id: string; event_type: string; error_code: string | null; attempts: number; received_at: string }[];
}
export const checkoutSchema = z.object({
  request_id: uuid, plan_id: uuid, name: z.string().trim().min(1).max(160),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{2,63}$/, 'Use 3–64 lowercase letters, numbers or hyphens.'),
  organization_id: uuid.nullable().default(null),
}).strict();
export const planSchema = z.object({ name: z.string().trim().min(1).max(80), stripe_price_id: z.string().regex(/^price_[A-Za-z0-9]+$/), event_limit: z.number().int().min(1).max(10000) }).strict();
export const planActiveSchema = z.object({ id: uuid, active: z.boolean() }).strict();
export const reconcileSchema = z.object({ intent_id: uuid }).strict();
export const portalSchema = z.object({ organization_id: uuid }).strict();

// Stripe uses zero-decimal currency amounts for these currencies; JPY 100 is
// 100 yen, while USD 100 is one dollar. Prices remain the provider's amounts.
const zeroDecimal = new Set(['bif','clp','djf','gnf','jpy','kmf','krw','mga','pyg','rwf','vnd','vuv','xaf','xof','xpf']);
const threeDecimal = new Set(['bhd','jod','kwd','omr','tnd']);
export function planPrice(plan: BillingPlan): string {
  const scale = zeroDecimal.has(plan.currency) ? 1 : threeDecimal.has(plan.currency) ? 1000 : 100;
  return `${new Intl.NumberFormat('en-US', { style: 'currency', currency: plan.currency.toUpperCase() }).format(plan.unit_amount / scale)} / ${plan.billing_interval}`;
}
