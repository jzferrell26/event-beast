import 'server-only';
import Stripe from 'stripe';
import { ApiError } from '../http';
import { platformEnabled } from '../platform-auth';

export function billingEnabled() { return platformEnabled() && process.env.EVENT_BEAST_BILLING_ENABLED === 'true'; }
export function billingLive() { return process.env.EVENT_BEAST_BILLING_MODE === 'live'; }
export function requireBilling() {
  if (!billingEnabled()) throw new ApiError(404, 'Subscription setup is not open yet.');
  if (process.env.EVENT_BEAST_DEMO_MODE === 'true') throw new ApiError(409, 'Subscriptions are unavailable in sample previews.');
}
export function billingOrigin() {
  const configured = process.env.EVENT_BEAST_PLATFORM_URL;
  if (!configured) throw new ApiError(503, 'The billing return address is being configured.');
  let url: URL;
  try { url = new URL(configured); } catch { throw new ApiError(503, 'The billing return address is being configured.'); }
  const loopback = ['127.0.0.1','localhost','[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback && !billingLive())) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new ApiError(503, 'Configure a trusted billing origin.');
  }
  return url.origin;
}
export function assertBillingOrigin(request: Request) {
  if (request.headers.get('origin') !== billingOrigin()) throw new ApiError(403, 'Open billing from the Event Beast workspace.');
}
export function stripeClient() {
  requireBilling();
  const key = process.env.EVENT_BEAST_STRIPE_SECRET_KEY;
  const expected = billingLive() ? /^(sk|rk)_live_/ : /^(sk|rk)_test_/;
  if (!key || !expected.test(key)) throw new ApiError(503, 'Billing credentials are not configured for this environment.');
  return new Stripe(key, { maxNetworkRetries: 1, timeout: 8000 });
}
export function webhookSecret() {
  const secret = process.env.EVENT_BEAST_STRIPE_WEBHOOK_SECRET;
  if (!secret?.startsWith('whsec_')) throw new ApiError(503, 'Payment notifications are being configured.');
  return secret;
}
export function checkoutDestination(raw: string | null): string {
  if (!raw) throw new ApiError(503, 'Checkout is not available. Please try again.');
  const url = new URL(raw);
  if (url.origin !== 'https://checkout.stripe.com' || url.username || url.password) throw new ApiError(503, 'The checkout destination could not be verified.');
  return raw;
}
