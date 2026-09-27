import type { ReadinessItem } from "./launch-readiness";

export const EVENT_BEAST_PROJECT_REF = "nyhzmazbfctuttizwnxp";

export interface LaunchEnvironment {
  demo: boolean;
  backendUrl?: string;
  backendKeyConfigured: boolean;
  siteUrl?: string;
  emailReady: boolean;
  activeAdmins: number;
}

/** Report only safe configuration facts, never credentials or Auth tokens. */
export function evaluateEnvironment(environment: LaunchEnvironment): ReadinessItem[] {
  let secureSite = false;
  try {
    const site = new URL(environment.siteUrl ?? "");
    secureSite = site.protocol === "https:" && !site.username && !site.password;
  } catch { /* Missing or malformed configuration must not pass a launch gate. */ }
  const dedicatedBackend = environment.backendUrl === `https://${EVENT_BEAST_PROJECT_REF}.supabase.co` && environment.backendKeyConfigured;
  const item = (key: string, title: string, ready: boolean, detail: string, href = "/admin/launch"): ReadinessItem => ({ key, title, status: ready ? "ready" : "needs_attention", detail, href });
  return [
    item("live_mode", "The attendee deployment is not a demo", !environment.demo,
      environment.demo ? "This is a read-only preview. It cannot qualify the live event." : "Demo mode is off on this deployment."),
    item("dedicated_backend", "The dedicated Event Beast backend is configured", dedicatedBackend,
      dedicatedBackend ? "This deployment uses the approved Event Beast project and a configured public client key." : "Configure the dedicated Event Beast project. Do not reuse another application's database."),
    item("secure_origin", "Authentication uses a configured HTTPS website", secureSite,
      secureSite ? "An HTTPS website origin is configured. Verify its email callbacks during the delivery check." : "Configure the attendee website's HTTPS origin before opening registration."),
    item("email_gate", "Verification and recovery email are enabled", !environment.demo && environment.emailReady,
      environment.emailReady && !environment.demo ? "The email gate is open. The independent-inbox delivery check below must still be recorded." : "Account creation, resend and password-recovery email remain paused. Configure and qualify transactional email before enabling EVENT_BEAST_EMAIL_READY."),
    item("active_admin", "An Admin has claimed event access", environment.activeAdmins > 0,
      environment.activeAdmins > 0 ? `${environment.activeAdmins} active Admin account(s). Confirm an organizer can sign in and manage the event.` : "An unclaimed Admin registration is not working organizer access. Verify and sign in with the designated Admin email.", "/admin/users"),
  ];
}
