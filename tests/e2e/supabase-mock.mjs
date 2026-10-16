// Isolated Supabase double for browser tests. Every request to the real project is
// answered here, so screenshots and interaction tests never read or write real data.
export const SUPABASE_URL = 'https://ilohuxhyfqikjlvoarts.supabase.co'

const json = (body, status = 200, headers = {}) => ({ status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', ...headers }, body: body === undefined ? '' : JSON.stringify(body) })
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value))
const randomId = () => crypto.randomUUID()

function base64url(value) { return Buffer.from(JSON.stringify(value)).toString('base64url') }
export function fakeSession(user, now = Date.now()) {
  const exp = Math.floor(now / 1000) + 60 * 60 * 24 * 365
  const token = `${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url({ sub: user.id, email: user.email, role: 'authenticated', aud: 'authenticated', exp, aal: 'aal2', session_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', amr: [{ method: 'password', timestamp: Math.floor(now / 1000) }, { method: 'totp', timestamp: Math.floor(now / 1000) }] })}.test-signature`
  return { access_token: token, token_type: 'bearer', expires_in: 3600 * 24 * 365, expires_at: exp, refresh_token: 'test-refresh-token', user }
}

function parseValue(raw) {
  if (raw === 'null') return null
  if (raw === 'true') return true
  if (raw === 'false') return false
  return raw
}
function compare(left, right) {
  if (left === null || left === undefined) return right === null || right === undefined ? 0 : -1
  if (right === null || right === undefined) return 1
  const a = typeof left === 'number' ? left : String(left), b = typeof left === 'number' ? Number(right) : String(right)
  return a < b ? -1 : a > b ? 1 : 0
}
const safeDecode = value => { try { return decodeURIComponent(value) } catch { return value } }
function matches(row, column, expression) {
  let negate = false, rest = expression
  if (rest.startsWith('not.')) { negate = true; rest = rest.slice(4) }
  const dot = rest.indexOf('.')
  if (dot < 0) return true
  const op = rest.slice(0, dot), raw = safeDecode(rest.slice(dot + 1)), value = row[column]
  let result = true
  switch (op) {
    case 'eq': result = String(value) === raw || value === parseValue(raw); break
    case 'neq': result = String(value) !== raw; break
    case 'gt': result = compare(value, raw) > 0; break
    case 'gte': result = compare(value, raw) >= 0; break
    case 'lt': result = compare(value, raw) < 0; break
    case 'lte': result = compare(value, raw) <= 0; break
    case 'is': result = raw === 'null' ? value === null || value === undefined : value === parseValue(raw); break
    case 'in': { const list = raw.replace(/^\(|\)$/g, '').split(',').map(item => item.replace(/^"|"$/g, '')); result = list.includes(String(value)); break }
    case 'like': case 'ilike': { const pattern = new RegExp(`^${raw.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*').replaceAll('%', '.*')}$`, op === 'ilike' ? 'i' : ''); result = pattern.test(String(value ?? '')); break }
    case 'cs': { const list = raw.replace(/^\{|\}$/g, '').split(',').filter(Boolean); result = Array.isArray(value) && list.every(item => value.includes(item)); break }
    default: result = true
  }
  return negate ? !result : result
}
const reserved = new Set(['select', 'order', 'limit', 'offset', 'or', 'and', 'on_conflict', 'columns'])
// or=(name.ilike.%x%,company.ilike.%x%): any of the comma-separated conditions.
function matchesAny(row, expression) {
  const conditions = expression.replace(/^\(|\)$/g, '').split(',').filter(Boolean)
  return conditions.some(condition => { const dot = condition.indexOf('.'); return matches(row, condition.slice(0, dot), condition.slice(dot + 1)) })
}
function filterRows(rows, params) {
  let output = rows.filter(row => [...params.entries()].every(([key, value]) => key === 'or' ? matchesAny(row, value) : reserved.has(key) || matches(row, key, value)))
  const order = params.get('order')
  if (order) {
    const rules = order.split(',').map(rule => { const [column, direction = 'asc'] = rule.split('.'); return { column, desc: direction === 'desc' } })
    output = [...output].sort((a, b) => { for (const rule of rules) { const result = compare(a[rule.column], b[rule.column]); if (result) return rule.desc ? -result : result } return 0 })
  }
  return output
}

