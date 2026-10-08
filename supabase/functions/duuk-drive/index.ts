import { checked, database, handler, HttpError, json, member, readBody, readJson, sha256, text, uuid } from '../_shared/http.ts'
import { PDFDocument } from '../_shared/pdf.ts'
import { libraryFileType, libraryLimit } from '../_shared/drive-files.mjs'
import { createManagedFolder, updateManagedItem } from '../_shared/drive-manager.mjs'
import { authorizationUrl, defaultDriveAccount, DriveError, driveRedirect, driveScope, driveStatePrefix, ensureFolder, exchangeToken, identityOf, SourceError, storageQuota, syncDocument } from '../_shared/google-drive.mjs'

const configuration = () => ({ id: Deno.env.get('DUUK_DRIVE_GOOGLE_CLIENT_ID') || '', secret: Deno.env.get('DUUK_DRIVE_GOOGLE_CLIENT_SECRET') || '', account: (Deno.env.get('DUUK_DRIVE_ACCOUNT_EMAIL') || defaultDriveAccount).trim().toLowerCase() })
const random = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('')
const tokensOf = (token: any, previous: any = {}) => ({ access_token: token.access_token, refresh_token: token.refresh_token || previous.refresh_token, expires_at: Date.now() + Number(token.expires_in || 3600) * 1000 })
const authorizationFailure = (cause: any) => cause instanceof DriveError && cause.authorization

