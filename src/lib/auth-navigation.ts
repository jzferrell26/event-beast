// Auth cookies and redirects must stay on the configured website origin.
// Reverse proxies may expose localhost in Request.url; that is not the public
// browser origin, and redirecting there loses the newly established session.
export function authenticationOrigin(configuredSite: string | undefined): string {
  if (!configuredSite) throw new Error('The event website origin is not configured.');
  const url = new URL(configuredSite);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) || url.username || url.password) {
    throw new Error('Use the HTTPS event website origin.');
  }
  return url.origin;
}
