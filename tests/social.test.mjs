import test from 'node:test'
import assert from 'node:assert/strict'
import { advancePublication, authorizationUrl, classifyGraphError, createInstagramClient, exchangeCode, InstagramError, longLivedToken, parseSignedRequest, readMetrics, readProfile, shouldRefresh, socialStatePrefix } from '../supabase/functions/_shared/instagram.mjs'
import { captionStats, cropBox, validatePost } from '../supabase/functions/_shared/social-rules.mjs'
import { dailyMaintenance, dispatchDue, finishConnection, publishClaimed, readInsights, startConnection } from '../supabase/functions/_shared/social-worker.mjs'

const now = Date.parse('2026-10-14T15:00:00Z')
const image = { kind: 'image', mime_type: 'image/jpeg', size_bytes: 400000, width: 1080, height: 1350 }
const video = { kind: 'video', mime_type: 'video/mp4', size_bytes: 9000000, width: 1080, height: 1920, duration_ms: 20000 }

// A scripted Graph API: each route answers in order and every call is recorded.
function graph(routes) {
  const calls = []
  const fetch = async (input, init = {}) => {
    const url = new URL(String(input)), method = init.method || 'GET'
    const params = method === 'GET' ? Object.fromEntries(url.searchParams) : Object.fromEntries(new URLSearchParams(String(init.body || '')))
    const key = `${method} ${url.pathname.replace(/^\/v\d+\.\d+/, '')}`
    calls.push({ key, params })
    const route = routes[key]
    if (!route) return new Response(JSON.stringify({ error: { code: 100, message: 'unknown route ' + key } }), { status: 400 })
    const answer = typeof route === 'function' ? route(params, calls) : Array.isArray(route) ? (route.length > 1 ? route.shift() : route[0]) : route
    if (answer instanceof Error) throw answer
    return new Response(JSON.stringify(answer.body ?? answer), { status: answer.status || 200 })
  }
  return { fetch, calls, keys: () => calls.map(call => call.key) }
}

test('Post rules follow the official publishing limits', () => {
  assert.deepEqual(validatePost({ format: 'image', caption: 'Olá #duuk', media: [image] }), [])
  assert.match(validatePost({ format: 'image', media: [] })[0].message, /exatamente 1/)
  assert.match(validatePost({ format: 'carousel', media: [image] })[0].message, /2 a 10/)
  assert.equal(validatePost({ format: 'carousel', media: Array(11).fill(image) }).length, 1)
  assert.match(validatePost({ format: 'reel', media: [image] })[0].message, /somente vídeo/)
  assert.match(validatePost({ format: 'story', caption: 'texto', media: [image] })[0].message, /não aceitam legenda/)
  assert.match(validatePost({ format: 'image', media: [{ ...image, mime_type: 'image/png' }] })[0].message, /JPEG/)
  assert.match(validatePost({ format: 'image', media: [{ ...image, width: 1080, height: 1920 }] })[0].message, /4:5/)
  assert.deepEqual(validatePost({ format: 'story', media: [{ ...image, width: 1080, height: 1920 }] }), [])
  assert.match(validatePost({ format: 'reel', media: [{ ...video, duration_ms: 1000 }] })[0].message, /3 segundos/)
  assert.match(validatePost({ format: 'reel', media: [{ ...video, alt_text: 'capa' }] })[0].message, /somente para imagens/)
  assert.match(validatePost({ format: 'image', caption: Array.from({ length: 31 }, (_, i) => `#t${i}`).join(' '), media: [image] })[0].message, /30 hashtags/)
  assert.match(validatePost({ format: 'image', caption: 'x'.repeat(2201), media: [image] })[0].message, /2200/)
  assert.match(validatePost({ format: 'image', media: [image], schedule: true, scheduledAt: new Date(now + 30000).toISOString(), now })[0].message, /1 minuto/)
  assert.deepEqual(validatePost({ format: 'image', media: [image], schedule: true, scheduledAt: new Date(now + 3600000).toISOString(), now }), [])
  assert.match(validatePost({ format: 'gif', media: [image] })[0].message, /formato/)
})

test('Caption counts ignore e-mails and repeated symbols', () => {
  assert.deepEqual(captionStats('Fale com contato@duuk.com.br @duukfilms #filme #filme2 a#b'), { length: 58, hashtags: 2, mentions: 1 })
  assert.equal(captionStats('🎬🎬').length, 2)
})