type Options = { limit?: number, budget?: number, document_id?: string }
async function backend(db: ReturnType<typeof database>, operation: string, payload: any = {}) {
  const result = await db.rpc('duuk_drive_backend', { operation, payload })
  if (result.error) console.error(JSON.stringify({ source: 'drive-rpc', operation, code: result.error.code }))
  return checked(result)
}
async function manageBackend(db: ReturnType<typeof database>, operation: string, payload: any = {}) {
  const result = await db.rpc('duuk_drive_manage_backend', { operation, payload })
  if (result.error) console.error(JSON.stringify({ source: 'drive-manager-rpc', operation, code: result.error.code }))
  return checked(result)
}
async function organize(db: ReturnType<typeof database>, config: ReturnType<typeof configuration>, payload: any) {
  const change = await manageBackend(db, 'prepare', payload)
  if (change.completed) return change.completed
  const scope = { generation: change.generation, lease_id: change.lease_id, change_id: change.change_id }
  try {
    let tokens = change.tokens
    if (!tokens?.refresh_token) throw new DriveError(401)
    if (!tokens.access_token || tokens.expires_at < Date.now() + 60000) {
      tokens = tokensOf(await exchangeToken({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token }, config), tokens)
      await backend(db, 'tokens', { ...scope, tokens })
    }
    const ctx = { token: tokens.access_token, request: fetch, check: () => manageBackend(db, 'check', scope) }
    const result = change.action === 'folder_create' ? await createManagedFolder(ctx, change) : await updateManagedItem(ctx, change)
    return await manageBackend(db, 'commit', { ...scope, result })
  } catch (cause) {
    const error = cause instanceof DriveError || cause instanceof SourceError || cause instanceof HttpError ? cause.message : 'Não foi possível concluir no Google Drive. Tente novamente a mesma alteração.'
    if (authorizationFailure(cause)) await backend(db, 'error', { ...scope, error }).catch(() => {})
    else await manageBackend(db, 'abort', { ...scope, error }).catch(() => {})
    if (cause instanceof HttpError) throw cause
    throw new HttpError(error, cause instanceof SourceError ? 409 : 502)
  }
}
export async function dispatch(db: ReturnType<typeof database>, config: ReturnType<typeof configuration>, options: Options = {}) {
  const rpc = (operation: string, payload: any = {}) => backend(db, operation, payload)
  const started = Date.now(), budget = options.budget ?? 45000
  let processed = 0, failed = 0
  await rpc('reconcile')
  const connection = await rpc('claim')
  if (!connection) return { processed, failed, idle: true }
  const scope = { generation: connection.generation, lease_id: connection.lease_id }
  const expectedSource = (doc: any) => ({ document_id: doc.id, expected_source_path: doc.source_path, expected_source_sha256: doc.source_sha256 })
  try {
    let tokens = connection.tokens
    if (!tokens?.refresh_token) throw new DriveError(401)
    if (!tokens.access_token || tokens.expires_at < Date.now() + 60000) {
      tokens = tokensOf(await exchangeToken({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token }, config), tokens)
      await rpc('tokens', { ...scope, tokens })
    }
    const store = {
      get: (key: string) => rpc('folder_get', { ...scope, key }),
      save: async (row: any) => { await rpc('folder_save', { ...scope, ...row }) },
      forget: async (key: string) => { await rpc('folder_forget', { ...scope, key }) },
      uniqueName: (parent_key: string | null, client_key: string, name: string) => rpc('unique_name', { ...scope, parent_key, client_key, name }),
    }
    const ctx = { token: tokens.access_token, request: fetch, verified: new Set<string>(), store, checkDocument: (doc: any) => rpc('check', { ...scope, ...expectedSource(doc) }) }
    if (connection.quota_due) {
      try {
        // Garante a estrutura DUUK / Contratos / Propostas Comerciais / Documentos e atualiza o espaço usado.
        const root = await ensureFolder(ctx, { key: 'root', name: 'DUUK' })
        for (const [section, label] of [['contracts', 'Contratos'], ['proposals', 'Propostas Comerciais'], ['documents', 'Documentos']]) await ensureFolder(ctx, { key: `section:${section}`, name: label, parent: root })
        await rpc('quota', { ...scope, ...await storageQuota(ctx.token) })
      } catch (cause) { if (authorizationFailure(cause)) throw cause; console.error(JSON.stringify({ source: 'drive-maintenance', status: (cause as any)?.status || 0 })) }
    }
    const jobs = await rpc('jobs', { ...scope, limit: options.limit ?? 4, document_id: options.document_id })
    for (const job of jobs) {
      if (Date.now() - started > budget) break
      let error: string | null = null, result: any = {}, retryable = true
      try {
        await ctx.checkDocument(job)
        const download = await db.storage.from(job.source_bucket || 'duuk-documents').download(job.source_path)
        if (download.error || !download.data) {
          const missing = (download.error as any)?.status === 404 || String((download.error as any)?.statusCode) === '404' || /not found/i.test(String(download.error?.message || ''))
          throw missing ? new SourceError('O PDF de origem não está mais disponível no DUUK Admin.') : new Error('storage')
        }
        result = await syncDocument(ctx, job, new Uint8Array(await download.data.arrayBuffer()))
        processed++
      } catch (cause: any) {
        if (authorizationFailure(cause) || cause instanceof HttpError && cause.status === 409) throw cause
        failed++
        error = cause instanceof DriveError || cause instanceof SourceError ? cause.message : 'Não foi possível salvar no Google Drive. Uma nova tentativa será feita.'
        retryable = cause?.retryable !== false
        console.error(JSON.stringify({ source: 'drive-document', status: cause?.status || 0, reason: cause?.reason || '' }))
      }
      await rpc('finish', { ...scope, ...expectedSource(job), error, retryable, ...result })
    }
    await rpc('release', scope)
  } catch (cause: any) {
    failed++
    if (cause instanceof HttpError && cause.status === 409) { await rpc('release', scope).catch(() => {}); return { processed, failed } }
    if (authorizationFailure(cause)) await rpc('error', { ...scope, error: 'A autorização do Google expirou. Conecte a conta novamente.' }).catch(() => {})
    else {
      const jobs = await rpc('jobs', { ...scope, limit: options.limit ?? 4, document_id: options.document_id }).catch(() => [])
      const error = cause instanceof DriveError ? cause.message : 'A conexão com o Google Drive falhou. Uma nova tentativa será feita.'
      for (const job of jobs) await rpc('finish', { ...scope, ...expectedSource(job), error, retryable: true }).catch(() => {})
      await rpc('release', scope).catch(() => {})
    }
  }
  return { processed, failed }
}

