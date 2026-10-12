import test from 'node:test'
import assert from 'node:assert/strict'
import { hasSeenRelease, markReleaseSeen, releaseSeenKey } from '../src/admin/releaseSeen.mjs'

test('release dismissal is isolated by account and version and survives module reload', async () => {
  const data = new Map()
  const storage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) }
  markReleaseSeen(storage, 'reader-a', '1.9.2')
  assert.equal(hasSeenRelease(storage, 'reader-a', '1.9.2'), true)
  assert.equal(hasSeenRelease(storage, 'reader-b', '1.9.2'), false)
  assert.equal(hasSeenRelease(storage, 'reader-a', '1.9.3'), false)
  const fresh = await import('../src/admin/releaseSeen.mjs?reload')
  assert.equal(fresh.hasSeenRelease(storage, 'reader-a', '1.9.2'), true)
  assert.equal(data.get(releaseSeenKey('reader-a', '1.9.2')), '1')
})

test('blocked or absent storage never prevents closing release notes', () => {
  const blocked = { getItem() { throw new Error('blocked') }, setItem() { throw new Error('blocked') } }
  assert.equal(hasSeenRelease(blocked, 'blocked-reader', '1.9.2'), false)
  assert.doesNotThrow(() => markReleaseSeen(blocked, 'blocked-reader', '1.9.2'))
  assert.equal(hasSeenRelease(blocked, 'blocked-reader', '1.9.2'), true)
  markReleaseSeen(null, 'memory-reader', '1.9.2')
  assert.equal(hasSeenRelease(null, 'memory-reader', '1.9.2'), true)
})
