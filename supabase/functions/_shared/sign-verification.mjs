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
  html: `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Seu código DUUK</title></head>
<body style="margin:0;padding:0;background:#f3f1ef;color:#24211f;font-family:Arial,Helvetica,sans-serif">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">Seu código para continuar na assinatura DUUK. Válido por 10 minutos.</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f1ef"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden">
<tr><td bgcolor="#111111" style="padding:30px 28px;border-top:3px solid #f5824a">
<img src="https://www.duukfilms.com/media/duuk-logo-white.png" width="40" height="49" alt="DUUK Films" style="display:block;width:40px;height:49px;border:0">
<p style="margin:20px 0 0;color:#e6a27b;font-size:10px;font-weight:bold;letter-spacing:2px">DOCUMENTOS / ASSINATURA</p></td></tr>
<tr><td style="padding:30px 28px 16px"><h1 style="margin:0 0 14px;color:#24211f;font-size:26px;line-height:1.2;letter-spacing:-.7px">Um passo para continuar.</h1>
<p style="margin:0;color:#68615c;font-size:15px;line-height:1.7">Use o código abaixo na página de assinatura que você abriu.</p></td></tr>
<tr><td style="padding:8px 28px 24px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" bgcolor="#fff1e8" style="padding:24px 8px;border-radius:12px">
<p style="margin:0 0 12px;color:#945335;font-size:10px;font-weight:bold;letter-spacing:1.5px">SEU CÓDIGO DE ACESSO</p>
<p dir="ltr" style="margin:0;color:#a93d13;font-family:Consolas,Menlo,monospace;font-size:36px;font-weight:bold;line-height:1.2;letter-spacing:6px">${code}</p>
<p style="margin:14px 0 0;color:#815b46;font-size:12px">Válido por <strong>10 minutos</strong></p></td></tr></table></td></tr>
<tr><td style="padding:0 28px 30px"><p style="margin:0;color:#68615c;font-size:13px;line-height:1.7"><strong style="color:#24211f">Este código é só seu.</strong> Não compartilhe com outras pessoas. A confirmação libera o acesso ao documento; a assinatura acontece na próxima etapa.</p>
<p style="margin:20px 0 0;color:#8a827c;font-size:12px;line-height:1.6">Se você não solicitou este acesso, ignore este e-mail.</p></td></tr>
<tr><td style="padding:20px 28px;background:#faf8f6;border-top:1px solid #eee9e4"><p style="margin:0;color:#7c736c;font-size:11px;line-height:1.6"><strong style="color:#24211f">DUUK Films</strong><br>Histórias que ganham forma.</p></td></tr>
</table></td></tr></table></body></html>`,
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
