export const driveScope = 'https://www.googleapis.com/auth/drive.file'
export const driveRedirect = 'https://www.duukfilms.com/admin/configuracoes/integracoes'
export const driveStatePrefix = 'drv.'
export const defaultDriveAccount = 'duukfilms@gmail.com'
const api = 'https://www.googleapis.com/drive/v3'
const uploadApi = 'https://www.googleapis.com/upload/drive/v3/files'
const folderType = 'application/vnd.google-apps.folder'
const multipartLimit = 5 * 1024 * 1024

export const sections = {
 contract_original: { section: 'contracts', label: 'Contratos', child: 'generated', childLabel: 'Contratos Gerados' },
 contract_signed: { section: 'contracts', label: 'Contratos', child: 'signed', childLabel: 'Contratos Assinados' },
 proposal: { section: 'proposals', label: 'Propostas Comerciais' },
 document: { section: 'documents', label: 'Documentos' },
}

const reasons = {
 storageQuotaExceeded: 'O armazenamento do Google Drive está cheio. Libere espaço na conta para continuar.',
 accessNotConfigured: 'A API do Google Drive ainda não foi ativada no Google Cloud.',
 rateLimitExceeded: 'O Google limitou as solicitações. Uma nova tentativa será feita.',
 userRateLimitExceeded: 'O Google limitou as solicitações. Uma nova tentativa será feita.',
 insufficientPermissions: 'A conta não concedeu acesso ao Google Drive. Conecte a conta novamente.',
}
export class DriveError extends Error {
 constructor(status, reason = '') {
  const authorization = status === 401 || reason === 'invalid_grant' || reason === 'insufficientPermissions' || reason === 'authError'
  super(authorization ? 'A autorização do Google expirou. Conecte a conta novamente.' : reasons[reason] || (status === 403 ? 'O Google recusou o acesso ao Drive.' : status === 429 ? reasons.rateLimitExceeded : 'Não foi possível salvar no Google Drive. Uma nova tentativa será feita.'))
  this.status = status; this.reason = reason; this.authorization = authorization
  // Falhas de configuração ou de espaço não se resolvem sozinhas em minutos; continuam visíveis para o administrador.
  this.retryable = !['storageQuotaExceeded', 'accessNotConfigured'].includes(reason)
 }
}
export class SourceError extends Error {
 constructor(message) { super(message); this.retryable = false }
}

export async function driveRequest(url, options = {}, request = fetch, timeout = 30000) {
 const response = await request(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(timeout) })
 if (response.status === 204) return null
 const data = await response.json().catch(() => ({}))
 if (!response.ok) throw new DriveError(response.status, typeof data.error === 'string' ? data.error : data.error?.errors?.[0]?.reason || '')
 return data
}

