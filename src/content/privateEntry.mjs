// React Router decodes path segments and normally matches case-insensitively.
// Load private screens only from the canonical URL carrying private headers.
export function privateEntryRedirect(value) {
  const url = new URL(value)
  const first = url.pathname.split('/')[1]
  let segment
  try { segment = decodeURIComponent(first) } catch { return null }
  if (!/^(admin|assinar)$/i.test(segment)) return null
  // Preserve every remaining byte (OAuth paths, IDs and escapes); only the
  // private route root needs normalization to select the right HTTP headers.
  const canonical = `/${segment.toLowerCase()}${url.pathname.slice(first.length + 1)}`
  const destination = new URL(url.href)
  destination.pathname = canonical
  return destination.pathname === url.pathname ? null : destination.href
}
