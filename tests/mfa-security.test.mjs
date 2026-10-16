import assert from 'node:assert/strict'
import test from 'node:test'
import { authenticatorImage, mfaRequirement, validMfaCode, requiresMfaConfirmation, mfaRequiredMessage } from '../src/content/mfa.mjs'
import { verifiedSessionClaims } from '../supabase/functions/_shared/session-claims.mjs'
import { prepareSqlFixture } from '../scripts/prepare-sql-fixture.mjs'
import { privateEntryRedirect } from '../src/content/privateEntry.mjs'

const factor = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', status: 'verified' }
test('private URL aliases navigate to the protected canonical document before mounting the application', () => {
  const base = 'https://www.duukfilms.com'
  for (const path of ['/ADMIN', '/ad%6din', '/%61dmin']) assert.equal(privateEntryRedirect(base + path + '?code=preserved#hash'), base + '/admin?code=preserved#hash')
  assert.equal(privateEntryRedirect(base + '/Admin/agenda/'), base + '/admin/agenda/')
  assert.equal(privateEntryRedirect(base + '/ASSINAR/abc'), base + '/assinar/abc')
  assert.equal(privateEntryRedirect(base + '/%61dmin/project%252fkeep?state=ABC'), base + '/admin/project%252fkeep?state=ABC')
  for (const path of ['/admin/', '/admin/agenda', '/assinar/abc', '/portfolio', '/administrator', '/admin/%broken']) assert.equal(privateEntryRedirect(base + path), null)
})
const client = (factors, currentLevel, error = null) => ({ mfa: {
  listFactors: async () => ({ data: { totp: factors }, error }),
  getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel }, error: null }),
} })
test('mandatory MFA gates enrollment, password-only sessions, and unverified factors', async () => {
  assert.equal((await mfaRequirement(client([], 'aal1'))).step, 'enroll')
  assert.equal((await mfaRequirement(client([{ ...factor, status: 'unverified' }], 'aal2'))).step, 'enroll')
  assert.deepEqual(await mfaRequirement(client([factor], 'aal1')), { step: 'challenge', factors: [factor] })
  assert.equal(await mfaRequirement(client([factor], 'aal2')), null)
  assert.deepEqual(await mfaRequirement(client([factor], 'aal2'), { requireChallenge: true }), { step: 'challenge', factors: [factor] })
  assert.equal((await mfaRequirement(client([], 'aal2'), { requireChallenge: true })).step, 'enroll')
  assert(requiresMfaConfirmation(new Error(mfaRequiredMessage)))
  assert(!requiresMfaConfirmation(new Error('Sua conta não tem acesso a este módulo.')))
  await assert.rejects(mfaRequirement(client([], 'aal1', new Error('Network'))), /verificar os dois fatores/)
})
test('MFA inputs accept only six ASCII digits and QR images never use an external service', () => {
  for (const code of ['000000', '123456']) assert(validMfaCode(code))
  for (const code of ['', '12345', '1234567', ' 123456', '１２３４５６', '12a456']) assert(!validMfaCode(code))
  assert.match(authenticatorImage('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), /^data:image\/svg\+xml,/)
  assert(!authenticatorImage('data:image/svg+xml;utf-8,<svg fill="#000"></svg>').includes('#'))
  assert.equal(authenticatorImage('https://external.invalid/qr?secret=fixture'), '')
  assert.equal(authenticatorImage('javascript:alert(1)'), '')
})
test('verified session claim extraction rejects missing, malformed and password-only sessions', () => {
  const jwt = payload => `e30.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.fixture`
  const valid = { session_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', aal: 'aal2' }
  assert.deepEqual(verifiedSessionClaims(jwt(valid)), { session: valid.session_id, assurance: 'aal2' })
  for (const payload of [{ ...valid, aal: 'aal1' }, { ...valid, session_id: 'not-a-uuid' }, { aal: 'aal2' }, {}]) assert.equal(verifiedSessionClaims(jwt(payload)), null)
  for (const token of ['', 'not-json', 'a.!.c']) assert.equal(verifiedSessionClaims(token), null)
})
test('legacy SQL MFA fixtures require rollback and keep business permission assertions intact', () => {
  const source = "begin;\nselect set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);\nselect 'business check';\nrollback;"
  const adapted = prepareSqlFixture(source)
  assert(adapted.includes('pg_temp.duuk_fixture_claims(actor)::text'))
  assert(adapted.includes("select 'business check';"))
  assert(adapted.includes("email like '%@test.invalid'"))
  assert(adapted.endsWith('rollback;'))
  assert.throws(() => prepareSqlFixture(source.replace('rollback;', 'commit;')), /roll it back/)
  assert.throws(() => prepareSqlFixture(source + '\nupdate auth.users set email=null;'), /roll it back/)
})