handler(async (req, headers) => {
  const db = database(), config = configuration(), configured = !!config.id && !!config.secret
  const rpc = (operation: string, payload: any = {}) => backend(db, operation, payload)
  const limit = async (actor: string, name: string, maximum: number) => { if (!checked(await db.rpc('duuk_action_limit', { actor, action_name: name, maximum, window_seconds: 600 }))) throw new HttpError('Aguarde alguns minutos antes de tentar novamente.', 429) }

  if (req.headers.get('content-type')?.includes('multipart/form-data')) {
    const library = new URL(req.url).searchParams.get('library') === '1'
    const user = await member(req, db, library ? 'drive' : 'crm.clients'), scope = { user_id: user.id }
    await limit(user.id, 'drive-proposal', 20)
    const form = await new Response(await readBody(req, library ? libraryLimit + 100000 : 11000000), { headers: { 'Content-Type': req.headers.get('content-type')! } }).formData(), file = form.get('file')
    if (library) {
      if (!(file instanceof File)) throw new HttpError('Escolha um arquivo.')
      const bytes = new Uint8Array(await file.arrayBuffer())
      let mime: string
      try { mime = libraryFileType(file.name, bytes) } catch (cause) { throw new HttpError((cause as Error).message) }
      if (mime === 'application/pdf') try { await PDFDocument.load(bytes) } catch { throw new HttpError('Use um PDF válido, sem senha.') }
      const selectedFolder = form.get('folder_id') ? await manageBackend(db, 'upload_folder', { ...scope, folder_id: text(form.get('folder_id'), 'a pasta', 240) }) : null
      const path = `files/${user.id}/${crypto.randomUUID()}`, title = text(form.get('title'), 'o título', 160, false)
      checked(await db.storage.from('duuk-drive-files').upload(path, bytes, { contentType: mime, upsert: false }))
      let saved
      try { saved = await rpc('add_file', { ...scope, file_name: file.name, title, client_id: form.get('client_id') ? uuid(form.get('client_id')) : undefined, managed_folder_key: selectedFolder?.folder_key, source_path: path, sha256: await sha256(bytes), mime_type: mime, byte_size: bytes.length }) }
      catch (cause) {
        const linked = await db.from('duuk_drive_documents').select('id').eq('source_path', path).maybeSingle()
        if (!linked.error && !linked.data) await db.storage.from('duuk-drive-files').remove([path])
        throw cause
      }
      if (configured) await dispatch(db, config, { limit: 1, budget: 25000, document_id: saved.id }).catch(() => {})
      return json(saved, headers)
    }
    if (!(file instanceof File) || file.size > 10485760 || !file.size) throw new HttpError('Envie um PDF de até 10 MB.')
    const bytes = new Uint8Array(await file.arrayBuffer())
    try { await PDFDocument.load(bytes) } catch { throw new HttpError('Use um PDF válido, sem senha.') }
    const kind = text(form.get('kind') || 'proposal', 'o tipo de documento', 20)
    if (!['proposal', 'document'].includes(kind)) throw new HttpError('Confira o tipo de documento.')
    const title = text(form.get('title'), 'o título do documento', 160, false)
    const clientId = uuid(form.get('client_id')), digest = await sha256(bytes), path = `${kind}/${clientId}/${crypto.randomUUID()}.pdf`
    checked(await db.storage.from('duuk-documents').upload(path, bytes, { contentType: 'application/pdf', upsert: false }))
    try { return json(await rpc('add_proposal', { ...scope, client_id: clientId, kind, title, source_path: path, sha256: digest }), headers) }
    catch (cause) {
      // Uma resposta perdida não autoriza apagar um PDF que a transação já pode ter vinculado.
      const saved = await db.from('duuk_drive_documents').select('id').eq('source_path', path).maybeSingle()
      if (!saved.error && !saved.data) await db.storage.from('duuk-documents').remove([path])
      throw cause
    }
  }

  const body = await readJson(req, 12000), cron = req.headers.get('x-duuk-cron')
  if (body.action === 'dispatch') {
    const secrets = checked(await db.rpc('duuk_backend_secrets'))
    if (!cron || cron !== secrets?.['duuk.push.cron']) throw new HttpError('Acesso restrito.', 403)
    return json(configured ? await dispatch(db, config) : { configured: false, processed: 0 }, headers)
  }

  const user = await member(req, db), scope = { user_id: user.id }
  if (['browse', 'folders'].includes(body.action)) return json(await manageBackend(db, body.action, { ...scope, folder_id: text(body.folder_id, 'a pasta', 240, false) || null, kind: text(body.kind, 'a categoria', 30, false), search: text(body.search, 'a busca', 120, false), offset: Math.max(0, Math.min(100000, Number(body.offset) || 0)), trashed: body.trashed === true, view: body.view === 'all' ? 'all' : 'folder' }), headers)
  if (['folder_create', 'folder_update', 'folder_move', 'folder_trash', 'folder_restore', 'document_update', 'document_move', 'document_trash', 'document_restore'].includes(body.action)) {
    if (!configured) throw new HttpError('A integração aguarda a configuração do Google Cloud.', 503)
    await limit(user.id, 'drive-organize', 100)
    return json(await organize(db, config, { ...scope, action: body.action, request_id: uuid(body.request_id), id: text(body.id, 'o item', 240, false) || null, parent_id: text(body.parent_id, 'a pasta de destino', 240, false) || null, name: text(body.name, 'o nome', 200, false) || null, description: text(body.description, 'a descrição', 2000, false), revision: Math.max(0, Math.min(2147483647, Number(body.revision) || 0)) }), headers)
  }
  if (body.action === 'status') return json({ configured, expected_account: config.account, ...await rpc('status', scope) }, headers)
  if (body.action === 'library') return json(await rpc('library', { ...scope, kind: text(body.kind, 'a categoria', 30, false), search: text(body.search, 'a busca', 120, false), offset: Math.max(0, Math.min(100000, Number(body.offset) || 0)) }), headers)
  if (body.action === 'documents') return json({ documents: await rpc('documents', { ...scope, kind: body.kind, contract_id: body.contract_id ? uuid(body.contract_id) : undefined, client_id: body.client_id ? uuid(body.client_id) : undefined }) }, headers)
  if (body.action === 'file') {
    const found = await rpc('file', { ...scope, document_id: uuid(body.id) })
    if (!found.source_path) throw new HttpError('Este arquivo está disponível somente no Google Drive.', 404)
    const signed = checked(await db.storage.from(found.source_bucket || 'duuk-documents').createSignedUrl(found.source_path, 120, body.disposition === 'download' ? { download: found.file_name } : undefined))
    if (!signed) throw new HttpError('Arquivo indisponível.', 500)
    return json({ url: signed.signedUrl, file_name: found.file_name, mime_type: found.mime_type }, headers)
  }
  if (body.action === 'retry') {
    await limit(user.id, 'drive-retry', 30)
    const connection = checked(await db.from('duuk_drive_connection').select('status').maybeSingle())
    if (!configured || connection?.status !== 'connected') throw new HttpError('Conecte o Google Drive em Configurações → Integrações antes de sincronizar.', 409)
    const documentId = body.id ? uuid(body.id) : undefined
    const queued = await rpc('retry', { ...scope, document_id: documentId })
    const result = await dispatch(db, config, { budget: 25000, limit: documentId ? 1 : 3, document_id: documentId })
    return json({ ...queued, ...result }, headers)
  }
  if (body.action === 'disconnect') {
    // Revogar no Google remove os grants de todo o projeto, inclusive da Agenda e de uma reconexão.
    // Desconectar remove o segredo local e invalida os workers; a revogação externa é manual.
    await rpc('disconnect', scope)
    return json({ disconnected: true }, headers)
  }
  if (!['start', 'callback'].includes(body.action)) throw new HttpError('Ação inválida.')
  if (!configured) throw new HttpError('A integração aguarda a configuração do Google Cloud pela administração.', 503)
  await limit(user.id, 'drive-connect', 20)
  if (body.action === 'start') {
    const state = driveStatePrefix + random(), verifier = random(), digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)), challenge = btoa(String.fromCharCode(...new Uint8Array(digest))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
    await rpc('start', { ...scope, state_hash: await sha256(state), verifier })
    return json({ url: authorizationUrl(config.id, state, challenge, config.account) }, headers)
  }
  const state = text(body.state, 'a conexão', 128), code = text(body.code, 'o código de autorização', 4096, false)
  if (!state.startsWith(driveStatePrefix)) throw new HttpError('Conexão inválida. Comece novamente no painel.')
  const pending = await rpc('consume', { ...scope, state_hash: await sha256(state) })
  if (body.denied || !code) throw new HttpError('Conexão cancelada no Google. O armazenamento anterior foi preservado.')
  try {
    const token = await exchangeToken({ grant_type: 'authorization_code', code, redirect_uri: driveRedirect, code_verifier: pending.verifier }, config)
    if (!String(token.scope || '').split(' ').includes(driveScope) || !token.refresh_token) throw new HttpError('Permita o acesso aos arquivos criados pelo DUUK e o acesso contínuo para concluir a conexão.')
    const identity = await identityOf(token.access_token)
    if (!identity?.sub || !identity.email_verified || !identity.email) throw new HttpError('O Google não confirmou o e-mail da conta.')
    if (String(identity.email).toLowerCase() !== config.account) {
      throw new HttpError(`Entre com a conta ${config.account} para conectar o armazenamento da DUUK.`)
    }
    await rpc('connect', { ...scope, state_hash: await sha256(state), google_subject: identity.sub, account_email: identity.email, tokens: tokensOf(token) })
  } catch (cause) {
    if (cause instanceof HttpError) throw cause
    throw new HttpError(cause instanceof DriveError ? cause.message : 'Não foi possível concluir a conexão com o Google. Tente novamente.', 400)
  }
  await dispatch(db, config, { budget: 20000, limit: 2 }).catch(() => {})
  return json({ connected: true }, headers)
})
