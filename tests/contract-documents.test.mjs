import test from 'node:test'
import assert from 'node:assert/strict'
import { prepareContractDownload, privateContractUrl, signingDateTime } from '../src/office/contractDocuments.js'

const origin = 'https://project.supabase.co'
const privateUrl = `${origin}/storage/v1/object/sign/duuk-documents/signed/fixture.pdf?token=private-fixture`

test('PDF privado: preserva token e solicita attachment nativo sem aceitar origem, bucket ou protocolo externos', () => {
  const url = new URL(privateContractUrl(privateUrl, origin, 'duuk-assinado-fixture.pdf'))
  assert.equal(url.searchParams.get('token'), 'private-fixture')
  assert.equal(url.searchParams.get('download'), 'duuk-assinado-fixture.pdf')
  for (const value of [privateUrl.replace('project.supabase.co', 'evil.test'), privateUrl.replace('/sign/', '/public/'), privateUrl.replace('duuk-documents', 'duuk-media'), privateUrl.replace('https:', 'http:'), privateUrl.replace('project.supabase.co', 'user:secret@project.supabase.co'), privateUrl.split('?')[0], `${privateUrl}#private`, 'javascript:alert(1)']) assert.equal(privateContractUrl(value, origin), '')
  for (const filename of ['../contract.pdf', 'duuk\r\n.pdf', 'duuk.html', '']) if (filename) assert.equal(privateContractUrl(privateUrl, origin, filename), '')
})

function browserFixture({ blocked = false } = {}) {
  const calls = [], destination = {
    closed: false, opener: {}, document: { title: '', createElement: () => ({}), head: { append: meta => calls.push(['referrer', meta.content]) }, body: {} },
    location: { replace: url => calls.push(['navigate', url]) },
    close() { this.closed = true; calls.push(['close']) },
  }
  const browser = { open: (...args) => { calls.push(['open', ...args]); return blocked ? null : destination }, location: { assign: url => calls.push(['fallback', url]) } }
  return { browser, calls, destination }
}

test('download: reserva janela no toque, remove opener e referrer antes de aguardar autorização', async () => {
  const fixture = browserFixture(), download = prepareContractDownload(fixture.browser)
  assert.deepEqual(fixture.calls, [['open', '', '_blank'], ['referrer', 'no-referrer']])
  assert.equal(fixture.destination.opener, null)
  await Promise.resolve()
  download.complete(privateUrl, origin, 'duuk-assinado-fixture.pdf')
  assert.equal(fixture.calls.at(-1)[0], 'navigate')
  assert(new URL(fixture.calls.at(-1)[1]).searchParams.has('download'))
  download.cancel()
  assert.equal(fixture.destination.closed, false)
})

test('download: rejeição fecha janela e popup bloqueado prepara outro toque sem abandonar formulário', () => {
  const rejected = browserFixture(), download = prepareContractDownload(rejected.browser)
  assert.throws(() => download.complete('https://evil.test/private.pdf', origin, 'duuk.pdf'), /acesso seguro/)
  download.cancel()
  assert.equal(rejected.destination.closed, true)
  assert(!rejected.calls.some(([action]) => action === 'navigate'))
  const blocked = browserFixture({ blocked: true })
  const ready = prepareContractDownload(blocked.browser).complete(privateUrl, origin, 'duuk.pdf')
  assert.equal(new URL(ready).searchParams.get('download'), 'duuk.pdf')
  assert.deepEqual(blocked.calls, [['open', '', '_blank']])
})

test('aceite: datas incluem hora de Brasília e preservam a virada do dia UTC', () => {
  assert.equal(signingDateTime('2026-10-15T01:02:00Z'), '14/10/2026, 22:02 (horário de Brasília)')
  assert.equal(signingDateTime(null), '—')
  assert.equal(signingDateTime('invalid'), '—')
})
