import test from 'node:test'
import assert from 'node:assert/strict'
import { authorizationUrl, driveScope, driveRedirect, driveStatePrefix, DriveError, SourceError, ensurePath, ensureFolder, syncDocument, multipartBody, safeFileName, storageQuota, exchangeToken } from '../supabase/functions/_shared/google-drive.mjs'

const json = (status, data = {}) => new Response(status === 204 ? null : JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
const pdf = text => new TextEncoder().encode(`%PDF-1.7\n${text}`)
const sha = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('')

function fakeDrive() {
  const files = new Map(), calls = []
  let next = 1
  const ids = { create: 0, upload: 0 }
  const request = async (url, options = {}) => {
    const parsed = new URL(url), method = options.method || 'GET'
    calls.push([method, parsed.pathname, parsed.search])
    assert.equal(options.redirect, 'error')
    assert.match(options.headers.Authorization, /^Bearer /)
    assert(!parsed.pathname.includes('/permissions'), 'nenhum compartilhamento deve ser criado')
    if (parsed.pathname === '/drive/v3/about') return json(200, { storageQuota: { limit: '16106127360', usage: '1073741824' } })
    if (parsed.pathname === '/drive/v3/files' && method === 'GET') {
      const q = parsed.searchParams.get('q'), match = /key='([^']+)' and value='([^']+)'/.exec(q)
      const found = [...files.values()].filter(f => !f.trashed && f.appProperties?.[match[1]] === match[2] && (!q.includes('folder') || f.mimeType === 'application/vnd.google-apps.folder'))
      return json(200, { files: found.slice(0, 1) })
    }
    if (parsed.pathname === '/drive/v3/files' && method === 'POST') {
      const body = JSON.parse(options.body), id = `folder${next++}`
      ids.create++
      files.set(id, { id, trashed: false, ...body })
      return json(200, { id })
    }
    if (parsed.pathname.startsWith('/drive/v3/files/') && method === 'GET') {
      const file = files.get(decodeURIComponent(parsed.pathname.split('/').pop()))
      return file ? json(200, file) : json(404, { error: { errors: [{ reason: 'notFound' }] } })
    }
    if (parsed.pathname === '/upload/drive/v3/files') {
      assert.equal(parsed.searchParams.get('uploadType'), 'multipart')
      const text = new TextDecoder().decode(options.body), metadata = JSON.parse(text.split('\r\n\r\n')[1].split('\r\n--')[0]), id = `file${next++}`
      ids.upload++
      files.set(id, { id, trashed: false, webViewLink: `https://drive.google.com/file/d/${id}/view`, ...metadata, bytes: options.body })
      return json(200, files.get(id))
    }
    throw new Error(`Chamada inesperada ${method} ${url}`)
  }
  return { files, calls, ids, request }
}
function memoryStore() {
  const rows = new Map()
  return {
    rows,
    async get(key) { return rows.get(key) || null },
    async save(row) { rows.set(row.key, row) },
    async forget(key) { rows.delete(key); for (const [child, row] of rows) if (row.parent_key === key) await this.forget(child) },
    async uniqueName(parentKey, clientKey, name) {
      const n = [...rows.values()].filter(r => r.parent_key === (parentKey || null) && r.client_key !== clientKey && r.name.replace(/ \(\d+\)$/, '').toLowerCase() === name.toLowerCase()).length
      return n ? `${name} (${n + 1})` : name
    },
  }
}
const context = (drive, store = memoryStore()) => ({ token: 'access', request: drive.request, verified: new Set(), store })
const contract = { id: '11111111-1111-4111-8111-111111111111', kind: 'contract_original', client_key: 'crm:abc', client_name: 'Apollo Grill', file_name: 'Contrato Apollo Grill.pdf' }
const pathOf = (drive, id) => { const names = []; for (let file = drive.files.get(id); file; file = drive.files.get(file.parents?.[0])) names.unshift(file.name); return names.join('/') }

test('OAuth do Drive pede somente arquivos criados pelo app, identidade, PKCE e acesso offline', () => {
  const url = new URL(authorizationUrl('client-id', `${driveStatePrefix}state`, 'challenge', 'duukfilms@gmail.com'))
  assert.equal(url.origin, 'https://accounts.google.com')
  assert.equal(url.searchParams.get('redirect_uri'), driveRedirect)
  assert.deepEqual(url.searchParams.get('scope').split(' '), ['openid', 'email', driveScope])
  assert.equal(driveScope, 'https://www.googleapis.com/auth/drive.file')
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256')
  assert.equal(url.searchParams.get('access_type'), 'offline')
  assert.equal(url.searchParams.get('login_hint'), 'duukfilms@gmail.com')
  assert(url.searchParams.get('state').startsWith('drv.'))
  assert(!url.searchParams.has('client_secret'))
})

test('estrutura DUUK / Contratos / Cliente / Gerados e Assinados é criada uma única vez', async () => {
  const drive = fakeDrive(), ctx = context(drive)
  const generated = await ensurePath(ctx, contract)
  assert.equal(pathOf(drive, generated.id), 'DUUK/Contratos/Apollo Grill/Contratos Gerados')
  const signed = await ensurePath(ctx, { ...contract, kind: 'contract_signed' })
  assert.equal(pathOf(drive, signed.id), 'DUUK/Contratos/Apollo Grill/Contratos Assinados')
  const created = drive.ids.create
  assert.equal(created, 5)
  await ensurePath(context(drive, ctx.store), contract)
  await ensurePath(context(drive, ctx.store), { ...contract, kind: 'contract_signed' })
  assert.equal(drive.ids.create, created)
})

test('propostas ficam em Propostas Comerciais / Cliente e documentos em Documentos / Cliente', async () => {
  const drive = fakeDrive(), ctx = context(drive)
  assert.equal(pathOf(drive, (await ensurePath(ctx, { ...contract, kind: 'proposal' })).id), 'DUUK/Propostas Comerciais/Apollo Grill')
  assert.equal(pathOf(drive, (await ensurePath(ctx, { ...contract, kind: 'document' })).id), 'DUUK/Documentos/Apollo Grill')
})

test('banco vazio reaproveita as pastas marcadas no Drive em vez de duplicar', async () => {
  const drive = fakeDrive()
  await ensurePath(context(drive), contract)
  const before = drive.ids.create
  const again = await ensurePath(context(drive, memoryStore()), contract)
  assert.equal(drive.ids.create, before)
  assert.equal(pathOf(drive, again.id), 'DUUK/Contratos/Apollo Grill/Contratos Gerados')
})

test('pasta removida ou na lixeira do Drive é recriada e os filhos obsoletos são esquecidos', async () => {
  const drive = fakeDrive(), ctx = context(drive)
  await ensurePath(ctx, contract)
  const section = ctx.store.rows.get('section:contracts')
  drive.files.get(section.drive_id).trashed = true
  const fresh = context(drive, ctx.store)
  const folder = await ensureFolder(fresh, { key: 'section:contracts', name: 'Contratos', parent: { id: ctx.store.rows.get('root').drive_id, key: 'root' } })
  assert.notEqual(folder.id, section.drive_id)
  assert.equal(ctx.store.rows.get('section:contracts').drive_id, folder.id)
  assert(!ctx.store.rows.has('client:contracts:crm:abc'))
})

test('clientes com o mesmo nome e identificadores diferentes recebem pastas distintas', async () => {
  const drive = fakeDrive(), ctx = context(drive)
  const a = await ensurePath(ctx, { ...contract, client_key: 'crm:a' }), b = await ensurePath(ctx, { ...contract, client_key: 'crm:b' })
  assert.notEqual(a.id, b.id)
  assert.equal(pathOf(drive, b.id), 'DUUK/Contratos/Apollo Grill (2)/Contratos Gerados')
  assert.equal(pathOf(drive, (await ensurePath(ctx, { ...contract, client_key: 'crm:a' })).id), 'DUUK/Contratos/Apollo Grill/Contratos Gerados')
})

test('upload cria um PDF privado com marcador do documento e sem compartilhamento', async () => {
  const drive = fakeDrive(), bytes = pdf('original'), doc = { ...contract, source_sha256: await sha(bytes) }
  const result = await syncDocument(context(drive), doc, bytes)
  const file = drive.files.get(result.drive_file_id)
  assert.equal(file.name, 'Contrato Apollo Grill.pdf')
  assert.equal(file.mimeType, 'application/pdf')
  assert.equal(file.appProperties.duuk_document, contract.id)
  assert.equal(result.drive_link, `https://drive.google.com/file/d/${file.id}/view`)
  assert.equal(result.drive_folder_id, drive.files.get(file.parents[0]).id)
  assert(!drive.calls.some(([, path]) => path.includes('permissions')))
})

test('nova tentativa depois de resposta perdida adota o arquivo existente sem duplicar', async () => {
  const drive = fakeDrive(), bytes = pdf('assinado'), doc = { ...contract, kind: 'contract_signed', file_name: 'Contrato Apollo Grill - Assinado.pdf', source_sha256: await sha(bytes) }
  const first = await syncDocument(context(drive), doc, bytes)
  const second = await syncDocument(context(drive, memoryStore()), doc, bytes)
  assert.equal(drive.ids.upload, 1)
  assert.equal(second.drive_file_id, first.drive_file_id)
  assert.equal(pathOf(drive, drive.files.get(first.drive_file_id).id), 'DUUK/Contratos/Apollo Grill/Contratos Assinados/Contrato Apollo Grill - Assinado.pdf')
})

test('PDF alterado, vazio ou inválido nunca é enviado', async () => {
  const drive = fakeDrive(), bytes = pdf('conteudo')
  await assert.rejects(() => syncDocument(context(drive), { ...contract, source_sha256: 'f'.repeat(64) }, bytes), SourceError)
  await assert.rejects(() => syncDocument(context(drive), contract, new Uint8Array()), SourceError)
  await assert.rejects(() => syncDocument(context(drive), contract, new TextEncoder().encode('não é pdf')), e => e instanceof SourceError && e.retryable === false)
  assert.equal(drive.ids.upload, 0)
  assert.equal(drive.calls.length, 0)
})

test('erros do Google viram mensagens seguras, sem conteúdo do provedor', async () => {
  const failing = status => data => async () => json(status, data)
  await assert.rejects(() => exchangeToken({}, { id: 'a', secret: 'b' }, failing(400)({ error: 'invalid_grant', error_description: 'detalhe sensível' })), e => e.authorization && !e.message.includes('sensível'))
  await assert.rejects(() => storageQuota('t', failing(401)({})), e => e instanceof DriveError && e.authorization)
  await assert.rejects(() => storageQuota('t', failing(403)({ error: { errors: [{ reason: 'storageQuotaExceeded' }] } })), e => !e.authorization && e.retryable === false && /cheio/.test(e.message))
  await assert.rejects(() => storageQuota('t', failing(403)({ error: { errors: [{ reason: 'accessNotConfigured' }] } })), e => /API do Google Drive/.test(e.message) && e.retryable === false)
  await assert.rejects(() => storageQuota('t', failing(429)({})), e => e.retryable && !e.authorization)
  await assert.rejects(() => storageQuota('t', failing(500)({ error: 'x' })), e => e.retryable && !e.authorization)
})

test('espaço usado e limite são lidos quando o Google informa e aceitam contas sem limite', async () => {
  assert.deepEqual(await storageQuota('t', fakeDrive().request), { limit: 16106127360, usage: 1073741824 })
  assert.deepEqual(await storageQuota('t', async () => json(200, { storageQuota: { usage: '10' } })), { limit: null, usage: 10 })
})

test('nomes de pasta e arquivo removem caracteres inseguros e preservam acentos', () => {
  assert.equal(safeFileName('  Nova/Empresa: "Teste"  '), 'Nova Empresa Teste')
  assert.equal(safeFileName('Ação & Cia\n'), 'Ação & Cia')
  assert.equal(safeFileName('///'), 'Cliente')
  assert.equal(safeFileName('x'.repeat(200)).length, 90)
})

test('corpo multipart mantém os bytes do PDF intactos', () => {
  const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0, 255, 13, 10, 45, 45])
  const body = multipartBody({ name: 'a.pdf' }, bytes, 'limite')
  const marker = Array.from(new TextEncoder().encode('application/pdf\r\n\r\n')), start = body.findIndex((_, i) => marker.every((m, j) => body[i + j] === m)) + marker.length
  assert.deepEqual(Array.from(body.slice(start, start + bytes.length)), Array.from(bytes))
  assert(new TextDecoder().decode(body.slice(-10)).endsWith('--limite--'))
})