test('Crop boxes keep the ratio inside the image', () => {
  assert.deepEqual(cropBox(1080, 1920, 4 / 5), { x: 0, y: 285, width: 1080, height: 1350 })
  assert.deepEqual(cropBox(4000, 1000, 1.91), { x: 1045, y: 0, width: 1910, height: 1000 })
  assert.equal(cropBox(0, 10, 1), null)
})

test('Graph errors become safe Portuguese messages', () => {
  const auth = classifyGraphError({ error: { code: 190, message: 'Error validating access token: secret details' } })
  assert.equal(auth.kind, 'auth'); assert.doesNotMatch(auth.message, /secret/)
  assert.equal(classifyGraphError({ error: { code: 9, error_subcode: 2207042 } }).status, 429)
  assert.equal(classifyGraphError({ error: { code: 9007 } }).kind, 'pending')
  assert.equal(classifyGraphError({ error: { code: 4 } }).retriable, true)
  assert.equal(classifyGraphError({ error: { code: 10 } }).kind, 'permission')
  assert.equal(classifyGraphError({}, 503).kind, 'transient')
})

test('Client keeps the token out of logs and URLs only where Meta requires it', async () => {
  const api = graph({ 'GET /me': { user_id: '178', id: '991', username: 'duukfilms', followers_count: 10 }, 'POST /me/media': { id: '555' } })
  const client = createInstagramClient({ token: 'TOKEN', fetch: api.fetch })
  await client.get('me', { fields: 'user_id' })
  await client.post('me/media', { image_url: 'https://x/y.jpg' })
  assert.equal(api.calls[0].params.access_token, 'TOKEN')
  assert.equal(api.calls[1].params.access_token, 'TOKEN')
  assert.throws(() => createInstagramClient({ token: '' }), InstagramError)
  const offline = createInstagramClient({ token: 'T', fetch: async () => { throw new TypeError('network') } })
  await assert.rejects(offline.get('me'), error => error.kind === 'transient' && error.retriable)
})

test('OAuth uses the official Instagram Login endpoints and scopes', async () => {
  const url = new URL(authorizationUrl({ appId: '123456', state: socialStatePrefix + 'abc' }))
  assert.equal(url.origin + url.pathname, 'https://www.instagram.com/oauth/authorize')
  assert.equal(url.searchParams.get('redirect_uri'), 'https://www.duukfilms.com/admin/social/conexao')
  assert.equal(url.searchParams.get('scope'), 'instagram_business_basic,instagram_business_content_publish,instagram_business_manage_insights')
  assert.equal(url.searchParams.get('response_type'), 'code')
  let sent
  const fetch = async (input, init) => { sent = { input: String(input), body: Object.fromEntries(new URLSearchParams(String(init.body))) }; return new Response(JSON.stringify({ data: [{ access_token: 'SHORT', user_id: 991, permissions: 'instagram_business_basic,instagram_business_content_publish' }] })) }
  const short = await exchangeCode({ appId: '123456', appSecret: 'S', code: 'abc#_', fetch })
  assert.equal(sent.input, 'https://api.instagram.com/oauth/access_token'); assert.equal(sent.body.code, 'abc')
  assert.deepEqual(short, { token: 'SHORT', userId: '991', permissions: ['instagram_business_basic', 'instagram_business_content_publish'] })
  await assert.rejects(exchangeCode({ appId: '1', appSecret: 'S', code: 'x', fetch: async () => new Response(JSON.stringify({ error_type: 'OAuthException', error_message: 'used' }), { status: 400 }) }), /recusou o código/)
  const long = await longLivedToken({ appSecret: 'S', token: 'SHORT', fetch: async input => { assert.match(String(input), /grant_type=ig_exchange_token/); return new Response(JSON.stringify({ access_token: 'LONG', expires_in: 5183944 })) } })
  assert.deepEqual(long, { token: 'LONG', expiresIn: 5183944 })
})

test('Token refresh waits 24 hours and renews before expiring', () => {
  const day = 86400000
  assert.equal(shouldRefresh({ issuedAt: new Date(now - 3600000), expiresAt: new Date(now + 59 * day), now }), false)
  assert.equal(shouldRefresh({ issuedAt: new Date(now - 8 * day), expiresAt: new Date(now + 52 * day), now }), true)
  assert.equal(shouldRefresh({ issuedAt: new Date(now - 2 * day), expiresAt: new Date(now + 10 * day), now }), true)
  assert.equal(shouldRefresh({ issuedAt: new Date(now - 30 * day), expiresAt: new Date(now - 1), now }), false)
})

