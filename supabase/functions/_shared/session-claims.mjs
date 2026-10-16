// Call only after auth.getUser(token) has verified the JWT. Decoding alone
// never establishes identity or permissions.
export function verifiedSessionClaims(token) {
  try {
    const part = token.split('.')[1]
    const value = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')))
    if (value.aal !== 'aal2' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value.session_id)) return null
    return { session: value.session_id, assurance: value.aal }
  } catch { return null }
}
