// Official pinned SDK against local HTTP only: no Google API, key or DUUK data.
// npx --yes deno@2.5.6 test --node-modules-dir=none --no-lock \
//   --allow-net=127.0.0.1 --allow-env supabase/tests/duuk-ai-tools-sdk.test.ts
import { FunctionCallingConfigMode, GoogleGenAI } from 'npm:@google/genai@2.28.0'
import { normalizeCompletedToolCalls, toolsFor } from '../functions/_shared/duuk-ai-tools.mjs'

function assert(value: unknown, message = 'Assertion failed'): asserts value { if (!value) throw new Error(message) }

Deno.test('pinned Gemini SDK sends native JSON declarations and yields complete functionCalls in streaming chunks with one request', async () => {
 let calls = 0
 const server = Deno.serve({ hostname: '127.0.0.1', port: 0, onListen() {} }, async request => {
  calls++
  const url = new URL(request.url)
  assert(url.pathname === '/v1beta/models/gemini-3.5-flash:streamGenerateContent' && url.searchParams.get('alt') === 'sse')
  const body = await request.json()
  assert(body.toolConfig.functionCallingConfig.mode === 'AUTO')
  const declarations = body.tools[0].functionDeclarations
  assert(declarations.length === 2 && declarations[0].name === 'prepare_agenda_event' && declarations[1].name === 'view_agenda')
  assert(declarations[0].parametersJsonSchema.type === 'object' && declarations[0].parametersJsonSchema.additionalProperties === false)
  assert(declarations[0].parametersJsonSchema.properties.title.maxLength === 160)
  assert(!declarations[0].parametersJsonSchema.properties.responsible_id && !declarations[0].parameters)
  assert(!JSON.stringify(body).includes('duuk-local-fixture-not-a-real-key'))
  const chunks = [
   { candidates: [{ content: { role: 'model', parts: [{ text: 'Confira o cartão antes de confirmar.' }] } }] },
   { candidates: [{ content: { role: 'model', parts: [{ functionCall: { id: 'fixture-call-1', name: 'prepare_agenda_event', args: { title: 'Reunião fictícia', start_date: '2026-10-10', end_date: '2026-10-10', all_day: false, start_time: '14:00', category: 'meeting', responsible_hint: 'Ana' } } }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 15, totalTokenCount: 35 } },
  ]
  return new Response(chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } })
 })
 try {
  const client = new GoogleGenAI({ apiKey: 'duuk-local-fixture-not-a-real-key', vertexai: false, httpOptions: { baseUrl: `http://127.0.0.1:${server.addr.port}`, apiVersion: 'v1beta', retryOptions: { attempts: 1 } } })
  const stream = await client.models.generateContentStream({ model: 'gemini-3.5-flash', contents: 'Marque uma reunião fictícia amanhã às 14h.', config: { tools: toolsFor({ agenda: true }), toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO } } } })
  let text = '', inputTokens = 0, finishReason: string | undefined
  const functionCalls: unknown[] = []
  for await (const chunk of stream) {
   text += (chunk.candidates?.[0]?.content?.parts || []).filter(part => typeof part.text === 'string' && !part.thought).map(part => part.text).join('')
   if (chunk.functionCalls) functionCalls.push(...chunk.functionCalls)
   if (chunk.usageMetadata) inputTokens = chunk.usageMetadata.promptTokenCount || 0
   finishReason = chunk.candidates?.[0]?.finishReason || finishReason
  }
  assert(text === 'Confira o cartão antes de confirmar.' && inputTokens === 20)
  assert(functionCalls.length === 1 && calls === 1)
  const actions = normalizeCompletedToolCalls(functionCalls, { agenda: true }, finishReason)
  assert(actions.length === 1 && actions[0].kind === 'agenda.create' && actions[0].payload.responsible_hint === 'Ana' && actions[0].payload.start_time === '14:00')
  assert(!('id' in actions[0].payload) && !('responsible_id' in actions[0].payload))
 } finally { await server.shutdown() }
})

Deno.test('SDK clean EOF and MAX_TOKENS expose complete-looking calls but the backend normalizer rejects both without STOP', async () => {
 for (const finalReason of [undefined, 'MAX_TOKENS']) {
  let calls = 0
  const server = Deno.serve({ hostname: '127.0.0.1', port: 0, onListen() {} }, request => {
   calls++
   assert(new URL(request.url).pathname === '/v1beta/models/gemini-3.5-flash:streamGenerateContent')
   const chunk = { candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'prepare_agenda_event', args: { title: 'Reunião fictícia', start_date: '2026-10-10', start_time: '14:00', all_day: false } } }] }, ...(finalReason ? { finishReason: finalReason } : {}) }] }
   // All JSON/SSE frames are syntactically complete. The EOF case omits the
   // provider's final marker, as can happen if an upstream stream ends early.
   return new Response(`data: ${JSON.stringify(chunk)}\n\n`, { headers: { 'content-type': 'text/event-stream' } })
  })
  try {
   const client = new GoogleGenAI({ apiKey: 'duuk-local-fixture-not-a-real-key', vertexai: false, httpOptions: { baseUrl: `http://127.0.0.1:${server.addr.port}`, apiVersion: 'v1beta', retryOptions: { attempts: 1 } } })
   const stream = await client.models.generateContentStream({ model: 'gemini-3.5-flash', contents: 'Marque uma reunião fictícia amanhã às 14h.', config: { tools: toolsFor({ agenda: true }) } })
   const functionCalls: unknown[] = []
   let finishReason: string | undefined
   for await (const chunk of stream) { functionCalls.push(...(chunk.functionCalls || [])); finishReason = chunk.candidates?.[0]?.finishReason || finishReason }
   assert(functionCalls.length === 1 && calls === 1, 'the SDK ends normally with a complete-looking call and never retries')
   assert(finishReason === finalReason)
   let rejected = false
   try { normalizeCompletedToolCalls(functionCalls, { agenda: true }, finishReason) } catch (cause) { rejected = (cause as { code?: string }).code === 'DUUK_AI_INVALID_TOOL_CALL' }
   assert(rejected, 'EOF and token limit must never produce a draft action')
  } finally { await server.shutdown() }
 }
})