test('Profile reading rejects incomplete answers and unsafe URLs', async () => {
  const ok = await readProfile({ get: async () => ({ user_id: '178', id: '991', username: 'duukfilms', profile_picture_url: 'http://insecure', followers_count: -1, media_count: 12 }) })
  assert.equal(ok.ig_user_id, '178'); assert.equal(ok.app_scoped_id, '991'); assert.equal(ok.profile_picture_url, null); assert.equal(ok.followers_count, null); assert.equal(ok.media_count, 12)
  await assert.rejects(readProfile({ get: async () => ({ id: 'x' }) }), InstagramError)
})

test('Missing metrics stay unavailable instead of zero', () => {
  assert.deepEqual(readMetrics({ data: [{ name: 'reach', total_value: { value: 120 } }, { name: 'likes', values: [{ value: 2 }, { value: 3 }] }] }, ['reach', 'likes', 'shares']), { reach: 120, likes: 5, shares: null })
})

async function sign(payload, secret) {
  const encode = value => Buffer.from(value).toString('base64url')
  const body = encode(JSON.stringify(payload))
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return encode(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)))) + '.' + body
}

test('Meta callbacks need a valid signature', async () => {
  const request = await sign({ algorithm: 'HMAC-SHA256', user_id: '991', issued_at: 1 }, 'app-secret')
  assert.deepEqual(await parseSignedRequest(request, 'app-secret'), { userId: '991', issuedAt: 1 })
  await assert.rejects(parseSignedRequest(request, 'other-secret'), /inválida/)
  await assert.rejects(parseSignedRequest('x.y', 'app-secret'), InstagramError)
  await assert.rejects(parseSignedRequest(await sign({ algorithm: 'none', user_id: '991' }, 'app-secret'), 'app-secret'), InstagramError)
})

function publication(routes) {
  const api = graph(routes), saves = []
  const save = async (patch, items = []) => { saves.push({ patch, items }) }
  return { api, saves, client: createInstagramClient({ token: 'T', fetch: api.fetch }), save }
}
const noSleep = async () => {}

test('A photo is created, checked and published once, saving the attempt first', async () => {
  const run = publication({
    'GET /me/content_publishing_limit': { data: [{ quota_usage: 3, config: { quota_total: 100, quota_duration: 86400 } }] },
    'POST /me/media': { id: '700' }, 'GET /700': { status_code: 'FINISHED' },
    'POST /me/media_publish': { id: '900' }, 'GET /900': { permalink: 'https://www.instagram.com/p/abc/', timestamp: '2026-10-14T15:00:05+0000' },
  })
  const result = await advancePublication({ post: { format: 'image', caption: 'Olá' }, items: [{ position: 0, kind: 'image', alt_text: 'Equipe' }], client: run.client, mediaUrl: async () => 'https://files/x.jpg', save: run.save, now, sleep: noSleep })
  assert.equal(result.outcome, 'published'); assert.equal(result.patch.ig_media_id, '900'); assert.equal(result.patch.permalink, 'https://www.instagram.com/p/abc/')
  assert.deepEqual(run.api.calls.find(call => call.key === 'POST /me/media').params, { image_url: 'https://files/x.jpg', caption: 'Olá', alt_text: 'Equipe', access_token: 'T' })
  const attemptSaved = run.saves.findIndex(entry => entry.patch.publish_attempted_at)
  assert.ok(attemptSaved > run.saves.findIndex(entry => entry.patch.ig_container_id))
  assert.equal(run.api.keys().filter(key => key === 'POST /me/media_publish').length, 1)
})

test('A lost publish answer is reconciled, never published twice', async () => {
  const run = publication({ 'GET /700': { status_code: 'PUBLISHED' }, 'GET /me/media': { data: [{ id: '901', caption: 'Olá', timestamp: '2026-10-14T14:59:00+0000', permalink: 'https://www.instagram.com/p/x/' }] } })
  const result = await advancePublication({ post: { format: 'image', caption: 'Olá', ig_container_id: '700', publish_attempted_at: new Date(now - 60000).toISOString(), processing_started_at: new Date(now - 60000).toISOString() }, items: [{ position: 0, kind: 'image' }], client: run.client, mediaUrl: async () => 'u', save: run.save, now, sleep: noSleep })
  assert.equal(result.outcome, 'published'); assert.equal(result.patch.ig_media_id, '901')
  assert.ok(!run.api.keys().includes('POST /me/media_publish'))
})

