// Exercise the actual Edge entry point, pinned SDK and HTTP/Auth wrappers.
// Every fetch is intercepted in memory; no Google, database, credentials or
// business records are used. The temporary environment belongs to this process.
// npx --yes deno@2.5.6 test --node-modules-dir=none --no-lock --allow-env
//   --allow-sys=hostname supabase/tests/duuk-ai-actions-edge.test.ts
function assert(value: unknown, message = 'Assertion failed'): asserts value { if (!value) throw new Error(message) }
const userId = '11111111-1111-4111-8111-111111111111'
const conversationId = '22222222-2222-4222-8222-222222222222'
const messageId = '33333333-3333-4333-8333-333333333333'
const actionId = '44444444-4444-4444-8444-444444444444'
const leaseId = '55555555-5555-4555-8555-555555555555'
const consentVersion = 'fixture-actions-version'
const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const call = (name = 'prepare_agenda_event', id = 'call-1') => ({ id, name, args: { title: 'Reunião fictícia', start_date: '2030-01-10', end_date: '2030-01-10', all_day: false, start_time: '14:00', category: 'meeting' } })
const frame = (parts: unknown[], finishReason?: string) => ({ candidates: [{ content: { role: 'model', parts }, ...(finishReason ? { finishReason } : {}) }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 12, totalTokenCount: 22 } })

