import test from 'node:test'
import assert from 'node:assert/strict'
import { newSigningCode, newVerificationToken, normalizeSigningEmail, requestSigningCode, sendSigningCode, signingCodeHash, signingCodeMessage, signingEmailHint } from '../supabase/functions/_shared/sign-verification.mjs'

const id = '11111111-1111-4111-8111-111111111111', pepper = 'x'.repeat(64), email = 'fixture@test.invalid'
test('códigos têm seis dígitos e a amostragem rejeita números que causariam viés', () => {
 assert.equal(newSigningCode(array => { array[0] = 0; return array }), '000000')
 assert.equal(newSigningCode(array => { array[0] = 999999; return array }), '999999')
 const sequence = [0xffffffff, 123456]
 assert.equal(newSigningCode(array => { array[0] = sequence.shift(); return array }), '123456')
 assert.equal(sequence.length, 0)
 assert.match(newVerificationToken(), /^[a-f0-9]{64}$/)
 assert.notEqual(newVerificationToken(), newVerificationToken())
})
test('e-mail tem destinatário único, rejeita injeção e a página usa apenas uma indicação mascarada', () => {
 assert.equal(normalizeSigningEmail(' Fixture+duuk@TEST.invalid '), 'fixture+duuk@test.invalid')
 assert.equal(signingEmailHint(email), 'f***@test.invalid')
 for (const value of ['a@test.invalid,b@test.invalid', 'Nome <a@test.invalid>', 'a@test.invalid\r\nBcc:b@test.invalid', 'a..b@test.invalid', '.a@test.invalid', 'a@test..invalid', 'a@-test.invalid', 'a@localhost', 'a@']) assert.throws(() => normalizeSigningEmail(value))
})
test('hash do código exige segredo backend e vincula código ao desafio', async () => {
 const hash = await signingCodeHash(pepper, id, '123456')
 assert.match(hash, /^[a-f0-9]{64}$/)
 assert.equal(hash, await signingCodeHash(pepper, id, '123456'))
 assert.notEqual(hash, await signingCodeHash(pepper, '22222222-2222-4222-8222-222222222222', '123456'))
 assert.notEqual(hash, await signingCodeHash('y'.repeat(64), id, '123456'))
 await assert.rejects(() => signingCodeHash('short', id, '123456'))
 await assert.rejects(() => signingCodeHash(pepper, id, '1234'))
})
test('SMTP envia somente código e validade, sem dados do contrato, URLs ou anexos', async () => {
 const message = signingCodeMessage(email, '123456')
 assert.equal(message.to, email)
 assert(message.text.includes('123456'))
 assert(message.text.includes('10 minutos'))
 assert(!/https?:|contrato:|anexo/i.test(message.html))
 const calls = []; let closed = false
 await sendSigningCode({ user: 'mailbox@test.invalid', password: 'fixture' }, async () => ({ sendMail: async data => { calls.push(data); return { accepted: [email] } }, close: () => { closed = true } }), email, '123456')
 assert.equal(calls.length, 1)
 assert.deepEqual(calls[0].to, { address: email })
 assert.equal(calls[0].disableFileAccess, true)
 assert.equal(calls[0].disableUrlAccess, true)
 assert.equal(closed, true)
})
test('falha SMTP fecha transporte e não propaga erro com segredo ou código', async () => {
 let closed = false
 await assert.rejects(() => sendSigningCode({ user: email, password: 'private-fixture' }, async () => ({ sendMail: async () => { throw new Error('password private-fixture code 123456') }, close: () => { closed = true } }), email, '123456'), error => error.message === 'SIGN_MAIL_DELIVERY')
 assert.equal(closed, true)
})
test('pedido entregue repetido recupera desafio e não reenvia SMTP nem revela destinatário', async () => {
 let sent = false
 const result = await requestSigningCode({ digest: 'd'.repeat(64), email, client_request_id: id }, { pepper, randomId: () => id, randomCode: () => '123456', rpc: async (operation, payload) => {
  assert.equal(operation, 'prepare')
  assert(!Object.values(payload).includes('123456'))
  return { deliver: false, challenge_id: id, expires_at: 'expiry', retry_at: 'retry', email_hint: 'f***@test.invalid', recipient_email: email }
 }, send: async () => { sent = true } })
 assert.equal(sent, false)
 assert.deepEqual(result, { challenge_id: id, expires_at: 'expiry', retry_at: 'retry', email_hint: 'f***@test.invalid' })
})
test('envio só confirma entrega após SMTP e falha registra estado seguro', async () => {
 for (const fail of [false, true]) {
  const calls = []
  const work = requestSigningCode({ digest: 'd'.repeat(64), email, client_request_id: id }, { pepper, randomId: () => id, randomCode: () => '123456', rpc: async (operation, payload) => {
   calls.push({ operation, payload })
   if (operation === 'prepare') return { deliver: true, challenge_id: id, recipient_email: email }
   return {}
  }, send: async (to, code) => { assert.equal(to, email); assert.equal(code, '123456'); assert.equal(calls.length, 1); if (fail) throw new Error('SMTP secret') } })
  if (fail) await assert.rejects(work, error => error.message === 'SIGN_MAIL_DELIVERY')
  else await work
  assert.equal(calls[1].operation, 'delivery')
  assert.equal(calls[1].payload.sent, !fail)
 }
})
