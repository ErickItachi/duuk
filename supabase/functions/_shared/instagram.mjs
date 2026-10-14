// Instagram API with Instagram Login (official Graph API at graph.instagram.com).
// No scraping, no session cookies, no passwords: only OAuth tokens issued by Meta.
// Pure ESM so the Edge Function (Deno) and the Node tests share the same code.

export const graphVersion = 'v23.0'
export const graphHost = 'https://graph.instagram.com'
export const socialScopes = Object.freeze(['instagram_business_basic', 'instagram_business_content_publish', 'instagram_business_manage_insights'])
export const socialRedirect = 'https://www.duukfilms.com/admin/social/conexao'
export const socialStatePrefix = 'duuk-ig.'
const profileFields = 'user_id,username,name,account_type,profile_picture_url,followers_count,follows_count,media_count'

export class InstagramError extends Error {
  constructor(message, { status = 502, code = null, subcode = null, kind = 'transient', retriable = false } = {}) {
    super(message)
    this.name = 'InstagramError'
    this.status = status
    this.code = code
    this.subcode = subcode
    this.kind = kind
    this.retriable = retriable
  }
}

// Messages for the publishing error subcodes documented by Meta. Anything else keeps a generic text;
// the raw Meta message is never shown because it may echo request details.
const publishErrors = {
  2207001: ['O Instagram teve um erro temporário ao processar a mídia.', 'transient', true],
  2207003: ['O Instagram demorou para baixar a mídia.', 'transient', true],
  2207004: ['A imagem passa de 8 MB.', 'media', false],
  2207005: ['Formato de imagem não aceito. Use JPEG.', 'media', false],
  2207006: ['A mídia não foi encontrada pelo Instagram.', 'media', false],
  2207008: ['O contêiner da mídia expirou. Ele será recriado.', 'expired', true],
  2207009: ['Proporção da imagem fora do intervalo aceito (4:5 a 1,91:1).', 'media', false],
  2207010: ['A legenda passa do limite do Instagram (2.200 caracteres, 30 hashtags ou 20 menções).', 'media', false],
  2207020: ['A mídia expirou antes da publicação. Ela será enviada novamente.', 'expired', true],
  2207023: ['Tipo de mídia não reconhecido pelo Instagram.', 'media', false],
  2207026: ['Formato de vídeo não aceito. Use MP4 ou MOV com H.264/HEVC e áudio AAC.', 'media', false],
  2207027: ['A mídia ainda não está pronta no Instagram.', 'pending', true],
  2207028: ['O carrossel precisa de 2 a 10 itens válidos.', 'media', false],
  2207032: ['O Instagram não conseguiu criar a mídia agora.', 'transient', true],
  2207042: ['A conta atingiu o limite de publicações pela API nas últimas 24 horas.', 'limit', false],
  2207050: ['A conta do Instagram está restrita ou inativa. Confira o aplicativo do Instagram.', 'account', false],
  2207051: ['O Instagram bloqueou esta ação por suspeita de spam ou restrição da conta.', 'account', false],
  2207052: ['O Instagram não conseguiu baixar a mídia do DUUK. Tente novamente.', 'transient', true],
  2207053: ['O Instagram teve um erro desconhecido ao enviar a mídia.', 'transient', true],
  2207057: ['O ponto escolhido para a capa do vídeo é inválido.', 'media', false],
}