Deno.test({ name: 'actual DUUK AI Edge keeps native actions private, finalizes safely and checks Auth/consent routes', sanitizeOps: false, sanitizeResources: false, async fn(t) {
 const originalFetch = globalThis.fetch, originalServe = Deno.serve, originalTimer = globalThis.setTimeout
 const previousUrl = Deno.env.get('SUPABASE_URL'), previousServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
 const timers: number[] = [], requests: { name: string; body: any }[] = [], generations: any[] = []
 let edge!: (request: Request) => Promise<Response>, chunks: any[] = [], accepted = true, allowed = true, permissionChecks = 0, revokeBeforeGeneration = false, replay = false, replayError = false
 globalThis.setTimeout = ((handler: (...args: any[]) => void, timeout?: number, ...args: any[]) => { const id = originalTimer(handler, timeout, ...args); timers.push(id); return id }) as typeof setTimeout
 Deno.env.set('SUPABASE_URL', 'http://127.0.0.1:17777')
 Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'fixture-service-key-not-a-real-secret')
 Deno.serve = ((...args: any[]) => { edge = args.at(-1); return {} }) as typeof Deno.serve
 globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const request = input instanceof Request ? input : new Request(input, init)
  const url = new URL(request.url), body = request.method === 'POST' ? await request.json() : null
  if (url.hostname === 'generativelanguage.googleapis.com') {
   if (request.method === 'GET' && url.pathname.endsWith('/models')) return respond({ models: [{ name: 'models/gemini-3.5-flash-lite', supportedGenerationMethods: ['generateContent'] }, { name: 'models/gemini-3.5-flash', supportedGenerationMethods: ['generateContent'] }] })
   assert(request.method === 'POST' && url.pathname.endsWith(':streamGenerateContent'), 'Unexpected Google transport operation')
   generations.push(body)
   return new Response(chunks.map(item => `data: ${JSON.stringify(item)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } })
  }
  assert(url.hostname === '127.0.0.1' && url.port === '17777', 'Fixture blocked an unexpected external request')
  if (url.pathname === '/auth/v1/user') return respond({ id: userId, email: 'fixture@test.invalid', app_metadata: {}, user_metadata: {}, aud: 'authenticated', role: 'authenticated', created_at: '2030-01-01T00:00:00Z' })
  const name = url.pathname.split('/').at(-1)!
  requests.push({ name, body })
  if (name === 'duuk_check_permission') { permissionChecks++; return respond(allowed && !(revokeBeforeGeneration && permissionChecks > 1)) }
  if (name === 'duuk_ai_consent_backend') return respond({ accepted, version: consentVersion })
  if (name === 'duuk_ai_backend') {
   if (body.operation === 'configuration') return respond({ api_key: 'duuk-local-fixture-not-a-real-key', free_tier_confirmed: true, fast_model: 'gemini-3.5-flash-lite', creative_model: 'gemini-3.5-flash' })
   if (body.operation === 'permissions') return respond({ ai: true, agenda: true, finance: true, 'crm.followups': true })
   if (body.operation === 'begin_generation') {
    if (replay) return respond({ completed: { conversation_id: conversationId, request_id: body.payload.request_id, message: { id: messageId, role: 'assistant', content: 'Resposta salva.' } } })
    return respond({ conversation: { id: conversationId }, request: { id: body.payload.request_id, lease_id: leaseId }, history: [{ role: 'user', content: body.payload.message }], permissions: { ai: true, agenda: true } })
   }
   if (body.operation === 'conversation') return respond({ conversation: { id: conversationId }, messages: [] })
  }
  if (name === 'duuk_ai_action_backend') {
   assert(body.payload.user_id === userId, 'The caller injected a different actor')
   if (body.operation === 'finish') return respond({ conversation_id: conversationId, request_id: body.payload.request_id, message: body.payload.status === 'failed' ? null : { id: messageId, role: 'assistant', content: body.payload.content, status: body.payload.status }, actions: body.payload.status === 'complete' ? body.payload.tool_calls.map((tool: any) => ({ id: actionId, kind: tool.kind, payload: tool.payload, status: 'pending', message_id: messageId })) : [] })
   if (body.operation === 'list') return replayError ? respond({ code: 'PT403', message: 'Fixture denied action list' }, 403) : respond({ actions: [] })
   if (body.operation === 'options') return respond({ people: [], clients: [] })
   if (body.operation === 'execute') return respond({ code: 'PT403', message: 'Fixture module permission revoked' }, 403)
   if (body.operation === 'cancel') return respond({ action: { id: actionId, status: 'cancelled' } })
  }
  throw new Error(`Unexpected fixture RPC: ${name}/${body?.operation}`)
 }) as typeof fetch
 try {
  await import('../functions/duuk-ai/index.ts')
  Deno.serve = originalServe
  assert(typeof edge === 'function')
  const reset = () => { chunks = []; requests.length = 0; generations.length = 0; accepted = true; allowed = true; permissionChecks = 0; revokeBeforeGeneration = false; replay = false; replayError = false }
  const invoke = async (body: any, authorization = true) => edge(new Request('http://127.0.0.1/duuk-ai', { method: 'POST', headers: { 'content-type': 'application/json', ...(authorization ? { authorization: 'Bearer fixture-access-token' } : {}) }, body: JSON.stringify(body) }))
  const generate = (extra: any = {}) => invoke({ action: 'generate', actions_supported: true, consent: true, consent_version: consentVersion, client_request_id: crypto.randomUUID(), message: 'Marque uma reunião fictícia amanhã às 14h.', ...extra })
  const events = async (response: Response) => (await response.text()).split('\n\n').filter(value => value.startsWith('data: ')).map(value => JSON.parse(value.slice(6)))
  const finish = () => requests.filter(request => request.name === 'duuk_ai_action_backend' && request.body.operation === 'finish').at(-1)?.body.payload
  await t.step('STOP native call is persisted once with canonical draft and controlled assistant text', async () => {
   reset();chunks = [frame([{ text: 'Já marquei indevidamente.' }]), frame([{ functionCall: call() }], 'STOP')]
   const response = await generate(), streamed = await events(response), payload = finish()
   assert(response.status === 200 && generations.length === 1)
   assert(generations[0].tools[0].functionDeclarations.some((tool: any) => tool.name === 'prepare_agenda_event'))
   assert(generations[0].toolConfig.functionCallingConfig.mode === 'AUTO')
   assert(payload.status === 'complete' && payload.tool_calls.length === 1 && payload.tool_calls[0].kind === 'agenda.create')
   assert(payload.tool_calls[0].payload.start_time === '14:00' && !('responsible_id' in payload.tool_calls[0].payload))
   assert(!payload.content.includes('Já marquei') && payload.content.includes('confirmar'))
   assert(streamed.at(-1).type === 'done' && streamed.at(-1).actions.length === 1)
   assert(!streamed.some(event => event.type === 'delta' && event.text.includes('Já marquei')), 'Unsupported claims leaked before the tool result')
  })
  await t.step('MAX_TOKENS with text and native call persists partial response without cards', async () => {
   reset();chunks = [frame([{ text: 'Preparando.' }]), frame([{ functionCall: call() }], 'MAX_TOKENS')]
   const streamed = await events(await generate()), payload = finish()
   assert(payload.status === 'partial' && payload.error_code === 'incomplete_tool_response' && payload.tool_calls.length === 0)
   assert(streamed.some(event => event.type === 'error') && streamed.at(-1).actions.length === 0 && generations.length === 1)
  })
  await t.step('legacy clients without actions_supported never send tools or create action cards', async () => {
   reset();chunks = [frame([{ text: 'Abra a agenda para criar um compromisso.' }], 'STOP')]
   const streamed = await events(await generate({ actions_supported: false })), payload = finish()
   assert(generations.length === 1 && !('tools' in generations[0]) && !('toolConfig' in generations[0]))
   assert(payload.status === 'complete' && payload.tool_calls.length === 0 && streamed.at(-1).actions.length === 0)
  })
  await t.step('clean EOF with complete-looking call persists controlled partial notice without cards', async () => {
   reset();chunks = [frame([{ functionCall: call() }])]
   const streamed = await events(await generate()), payload = finish()
   assert(payload.status === 'partial' && payload.tool_calls.length === 0 && payload.error_code === 'incomplete_tool_response')
   assert(streamed.at(-1).type === 'done' && streamed.at(-1).message.status === 'partial' && payload.content.includes('Nenhum registro'))
  })
  await t.step('duplicate call ID with different function names is rejected', async () => {
   // Identical args make the name comparison meaningful: deduplicating only by
   // ID and args would incorrectly retain the first valid agenda action.
   reset();chunks = [frame([{ functionCall: call() }]), frame([{ functionCall: call('view_agenda') }], 'STOP')]
   const streamed = await events(await generate()), payload = finish()
   assert(payload.status === 'partial' && payload.tool_calls.length === 0)
   assert(streamed.some(event => event.type === 'error') && streamed.at(-1).actions.length === 0)
  })
  await t.step('Auth and consent block transport; permission revoked before generation is persisted as failed', async () => {
   reset();assert((await invoke({ action: 'action_options' }, false)).status === 401 && requests.length === 0)
   allowed = false;assert((await invoke({ action: 'action_options' })).status === 403 && generations.length === 0)
   reset();accepted = false;assert((await generate()).status === 409 && generations.length === 0 && !finish())
   reset();assert((await generate({ consent_version: 'old-version' })).status === 409 && generations.length === 0)
   reset();revokeBeforeGeneration = true;const streamed = await events(await generate())
   assert(generations.length === 0 && finish().status === 'failed' && finish().tool_calls.length === 0 && streamed.some(event => event.type === 'error'))
  })
  await t.step('action routes forward only authenticated actor and preserve explicit confirmation', async () => {
   reset();const response = await invoke({ action: 'action_execute', id: actionId, confirmed: false, client_request_id: crypto.randomUUID(), user_id: conversationId, changes: { title: 'Fictícia' } })
   assert(response.status === 403)
   const executed = requests.find(request => request.name === 'duuk_ai_action_backend')?.body
   assert(executed.operation === 'execute' && executed.payload.user_id === userId && executed.payload.confirmed === false)
   const cancelled = await invoke({ action: 'action_cancel', id: actionId, user_id: conversationId })
   assert(cancelled.status === 200 && (await cancelled.json()).action.status === 'cancelled' && generations.length === 0)
  })
  await t.step('completed generation replay with action-list failure closes SSE without generating or finishing again', async () => {
   reset();replay = true;replayError = true
   const streamed = await events(await generate())
   assert(streamed.length === 1 && streamed[0].type === 'error' && generations.length === 0 && !finish())
  })
 } finally {
  globalThis.fetch = originalFetch;Deno.serve = originalServe;globalThis.setTimeout = originalTimer
  for (const timer of timers) clearTimeout(timer)
  if (previousUrl === undefined) Deno.env.delete('SUPABASE_URL');else Deno.env.set('SUPABASE_URL', previousUrl)
  if (previousServiceKey === undefined) Deno.env.delete('SUPABASE_SERVICE_ROLE_KEY');else Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', previousServiceKey)
 }
} })
