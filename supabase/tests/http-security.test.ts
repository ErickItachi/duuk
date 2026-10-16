import { cors, HttpError, member, readJson } from '../functions/_shared/http.ts'
const assert = (value: unknown, message = 'Assertion failed') => { if (!value) throw new Error(message) }
const actor = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', session = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const jwt = (aal = 'aal2') => `e30.${btoa(JSON.stringify({ sub: actor, session_id: session, aal }))}.verified-by-auth-stub`
const request = (token: string) => new Request('https://edge.invalid', { headers: { authorization: `Bearer ${token}` } })

Deno.test('private backend verifies identity before trusting claims and requires live MFA session before permissions', async () => {
  const calls: string[] = []
  let identity = true, live = true, permitted = true, withinLimit = true
  const db = {
    auth: { getUser: () => { calls.push('identity'); return { data: { user: identity ? { id: actor } : null }, error: identity ? null : new Error('Invalid signature') } } },
    rpc: (name: string, input: Record<string, unknown>) => {
      calls.push(name)
      assert(input.actor === actor)
      if (name === 'duuk_authorize_session') { assert(input.session === session && input.assurance === 'aal2'); return { data: live, error: null } }
      if (name === 'duuk_action_limit') { assert(input.action_name === 'admin-request' && input.maximum === 180); return { data: withinLimit, error: null } }
      assert(input.requested === 'finance'); return { data: permitted, error: null }
    },
  } as any
  assert((await member(request(jwt()), db, 'finance')).id === actor)
  assert(calls.join(',') === 'identity,duuk_authorize_session,duuk_check_permission,duuk_action_limit')
  const denied = async (token: string, status: number, expected: string) => {
    calls.length = 0
    try { await member(request(token), db, 'finance'); throw new Error('Access allowed') }
    catch (error) { assert(error instanceof HttpError && error.status === status); assert(calls.join(',') === expected) }
  }
  identity = false; await denied(jwt(), 401, 'identity')
  identity = true; await denied(jwt('aal1'), 403, 'identity')
  live = false; await denied(jwt(), 401, 'identity,duuk_authorize_session')
  live = true; permitted = false; await denied(jwt(), 403, 'identity,duuk_authorize_session,duuk_check_permission')
  permitted = true; withinLimit = false; await denied(jwt(), 429, 'identity,duuk_authorize_session,duuk_check_permission,duuk_action_limit')
})
Deno.test('production CORS rejects foreign origins, preview and localhost; trusted responses never cache', () => {
  Deno.env.delete('DUUK_ALLOW_LOCAL_ORIGINS')
  for (const origin of ['https://attacker.invalid', 'https://www.duukfilms.com.attacker.invalid', 'https://duuk-preview-duuk1.vercel.app', 'http://localhost:5173']) {
    try { cors(new Request('https://edge.invalid', { headers: { origin } })); throw new Error('Origin accepted') }
    catch (error) { assert(error instanceof HttpError && error.status === 403) }
  }
  const headers = cors(new Request('https://edge.invalid', { headers: { origin: 'https://www.duukfilms.com' } }))
  assert(headers['Access-Control-Allow-Origin'] === 'https://www.duukfilms.com')
  assert(headers['Cache-Control'] === 'no-store' && headers['X-Content-Type-Options'] === 'nosniff')
})
Deno.test('streamed request size limits apply without trusting content-length', async () => {
  try { await readJson(new Request('https://edge.invalid', { method: 'POST', body: JSON.stringify({ text: 'x'.repeat(100) }) }), 32); throw new Error('Oversize accepted') }
  catch (error) { assert(error instanceof HttpError && error.status === 413) }
})