export function createSupabaseMock({ user, profile, permissions, tables = {}, rpc = {}, functions = {}, log = () => {} }) {
  const store = clone(tables)
  const calls = []
  user = { factors: [{ id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', factor_type: 'totp', friendly_name: 'Autenticador de teste', status: 'verified' }], ...user }
  const session = fakeSession(user)
  async function handle(route) {
    const request = route.request(), url = new URL(request.url()), path = url.pathname, method = request.method()
    let body
    try { body = request.postDataJSON() } catch { body = request.postData() }
    calls.push({ method, path, search: url.search, body })
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } })
    if (path.startsWith('/auth/v1/')) {
      if (path === '/auth/v1/user') return route.fulfill(json(user))
      if (path === '/auth/v1/token') return route.fulfill(json(session))
      if (path === '/auth/v1/logout') return route.fulfill({ status: 204 })
      return route.fulfill(json({}))
    }
    if (path.startsWith('/functions/v1/')) {
      const name = path.split('/')[3]
      if (name === 'duuk-team' && body?.action === 'context') return route.fulfill(json({ profile, permissions }))
      const handler = functions[name]
      const result = typeof handler === 'function' ? await handler(body || {}, { store, user }) : handler?.[body?.action] ?? undefined
      if (result === undefined) { log(`function ${name}:${body?.action || ''}`); return route.fulfill(json({})) }
      if (result?.__status) return route.fulfill(json(result.body, result.__status))
      return route.fulfill(json(typeof result === 'function' ? await result(body, { store, user }) : result))
    }
    if (path.startsWith('/rest/v1/rpc/')) {
      const name = path.split('/').pop(), handler = rpc[name]
      if (handler === undefined) { log(`rpc ${name}`); return route.fulfill(json(null)) }
      return route.fulfill(json(typeof handler === 'function' ? await handler(body || {}, { store, user }) : handler))
    }
    if (path.startsWith('/rest/v1/')) {
      const table = path.split('/')[3]
      if (!(table in store)) { log(`table ${table}`); store[table] = [] }
      const rows = store[table], params = url.searchParams
      const single = (request.headers().accept || '').includes('vnd.pgrst.object')
      const prefer = request.headers().prefer || ''
      const respond = (data) => {
        if (single) return data.length ? route.fulfill(json(data[0])) : route.fulfill(json({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: 'The result contains 0 rows' }, 406))
        return route.fulfill(json(data, 200, { 'content-range': `0-${Math.max(data.length - 1, 0)}/${data.length}` }))
      }
      if (method === 'GET' || method === 'HEAD') {
        const filtered = filterRows(rows, params)
        const offset = Number(params.get('offset') || 0), limit = params.get('limit') ? Number(params.get('limit')) : filtered.length
        const page = filtered.slice(offset, offset + limit)
        if (method === 'HEAD' || prefer.includes('count=')) {
          if (method === 'HEAD') return route.fulfill({ status: 200, headers: { 'content-range': `0-${Math.max(page.length - 1, 0)}/${filtered.length}`, 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range' } })
        }
        return respond(clone(page))
      }
      if (method === 'POST') {
        const now = new Date().toISOString()
        const items = (Array.isArray(body) ? body : [body]).map(item => ({ id: randomId(), version: 1, created_at: now, updated_at: now, ...item }))
        if (prefer.includes('resolution=merge-duplicates')) {
          for (const item of items) { const key = params.get('on_conflict') || Object.keys(item)[0]; const index = rows.findIndex(row => row[key] === item[key]); if (index >= 0) rows[index] = { ...rows[index], ...item }; else rows.push(item) }
        } else rows.push(...items)
        return prefer.includes('return=representation') ? respond(clone(items)) : route.fulfill({ status: 201, headers: { 'access-control-allow-origin': '*' } })
      }
      if (method === 'PATCH') {
        const changed = filterRows(rows, params)
        for (const row of changed) Object.assign(row, body, { version: (row.version || 0) + 1, updated_at: new Date().toISOString() })
        return prefer.includes('return=representation') ? respond(clone(changed)) : route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } })
      }
      if (method === 'DELETE') {
        const removed = filterRows(rows, params)
        store[table] = rows.filter(row => !removed.includes(row))
        return prefer.includes('return=representation') ? respond(clone(removed)) : route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } })
      }
    }
    if (path.startsWith('/storage/v1/')) {
      const parts = path.split('/')
      if (parts[3] === 'object' && parts[4] === 'sign') {
        if (method === 'POST' && parts.length === 6) return route.fulfill(json((body?.paths || []).map(item => ({ path: item, signedURL: `/object/sign/${parts[5]}/${item}?token=test`, error: null }))))
        if (method === 'POST') return route.fulfill(json({ signedURL: `/object/sign/${parts.slice(5).join('/')}?token=test` }))
        return route.fulfill({ status: 200, headers: { 'content-type': 'image/svg+xml', 'access-control-allow-origin': '*' }, body: placeholderImage(parts.at(-1)) })
      }
      if (parts[3] === 'object' && method === 'POST') return route.fulfill(json({ Key: parts.slice(4).join('/') }))
      if (parts[3] === 'object' && method === 'DELETE') return route.fulfill(json([]))
      return route.fulfill(json({}))
    }
    log(`unhandled ${method} ${path}`)
    return route.fulfill(json({}))
  }
  return { handle, calls, store, session }
}

function placeholderImage(seed = '') {
  let hash = 0
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  const shade = 28 + (hash % 40)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1500" viewBox="0 0 1200 1500"><rect width="1200" height="1500" fill="hsl(0 0% ${shade}%)"/><circle cx="${300 + hash % 600}" cy="${400 + hash % 700}" r="${180 + hash % 200}" fill="hsl(0 0% ${shade + 12}%)"/><rect x="0" y="1100" width="1200" height="400" fill="hsl(0 0% ${shade - 10}%)"/></svg>`
}

export async function installSupabaseMock(page, options) {
  const mock = createSupabaseMock(options)
  await page.route(`${SUPABASE_URL}/**`, mock.handle)
  if (page.routeWebSocket) await page.routeWebSocket(/supabase\.co\/realtime/, () => {})
  if (options.signedIn !== false) {
    await page.addInitScript(({ session, theme, userId, extra }) => {
      try {
        localStorage.setItem('duuk-admin-auth', JSON.stringify(session))
        localStorage.setItem('duuk-remember', 'true')
        if (theme) localStorage.setItem(`duuk-admin-theme:${userId}`, theme)
        for (const [key, value] of Object.entries(extra || {})) localStorage.setItem(key, value)
      } catch { /* storage unavailable */ }
    }, { session: mock.session, theme: options.theme, userId: options.user.id, extra: options.localStorage })
  } else if (options.theme) {
    await page.addInitScript(({ theme }) => { try { localStorage.setItem('duuk-admin-theme:guest', theme) } catch { /* storage unavailable */ } }, { theme: options.theme })
  }
  return mock
}
