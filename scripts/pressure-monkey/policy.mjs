import { z } from 'zod';

export const PRODUCTION_PROJECT = 'nyhzmazbfctuttizwnxp';
export const PRODUCTION_EVENT = 'a9bdf080-f47f-538e-94f7-38e4ff996116';
const protectedHosts = ['event-beast.vercel.app', 'momentumbuilder.com'];
const text = z.string().trim().min(1).max(300);
const positive = z.number().finite().int().positive();
const nonnegative = z.number().finite().int().nonnegative();
const utc = z.string().datetime();
const sha = z.string().regex(/^[a-f0-9]{40}$/);

export class SafetyError extends Error {
  constructor(code) { super(code); this.name = 'SafetyError'; this.code = code; }
}
const refuse = code => { throw new SafetyError(code); };
export function productionHost(host) {
  return protectedHosts.some(value => host === value || host.endsWith('.' + value))
    || host === `${PRODUCTION_PROJECT}.supabase.co`
    || /^event-beast-[^.]+\.vercel\.app$/.test(host);
}
function origin(value) {
  let parsed;
  try { parsed = new URL(value); } catch { return refuse('INVALID_ORIGIN'); }
  if (parsed.origin !== value || parsed.username || parsed.password || !['https:', 'http:'].includes(parsed.protocol)) refuse('INVALID_ORIGIN');
  return parsed;
}
const loopback = host => ['127.0.0.1', '[::1]', 'localhost'].includes(host);

export const approvalSchema = z.object({
  schema_version: z.literal(1), status: z.literal('approved'), run_id: z.string().uuid(),
  approved_by: text, approval_reference: text, approved_at_utc: utc, expires_at_utc: utc,
  operator: text, rollback_owner: text,
  target: z.object({
    environment: z.enum(['local', 'isolated', 'production_bounded']), app_origin: text,
    deployment_id: text, application_sha: sha, harness_sha: sha,
    supabase_project_ref: z.string().regex(/^(?:local|[a-z]{20})$/), event_id: z.string().uuid(),
    allowed_hosts: z.array(text).min(1).max(10), allowed_paths: z.array(text).min(1).max(2000),
    verified_isolated_from_production: z.literal(true),
  }).strict(),
  permissions: z.object({
    allow_production: z.literal(false), allow_faults: z.boolean(), allow_external_email: z.literal(false),
    allow_paid_provisioning: z.literal(false), allow_provider_or_dns_changes: z.literal(false),
  }).strict(),
  profile: z.enum(['PM-L01', 'PM-L02', 'PM-L03', 'PM-L04', 'PM-L05', 'PM-L06', 'PM-L07']),
  random_seed: nonnegative,
  limits: z.object({
    max_active_sessions: positive.max(550), max_open_sockets: nonnegative.max(1000),
    max_http_requests_per_second: positive, max_total_http_attempts_including_retries: positive,
    max_writes_including_fixture_setup: nonnegative, max_transfer_bytes: positive,
    max_duration_seconds: positive.max(7200), max_estimated_cost_usd: z.number().finite().nonnegative(),
    max_fault_affected_sessions: nonnegative, max_fault_duration_seconds: nonnegative,
  }).strict(),
  preflight: z.object({
    effective_provider_limits_evidence: text, capacity_headroom_verified: z.literal(true),
    safety_telemetry_verified: z.literal(true), watchdog_verified: z.literal(true),
    normal_auth_sessions_verified: z.literal(true), rollback_compatibility_verified: z.literal(true),
    fixture_manifest_reference: text, credentials_reference: text, cleanup_verified_locally: z.literal(true),
  }).strict(),
  notes: z.string().max(3000).optional(),
}).strict();

/** Mechanical review, not a way to manufacture the owner's authorization.
 * This version never dispatches hosted traffic, even with a valid manifest. */
