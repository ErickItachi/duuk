import assert from 'node:assert/strict'
import test from 'node:test'
import { captionLine, dashboardColumns, digestItems, quickActions, socialView } from '../src/office/dashboard/model.js'

const day = '2026-10-14'
const accounts = [
  { id: 'a1', username: 'duukfilms', status: 'active' },
  { id: 'a2', username: 'cliente', status: 'expired' },
  { id: 'a3', username: 'antiga', status: 'disconnected' },
]
const posts = [
  { id: 'p1', account_id: 'a1', format: 'reel', status: 'scheduled', caption: 'Bastidores', scheduled_at: '2026-10-15T13:00:00Z', updated_at: '2026-10-14T10:00:00Z' },
  { id: 'p2', account_id: 'a1', format: 'image', status: 'scheduled', caption: '', scheduled_at: '2026-10-14T21:00:00Z', updated_at: '2026-10-14T10:00:00Z' },
  { id: 'p3', account_id: 'a1', format: 'carousel', status: 'publishing', caption: 'Em envio', scheduled_at: '2026-10-14T12:00:00Z', updated_at: '2026-10-14T12:00:00Z' },
  { id: 'p4', account_id: 'a2', format: 'story', status: 'failed', caption: 'Story', last_error: 'Token expirado.', updated_at: '2026-10-13T10:00:00Z' },
  { id: 'p5', account_id: 'a1', format: 'image', status: 'failed', caption: 'Foto', updated_at: '2026-10-14T09:00:00Z' },
]

test('Social summary orders upcoming posts and counts today in Brasília', () => {
  const view = socialView({ accounts, posts }, day)
  assert.equal(view.connected, 2)
  assert.deepEqual(view.attention.map(account => account.username), ['cliente'])
  assert.deepEqual(view.upcoming.map(post => post.id), ['p3', 'p2', 'p1'])
  assert.equal(view.upcoming[0].account.username, 'duukfilms')
  // 21:00 UTC on the 14th is 18:00 in Brasília, still today; the 15th is not.
  assert.equal(view.today, 2)
  assert.deepEqual(view.failed.map(post => post.id), ['p5', 'p4'])
})

test('Social summary without a connected account stays empty instead of inventing posts', () => {
  const view = socialView({ accounts: [{ id: 'a3', username: 'antiga', status: 'disconnected' }], posts: [] }, day)
  assert.equal(view.connected, 0)
  assert.deepEqual([view.upcoming, view.failed, view.attention], [[], [], []])
  assert.deepEqual(digestItems({ social: view }, day), [])
})

test('Digest names failed posts, accounts to reconnect and posts scheduled today', () => {
  const items = digestItems({ social: socialView({ accounts, posts }, day) }, day)
  assert.deepEqual(items.map(item => [item.key, item.text, item.tone || '']), [
    ['social-failed', '2 publicações com falha', 'danger'],
    ['social-account', 'Instagram precisa ser reconectado', 'danger'],
    ['social-today', '2 publicações agendadas hoje', ''],
  ])
})

test('Social card keeps its place in the dashboard layout and quick actions', () => {
  assert.deepEqual(dashboardColumns(['agenda', 'social', 'site'], 'single').columns, [['agenda', 'social', 'site']])
  const wide = dashboardColumns(['agenda', 'pipeline', 'contracts', 'social'], 'wide')
  assert.equal(wide.kind, 'split')
  assert.ok(wide.columns[1].includes('social'))
  assert.equal(quickActions.find(action => action.id === 'post').permission, 'social')
})

test('Captions collapse whitespace and are shortened for one line', () => {
  assert.equal(captionLine('  Bastidores\n\nda gravação  '), 'Bastidores da gravação')
  assert.equal(captionLine('a'.repeat(80), 10), `${'a'.repeat(10)}…`)
  assert.equal(captionLine(null), '')
})
