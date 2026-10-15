import test from 'node:test'
import assert from 'node:assert/strict'
import { claimNotificationSound, createNotificationChime, notificationArrivals, soundEnabled, soundPreferenceKey } from '../src/admin/notification-sound.mjs'

const now = Date.parse('2026-10-15T15:00:00Z')
const row = (id, age = 0, read_at = null) => ({ id, created_at: new Date(now - age).toISOString(), read_at })
const storage = () => { const values = new Map(); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), values } }

test('a primeira carga e recargas não tocam o histórico', () => {
  const first = notificationArrivals(null, [row('old')], now)
  assert.equal(first.fresh.length, 0)
  assert.equal(notificationArrivals(first.seen, [row('old')], now).fresh.length, 0)
})
test('som considera somente itens novos, não lidos e recentes', () => {
  const first = new Set(['known'])
  const result = notificationArrivals(first, [row('known'), row('new', 5000), row('stale', 31000), row('read', 0, 'read'), row('future', -6000), { id: 'bad', created_at: 'invalid' }], now)
  assert.deepEqual(result.fresh.map(item => item.id), ['new'])
  assert.equal(notificationArrivals(result.seen, [row('read')], now).fresh.length, 0)
})
test('duas abas compartilham deduplicação e agrupam uma rajada num toque', () => {
  const device = storage()
  assert.equal(claimNotificationSound(device, 'one', ['a','b'], now), true)
  assert.equal(claimNotificationSound(device, 'one', ['a','b'], now + 10), false)
  assert.equal(claimNotificationSound(device, 'one', ['c'], now + 100), false)
  assert.equal(claimNotificationSound(device, 'one', ['c'], now + 3000), false)
  assert.equal(claimNotificationSound(device, 'one', ['d'], now + 3000), true)
  assert.equal(claimNotificationSound(device, 'other', ['a'], now + 3000), true)
  const saved = [...device.values.values()].map(JSON.parse)
  assert(saved.every(value => Object.keys(value).every(key => ['ids','at'].includes(key))))
})
test('preferência é local e por usuário; armazenamento bloqueado não quebra o app', () => {
  const device = storage()
  assert.equal(soundEnabled(device, 'one'), true)
  device.setItem(soundPreferenceKey('one'), 'off')
  assert.equal(soundEnabled(device, 'one'), false)
  assert.equal(soundEnabled(device, 'other'), true)
  const blocked = { getItem() { throw Error() }, setItem() { throw Error() } }
  assert.equal(soundEnabled(blocked, 'one'), true)
  assert.equal(claimNotificationSound(blocked, 'one', ['a'], now), true)
  for (let i=0; i<150; i++) claimNotificationSound(device, 'one', [`id-${i}`], now+i*3000)
  const state = JSON.parse([...device.values.entries()].find(([key]) => key.startsWith('duuk-notification-chime:'))[1])
  assert.equal(state.ids.length, 100)
})
test('áudio só toca após liberar o contexto e falhas não vazam para a notificação', async () => {
  const events = []
  class AudioContext {
    state = 'suspended'; currentTime = 10; destination = {}
    async resume() { this.state='running' }
    async close() { events.push('closed') }
    createOscillator() { return { frequency: {}, connect() {}, disconnect() {}, start(time) { events.push(['start',time]) }, stop(time) { events.push(['stop',time]) } } }
    createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} } }
  }
  const audio = createNotificationChime(AudioContext)
  assert.equal(audio.play(), false)
  assert.equal(await audio.unlock(), true)
  assert.equal(audio.play(), true)
  assert.equal(events.filter(e => e[0]==='start').length, 2)
  assert(events.filter(e => e[0]==='stop').every(e => e[1] < 10.5))
  audio.close(); assert.equal(audio.play(), false)
  const unsupported = createNotificationChime(null)
  assert.equal(await unsupported.unlock(), false)
  assert.equal(unsupported.play(), false)
  const denied = createNotificationChime(class { constructor() { throw Error('blocked') } })
  assert.equal(await denied.unlock(), false)
})
