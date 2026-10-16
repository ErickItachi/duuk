// The browser controls the challenge UI. Database policies and every private
// Edge Function independently enforce the same requirement.
export const mfaRequiredMessage = 'Confirme os dois fatores para acessar o painel.'
export const requiresMfaConfirmation = error => error?.message === mfaRequiredMessage

export async function mfaRequirement(auth, { requireChallenge = false, token } = {}) {
  const [factors, assurance] = await Promise.all([
    auth.mfa.listFactors(), auth.mfa.getAuthenticatorAssuranceLevel(token),
  ])
  if (factors.error || assurance.error) throw new Error('Não foi possível verificar os dois fatores. Tente novamente.')
  const verified = (factors.data?.totp || []).filter(factor => factor.status === 'verified')
  if (!verified.length) return { step: 'enroll', factors: [] }
  if (requireChallenge || assurance.data?.currentLevel !== 'aal2') return { step: 'challenge', factors: verified }
  return null
}

export const validMfaCode = code => /^\d{6}$/.test(code)
export function authenticatorImage(qr) {
  if (typeof qr !== 'string') return ''
  if (qr.startsWith('<svg')) return `data:image/svg+xml,${encodeURIComponent(qr)}`
  if (qr.startsWith('data:image/svg+xml;') || qr.startsWith('data:image/svg+xml,')) {
    const comma = qr.indexOf(',')
    if (comma < 0) return ''
    const svg = qr.slice(comma + 1)
    // supabase-js returns an unescaped SVG data URL. A literal # in a QR
    // color would otherwise turn the rest of the image into a URL fragment.
    return svg.startsWith('<') ? `data:image/svg+xml,${encodeURIComponent(svg)}` : qr
  }
  return ''
}