test('Carousels create every child before the parent and videos wait for processing', async () => {
  let child = 0
  const run = publication({
    'GET /me/content_publishing_limit': { data: [{ quota_usage: 0, config: { quota_total: 100 } }] },
    'POST /me/media': params => ({ id: params.media_type === 'CAROUSEL' ? '800' : String(701 + child++) }),
    'GET /701': { status_code: 'FINISHED' }, 'GET /702': { status_code: 'IN_PROGRESS' },
  })
  const items = [{ position: 0, kind: 'image' }, { position: 1, kind: 'video' }]
  const result = await advancePublication({ post: { format: 'carousel', caption: '' }, items, client: run.client, mediaUrl: async item => `https://files/${item.position}`, save: run.save, now, sleep: noSleep })
  assert.equal(result.outcome, 'waiting'); assert.equal(result.patch.next_attempt_at, new Date(now + 60000).toISOString())
  assert.deepEqual(run.api.calls.filter(call => call.key === 'POST /me/media').map(call => call.params.is_carousel_item), ['true', 'true'])
  assert.deepEqual(run.saves.flatMap(entry => entry.items.map(item => item.ig_container_id)), ['701', '702'])
})

test('Quota, retries and timeouts end in clear states', async () => {
  const full = publication({ 'GET /me/content_publishing_limit': { data: [{ quota_usage: 100, config: { quota_total: 100, quota_duration: 86400 } }] } })
  const limited = await advancePublication({ post: { format: 'image' }, items: [{ position: 0, kind: 'image' }], client: full.client, mediaUrl: async () => 'u', save: full.save, now, sleep: noSleep })
  assert.equal(limited.outcome, 'failed'); assert.match(limited.patch.last_error, /limite de 100/)
  const flaky = publication({ 'GET /me/content_publishing_limit': { data: [] }, 'POST /me/media': { status: 500, body: { error: { code: 2, is_transient: true } } } })
  const retry = await advancePublication({ post: { format: 'image', attempts: 0 }, items: [{ position: 0, kind: 'image' }], client: flaky.client, mediaUrl: async () => 'u', save: flaky.save, now, sleep: noSleep })
  assert.equal(retry.outcome, 'retry'); assert.equal(retry.patch.attempts, 1)
  const exhausted = await advancePublication({ post: { format: 'image', attempts: 3 }, items: [{ position: 0, kind: 'image' }], client: flaky.client, mediaUrl: async () => 'u', save: flaky.save, now, sleep: noSleep })
  assert.equal(exhausted.outcome, 'failed')
  const slow = publication({})
  const timeout = await advancePublication({ post: { format: 'reel', processing_started_at: new Date(now - 31 * 60000).toISOString(), ig_container_id: '7' }, items: [{ position: 0, kind: 'video' }], client: slow.client, mediaUrl: async () => 'u', save: slow.save, now, sleep: noSleep })
  assert.equal(timeout.outcome, 'failed'); assert.equal(timeout.patch.last_error_code, 'timeout'); assert.equal(slow.api.calls.length, 0)
})

// A recorded stand-in for the duuk_social_backend RPC.
function fakeBackend(answers = {}) {
  const calls = []
  const backend = async (operation, payload) => {
    calls.push({ operation, payload })
    const answer = answers[operation]
    if (answer instanceof Error) throw answer
    return typeof answer === 'function' ? answer(payload) : answer ?? { ok: true }
  }
  return { backend, calls, ops: () => calls.map(call => call.operation) }
}
const claimed = { id: 'p1', lease_token: 'l1', account_id: 'a1', format: 'image', caption: 'Olá', publish_requested_by: 'u1', media: [{ position: 0, media_id: 'm1', storage_path: 'u1/f.jpg', ...image }] }