export function classifyGraphError(payload, httpStatus = 500) {
  const error = payload?.error || {}
  const code = Number(error.code) || null, subcode = Number(error.error_subcode) || null
  if (subcode && publishErrors[subcode]) {
    const [message, kind, retriable] = publishErrors[subcode]
    return new InstagramError(message, { status: kind === 'limit' ? 429 : 422, code, subcode, kind, retriable })
  }
  if (code === 190 || code === 102 || error.type === 'OAuthException' && /token/i.test(String(error.message || ''))) return new InstagramError('A autorização do Instagram expirou ou foi revogada. Reconecte a conta.', { status: 401, code, subcode, kind: 'auth' })
  if (code === 10 || (code >= 200 && code <= 299)) return new InstagramError('A conta não concedeu a permissão necessária a esta ação. Reconecte e aceite todas as permissões.', { status: 403, code, subcode, kind: 'permission' })
  if ([4, 17, 32, 613].includes(code)) return new InstagramError('O Instagram limitou as consultas por agora. Tente novamente mais tarde.', { status: 429, code, subcode, kind: 'rate', retriable: true })
  if (code === 9007 || code === 9004) return new InstagramError('A mídia ainda não está pronta no Instagram.', { status: 409, code, subcode, kind: 'pending', retriable: true })
  if (code === 1 || code === 2 || error.is_transient === true || httpStatus >= 500) return new InstagramError('O Instagram está instável no momento. Tente novamente em alguns minutos.', { status: 503, code, subcode, kind: 'transient', retriable: true })
  if (code === 100) return new InstagramError('O Instagram recusou um dos dados enviados.', { status: 422, code, subcode, kind: 'invalid' })
  return new InstagramError('O Instagram recusou a solicitação.', { status: 502, code, subcode, kind: 'invalid' })
}

async function readResponse(response) {
  const body = await response.text()
  try { return body ? JSON.parse(body) : {} } catch { return { error: { message: 'invalid_json' } } }
}

function form(params) {
  const body = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== null && value !== '') body.set(key, String(value))
  return body
}

export function createInstagramClient({ token, fetch = globalThis.fetch, version = graphVersion, timeoutMs = 25000 }) {
  if (!token) throw new InstagramError('Conta do Instagram sem autorização.', { status: 409, kind: 'auth' })
  async function call(method, path, params = {}) {
    const url = new URL(`${graphHost}/${version}/${path.replace(/^\/+/, '')}`)
    let body
    if (method === 'GET') { for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== null) url.searchParams.set(key, String(value)); url.searchParams.set('access_token', token) }
    else body = form({ ...params, access_token: token })
    let response
    try { response = await fetch(url, { method, body, headers: body ? { 'content-type': 'application/x-www-form-urlencoded' } : undefined, signal: AbortSignal.timeout(timeoutMs) }) }
    catch { throw new InstagramError('Não foi possível falar com o Instagram agora.', { status: 503, kind: 'transient', retriable: true }) }
    const data = await readResponse(response)
    if (!response.ok || data?.error) throw classifyGraphError(data, response.status)
    return data
  }
  return { get: (path, params) => call('GET', path, params), post: (path, params) => call('POST', path, params) }
}

export function authorizationUrl({ appId, state, redirectUri = socialRedirect, scopes = socialScopes }) {
  const url = new URL('https://www.instagram.com/oauth/authorize')
  url.search = new URLSearchParams({ client_id: appId, redirect_uri: redirectUri, response_type: 'code', scope: scopes.join(','), state, force_reauth: 'true' }).toString()
  return url.toString()
}

