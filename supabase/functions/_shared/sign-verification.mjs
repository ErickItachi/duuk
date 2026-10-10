export function normalizeSigningEmail(value) {
 const email = String(value || '').trim().toLowerCase()
 if (email.length > 254 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(email) || email.startsWith('.') || email.split('@')[0].endsWith('.') || email.includes('..')) throw new Error('SIGN_EMAIL_INVALID')
 return email
}
export function signingEmailHint(value) {
 const [local, domain] = normalizeSigningEmail(value).split('@')
 return `${local.slice(0, 1)}***@${domain}`
}
export function newSigningCode(random = crypto.getRandomValues.bind(crypto)) {
 // Rejection sampling keeps all one million codes equally likely.
 const limit = Math.floor(0x100000000 / 1000000) * 1000000
 let value
 do { value = random(new Uint32Array(1))[0] } while (value >= limit)
 return String(value % 1000000).padStart(6, '0')
}
export function newVerificationToken() {
 return Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('')
}
export async function signingCodeHash(pepper, challengeId, code) {
 if (typeof pepper !== 'string' || pepper.length < 32 || !/^[a-f0-9-]{36}$/.test(challengeId) || !/^\d{6}$/.test(code)) throw new Error('SIGN_CHALLENGE_INVALID')
 const encoder = new TextEncoder(), key = await crypto.subtle.importKey('raw', encoder.encode(pepper), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
 const hash = await crypto.subtle.sign('HMAC', key, encoder.encode(`duuk-sign-email-v1\n${challengeId}\n${code}`))
 return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('')
}
export const signingCodeMessage = (email, code) => {
 const to = normalizeSigningEmail(email)
 if (!/^\d{6}$/.test(code)) throw new Error('SIGN_CHALLENGE_INVALID')
 return {
  to,
  subject: 'DUUK | Código para acessar a assinatura',
  text: `Seu código de confirmação DUUK é ${code}.\n\nEle vale por 10 minutos. Informe o código somente na página de assinatura que você abriu. Não compartilhe este código.\n\nSe você não solicitou este acesso, ignore este e-mail.`,
  html: `<div style="font-family:Arial,sans-serif;color:#222;max-width:520px;margin:auto;padding:32px"><p style="font-weight:700;letter-spacing:3px">DUUK</p><h1 style="font-size:22px">Confirme seu acesso</h1><p>Digite este código na página de assinatura:</p><p style="font-size:32px;font-weight:700;letter-spacing:7px">${code}</p><p>O código vale por 10 minutos. Não compartilhe este código.</p><p style="font-size:13px;color:#666">Se você não solicitou este acesso, ignore este e-mail.</p></div>`,
 }
}
export async function sendSigningCode(credentials, transportFactory, email, code) {
 if (!credentials?.password || !credentials?.user) throw new Error('SIGN_MAIL_UNAVAILABLE')
 const transport = await transportFactory(credentials)
 try {
  const message = signingCodeMessage(email, code)
  const result = await transport.sendMail({ ...message, to: { address: message.to }, from: { name: 'DUUK', address: credentials.user }, disableFileAccess: true, disableUrlAccess: true })
  if (!result?.accepted?.some(address => String(address).toLowerCase() === message.to)) throw new Error('SIGN_MAIL_DELIVERY')
 } catch { throw new Error('SIGN_MAIL_DELIVERY') } finally { transport.close() }
}
export async function requestSigningCode(input, { rpc, send, pepper, randomCode = newSigningCode, randomId = crypto.randomUUID.bind(crypto) }) {
 const challengeId = randomId(), code = randomCode(), email = normalizeSigningEmail(input.email)
 const prepared = await rpc('prepare', { digest: input.digest, email, client_request_id: input.client_request_id, challenge_id: challengeId, code_hash: await signingCodeHash(pepper, challengeId, code) })
 const response = { challenge_id: prepared.challenge_id, expires_at: prepared.expires_at, retry_at: prepared.retry_at, email_hint: prepared.email_hint }
 if (!prepared.deliver) return response
 try {
  await send(prepared.recipient_email, code)
  await rpc('delivery', { digest: input.digest, challenge_id: prepared.challenge_id, sent: true })
 } catch {
  await rpc('delivery', { digest: input.digest, challenge_id: prepared.challenge_id, sent: false }).catch(() => {})
  throw new Error('SIGN_MAIL_DELIVERY')
 }
 return response
}
