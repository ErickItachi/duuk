// A navigation response created by the service worker does not pass through
// Vercel. Carry the same document protections into its cached HTML response.
export function adminShellHeaders(configuration) {
  const headers = new Headers({ 'Content-Type': 'text/html; charset=utf-8' })
  for (const rule of configuration.headers || []) {
    if (rule.has || rule.missing) continue
    if (!['/(.*)', '/admin', '/admin/:path*'].includes(rule.source)) continue
    for (const { key, value } of rule.headers || []) headers.set(key, value)
  }
  // The same cached shell serves OAuth callbacks and other private routes.
  headers.set('Referrer-Policy', 'no-referrer')
  headers.set('Cache-Control', 'no-store')
  return Object.fromEntries(headers)
}
