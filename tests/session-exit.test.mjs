import assert from 'node:assert/strict'
import test from 'node:test'
import { adminAuthStorageKey, clearAdminAuthStorage, endAdminSession, removeDeviceSubscription } from '../src/content/sessionExit.mjs'

function storage(values) {
  const data = new Map(Object.entries(values))
  return { data, get length() { return data.size }, key: index => [...data.keys()][index], removeItem: key => data.delete(key) }
}

test('offline cleanup removes authentication from both storages while preserving preferences', () => {
  const local = storage({ [adminAuthStorageKey]: 'fixture-session', [`${adminAuthStorageKey}-code-verifier`]: 'fixture-pkce', 'duuk-admin-theme:last': 'dark', 'duuk-remember': 'true' })
  const session = storage({ [adminAuthStorageKey]: 'fixture-session', [`${adminAuthStorageKey}-user`]: 'fixture-user', 'duuk-analytics-disabled': '1' })
  clearAdminAuthStorage([local, () => { throw new Error('Storage disabled') }, session])
  assert.deepEqual(Object.fromEntries(local.data), { 'duuk-admin-theme:last': 'dark', 'duuk-remember': 'true' })
  assert.deepEqual(Object.fromEntries(session.data), { 'duuk-analytics-disabled': '1' })
})

test('local device push is disabled even when backend unregistration is unavailable', async () => {
  const calls = []
  await assert.rejects(removeDeviceSubscription({ endpoint: 'fixture-endpoint', unsubscribe: async () => calls.push('local') }, async endpoint => { calls.push(endpoint); throw new Error('Offline') }))
  assert.deepEqual(calls, ['fixture-endpoint', 'local'])
  await removeDeviceSubscription(null, () => { throw new Error('Must not call') })
})

test('normal logout continues through push failure and uses SDK local revocation', async () => {
  const calls = []
  const result = await endAdminSession({
    auth: { signOut: async options => { calls.push(options); return { error: null } } },
    unsubscribePush: async () => { calls.push('push'); throw new Error('Unavailable') },
    offline: () => false,
    clearStorage: () => assert.fail('SDK clears normal logout'), disconnect: () => assert.fail('SDK handles normal logout'), onOfflineExit: () => assert.fail('No forced navigation online'),
  })
  assert.deepEqual(calls, ['push', { scope: 'local' }])
  assert.deepEqual(result, { offline: false })
})

test('failed offline logout stops refresh, clears credentials and disconnects before clearing view and memory', async () => {
  const calls = []
  const result = await endAdminSession({
    auth: { signOut: async () => { calls.push('revoke'); return { error: new Error('Network unavailable') } }, stopAutoRefresh: async () => calls.push('stop') },
    unsubscribePush: async () => calls.push('push'), offline: () => true,
    clearStorage: () => calls.push('credentials'), disconnect: async () => calls.push('channels'), onOfflineExit: () => calls.push('reload'),
  })
  assert.deepEqual(calls, ['push', 'revoke', 'stop', 'credentials', 'channels', 'reload'])
  assert.deepEqual(result, { offline: true })
})

test('online authentication errors remain visible and do not pretend server revocation succeeded', async () => {
  await assert.rejects(endAdminSession({ auth: { signOut: async () => ({ error: new Error('Server rejected') }) }, unsubscribePush: async () => {}, offline: () => false, clearStorage: () => assert.fail('No silent cleanup online'), disconnect: () => assert.fail('Keep retry possible'), onOfflineExit: () => assert.fail('No silent reload') }), /Não foi possível encerrar a sessão/)
})

test('offline cleanup also handles thrown transport and channel errors', async () => {
  let cleared = false, reloaded = false
  await endAdminSession({ auth: { signOut: async () => { throw new Error('Network unavailable') }, stopAutoRefresh: async () => { throw new Error('Already stopped') } }, unsubscribePush: async () => {}, offline: () => true, clearStorage: () => { cleared = true }, disconnect: async () => { throw new Error('Already closed') }, onOfflineExit: () => { reloaded = true } })
  assert(cleared && reloaded)
})
