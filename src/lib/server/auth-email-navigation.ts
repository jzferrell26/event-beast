import 'server-only';
import { authenticationOrigin } from '../auth-navigation';
import { safeNext } from '../format';
import { ApiError } from './http';

/** Email context selects a configured origin and UI, never an account or role. */
export function emailLinkNavigation(params: URLSearchParams, legacyNext = '/') {
  const requestedNext = params.get('next');
  const workspace = params.get('context') === 'workspace'
    || /^\/(?:app(?:\/|$)|agency(?:\/|$)|platform\/)/.test(safeNext(requestedNext));
  if (workspace && process.env.EVENT_BEAST_PLATFORM_ENABLED !== 'true') {
    throw new ApiError(404, 'Workspace sign-in is not available. Your link was not used.');
  }
  const eventSite = process.env.EVENT_BEAST_SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL;
  const origin = authenticationOrigin(workspace ? process.env.EVENT_BEAST_PLATFORM_URL ?? eventSite : eventSite);
  return {
    workspace,
    origin,
    next: safeNext(requestedNext || (workspace ? '/app' : legacyNext)),
    passwordSetup: workspace ? '/platform/auth?mode=reset' : '/reset-password',
    failure: workspace ? '/platform/auth?error=link' : '/auth?error=link&force=1',
    signIn: workspace ? '/platform/auth' : '/auth?force=1',
  };
}