test('The worker refuses to publish when the requester lost access', async () => {
  const db = fakeBackend({ actor_ok: false, progress: payload => ({ id: 'p1', ...payload.patch }) })
  const api = graph({})
  const result = await publishClaimed({ post: claimed, backend: db.backend, fetch: api.fetch, mediaUrl: async () => 'u', now })
  assert.equal(result.outcome, 'failed'); assert.equal(api.calls.length, 0)
  const progress = db.calls.find(call => call.operation === 'progress').payload
  assert.equal(progress.release, true); assert.equal(progress.notify, true); assert.equal(progress.lease_token, 'l1'); assert.match(progress.patch.last_error, /não tem mais acesso/)
})

test('The worker checks the account and the media before calling Instagram', async () => {
  const inactive = fakeBackend({ actor_ok: true, token: { status: 'expired', username: 'duuk' }, progress: p => p.patch })
  assert.equal((await publishClaimed({ post: claimed, backend: inactive.backend, fetch: graph({}).fetch, mediaUrl: async () => 'u', now })).post.last_error_code, 'account')
  const client = fakeBackend({ actor_ok: true, token: { status: 'active', token: 'T', owner_kind: 'client' }, settings: { access_level: 'standard' }, progress: p => p.patch })
  assert.equal((await publishClaimed({ post: claimed, backend: client.backend, fetch: graph({}).fetch, mediaUrl: async () => 'u', now })).post.last_error_code, 'access')
  const removed = fakeBackend({ actor_ok: true, token: { status: 'active', token: 'T' }, progress: p => p.patch })
  assert.equal((await publishClaimed({ post: { ...claimed, media: [{ position: 0, media_id: null }] }, backend: removed.backend, fetch: graph({}).fetch, mediaUrl: async () => 'u', now })).post.last_error_code, 'media')
  const invalid = fakeBackend({ actor_ok: true, token: { status: 'active', token: 'T' }, progress: p => p.patch })
  assert.equal((await publishClaimed({ post: { ...claimed, format: 'story' }, backend: invalid.backend, fetch: graph({}).fetch, mediaUrl: async () => 'u', now })).post.last_error_code, 'validation')
})

test('Scheduled posts publish through the lease and notify the requester', async () => {
  const db = fakeBackend({ claim_due: [claimed], actor_ok: true, token: { status: 'active', token: 'T', owner_kind: 'duuk' }, progress: p => ({ id: 'p1', ...p.patch }) })
  const api = graph({
    'GET /me/content_publishing_limit': { data: [] }, 'POST /me/media': { id: '700' }, 'GET /700': { status_code: 'FINISHED' },
    'POST /me/media_publish': { id: '900' }, 'GET /900': { permalink: 'https://www.instagram.com/p/a/' },
  })
  const result = await dispatchDue({ backend: db.backend, fetch: api.fetch, mediaUrl: async path => `https://signed/${path}`, now: () => now, sleep: noSleep })
  assert.deepEqual(result, { processed: 1, outcomes: ['published'] })
  const final = db.calls.filter(call => call.operation === 'progress').at(-1).payload
  assert.equal(final.release, true); assert.equal(final.notify, true); assert.equal(final.patch.status, 'published'); assert.equal(final.event.kind, 'published')
  assert.equal(api.calls.find(call => call.key === 'POST /me/media').params.image_url, 'https://signed/u1/f.jpg')
})

test('An expired authorization marks the account for reconnection', async () => {
  const db = fakeBackend({ actor_ok: true, token: { status: 'active', token: 'T' }, progress: p => p.patch })
  const api = graph({ 'GET /me/content_publishing_limit': { data: [] }, 'POST /me/media': { status: 400, body: { error: { code: 190, type: 'OAuthException', message: 'token expired' } } } })
  const result = await publishClaimed({ post: claimed, backend: db.backend, fetch: api.fetch, mediaUrl: async () => 'u', now, sleep: noSleep })
  assert.equal(result.outcome, 'failed')
  assert.deepEqual(db.calls.find(call => call.operation === 'account_problem').payload.status, 'expired')
})

