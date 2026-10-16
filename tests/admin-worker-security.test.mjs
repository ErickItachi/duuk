import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'
import { adminShellHeaders } from '../scripts/admin-security.mjs'

const configuration = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'))
const source = await readFile(new URL('../scripts/admin-worker.template.js', import.meta.url), 'utf8')

test('cached PWA document retains deployed CSP and private document protections', async () => {
  const listeners = new Map(), cached = new Map(), assets = []
  const headers = adminShellHeaders(configuration)
  const deployedCsp = configuration.headers.find(rule => rule.source === '/admin/:path*').headers.find(header => header.key === 'Content-Security-Policy').value
  vm.runInNewContext(source, {
    BUILD: 'isolated-security-fixture', SHELL: '<main>DUUK Admin</main>', SHELL_HEADERS: headers, ASSETS: ['/assets/fixture.js'],
    self: { location: { origin: 'https://www.duukfilms.com' }, addEventListener: (event, listener) => listeners.set(event, listener) },
    caches: { open: async () => ({ put: async (path, response) => cached.set(path, response), addAll: async items => assets.push(...items), match: async path => cached.get(path) }) },
    URL, Response, Map, Set,
  })
  let installed
  listeners.get('install')({ waitUntil: promise => { installed = promise } })
  await installed
  const shell = cached.get('/admin-shell.html')
  assert.equal(shell.headers.get('Content-Security-Policy'), deployedCsp)
  assert.equal(shell.headers.get('X-Frame-Options'), 'DENY')
  assert.equal(shell.headers.get('X-Content-Type-Options'), 'nosniff')
  assert.equal(shell.headers.get('Referrer-Policy'), 'no-referrer')
  assert.equal(shell.headers.get('Cache-Control'), 'no-store')
  assert.match(shell.headers.get('Permissions-Policy'), /camera=\(\)/)
  assert.equal(shell.headers.get('X-Robots-Tag'), 'noindex, nofollow')
  assert.deepEqual(assets, ['/assets/fixture.js'])
  let navigated
  listeners.get('fetch')({ request: { url: 'https://www.duukfilms.com/admin/configuracoes/integracoes?code=private-fixture', method: 'GET', mode: 'navigate' }, respondWith: promise => { navigated = promise } })
  assert.equal((await navigated).headers.get('Content-Security-Policy'), deployedCsp)
  assert.equal((await navigated).headers.get('Referrer-Policy'), 'no-referrer')
  assert.equal(await (await navigated).text(), '<main>DUUK Admin</main>')
  assert.deepEqual([...cached.keys()], ['/admin-shell.html'])
})

test('private routes restrict requests to DUUK services while public media retains compatibility', () => {
  const publicCsp = configuration.headers.find(rule => rule.source === '/(.*)').headers.find(header => header.key === 'Content-Security-Policy').value
  assert(!publicCsp.split(';').find(item => item.trim().startsWith('connect-src')).includes(' https: '))
  assert.match(publicCsp, /media-src 'self' blob: https:/)
  for (const route of ['/admin', '/admin/:path*', '/admin/(.*)', '/admin-shell.html', '/assinar/:path*', '/assinar/(.*)']) {
    const csp = configuration.headers.find(rule => rule.source === route).headers.find(header => header.key === 'Content-Security-Policy').value
    const connections = csp.split(';').find(directive => directive.trim().startsWith('connect-src')).trim().split(/\s+/).slice(1)
    assert.deepEqual(connections, ["'self'", 'https://ilohuxhyfqikjlvoarts.supabase.co', 'https://ilohuxhyfqikjlvoarts.storage.supabase.co', 'wss://ilohuxhyfqikjlvoarts.supabase.co'])
    assert.equal(csp.split(';').find(directive => directive.trim().startsWith('script-src ')).trim(), route.startsWith('/admin') ? "script-src 'self' https://sdk.scdn.co/spotify-player.js" : "script-src 'self'")
    if(route.startsWith('/admin'))assert.equal(csp.split(';').find(directive=>directive.trim().startsWith('frame-src')).trim(),"frame-src 'self' https://sdk.scdn.co/embedded/")
  }
  const transport = configuration.headers.find(rule => rule.headers.some(header => header.key === 'Strict-Transport-Security'))
  assert.equal(transport.headers[0].value, 'max-age=31536000')
  assert.equal(transport.has[0].type, 'host')
  const hosts = new RegExp(`^(?:${transport.has[0].value})$`)
  assert(hosts.test('www.duukfilms.com') && hosts.test('duukfilms.com'))
  assert(!hosts.test('preview.vercel.app') && !hosts.test('other.duukfilms.com'))
})

test('private API and document responses remain outside the worker cache', () => {
  const listeners = new Map()
  vm.runInNewContext(source, { BUILD: 'fixture', ASSETS: ['/assets/fixture.js'], self: { location: { origin: 'https://www.duukfilms.com' }, addEventListener: (event, listener) => listeners.set(event, listener) }, URL, Map })
  for (const url of ['https://ilohuxhyfqikjlvoarts.supabase.co/rest/v1/duuk_contracts', 'https://ilohuxhyfqikjlvoarts.supabase.co/storage/v1/object/sign/duuk-documents/private.pdf?token=fixture', 'https://www.duukfilms.com/admin-version.json']) {
    let intercepted = false
    listeners.get('fetch')({ request: { url, method: 'GET', mode: 'cors' }, respondWith: () => { intercepted = true } })
    assert.equal(intercepted, false, url)
  }
})

test('waiting update adds explicit recovery only to legacy cached HTML without activating or clearing assets', async () => {
  const listeners = new Map(), headers = adminShellHeaders(configuration)
  const oldShell = '<html><head><title>DUUK Admin</title></head><body>legacy</body></html>'
  const old = new Map([['/admin-shell.html', new Response(oldShell, { headers })], ['/assets/legacy.js', new Response('legacy code')]])
  const recent = new Map([['/admin-shell.html', new Response('<title>DUUK PAINEL ADMINISTRATIVO</title>')]])
  const current = new Map(), buckets = new Map([['duuk-admin-old', old], ['duuk-admin-2.4', recent], ['unrelated', new Map()], ['duuk-admin-fixture', current]])
  let activated = false, deleted = false
  vm.runInNewContext(source, {
    BUILD: 'fixture', SHELL: '<head>current</head>', SHELL_HEADERS: headers, ASSETS: ['/admin-assets/login-recovery.js'],
    self: { location: { origin: 'https://www.duukfilms.com' }, addEventListener: (event, listener) => listeners.set(event, listener), skipWaiting: () => { activated = true } },
    caches: { keys: async () => [...buckets.keys()], delete: () => { deleted = true }, open: async key => ({ match: async path => buckets.get(key)?.get(path)?.clone(), put: async (path, response) => buckets.get(key).set(path, response), addAll: async () => {} }) },
    URL, Response, Map, Set,
  })
  let installed; listeners.get('install')({ waitUntil: promise => { installed = promise } }); await installed
  const patched = old.get('/admin-shell.html')
  assert.match(await patched.clone().text(), /<script src="\/admin-assets\/login-recovery.js" defer><\/script><\/head>/)
  assert.equal(patched.headers.get('content-security-policy'), headers['content-security-policy'])
  assert.equal(await old.get('/assets/legacy.js').text(), 'legacy code')
  assert.equal(await recent.get('/admin-shell.html').text(), '<title>DUUK PAINEL ADMINISTRATIVO</title>')
  assert.equal(activated, false); assert.equal(deleted, false)
})