export function validateApproval(input, now = Date.now()) {
  const parsed = approvalSchema.safeParse(input);
  if (!parsed.success) return { valid: false, issues: parsed.error.issues.map(issue => ({ path: issue.path.join('.'), code: issue.code })) };
  const m = parsed.data;
  const issues = [];
  const check = (condition, code) => { if (!condition) issues.push({ path: '', code }); };
  try {
    const app = origin(m.target.app_origin);
    check(m.target.environment !== 'production_bounded', 'PRODUCTION_EXECUTION_UNSUPPORTED');
    check(!productionHost(app.hostname) && m.target.supabase_project_ref !== PRODUCTION_PROJECT && m.target.event_id !== PRODUCTION_EVENT, 'PROTECTED_PRODUCTION_TARGET');
    check(m.target.environment === 'local' ? loopback(app.hostname) && m.target.supabase_project_ref === 'local' : app.protocol === 'https:' && !loopback(app.hostname) && m.target.supabase_project_ref !== 'local', 'ENVIRONMENT_TARGET_MISMATCH');
    for (const host of m.target.allowed_hosts) {
      const url = origin(`${app.protocol}//${host}`);
      check(url.host === host && !productionHost(url.hostname), 'INVALID_OR_PROTECTED_HOST');
      check(m.target.environment === 'local' ? loopback(url.hostname) : [app.host, `${m.target.supabase_project_ref}.supabase.co`].includes(host), 'UNAPPROVED_THIRD_PARTY_HOST');
    }
    check(m.target.allowed_hosts.includes(app.host), 'APP_HOST_NOT_ALLOWED');
    for (const path of m.target.allowed_paths) check(/^\/(?:[a-zA-Z0-9_-]+\/?)*$/.test(path), 'PATH_MUST_BE_EXACT');
  } catch (error) { issues.push({ path: 'target', code: error instanceof SafetyError ? error.code : 'INVALID_TARGET' }); }
  const approved = Date.parse(m.approved_at_utc), expires = Date.parse(m.expires_at_utc);
  check(approved <= now && expires > now && expires > approved && expires - approved <= 86400000, 'APPROVAL_WINDOW_INVALID');
  check(now + m.limits.max_duration_seconds * 1000 <= expires, 'RUN_EXCEEDS_APPROVAL_WINDOW');
  check(m.permissions.allow_faults || (m.limits.max_fault_affected_sessions === 0 && m.limits.max_fault_duration_seconds === 0), 'FAULT_PERMISSION_REQUIRED');
  check(m.limits.max_fault_affected_sessions <= m.limits.max_active_sessions && m.limits.max_fault_duration_seconds <= m.limits.max_duration_seconds, 'FAULT_LIMIT_EXCEEDS_RUN');
  check(m.target.environment === 'local' || m.limits.max_estimated_cost_usd > 0, 'HOSTED_COST_LIMIT_REQUIRED');
  return { valid: issues.length === 0, issues, ...(issues.length ? {} : { manifest: m }) };
}

export function assertAllowedRequest(m, raw, method = 'GET') {
  // Reject ambiguous normalization before URL() can hide dot segments or slashes.
  if (typeof raw !== 'string' || /[\\\s]/.test(raw) || /%(?:2e|2f|5c|00)/i.test(raw) || /\/(?:\.|\.\.)(?:\/|$)/.test(raw)) refuse('AMBIGUOUS_REQUEST_URL');
  let url;
  try { url = new URL(raw); } catch { return refuse('INVALID_REQUEST_URL'); }
  if (url.username || url.password || url.hash || productionHost(url.hostname)) refuse('PROTECTED_OR_CREDENTIAL_URL');
  const base = origin(m.target.app_origin);
  if (url.protocol !== base.protocol || !m.target.allowed_hosts.includes(url.host) || !m.target.allowed_paths.includes(url.pathname)) refuse('REQUEST_NOT_ALLOWLISTED');
  // This bootstrap slice is read-only. The future fixture/write adapters need
  // body-level guards and exact synthetic ownership, not a generic POST switch.
  if (!['GET', 'HEAD'].includes(method) || /\/(?:auth|admin|functions)(?:\/|$)/.test(url.pathname)) refuse('OPERATION_NOT_IMPLEMENTED');
  return url;
}

export function verifyTargetEvidence(m, evidence, now = Date.now()) {
  if (!evidence || !Number.isFinite(Date.parse(evidence.observed_at_utc)) || now - Date.parse(evidence.observed_at_utc) > 300000 || Date.parse(evidence.observed_at_utc) > now) refuse('STALE_OR_MISSING_TARGET_EVIDENCE');
  for (const key of ['app_origin', 'deployment_id', 'application_sha', 'harness_sha', 'supabase_project_ref', 'event_id']) {
    if (evidence[key] !== m.target[key]) refuse('TARGET_ATTESTATION_MISMATCH');
  }
  if (evidence.supabase_project_ref === PRODUCTION_PROJECT || evidence.event_id === PRODUCTION_EVENT || evidence.isolated_from_production !== true) refuse('SHARED_PRODUCTION_BACKEND');
  if (!Number.isSafeInteger(evidence.realtime_connection_limit) || !Number.isSafeInteger(evidence.existing_realtime_connections) || evidence.realtime_connection_limit <= 0 || evidence.existing_realtime_connections < 0) refuse('UNKNOWN_EFFECTIVE_CONNECTION_LIMIT');
  // Headroom means >=20% of configured capacity remains unused, not 20% of demand.
  const demand = m.limits.max_open_sockets + evidence.existing_realtime_connections;
  if (demand > evidence.realtime_connection_limit * 0.8) refuse('INSUFFICIENT_REALTIME_HEADROOM');
  return { requiredConnectionLimit: Math.ceil(demand / 0.8), usable: true };
}
