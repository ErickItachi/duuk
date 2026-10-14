// Server-side steps of the DUUK Social Media module, shared by the duuk-social Edge Function and the
// Node tests. `backend(operation, payload)` calls the service_role RPC duuk_social_backend; `fetch`
// reaches only official Instagram endpoints. Nothing here publishes without a claimed lease that came
// from an explicit request (Publicar agora) or a schedule a member saved.
import { accountInsights, advancePublication, authorizationUrl, createInstagramClient, exchangeCode, InstagramError, longLivedToken, mediaInsights, publishingLimit, readProfile, recentMedia, refreshToken, shouldRefresh, socialStatePrefix } from './instagram.mjs'
import { validatePost } from './social-rules.mjs'

const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const clock = value => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(new Date(value))

// Runs one step of a claimed post and always releases the lease. Videos usually need a few cron
// rounds: the post stays `publishing` with next_attempt_at until Instagram finishes processing.
export async function publishClaimed({ post, backend, fetch, mediaUrl, notify = true, now = Date.now(), sleep = pause }) {
  const lease = post.lease_token
  const progress = (patch, items = [], extra = {}) => backend('progress', { post_id: post.id, lease_token: lease, patch, items, ...extra })
  const finish = (patch, event) => progress(patch, [], { release: true, notify: notify && ['published', 'failed'].includes(patch.status), ...(event ? { event } : {}) })
  const stop = (message, code = 'precheck') => finish({ status: 'failed', last_error: message, last_error_code: code, next_attempt_at: null }, { kind: 'failed', message })

  if (!post.publish_requested_by || !await backend('actor_ok', { user_id: post.publish_requested_by })) return { outcome: 'failed', post: await stop('Quem pediu esta publicação não tem mais acesso ao Social Media. Revise e agende novamente.', 'permission') }
  const account = await backend('token', { account_id: post.account_id })
  if (account.status !== 'active' || !account.token) return { outcome: 'failed', post: await stop(`A conta @${account.username} precisa ser reconectada antes de publicar.`, 'account') }
  if (account.owner_kind === 'client') {
    const settings = await backend('settings', {})
    if (settings.access_level !== 'advanced') return { outcome: 'failed', post: await stop('Contas de clientes dependem do Acesso Avançado aprovado pela Meta.', 'access') }
  }
  const media = Array.isArray(post.media) ? post.media : []
  if (!media.length || media.some(item => !item.media_id || !item.storage_path)) return { outcome: 'failed', post: await stop('Uma das mídias saiu da biblioteca. Escolha os arquivos novamente.', 'media') }
  const problems = validatePost({ format: post.format, caption: post.caption, media })
  if (problems.length) return { outcome: 'failed', post: await stop(problems[0].message, 'validation') }

  const client = createInstagramClient({ token: account.token, fetch })
  const result = await advancePublication({
    post: { ...post }, items: media.map(item => ({ ...item })), client, now, sleep,
    mediaUrl: item => mediaUrl(item.storage_path),
    save: (patch, itemPatches = []) => progress(patch, itemPatches),
  })
  if (result.error?.kind === 'auth') await backend('account_problem', { account_id: post.account_id, status: 'expired', message: result.error.message }).catch(() => null)
  const event = result.outcome === 'published' ? { kind: 'published', message: 'Publicado no Instagram' }
    : result.outcome === 'failed' ? { kind: 'failed', message: result.patch.last_error }
      : result.outcome === 'retry' ? { kind: 'retry', message: `${result.patch.last_error} Nova tentativa às ${clock(result.patch.next_attempt_at)}.` }
        : !post.processing_started_at ? { kind: 'processing', message: 'O Instagram está processando a mídia.' } : null
  return { outcome: result.outcome, post: await finish(result.patch, event) }
}

// Cron: takes at most a few due posts per minute; each one keeps its own lease.
export async function dispatchDue({ backend, fetch, mediaUrl, limit = 3, now = () => Date.now(), sleep = pause }) {
  const claimed = await backend('claim_due', { limit })
  const outcomes = []
  for (const post of Array.isArray(claimed) ? claimed : []) {
    try { outcomes.push((await publishClaimed({ post, backend, fetch, mediaUrl, notify: true, now: now(), sleep })).outcome) }
    catch { outcomes.push('error') }
  }
  return { processed: outcomes.length, outcomes }
}

// Daily: renews long-lived tokens before they expire and records follower counts for the trend.
export async function dailyMaintenance({ backend, fetch, now = Date.now() }) {
  const accounts = await backend('active_accounts', {})
  const summary = { checked: 0, refreshed: 0, problems: 0 }
  for (const entry of Array.isArray(accounts) ? accounts : []) {
    summary.checked++
    try {
      const stored = await backend('token', { account_id: entry.account_id })
      if (!stored.token || (stored.expires_at && new Date(stored.expires_at).getTime() <= now)) {
        await backend('account_problem', { account_id: entry.account_id, status: 'expired', message: 'A autorização do Instagram expirou. Reconecte a conta.' })
        summary.problems++
        continue
      }
      let token = stored.token
      if (shouldRefresh({ issuedAt: stored.issued_at, refreshedAt: stored.refreshed_at, expiresAt: stored.expires_at, now })) {
        const renewed = await refreshToken({ token, fetch })
        token = renewed.token
        await backend('token_update', { account_id: entry.account_id, token, expires_at: new Date(now + renewed.expiresIn * 1000).toISOString() })
        summary.refreshed++
      }
      const profile = await readProfile(createInstagramClient({ token, fetch }))
      await backend('account_update', { account_id: entry.account_id, ...profile })
    } catch (error) {
      if (error instanceof InstagramError && ['auth', 'permission'].includes(error.kind)) {
        await backend('account_problem', { account_id: entry.account_id, status: error.kind === 'auth' ? 'expired' : 'error', message: error.message }).catch(() => null)
        summary.problems++
      }
    }
  }
  return summary
}

