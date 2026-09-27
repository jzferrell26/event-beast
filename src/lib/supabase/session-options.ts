// Persist the refresh-capable session across browser visits. Access tokens stay
// short-lived; a long cookie lifetime never overrides revoked event access.
export const SESSION_COOKIE_DAYS = 365;
export function sessionCookieOptions(siteUrl = process.env.EVENT_BEAST_SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? '') {
  const secure = typeof window === 'undefined' ? siteUrl.startsWith('https://') : window.location.protocol === 'https:';
  return { path: '/', sameSite: 'lax' as const, secure, maxAge: SESSION_COOKIE_DAYS * 24 * 60 * 60 };
}