test('Daily maintenance refreshes old tokens and records the profile', async () => {
  const day = 86400000
  const db = fakeBackend({ active_accounts: [{ account_id: 'a1' }, { account_id: 'a2' }], token: p => p.account_id === 'a1' ? { status: 'active', token: 'OLD', issued_at: new Date(now - 8 * day).toISOString(), expires_at: new Date(now + 52 * day).toISOString() } : { status: 'active', token: 'BAD', issued_at: new Date(now - 2 * day).toISOString(), expires_at: new Date(now + 58 * day).toISOString() } })
  const api = graph({
    'GET /refresh_access_token': { access_token: 'NEW', expires_in: 5184000 },
    'GET /me': params => params.access_token === 'BAD' ? { status: 400, body: { error: { code: 190, message: 'revoked' } } } : { user_id: '178', username: 'duukfilms', followers_count: 1200 },
  })
  const summary = await dailyMaintenance({ backend: db.backend, fetch: api.fetch, now })
  assert.deepEqual(summary, { checked: 2, refreshed: 1, problems: 1 })
  assert.equal(db.calls.find(call => call.operation === 'token_update').payload.token, 'NEW')
  assert.equal(db.calls.find(call => call.operation === 'account_update').payload.followers_count, 1200)
  assert.equal(db.calls.find(call => call.operation === 'account_problem').payload.account_id, 'a2')
})

test('Connection state is single use, hashed and tied to the server flow', async () => {
  const hash = async value => 'h:' + value
  const start = fakeBackend({ oauth_start: { app_id: '123456' } })
  const { url } = await startConnection({ backend: start.backend, userId: 'u1', hash })
  const state = new URL(url).searchParams.get('state')
  assert.ok(state.startsWith(socialStatePrefix) && state.length > 60)
  assert.equal(start.calls[0].payload.state_hash, 'h:' + state); assert.ok(!JSON.stringify(start.calls).includes('"' + state + '"'))
  await assert.rejects(finishConnection({ backend: start.backend, fetch: graph({}).fetch, userId: 'u1', code: 'abcdefgh', state: 'other', hash }), /incompleta/)
  const db = fakeBackend({ oauth_consume: { owner_kind: 'duuk', client_id: null }, settings: { configured: true, app_id: '123456', app_secret: 'SECRET' }, connect: p => ({ id: 'a1', username: p.username }) })
  const fetch = async input => {
    const url = String(input)
    if (url.startsWith('https://api.instagram.com/oauth/access_token')) return new Response(JSON.stringify({ data: [{ access_token: 'SHORT', user_id: '991', permissions: 'instagram_business_basic' }] }))
    if (url.includes('/access_token?')) return new Response(JSON.stringify({ access_token: 'LONG', expires_in: 5184000 }))
    return new Response(JSON.stringify({ user_id: '178', id: '991', username: 'duukfilms' }))
  }
  const account = await finishConnection({ backend: db.backend, fetch, userId: 'u1', code: 'abcdefgh#_', state, hash, now })
  assert.deepEqual(account, { id: 'a1', username: 'duukfilms' })
  assert.deepEqual(db.ops(), ['oauth_consume', 'settings', 'connect'])
  const connect = db.calls[2].payload
  assert.equal(connect.token, 'LONG'); assert.equal(connect.ig_user_id, '178'); assert.equal(connect.expires_at, new Date(now + 5184000000).toISOString())
})

test('Insights use the cache and keep unavailable metrics empty', async () => {
  const store = new Map()
  const db = fakeBackend({ token: { status: 'active', token: 'T' }, cache_get: p => store.get(p.scope + p.key) || null, cache_put: p => { store.set(p.scope + p.key, p.value); return { saved: true } } })
  const api = graph({
    'GET /me/insights': params => params.metric.includes(',') ? { status: 400, body: { error: { code: 100 } } } : params.metric === 'reach' ? { data: [{ name: 'reach', total_value: { value: 50 } }] } : { status: 400, body: { error: { code: 100 } } },
    'GET /me/media': { data: [{ id: '31', media_product_type: 'FEED', timestamp: '2026-10-10T10:00:00+0000' }] },
    'GET /31/insights': { data: [{ name: 'reach', values: [{ value: 9 }] }] },
  })
  const first = await readInsights({ backend: db.backend, fetch: api.fetch, accountId: 'a1', days: 14, now })
  assert.equal(first.days, 14); assert.equal(first.account.reach, 50); assert.equal(first.account.views, null)
  assert.equal(first.media[0].metrics.reach, 9); assert.equal(first.media[0].metrics.likes, null)
  const calls = api.calls.length
  const again = await readInsights({ backend: db.backend, fetch: api.fetch, accountId: 'a1', days: 14, now })
  assert.equal(api.calls.length, calls); assert.equal(again.account.reach, 50)
  assert.equal((await readInsights({ backend: db.backend, fetch: api.fetch, accountId: 'a1', days: 999, now })).days, 7)
})
