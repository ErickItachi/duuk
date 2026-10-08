// Parse only DUUK's authenticated SSE protocol. No model text is interpreted as HTML.
export async function readAiStream(response, { onEvent } = {}) {
 if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) throw new Error('A resposta da conexão não foi reconhecida. Tente novamente.')
 const reader = response.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true })
 let buffer = '', finished = false, pendingCr = false, generated = 0
 const malformed = () => new Error('A conexão foi interrompida. Sua mensagem foi preservada.')
 const receive = frame => {
  const data = frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')
  if (!data || data === '[DONE]') return
  let event
  try { event = JSON.parse(data) } catch { throw malformed() }
  if (!event || typeof event !== 'object' || !['meta', 'delta', 'error', 'done'].includes(event.type) || finished) throw malformed()
  if (event.type === 'error') throw new Error(typeof event.error === 'string' ? event.error.slice(0, 1000) : 'A geração foi interrompida. Tente novamente.')
  if (event.type === 'delta') {
   if (typeof event.text !== 'string') throw malformed()
   generated += event.text.length
   if (generated > 64000) throw malformed()
  }
  if (event.type === 'done') finished = true
  onEvent?.(event)
 }
 try {
  for (;;) {
   const { value, done } = await reader.read()
   let text
   try { text = decoder.decode(value, { stream: !done }) } catch { throw malformed() }
   if (pendingCr) { text = '\r' + text; pendingCr = false }
   if (!done && text.endsWith('\r')) { pendingCr = true; text = text.slice(0, -1) }
   buffer += text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
   if (buffer.length > 512000) throw malformed()
   let boundary
   while ((boundary = buffer.indexOf('\n\n')) >= 0) { receive(buffer.slice(0, boundary)); buffer = buffer.slice(boundary + 2) }
   if (done) break
  }
  if (buffer.trim()) receive(buffer)
  if (!finished) throw new Error('A conexão terminou antes da resposta. Você pode tentar novamente sem duplicar a solicitação.')
 } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
}
