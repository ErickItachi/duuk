import test from 'node:test'
import assert from 'node:assert/strict'
import { adminThemeKey, readAdminTheme, writeAdminTheme } from '../src/admin/themeStorage.mjs'

function memoryStorage() {
  const data = new Map()
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }
}

test('theme preferences are isolated across members and the login page', () => {
  const storage = memoryStorage()
  writeAdminTheme(storage, 'member-a', 'light')
  assert.equal(readAdminTheme(storage, 'member-a'), 'light')
  assert.equal(readAdminTheme(storage, 'member-b'), 'dark')
  assert.equal(readAdminTheme(storage, null), 'dark')
  writeAdminTheme(storage, null, 'light')
  writeAdminTheme(storage, 'member-b', 'light')
  writeAdminTheme(storage, 'member-a', 'dark')
  assert.equal(readAdminTheme(storage, 'member-a'), 'dark')
  assert.equal(readAdminTheme(storage, 'member-b'), 'light')
  assert.equal(readAdminTheme(storage, null), 'light')
})

test('existing members start dark and unknown saved values cannot become a theme', () => {
  const storage = memoryStorage()
  assert.equal(readAdminTheme(storage, 'member-a'), 'dark')
  storage.setItem(adminThemeKey('member-a'), 'unexpected-theme')
  assert.equal(readAdminTheme(storage, 'member-a'), 'dark')
  assert.equal(writeAdminTheme(storage, 'member-a', 'unexpected-theme'), 'dark')
})

test('blocked browser storage does not prevent switching the current tab theme', () => {
  const blocked = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
  assert.equal(readAdminTheme(blocked, 'member-a'), 'dark')
  assert.equal(writeAdminTheme(blocked, 'member-a', 'light'), 'light')
  assert.equal(readAdminTheme(null, 'member-a'), 'dark')
  assert.equal(writeAdminTheme(null, 'member-a', 'light'), 'light')
})