export async function exchangeCode({ appId, appSecret, code, redirectUri = socialRedirect, fetch = globalThis.fetch }) {
  let response
  try { response = await fetch('https://api.instagram.com/oauth/access_token', { method: 'POST', body: form({ client_id: appId, client_secret: appSecret, grant_type: 'authorization_code', redirect_uri: redirectUri, code: String(code).replace(/#_$/, '') }), headers: { 'content-type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(20000) }) }
  catch { throw new InstagramError('Não foi possível falar com o Instagram agora.', { status: 503, kind: 'transient', retriable: true }) }
  const data = await readResponse(response)
  const entry = Array.isArray(data?.data) ? data.data[0] : data
  if (!response.ok || !entry?.access_token) {
    if (data?.error_message || data?.error_type) throw new InstagramError('O Instagram recusou o código de autorização. Comece a conexão novamente.', { status: 400, kind: 'auth' })
    throw classifyGraphError(data, response.status)
  }
  const permissions = Array.isArray(entry.permissions) ? entry.permissions : String(entry.permissions || '').split(',')
  return { token: entry.access_token, userId: entry.user_id ? String(entry.user_id) : null, permissions: permissions.map(item => item.trim()).filter(Boolean) }
}

async function tokenRequest(url, fetch) {
  let response
  try { response = await fetch(url, { signal: AbortSignal.timeout(20000) }) }
  catch { throw new InstagramError('Não foi possível falar com o Instagram agora.', { status: 503, kind: 'transient', retriable: true }) }
  const data = await readResponse(response)
  if (!response.ok || data?.error || !data?.access_token) throw classifyGraphError(data, response.status)
  const expiresIn = Number(data.expires_in)
  return { token: data.access_token, expiresIn: Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 60 * 86400 }
}

export function longLivedToken({ appSecret, token, fetch = globalThis.fetch }) {
  const url = new URL(`${graphHost}/access_token`)
  url.search = new URLSearchParams({ grant_type: 'ig_exchange_token', client_secret: appSecret, access_token: token }).toString()
  return tokenRequest(url, fetch)
}

// Long-lived tokens can be refreshed once they are at least 24 hours old and still valid.
export function refreshToken({ token, fetch = globalThis.fetch }) {
  const url = new URL(`${graphHost}/refresh_access_token`)
  url.search = new URLSearchParams({ grant_type: 'ig_refresh_token', access_token: token }).toString()
  return tokenRequest(url, fetch)
}

// Refresh weekly, or sooner when the token is close to expiring; never before it is 24 hours old.
export function shouldRefresh({ issuedAt, refreshedAt, expiresAt, now = Date.now() }) {
  const last = new Date(refreshedAt || issuedAt || 0).getTime(), expiry = new Date(expiresAt || 0).getTime()
  if (!expiry || expiry <= now || now - last < 86400000) return false
  return now - last >= 7 * 86400000 || expiry - now <= 20 * 86400000
}

export async function readProfile(client) {
  const profile = await client.get('me', { fields: profileFields })
  const id = String(profile.user_id || profile.id || '')
  if (!/^\d{1,40}$/.test(id) || !profile.username) throw new InstagramError('O Instagram não retornou os dados da conta profissional.', { status: 502 })
  const count = value => Number.isFinite(Number(value)) && Number(value) >= 0 ? Math.round(Number(value)) : null
  return {
    ig_user_id: id,
    app_scoped_id: profile.id && /^\d{1,40}$/.test(String(profile.id)) ? String(profile.id) : null,
    username: String(profile.username).slice(0, 60),
    name: String(profile.name || '').slice(0, 160),
    account_type: String(profile.account_type || '').slice(0, 40),
    profile_picture_url: /^https:\/\//.test(profile.profile_picture_url || '') ? String(profile.profile_picture_url).slice(0, 2048) : null,
    followers_count: count(profile.followers_count), follows_count: count(profile.follows_count), media_count: count(profile.media_count),
  }
}

export async function publishingLimit(client) {
  const result = await client.get('me/content_publishing_limit', { fields: 'quota_usage,config' })
  const entry = Array.isArray(result?.data) ? result.data[0] : result
  const used = Number(entry?.quota_usage), total = Number(entry?.config?.quota_total)
  return { used: Number.isFinite(used) ? used : null, total: Number.isFinite(total) ? total : null, window_hours: Number(entry?.config?.quota_duration) ? Math.round(Number(entry.config.quota_duration) / 3600) : 24 }
}

const mediaFields = 'id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count'
export async function recentMedia(client, { limit = 24, after } = {}) {
  const result = await client.get('me/media', { fields: mediaFields, limit: Math.max(1, Math.min(50, limit)), after })
  const items = (Array.isArray(result?.data) ? result.data : []).map(item => ({
    id: String(item.id), caption: String(item.caption || '').slice(0, 2200), media_type: item.media_type || null, media_product_type: item.media_product_type || null,
    media_url: /^https:\/\//.test(item.media_url || '') ? item.media_url : null, thumbnail_url: /^https:\/\//.test(item.thumbnail_url || '') ? item.thumbnail_url : null,
    permalink: /^https:\/\/(www\.)?instagram\.com\//.test(item.permalink || '') ? item.permalink : null, timestamp: item.timestamp || null,
    like_count: Number.isFinite(item.like_count) ? item.like_count : null, comments_count: Number.isFinite(item.comments_count) ? item.comments_count : null,
  }))
  return { items, next: result?.paging?.next && result?.paging?.cursors?.after ? String(result.paging.cursors.after) : null }
}

// Insights: Meta returns an empty set (not zero) when a metric is unavailable; null keeps that meaning.
export const accountMetrics = Object.freeze(['reach', 'views', 'accounts_engaged', 'total_interactions', 'likes', 'comments', 'shares', 'saves', 'replies', 'profile_links_taps'])
export const mediaMetrics = Object.freeze({
  FEED: ['reach', 'views', 'likes', 'comments', 'shares', 'saved', 'total_interactions'],
  REELS: ['reach', 'views', 'likes', 'comments', 'shares', 'saved', 'total_interactions', 'ig_reels_avg_watch_time'],
  STORY: ['reach', 'views', 'replies', 'shares', 'total_interactions', 'follows', 'profile_visits'],
})

function metricValue(entry) {
  if (!entry) return null
  if (entry.total_value && Number.isFinite(Number(entry.total_value.value))) return Number(entry.total_value.value)
  if (Array.isArray(entry.values) && entry.values.length) {
    const numbers = entry.values.map(item => Number(item?.value)).filter(Number.isFinite)
    return numbers.length ? numbers.reduce((sum, value) => sum + value, 0) : null
  }
  return null
}

export function readMetrics(response, metrics) {
  const found = new Map((Array.isArray(response?.data) ? response.data : []).map(entry => [entry.name, metricValue(entry)]))
  return Object.fromEntries(metrics.map(name => [name, found.has(name) ? found.get(name) : null]))
}

// One request for every metric; if Meta rejects the set (a metric not offered to this account or media type),
// each metric is asked alone so the available ones still appear.
async function metricsWithFallback(client, path, metrics, params) {
  try { return readMetrics(await client.get(path, { ...params, metric: metrics.join(',') }), metrics) }
  catch (error) {
    if (!(error instanceof InstagramError) || !['invalid', 'permission'].includes(error.kind) || metrics.length === 1) throw error
    const results = await Promise.all(metrics.map(name => client.get(path, { ...params, metric: name }).then(response => readMetrics(response, [name])).catch(cause => { if (cause instanceof InstagramError && ['auth', 'rate'].includes(cause.kind)) throw cause; return { [name]: null } })))
    return Object.assign({}, ...results)
  }
}

export function accountInsights(client, { since, until }) {
  return metricsWithFallback(client, 'me/insights', accountMetrics, { period: 'day', metric_type: 'total_value', since: Math.floor(since / 1000), until: Math.floor(until / 1000) })
}

export function mediaInsights(client, { id, productType }) {
  const metrics = mediaMetrics[productType === 'REELS' ? 'REELS' : productType === 'STORY' ? 'STORY' : 'FEED']
  return metricsWithFallback(client, `${id}/insights`, metrics, {})
}

// Deauthorize and data-deletion callbacks from Meta carry a signed_request (HMAC-SHA256 with the app secret).
const base64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
function fromBase64url(value) {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/')
  return atob(normalized + '='.repeat((4 - normalized.length % 4) % 4))
}
export async function parseSignedRequest(signedRequest, appSecret) {
  const [signature, payload] = String(signedRequest || '').split('.', 2)
  if (!signature || !payload || !appSecret) throw new InstagramError('Solicitação assinada inválida.', { status: 400, kind: 'invalid' })
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(appSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const expected = base64url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)))
  let difference = expected.length ^ signature.length
  for (let index = 0; index < Math.max(expected.length, signature.length); index++) difference |= (expected.charCodeAt(index) || 0) ^ (signature.charCodeAt(index) || 0)
  if (difference) throw new InstagramError('Assinatura da Meta inválida.', { status: 403, kind: 'invalid' })
  let data
  try { data = JSON.parse(fromBase64url(payload)) } catch { throw new InstagramError('Solicitação assinada inválida.', { status: 400, kind: 'invalid' }) }
  if (String(data?.algorithm || '').toUpperCase() !== 'HMAC-SHA256' || !/^\d{1,40}$/.test(String(data?.user_id || ''))) throw new InstagramError('Solicitação assinada inválida.', { status: 400, kind: 'invalid' })
  return { userId: String(data.user_id), issuedAt: Number(data.issued_at) || null }
}

// ---------------------------------------------------------------------------------------------
// Publishing state machine. Every external side effect is saved before the next one, so a crash
// or a lost response never creates a second post: a container already marked PUBLISHED is
// reconciled instead of published again.
// post: { format, caption, share_to_feed, thumb_offset_ms, ig_container_id, publish_attempted_at, processing_started_at, attempts }
// items: [{ position, kind, alt_text, ig_container_id }]
// mediaUrl(item) -> public HTTPS URL that Instagram downloads (a short-lived signed URL)
// save(patch, itemPatches) persists progress; returns nothing.
// ---------------------------------------------------------------------------------------------
export const processingLimitMs = 30 * 60000
const retryDelays = [60000, 5 * 60000, 15 * 60000]

function containerParams(post, item, { child = false } = {}) {
  if (post.format === 'story') return item.kind === 'video' ? { media_type: 'STORIES', video_url: item.url } : { media_type: 'STORIES', image_url: item.url }
  if (post.format === 'reel') return { media_type: 'REELS', video_url: item.url, caption: post.caption || undefined, share_to_feed: post.share_to_feed === false ? 'false' : 'true', thumb_offset: Number.isFinite(post.thumb_offset_ms) ? post.thumb_offset_ms : undefined }
  if (child) return item.kind === 'video' ? { media_type: 'VIDEO', video_url: item.url, is_carousel_item: 'true' } : { image_url: item.url, is_carousel_item: 'true', alt_text: item.alt_text || undefined }
  return { image_url: item.url, caption: post.caption || undefined, alt_text: item.alt_text || undefined }
}

async function containerStatus(client, id) {
  const result = await client.get(id, { fields: 'status_code,status' })
  return { code: String(result?.status_code || ''), detail: String(result?.status || '') }
}

async function reconcilePublished(client, post, now) {
  const since = new Date(post.publish_attempted_at).getTime() - 10 * 60000
  const { items } = await recentMedia(client, { limit: 10 })
  const caption = String(post.caption || '').trim()
  const match = items.find(item => new Date(item.timestamp).getTime() >= since && (!caption || item.caption.trim() === caption)) || null
  return { status: 'published', published_at: match?.timestamp || new Date(now).toISOString(), ig_media_id: match?.id || null, permalink: match?.permalink || null }
}

export async function advancePublication({ post, items, client, mediaUrl, save, now = Date.now(), sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), checkLimit = true }) {
  const fail = (message, code) => ({ outcome: 'failed', patch: { status: 'failed', last_error: message, last_error_code: code ? String(code) : null, next_attempt_at: null } })
  const wait = (delay = 60000) => ({ outcome: 'waiting', patch: { status: 'publishing', next_attempt_at: new Date(now + delay).toISOString() } })
  try {
    const started = post.processing_started_at ? new Date(post.processing_started_at).getTime() : now
    if (!post.processing_started_at) await save({ processing_started_at: new Date(now).toISOString() })
    if (now - started > processingLimitMs) return fail('O Instagram não terminou de processar a mídia em 30 minutos. Tente novamente ou use outro arquivo.', 'timeout')

    // 1. A previous media_publish may have succeeded without us seeing the answer.
    if (post.publish_attempted_at && post.ig_container_id) {
      const status = await containerStatus(client, post.ig_container_id)
      if (status.code === 'PUBLISHED') return { outcome: 'published', patch: await reconcilePublished(client, post, now) }
      if (status.code === 'EXPIRED') { await save({ ig_container_id: null, publish_attempted_at: null }, items.map(item => ({ position: item.position, ig_container_id: null }))); return wait(1000) }
      if (status.code === 'ERROR') return fail(`O Instagram recusou a mídia${status.detail ? ` (${status.detail.slice(0, 120)})` : ''}.`, 'container_error')
      if (status.code !== 'FINISHED') return wait()
    }

    // 2. Respect the account's publishing quota before creating anything new.
    if (checkLimit && !post.ig_container_id && !items.some(item => item.ig_container_id)) {
      const quota = await publishingLimit(client).catch(() => null)
      if (quota?.total && quota.used !== null && quota.used >= quota.total) return fail(`A conta atingiu o limite de ${quota.total} publicações pela API em ${quota.window_hours} horas. Reagende para mais tarde.`, '2207042')
    }

    // 3. Containers: children first for carousels, then the main container.
    if (post.format === 'carousel') {
      for (const item of items) {
        if (item.ig_container_id) continue
        const created = await client.post('me/media', containerParams(post, { ...item, url: await mediaUrl(item) }, { child: true }))
        item.ig_container_id = String(created.id)
        await save({}, [{ position: item.position, ig_container_id: item.ig_container_id }])
      }
      for (const item of items) {
        let status = await containerStatus(client, item.ig_container_id)
        for (let round = 0; round < 3 && status.code === 'IN_PROGRESS' && item.kind === 'image'; round++) { await sleep(2000); status = await containerStatus(client, item.ig_container_id) }
        if (status.code === 'EXPIRED') { await save({ ig_container_id: null }, [{ position: item.position, ig_container_id: null }]); return wait(1000) }
        if (status.code === 'ERROR') return fail(`O Instagram recusou a mídia ${item.position + 1} do carrossel${status.detail ? ` (${status.detail.slice(0, 120)})` : ''}.`, 'container_error')
        if (status.code !== 'FINISHED') return wait()
      }
      if (!post.ig_container_id) {
        const created = await client.post('me/media', { media_type: 'CAROUSEL', children: items.map(item => item.ig_container_id).join(','), caption: post.caption || undefined })
        post.ig_container_id = String(created.id)
        await save({ ig_container_id: post.ig_container_id })
      }
    } else if (!post.ig_container_id) {
      const item = items[0]
      const created = await client.post('me/media', containerParams(post, { ...item, url: await mediaUrl(item) }))
      post.ig_container_id = String(created.id)
      await save({ ig_container_id: post.ig_container_id })
    }

    // 4. Images are usually ready within seconds; videos are checked again on the next minute.
    let status = await containerStatus(client, post.ig_container_id)
    for (let round = 0; round < 3 && status.code === 'IN_PROGRESS' && !items.some(item => item.kind === 'video'); round++) { await sleep(2000); status = await containerStatus(client, post.ig_container_id) }
    if (status.code === 'EXPIRED') { await save({ ig_container_id: null }, items.map(item => ({ position: item.position, ig_container_id: null }))); return wait(1000) }
    if (status.code === 'ERROR') return fail(`O Instagram recusou a mídia${status.detail ? ` (${status.detail.slice(0, 120)})` : ''}.`, 'container_error')
    if (status.code === 'PUBLISHED') return { outcome: 'published', patch: await reconcilePublished(client, { ...post, publish_attempted_at: post.publish_attempted_at || new Date(now).toISOString() }, now) }
    if (status.code !== 'FINISHED') return wait()

    // 5. Publish. The attempt time is saved first so a lost answer is reconciled, never repeated blindly.
    const attempted = new Date(now).toISOString()
    await save({ publish_attempted_at: attempted })
    const published = await client.post('me/media_publish', { creation_id: post.ig_container_id })
    const mediaId = String(published.id)
    let details = {}
    try { details = await client.get(mediaId, { fields: 'permalink,timestamp' }) } catch { details = {} }
    return { outcome: 'published', patch: { status: 'published', ig_media_id: mediaId, permalink: /^https:\/\/(www\.)?instagram\.com\//.test(details.permalink || '') ? details.permalink : null, published_at: details.timestamp || attempted, last_error: null, last_error_code: null, next_attempt_at: null } }
  } catch (error) {
    if (!(error instanceof InstagramError)) return fail('Erro inesperado ao publicar. Nada foi publicado em duplicidade; tente novamente.', 'internal')
    if (error.kind === 'pending') return wait()
    if (error.kind === 'expired') { await save({ ig_container_id: null, publish_attempted_at: null }, items.map(item => ({ position: item.position, ig_container_id: null }))); return wait(1000) }
    if (error.retriable && (post.attempts || 0) < retryDelays.length) return { outcome: 'retry', error, patch: { status: 'publishing', attempts: (post.attempts || 0) + 1, last_error: error.message, last_error_code: String(error.subcode || error.code || error.kind), next_attempt_at: new Date(now + retryDelays[post.attempts || 0]).toISOString() } }
    return { outcome: 'failed', error, patch: { status: 'failed', last_error: error.message, last_error_code: String(error.subcode || error.code || error.kind), next_attempt_at: null } }
  }
}
