// Local HTTP fixtures only: no Google request, real key, account or DUUK record.
// DUUK_AI_SDK_TEST=1 npx --yes deno@2.5.6 test --node-modules-dir=none --no-lock \
//   --allow-net=127.0.0.1 --allow-env supabase/tests/duuk-ai-sdk.integration.ts
import { GoogleGenAI } from 'npm:@google/genai@2.28.0'
import { selectModel } from '../functions/_shared/duuk-ai-knowledge.mjs'

const envPermission = await Deno.permissions.query({ name: 'env', variable: 'DUUK_AI_SDK_TEST' })
const enabled = envPermission.state === 'granted' && Deno.env.get('DUUK_AI_SDK_TEST') === '1'
function assert(value: unknown, message = 'Assertion failed'): asserts value { if (!value) throw new Error(message) }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const event = (text: string, final = false) => new TextEncoder().encode(`data: ${JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text }] }, ...(final ? { finishReason: 'STOP' } : {}) }], ...(final ? { usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 8, totalTokenCount: 18 } } : {}) })}\n\n`)
function fixture(handler: (request: Request) => Response | Promise<Response>) {
 const server = Deno.serve({ hostname: '127.0.0.1', port: 0, onListen() {} }, handler)
 // The server is controlled by the test. Omit SDK attempt timeout here because
 // 2.28.0 leaves successful-request timeout handles armed until their deadline.
 const client = new GoogleGenAI({ apiKey: 'duuk-local-fixture-not-a-real-key', vertexai: false, httpOptions: { baseUrl: `http://127.0.0.1:${server.addr.port}`, apiVersion: 'v1beta', retryOptions: { attempts: 1 } } })
 return { server, client }
}

Deno.test({ name: 'official Gemini SDK paginates models and yields incremental text with final usage', ignore: !enabled, async fn() {
 let modelPages = 0, generationCalls = 0, releaseFinal!: () => void, finalReleased = false
 const finalGate = new Promise<void>(resolve => { releaseFinal = () => { finalReleased = true; resolve() } })
 const { client, server } = fixture(async request => {
  const url = new URL(request.url)
  if (request.method === 'GET' && url.pathname === '/v1beta/models') {
   modelPages++
   return json(url.searchParams.get('pageToken') ? { models: [{ name: 'models/gemini-3.5-flash', supportedGenerationMethods: ['generateContent'] }] } : { models: [{ name: 'models/gemini-3.5-flash-lite', supportedGenerationMethods: ['generateContent'] }], nextPageToken: 'page-two' })
  }
  assert(request.method === 'POST' && url.pathname === '/v1beta/models/gemini-3.5-flash-lite:streamGenerateContent')
  assert(url.searchParams.get('alt') === 'sse')
  const body = await request.json()
  assert(body.systemInstruction.parts[0].text === 'Teste estático, sem dados privados.')
  assert(body.generationConfig.maxOutputTokens === 8192)
  assert(!JSON.stringify(body).includes('duuk-local-fixture-not-a-real-key'))
  generationCalls++
  return new Response(new ReadableStream({ async start(controller) { controller.enqueue(event('Ação ')); await finalGate; controller.enqueue(event('e direção.', true)); controller.close() } }), { headers: { 'content-type': 'text/event-stream' } })
 })
 try {
  const pager = await client.models.list({ config: { pageSize: 1 } }), available: string[] = []
  for await (const model of pager) { assert(model.supportedActions?.includes('generateContent')); available.push(model.name!.replace(/^models\//, '')) }
  assert(modelPages === 2 && available.length === 2)
  const model = selectModel('help', 'Como uso a agenda?', available)
  assert(model === 'gemini-3.5-flash-lite')
  const stream = await client.models.generateContentStream({ model, contents: [{ role: 'user', parts: [{ text: 'Pedido fictício.' }] }], config: { systemInstruction: 'Teste estático, sem dados privados.', maxOutputTokens: 8192 } })
  const iterator = stream[Symbol.asyncIterator](), first = await iterator.next()
  assert(first.value?.text === 'Ação ' && !finalReleased, 'first delta must arrive before generation finishes')
  releaseFinal()
  const last = await iterator.next()
  assert(last.value?.text === 'e direção.' && last.value.usageMetadata?.promptTokenCount === 10 && last.value.usageMetadata?.candidatesTokenCount === 8)
  assert((await iterator.next()).done && generationCalls === 1)
 } finally { releaseFinal(); await server.shutdown() }
} })

Deno.test({ name: 'official Gemini SDK abort stops reading and does not retry or switch models', ignore: !enabled, async fn() {
 let calls = 0, source: ReadableStreamDefaultController<Uint8Array> | undefined
 const { client, server } = fixture(request => {
  assert(new URL(request.url).pathname === '/v1beta/models/gemini-3.5-flash-lite:streamGenerateContent')
  calls++
  return new Response(new ReadableStream({ start(controller) { source = controller; controller.enqueue(event('Texto parcial.')) } }), { headers: { 'content-type': 'text/event-stream' } })
 })
 try {
  const abort = new AbortController()
  const stream = await client.models.generateContentStream({ model: 'gemini-3.5-flash-lite', contents: 'Pedido fictício.', config: { abortSignal: abort.signal, maxOutputTokens: 8192 } })
  const iterator = stream[Symbol.asyncIterator]()
  assert((await iterator.next()).value?.text === 'Texto parcial.')
  abort.abort()
  let stopped = false
  try { const next = await iterator.next(); stopped = next.done === true } catch { stopped = true }
  assert(stopped && calls === 1)
  // Abort stops this client, not a provider-side generation; close our fixture.
 } finally { try { source?.close() } catch { /* already cancelled */ } await server.shutdown() }
} })

Deno.test({ name: 'official Gemini SDK 429 produces one request and no model fallback', ignore: !enabled, async fn() {
 const paths: string[] = []
 const { client, server } = fixture(request => { paths.push(new URL(request.url).pathname); return json({ error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'Local quota fixture.' } }, 429) })
 try {
  let status = 0
  try { await client.models.generateContentStream({ model: 'gemini-3.5-flash', contents: 'Pedido fictício.' }) } catch (cause) { status = Number((cause as { status?: number }).status) }
  assert(status === 429)
  assert(paths.length === 1 && paths[0] === '/v1beta/models/gemini-3.5-flash:streamGenerateContent', '429 must not trigger retries or another model')
 } finally { await server.shutdown() }
} })
