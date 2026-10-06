import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const config = JSON.parse(readFileSync(new URL('../src/content/supabaseConfig.json', import.meta.url)))
const enabled = Boolean(process.env.DUUK_TEST_PASSWORD)

test('Supabase protege rascunhos, exige administrador e rejeita revisões antigas', { skip: !enabled, timeout: 60000 }, async () => {
  const login = await fetch(`${config.url}/auth/v1/token?grant_type=password`, {
    signal: AbortSignal.timeout(20000), method: 'POST', headers: { apikey: config.publishableKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.DUUK_TEST_EMAIL || 'contato@duukfilms.com', password: process.env.DUUK_TEST_PASSWORD }),
  })
  assert.equal(login.status, 200, 'Login deve funcionar')
  const session = await login.json()
  const call = async (path, body, authenticated = true) => {
    const response = await fetch(`${config.url}/rest/v1/${path}`, {
      signal: AbortSignal.timeout(20000), headers: { apikey: config.publishableKey, 'Content-Type': 'application/json', ...(authenticated ? { Authorization: `Bearer ${session.access_token}` } : {}) },
      ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}),
    })
    const data = await response.json()
    return { status: response.status, data }
  }
  const anonymous = await call('duuk_content?select=key', null, false)
  assert.equal(anonymous.status, 200)
  assert.deepEqual(anonymous.data.map((row) => row.key), ['published'])
  const forbidden = await call('rpc/duuk_publish', { expected_version: 1 }, false)
  assert([401, 403].includes(forbidden.status))
  const admin = await call('duuk_admins?select=user_id')
  assert.deepEqual(admin.data.map((row) => row.user_id), [session.user.id])
  const draft = (await call('duuk_content?key=eq.draft&select=content,version')).data[0]
  // A stale revision must fail before changing the row, even for an administrator.
  const stale = await call('rpc/duuk_save_draft', { document: draft.content, expected_version: draft.version - 1 })
  assert.equal(stale.status, 409)
  assert.equal(stale.data.code, 'PT409')
  const staleLive = await call('rpc/duuk_save_site', { document: draft.content, expected_version: draft.version - 1 })
  assert.equal(staleLive.status, 409)
  assert.equal(staleLive.data.code, 'PT409')
  const after = (await call('duuk_content?key=eq.draft&select=version')).data[0]
  assert.equal(after.version, draft.version)
})
