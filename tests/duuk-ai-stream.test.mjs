import assert from 'node:assert/strict'
import test from 'node:test'
import { readAiStream } from '../src/ai/stream.mjs'

const encode = value => new TextEncoder().encode(value)
const frame = (event, newline = '\n') => `data: ${JSON.stringify(event)}${newline}${newline}`
function response(chunks, { stayOpen = false } = {}) {
 let cancelled = false
 return {
  response: new Response(new ReadableStream({
   start(controller) { for (const chunk of chunks) controller.enqueue(typeof chunk === 'string' ? encode(chunk) : chunk); if (!stayOpen) controller.close() },
   cancel() { cancelled = true },
  }), { headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } }),
  get cancelled() { return cancelled },
 }
}

test('AI SSE preserves Portuguese and Unicode split between bytes and events split across CRLF', async () => {
 const expected = [{ type: 'meta', conversation_id: 'conversation' }, { type: 'delta', text: 'Ação, emoção e direção. 🎬' }, { type: 'done', message: { content: 'Ação, emoção e direção. 🎬' } }]
 const bytes = encode(': keepalive\r\n\r\n' + expected.map(event => frame(event, '\r\n')).join('')), seen = []
 const fixture = response([...bytes].map(byte => new Uint8Array([byte])))
 await readAiStream(fixture.response, { onEvent: event => seen.push(event) })
 assert.deepEqual(seen, expected)
})

test('AI SSE emits deltas immediately and requires DB completion rather than a provider sentinel', async () => {
 let streamController
 const seen = [], source = new Response(new ReadableStream({ start(controller) { streamController = controller } }), { headers: { 'content-type': 'text/event-stream' } })
 const read = readAiStream(source, { onEvent: event => seen.push(event) })
 streamController.enqueue(encode(frame({ type: 'delta', text: 'Primeira cena.' })))
 await new Promise(resolve => setTimeout(resolve, 0))
 assert.deepEqual(seen, [{ type: 'delta', text: 'Primeira cena.' }])
 streamController.enqueue(encode(frame({ type: 'done' }))); streamController.close(); await read
 await assert.rejects(readAiStream(response([frame({ type: 'delta', text: 'Parcial' }), 'data: [DONE]\n\n']).response), /terminou antes/)
})

test('AI SSE surfaces quota errors, cancels the stream and keeps received text available', async () => {
 const seen = [], fixture = response([frame({ type: 'delta', text: 'Texto recebido.' }), frame({ type: 'error', error: 'Cota gratuita atingida.' })], { stayOpen: true })
 await assert.rejects(readAiStream(fixture.response, { onEvent: event => seen.push(event) }), /Cota gratuita/)
 assert.equal(fixture.cancelled, true)
 assert.equal(seen[0].text, 'Texto recebido.')
 assert.equal(seen.length, 1)
})

test('AI SSE rejects malformed, unexpected, oversized and invalid UTF-8 streams and releases each reader', async () => {
 const fixtures = [
  response(['data: {invalid}\n\n'], { stayOpen: true }),
  response([frame(null)], { stayOpen: true }),
  response([frame({ type: 'delta', text: { invalid: true } })], { stayOpen: true }),
  response([frame({ type: 'unexpected' })], { stayOpen: true }),
  response(['data: ' + 'x'.repeat(512001)], { stayOpen: true }),
  response([frame({ type: 'delta', text: 'x'.repeat(64001) })], { stayOpen: true }),
  response([new Uint8Array([0xff])], { stayOpen: true }),
 ]
 for (const fixture of fixtures) {
  await assert.rejects(readAiStream(fixture.response), /conexão foi interrompida/)
  assert.equal(fixture.cancelled, true)
  assert.equal(fixture.response.body.locked, false)
 }
 await assert.rejects(readAiStream(new Response('{}', { headers: { 'content-type': 'application/json' } })), /não foi reconhecida/)
})

test('AI SSE propagates local abort without reporting incomplete generation as completed', async () => {
 let controller
 const source = new Response(new ReadableStream({ start(value) { controller = value } }), { headers: { 'content-type': 'text/event-stream' } })
 const pending = readAiStream(source)
 controller.error(new DOMException('Interrupted locally', 'AbortError'))
 await assert.rejects(pending, error => error.name === 'AbortError')
 assert.equal(source.body.locked, false)
})