export function authorizationUrl(clientId, state, challenge, hint = defaultDriveAccount) {
 const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
 url.search = new URLSearchParams({ client_id: clientId, redirect_uri: driveRedirect, response_type: 'code', scope: `openid email ${driveScope}`, state, code_challenge: challenge, code_challenge_method: 'S256', access_type: 'offline', prompt: 'consent', include_granted_scopes: 'false', login_hint: hint }).toString()
 return url.href
}
export function exchangeToken(params, config, request = fetch) {
 return driveRequest('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ ...params, client_id: config.id, client_secret: config.secret }) }, request)
}
export async function identityOf(token, request = fetch) {
 return driveRequest('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${token}` } }, request)
}

export function safeFileName(value, fallback = 'Cliente') {
 const cleaned = String(value || '').normalize('NFC').replace(/[\\/:*?"<>|\p{Cc}]+/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 90).trim()
 return cleaned || fallback
}
export async function tagFor(key) {
 const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key))
 return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 32)
}
const quoted = value => String(value).replaceAll('\\', '\\\\').replaceAll("'", "\\'")
const authorized = token => ({ Authorization: `Bearer ${token}` })

export async function storageQuota(token, request = fetch) {
 const about = await driveRequest(`${api}/about?fields=storageQuota`, { headers: authorized(token) }, request)
 const quota = about?.storageQuota || {}
 return { limit: quota.limit ? Number(quota.limit) : null, usage: quota.usage ? Number(quota.usage) : null }
}

async function folderAvailable(ctx, id) {
 try {
  const folder = await driveRequest(`${api}/files/${encodeURIComponent(id)}?fields=id,trashed,mimeType`, { headers: authorized(ctx.token) }, ctx.request)
  return Boolean(folder?.id) && !folder.trashed && folder.mimeType === folderType
 } catch (error) { if (error?.status === 404) return false; throw error }
}

// Cria cada pasta uma única vez: banco primeiro, depois busca por marcador no Drive, e só então criação.
/** @param {any} ctx @param {{key: string, name: string, parent?: any, clientKey?: string | null}} folder */
export async function ensureFolder(ctx, { key, name, parent = null, clientKey = null }) {
 const existing = await ctx.store.get(key)
 if (existing) {
  if (ctx.verified.has(key)) return { id: existing.drive_id, key }
  if (await folderAvailable(ctx, existing.drive_id)) { ctx.verified.add(key); return { id: existing.drive_id, key } }
  await ctx.store.forget(key)
 }
 const tag = await tagFor(key)
 const query = `appProperties has { key='duuk_folder' and value='${tag}' } and mimeType='${folderType}' and trashed=false`
 const found = await driveRequest(`${api}/files?${new URLSearchParams({ q: query, fields: 'files(id,name)', orderBy: 'createdTime', pageSize: '1', spaces: 'drive' })}`, { headers: authorized(ctx.token) }, ctx.request)
 let id = found?.files?.[0]?.id, finalName = found?.files?.[0]?.name || name
 if (!id) {
  finalName = clientKey ? await ctx.store.uniqueName(parent?.key || null, clientKey, name) : name
  const created = await driveRequest(`${api}/files?fields=id`, { method: 'POST', headers: { ...authorized(ctx.token), 'Content-Type': 'application/json' }, body: JSON.stringify({ name: finalName, mimeType: folderType, ...(parent ? { parents: [parent.id] } : {}), appProperties: { duuk_folder: tag } }) }, ctx.request)
  id = created?.id
  if (!id) throw new DriveError(500)
 }
 await ctx.store.save({ key, drive_id: id, name: finalName, parent_key: parent?.key || null, client_key: clientKey })
 ctx.verified.add(key)
 return { id, key }
}

export async function ensurePath(ctx, doc) {
 const layout = sections[doc.kind]
 if (!layout) throw new SourceError('Tipo de documento não suportado.')
 const root = await ensureFolder(ctx, { key: 'root', name: 'DUUK' })
 const section = await ensureFolder(ctx, { key: `section:${layout.section}`, name: layout.label, parent: root })
 const client = await ensureFolder(ctx, { key: `client:${layout.section}:${doc.client_key}`, name: safeFileName(doc.client_name), parent: section, clientKey: doc.client_key })
 if (!layout.child) return client
 return ensureFolder(ctx, { key: `client:${layout.section}:${doc.client_key}:${layout.child}`, name: layout.childLabel, parent: client })
}

export function multipartBody(metadata, bytes, boundary) {
 const encoder = new TextEncoder()
 const head = encoder.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`)
 const tail = encoder.encode(`\r\n--${boundary}--`)
 const output = new Uint8Array(head.length + bytes.length + tail.length)
 output.set(head, 0); output.set(bytes, head.length); output.set(tail, head.length + bytes.length)
 return output
}

const fileFields = 'id,name,webViewLink,parents,appProperties,sha256Checksum'
// Uma resposta perdida após o upload é reconhecida pelo marcador do documento, sem enviar uma cópia nova.
export async function findDocumentFile(ctx, doc) {
 const query = `appProperties has { key='duuk_document' and value='${quoted(doc.id)}' } and trashed=false`
 const found = await driveRequest(`${api}/files?${new URLSearchParams({ q: query, fields: `files(${fileFields})`, orderBy: 'createdTime', pageSize: '1', spaces: 'drive' })}`, { headers: authorized(ctx.token) }, ctx.request)
 const file = found?.files?.[0] || null
 // Um identificador reconhecido nunca autoriza adotar bytes de outra origem ou substituir um assinado.
 if (file && (file.appProperties?.duuk_sha256 !== doc.source_sha256 || file.appProperties?.duuk_kind !== doc.kind || file.sha256Checksum && file.sha256Checksum !== doc.source_sha256)) throw new SourceError('Já existe no Drive um arquivo com conteúdo diferente deste registro. O documento foi preservado para revisão da administração.')
 return file
}
export async function uploadDocument(ctx, doc, folder, bytes) {
 await ctx.checkDocument?.(doc)
 const metadata = { name: doc.file_name, mimeType: 'application/pdf', parents: [folder.id], description: 'Enviado automaticamente pelo DUUK Admin.', appProperties: { duuk_document: doc.id, duuk_kind: doc.kind, duuk_sha256: doc.source_sha256 } }
 if (bytes.length <= multipartLimit) {
  const boundary = `duuk-${crypto.randomUUID()}`
  return driveRequest(`${uploadApi}?${new URLSearchParams({ uploadType: 'multipart', fields: fileFields })}`, { method: 'POST', headers: { ...authorized(ctx.token), 'Content-Type': `multipart/related; boundary=${boundary}` }, body: multipartBody(metadata, bytes, boundary) }, ctx.request, 60000)
 }
 const started = await ctx.request(`${uploadApi}?${new URLSearchParams({ uploadType: 'resumable', fields: fileFields })}`, {
  method: 'POST',
  headers: { ...authorized(ctx.token), 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': 'application/pdf', 'X-Upload-Content-Length': String(bytes.length) },
  body: JSON.stringify(metadata),
  redirect: 'error',
  signal: AbortSignal.timeout(30000),
 })
 if (!started.ok) {
  const data = await started.json().catch(() => ({}))
  throw new DriveError(started.status, typeof data.error === 'string' ? data.error : data.error?.errors?.[0]?.reason || '')
 }
 const location = started.headers.get('Location')
 let session
 try { session = new URL(location) } catch { throw new DriveError(500) }
 if (session.protocol !== 'https:' || session.username || session.password || session.port || !(session.hostname === 'www.googleapis.com' || session.hostname.endsWith('.googleapis.com'))) throw new DriveError(500)
 await ctx.checkDocument?.(doc)
 return driveRequest(session.href, { method: 'PUT', headers: { ...authorized(ctx.token), 'Content-Type': 'application/pdf' }, body: bytes }, ctx.request, 120000)
}

export async function syncDocument(ctx, doc, bytes) {
 if (!bytes?.length || String.fromCharCode(...bytes.slice(0, 5)) !== '%PDF-') throw new SourceError('O PDF de origem está indisponível ou inválido.')
 const digest = await crypto.subtle.digest('SHA-256', bytes)
 const actual = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
 if (doc.source_sha256 && doc.source_sha256 !== actual) throw new SourceError('O PDF de origem não confere com o registro. Nada foi enviado.')
 const source = { ...doc, source_sha256: actual }
 await ctx.checkDocument?.(source)
 const folder = await ensurePath(ctx, source)
 await ctx.checkDocument?.(source)
 const file = (await findDocumentFile(ctx, source)) || (await uploadDocument(ctx, source, folder, bytes))
 if (!file?.id) throw new DriveError(500)
 if (file.sha256Checksum && file.sha256Checksum !== actual) throw new SourceError('O conteúdo confirmado pelo Google não confere com o PDF de origem. O documento foi preservado para revisão da administração.')
 return { drive_file_id: file.id, drive_folder_id: file.parents?.[0] || folder.id, drive_link: file.webViewLink || `https://drive.google.com/file/d/${file.id}/view` }
}
