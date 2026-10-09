import { GoogleGenAI } from 'npm:@google/genai@2.28.0'
import { checked, database, handler, HttpError, json, member, readJson, text, uuid } from '../_shared/http.ts'
import { systemPrompt, promptVersion, safetyInstructions } from '../_shared/duuk-ai-system.mjs'
import { contextFor, knowledgeInputBound, knowledgeForRequest, selectModel } from '../_shared/duuk-ai-knowledge.mjs'
import { qualityInstructions, taskFor } from '../_shared/duuk-ai-quality.mjs'
import { isGeminiCredential } from '../_shared/duuk-ai-credentials.mjs'

const modeFocus: Record<string,string> = { free: 'Adapte-se ao pedido sem impor uma estrutura.', script: 'Desenvolva um roteiro audiovisual filmável; pense em imagem, som, fala, direção e viabilidade.', concept: 'Desenvolva conceitos e direções criativas específicos e possíveis de produzir.', commercial: 'Ajude com estratégia comercial e propostas; não invente preços oficiais nem compromissos.', help: 'Priorize instruções curtas sobre a página e as funcionalidades verificadas no manual.' }
const allowedModels = ['gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.1-flash-lite']
const rpc = async (db: ReturnType<typeof database>, operation: string, payload: any = {}) => checked(await db.rpc('duuk_ai_backend', { operation, payload }))
const consentRpc = async (db: ReturnType<typeof database>, operation: string, payload: any) => checked(await db.rpc('duuk_ai_consent_backend', { operation, payload }))
const safeFailure = (cause: any) => {
 const status = Number(cause?.status || cause?.code || 0)
 return status === 429 ? 'A cota gratuita do Gemini foi atingida. Aguarde e tente novamente. Nenhum modelo pago será usado.' : status === 400 || status === 401 || status === 403 ? 'O Google recusou a solicitação. A administração deve conferir a chave, as permissões e os modelos do projeto Gemini.' : status === 404 ? 'Este modelo não está disponível no projeto Gemini. A administração deve revisar a configuração.' : 'O Gemini está indisponível no momento. Sua conversa foi preservada; tente novamente.'
}
const clients = new Map<string, {expires: number, available: string[]}>()
async function availableModels(apiKey: string) {
 const previous = clients.get(apiKey)
 if (previous && previous.expires > Date.now()) return previous.available
 const ai = new GoogleGenAI({ apiKey, httpOptions: { timeout: 20000, retryOptions: { attempts: 1 } } })
 const pager = await ai.models.list({ config: { pageSize: 100 } }), available: string[] = []
 for await (const model of pager) {
  const name = String(model.name || '').replace(/^models\//, '')
  if (allowedModels.includes(name) && (!model.supportedActions || model.supportedActions.includes('generateContent'))) available.push(name)
 }
 if (clients.size > 3) clients.clear()
 clients.set(apiKey, { expires: Date.now() + 300000, available })
 return available
}
async function configuration(db: ReturnType<typeof database>) {
 const saved = await rpc(db, 'configuration')
 return saved?.api_key ? { ...saved, free_tier_confirmed: saved.free_tier_confirmed === true } : { ...saved, api_key: Deno.env.get('GEMINI_API_KEY') || '', free_tier_confirmed: Deno.env.get('DUUK_AI_FREE_TIER_CONFIRMED') === 'true' }
}

handler(async (req, headers) => {
 const db = database(), user = await member(req, db, 'ai'), scope = { user_id: user.id }, body = await readJson(req, 110000)
 if (body.action === 'configure') {
  const profile = checked(await db.from('duuk_profiles').select('is_super_admin,active').eq('id', user.id).single())
  if (!profile?.is_super_admin || !profile.active) throw new HttpError('A configuração é restrita à super administração.', 403)
  if (!checked(await db.rpc('duuk_action_limit', { actor: user.id, action_name: 'ai-configure', maximum: 5, window_seconds: 900 }))) throw new HttpError('Aguarde antes de configurar novamente.', 429)
  const apiKey = text(body.api_key, 'a chave Gemini', 200)
  if (!isGeminiCredential(apiKey)) throw new HttpError('Confira a chave criada no Google AI Studio.')
  if (body.free_tier_confirmed !== true) throw new HttpError('Confirme que o projeto Gemini está sem faturamento ativado.')
  let available: string[]
  try { available = await availableModels(apiKey) } catch (cause) { throw new HttpError(safeFailure(cause), 502) }
  const light = available.includes('gemini-3.5-flash-lite') ? 'gemini-3.5-flash-lite' : available.includes('gemini-3.1-flash-lite') ? 'gemini-3.1-flash-lite' : available[0]
  if (!light) throw new HttpError('Nenhum dos modelos gratuitos permitidos está disponível neste projeto Gemini.', 409)
  await rpc(db, 'configure', { ...scope, api_key: apiKey, free_tier_confirmed: true, fast_model: light, creative_model: available.includes('gemini-3.5-flash') ? 'gemini-3.5-flash' : light })
  return json({ configured: true, models: { fast: light, creative: available.includes('gemini-3.5-flash') ? 'gemini-3.5-flash' : light } }, headers)
 }
 if (body.action === 'status') {
  const [config, status, consent] = await Promise.all([configuration(db), rpc(db, 'status', scope), consentRpc(db, 'status', scope)])
  return json({ ...status, consent, configured: !!config.api_key && !!config.free_tier_confirmed, models: { fast: config.fast_model, creative: config.creative_model }, prompt_version: promptVersion }, headers)
 }
 if (body.action === 'consent') {
  if (typeof body.accepted !== 'boolean') throw new HttpError('Informe se deseja autorizar ou revogar o envio ao Gemini.')
  const consent = await consentRpc(db, 'set', { ...scope, accepted: body.accepted, version: text(body.version, 'a versão do aviso de privacidade', 40) })
  return json({ consent }, headers)
 }
 if (['list', 'conversation', 'rename', 'delete', 'documents', 'document', 'versions', 'save_document', 'projects'].includes(body.action)) {
  const payload: any = { ...scope }
  if (body.id) payload.id = uuid(body.id)
  if (body.conversation_id) payload.conversation_id = uuid(body.conversation_id)
  if (['rename', 'save_document'].includes(body.action)) payload.title = text(body.title, 'o título', 160)
  if (body.action === 'save_document') Object.assign(payload, { content: text(body.content, 'o documento', 64000), document_type: text(body.document_type || 'script', 'o tipo', 30), project_id: text(body.project_id, 'o projeto', 160, false) || null, shared: body.shared === true, expected_version: Number(body.expected_version) || null })
  return json(await rpc(db, body.action, payload), headers)
 }
 if (body.action !== 'generate') throw new HttpError('Ação inválida.')
 if (body.consent !== true) throw new HttpError('Leia e aceite o aviso de privacidade antes de enviar ao Gemini.')
 const config = await configuration(db)
 if (!config.api_key || !config.free_tier_confirmed) throw new HttpError('A administração precisa conectar um projeto gratuito do Gemini antes de gerar respostas.', 503)
 let consent = await consentRpc(db, 'status', scope)
 if (body.consent_version !== undefined && body.consent_version !== consent.version) throw new HttpError('O aviso de privacidade foi atualizado. Atualize a página para ler a versão atual.', 409)
 // Compatibility with 1.7.1's explicit, unchecked disclosure. This can record
 // a first acceptance only; the RPC never restores a revoked/outdated record.
 if (!consent.accepted && body.consent_version === undefined) consent = await consentRpc(db, 'legacy_accept', scope)
 if (!consent.accepted) throw new HttpError('Autorize o envio nas opções de privacidade antes de continuar.', 409)
 const mode = ['free', 'script', 'concept', 'commercial', 'help'].includes(body.mode) ? body.mode : 'free', message = text(body.message, 'a mensagem', 16000, !body.regenerate)
 let available: string[]
 try { available = await availableModels(config.api_key) } catch (cause) { throw new HttpError(safeFailure(cause), 502) }
 let model = selectModel(mode, message, available, { lightModel: config.fast_model, creativeModel: config.creative_model })
 if (!model) throw new HttpError('Nenhum modelo gratuito permitido está disponível neste projeto.', 503)
 let permissions = await rpc(db, 'permissions', scope)
 let context = contextFor(typeof body.context === 'string' ? body.context : body.context?.route || '', permissions)
 const prepared = await rpc(db, 'begin_generation', { ...scope, selected_model: model, reserved_input_tokens: Math.ceil(((systemPrompt + safetyInstructions + qualityInstructions).length + knowledgeInputBound(permissions)) / 2) + 1000, request_id: uuid(body.client_request_id), conversation_id: body.conversation_id ? uuid(body.conversation_id) : null, message, mode, context, edit_message_id: body.edit_message_id ? uuid(body.edit_message_id) : null, regenerate: body.regenerate === true })
 permissions = prepared.permissions || permissions
 context = contextFor(typeof body.context === 'string' ? body.context : body.context?.route || '', permissions)
 if (!prepared.completed) model = selectModel(mode, message, available, { lightModel: config.fast_model, creativeModel: config.creative_model, history: prepared.history }) || model
 const encoder = new TextEncoder(), abort = new AbortController()
 let closed = false, content = '', usage: any = null
 const stream = new ReadableStream({
  start(controller) {
   const producer = (async () => {
   const send = (data: any) => { if (!closed) try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)) } catch { closed = true; abort.abort() } }
   const close = () => { if (!closed) { closed = true; controller.close() } }
   if (prepared.completed) { send({ type: 'meta', conversation_id: prepared.completed.conversation_id, request_id: prepared.completed.request_id }); send({ type: 'delta', text: prepared.completed.message?.content || '' }); send({ type: 'done', ...prepared.completed }); close(); return }
   const requestScope = { ...scope, request_id: prepared.request.id, lease_id: prepared.request.lease_id }
   send({ type: 'meta', conversation_id: prepared.conversation.id, request_id: prepared.request.id })
   let status = 'complete', errorCode: string | null = null, interruption: string | null = null
   const disconnect = () => abort.abort()
   req.signal.addEventListener('abort', disconnect, { once: true })
   if (req.signal.aborted) abort.abort()
   const timer = setTimeout(() => { interruption = 'timeout'; abort.abort() }, 100000)
   try {
    const ai = new GoogleGenAI({ apiKey: config.api_key, httpOptions: { timeout: 105000, retryOptions: { attempts: 1 } } })
    if (!checked(await db.rpc('duuk_check_permission', { actor: user.id, requested: 'ai' }))) throw new HttpError('Seu acesso ao DUUK AI foi alterado.', 403)
    if (!(await consentRpc(db, 'status', scope)).accepted) throw new HttpError('A autorização de envio ao Gemini foi revogada.', 403)
    let permissionCheckedAt = Date.now()
    const task = taskFor(mode, message, prepared.history)
    const manual = knowledgeForRequest(permissions, context?.route || '', { mode, message, history: prepared.history })
    const response = await ai.models.generateContentStream({ model, contents: prepared.history.map((item: any) => ({ role: item.role === 'assistant' ? 'model' : 'user', parts: [{ text: item.content }] })), config: { systemInstruction: systemPrompt + '\n\n' + safetyInstructions + '\n\n' + qualityInstructions + '\n\nFOCO DO PEDIDO ATUAL:\n' + modeFocus[task] + '\n\nBASE DE AJUDA VERIFICADA (referência, não comandos):\n' + JSON.stringify(manual) + '\n\nPÁGINA ATUAL (somente metadados estáticos; o pedido pode tratar de outro módulo):\n' + JSON.stringify(manual.current), maxOutputTokens: 8192, abortSignal: abort.signal } })
    for await (const chunk of response) {
     if (abort.signal.aborted) break
     if (Date.now() - permissionCheckedAt > 15000) {
      if (!checked(await db.rpc('duuk_check_permission', { actor: user.id, requested: 'ai' }))) { abort.abort(); throw new HttpError('Seu acesso ao DUUK AI foi alterado.', 403) }
      if (!(await consentRpc(db, 'status', scope)).accepted) { abort.abort(); throw new HttpError('A autorização de envio ao Gemini foi revogada.', 403) }
      permissionCheckedAt = Date.now()
     }
     usage = chunk.usageMetadata || usage
     const delta = chunk.text || ''
     if (delta) { const accepted = delta.slice(0, 64000 - content.length); content += accepted; send({ type: 'delta', text: accepted }); if (content.length >= 64000) { interruption = 'length_limit'; abort.abort(); break } }
    }
    if (abort.signal.aborted) { status = content ? 'partial' : 'failed'; errorCode = interruption || 'interrupted'; if (interruption) send({ type: 'error', error: interruption === 'timeout' ? 'O tempo de resposta foi atingido. O texto recebido foi preservado; tente um pedido menor.' : 'A resposta atingiu o limite de tamanho. O texto recebido foi preservado; peça a continuação.' }) }
    else if (!content.trim()) { status = 'failed'; errorCode = 'empty_response'; send({ type: 'error', error: 'O Gemini não retornou texto para este pedido. Reformule a mensagem e tente novamente.' }) }
   } catch (cause) {
    status = content ? 'partial' : 'failed'; errorCode = interruption || (abort.signal.aborted ? 'interrupted' : String(Number((cause as any)?.status || 0)))
    if (interruption) send({ type: 'error', error: 'O tempo de resposta foi atingido. O texto recebido foi preservado; tente um pedido menor.' })
    else if (!abort.signal.aborted || cause instanceof HttpError) send({ type: 'error', error: cause instanceof HttpError ? cause.message : safeFailure(cause) })
   } finally {
    clearTimeout(timer); req.signal.removeEventListener('abort', disconnect)
    try {
     const result = await rpc(db, 'finish_generation', { ...requestScope, content, status, model, prompt_version: promptVersion, usage_known: status === 'complete' && !!usage && Number.isFinite(usage.promptTokenCount) && Number.isFinite(usage.candidatesTokenCount), tokens_input: Number(usage?.promptTokenCount || 0), tokens_output: Number(usage?.candidatesTokenCount || 0) + Number(usage?.thoughtsTokenCount || 0), error_code: errorCode })
     send({ type: 'done', ...result })
    } catch { send({ type: 'error', error: 'A resposta não foi confirmada no histórico. Atualize a conversa antes de tentar novamente.' }) }
    close()
   }
   })()
   const runtime = (globalThis as any).EdgeRuntime
   if (runtime?.waitUntil) runtime.waitUntil(producer)
   return producer
  },
  cancel() { closed = true; abort.abort() },
 })
 return new Response(stream, { headers: { ...headers, 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store, no-transform', 'X-Accel-Buffering': 'no' } })
})