const randomHex = bytes => Array.from(crypto.getRandomValues(new Uint8Array(bytes)), value => value.toString(16).padStart(2, '0')).join('')

/** @param {{ backend: (operation: string, payload: any) => Promise<any>, userId: string, ownerKind?: string, clientId?: string | null, hash: (value: string) => Promise<string> }} options */
export async function startConnection({ backend, userId, ownerKind = 'duuk', clientId = null, hash }) {
  const state = socialStatePrefix + randomHex(32)
  const started = await backend('oauth_start', { user_id: userId, state_hash: await hash(state), owner_kind: ownerKind === 'client' ? 'client' : 'duuk', client_id: ownerKind === 'client' ? clientId : null })
  return { url: authorizationUrl({ appId: started.app_id, state }) }
}

// The state is single use and bound to the person who started the connection; the code is exchanged
// for a short-lived token, then a 60-day token that only the server ever sees.
export async function finishConnection({ backend, fetch, userId, code, state, hash, now = Date.now() }) {
  if (!String(state || '').startsWith(socialStatePrefix) || !/^[A-Za-z0-9_#.-]{8,2000}$/.test(String(code || ''))) throw new InstagramError('A resposta do Instagram veio incompleta. Comece a conexão novamente.', { status: 400, kind: 'invalid' })
  const pending = await backend('oauth_consume', { user_id: userId, state_hash: await hash(String(state)) })
  const settings = await backend('settings', {})
  if (!settings.configured) throw new InstagramError('Configure o app do Instagram antes de conectar uma conta.', { status: 409, kind: 'invalid' })
  const short = await exchangeCode({ appId: settings.app_id, appSecret: settings.app_secret, code, fetch })
  const long = await longLivedToken({ appSecret: settings.app_secret, token: short.token, fetch })
  const profile = await readProfile(createInstagramClient({ token: long.token, fetch }))
  return backend('connect', {
    user_id: userId, ...profile, owner_kind: pending.owner_kind, client_id: pending.client_id,
    permissions: short.permissions, token: long.token, expires_at: new Date(now + long.expiresIn * 1000).toISOString(),
  })
}

async function cached(backend, { accountId, scope, key, maxAge, force = false }, load) {
  if (!force) {
    const hit = await backend('cache_get', { account_id: accountId, scope, key, max_age: maxAge })
    if (hit) return hit
  }
  const value = { ...await load(), fetched_at: new Date().toISOString() }
  await backend('cache_put', { account_id: accountId, scope, key, value }).catch(() => null)
  return value
}

async function accountClient(backend, fetch, accountId) {
  const account = await backend('token', { account_id: accountId })
  if (account.status !== 'active' || !account.token) throw new InstagramError(`A conta @${account.username} precisa ser reconectada.`, { status: 409, kind: 'auth' })
  return createInstagramClient({ token: account.token, fetch })
}

// Overview: publishing quota and the latest posts, as Instagram reports them.
export async function readOverview({ backend, fetch, accountId, force = false }) {
  const client = await accountClient(backend, fetch, accountId)
  const [limit, recent] = await Promise.all([
    cached(backend, { accountId, scope: 'limit', key: 'quota', maxAge: 600, force }, () => publishingLimit(client)),
    cached(backend, { accountId, scope: 'recent', key: 'media:12', maxAge: 1800, force }, async () => ({ items: (await recentMedia(client, { limit: 12 })).items })),
  ])
  return { limit, recent: recent.items || [], fetched_at: recent.fetched_at }
}

export const insightRanges = Object.freeze([7, 14, 28])

async function inBatches(list, size, work) {
  const output = []
  for (let index = 0; index < list.length; index += size) output.push(...await Promise.all(list.slice(index, index + size).map(work)))
  return output
}

// Insights: account totals for the range plus per-post metrics for the latest posts. Metrics Meta does
// not offer for this account come back as null and are shown as unavailable, never as zero.
export async function readInsights({ backend, fetch, accountId, days = 7, force = false, now = Date.now() }) {
  const range = insightRanges.includes(Number(days)) ? Number(days) : 7
  const client = await accountClient(backend, fetch, accountId)
  const until = now - (now % 3600000), since = until - range * 86400000
  const totals = await cached(backend, { accountId, scope: 'account', key: `day:${range}:${new Date(until).toISOString().slice(0, 13)}`, maxAge: 3600, force }, async () => ({ metrics: await accountInsights(client, { since, until }) }))
  const recent = await cached(backend, { accountId, scope: 'recent', key: 'media:12', maxAge: 1800, force }, async () => ({ items: (await recentMedia(client, { limit: 12 })).items }))
  const media = await inBatches(recent.items || [], 4, async item => {
    const metrics = await cached(backend, { accountId, scope: 'media', key: item.id, maxAge: 6 * 3600, force }, async () => ({ metrics: await mediaInsights(client, { id: item.id, productType: item.media_product_type }) }))
      .catch(error => { if (error instanceof InstagramError && ['auth', 'rate'].includes(error.kind)) throw error; return { metrics: null } })
    return { ...item, metrics: metrics.metrics }
  })
  return { days: range, since: new Date(since).toISOString(), until: new Date(until).toISOString(), account: totals.metrics, media, fetched_at: totals.fetched_at }
}
