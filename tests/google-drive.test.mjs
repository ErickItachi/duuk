import test from 'node:test'
import assert from 'node:assert/strict'
import { authorizationUrl, driveScope, driveRedirect, driveStatePrefix, DriveError, SourceError, ensurePath, ensureFolder, syncDocument, multipartBody, safeFileName, storageQuota, exchangeToken, uploadDocument } from '../supabase/functions/_shared/google-drive.mjs'
import { driveState, safeDriveLink, safeDocumentUrl } from '../src/office/driveModel.js'

const json = (status, data = {}) => new Response(status === 204 ? null : JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
const pdf = text => new TextEncoder().encode(`%PDF-1.7\n${text}`)
const sha = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('')

function fakeDrive() {
  const files = new Map(), calls = [], sessions = new Map()
  let next = 1
  const ids = { create: 0, upload: 0, resumable: 0 }
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
      const type = parsed.searchParams.get('uploadType')
      if (type === 'resumable') {
        const session = `session${next++}`
        ids.resumable++
        sessions.set(session, JSON.parse(options.body))
        assert.equal(options.headers['X-Upload-Content-Type'], JSON.parse(options.body).mimeType)
        return new Response(null, { status: 200, headers: { Location: `https://www.googleapis.com/upload-session/${session}` } })
      }
      assert.equal(type, 'multipart')
      const text = new TextDecoder().decode(options.body), metadata = JSON.parse(text.split('\r\n\r\n')[1].split('\r\n--')[0]), id = `file${next++}`
      ids.upload++
      files.set(id, { id, trashed: false, webViewLink: `https://drive.google.com/file/d/${id}/view`, ...metadata, bytes: options.body })
      return json(200, files.get(id))
    }
    if (parsed.pathname.startsWith('/upload-session/') && method === 'PUT') {
      const metadata = sessions.get(parsed.pathname.split('/').pop()), id = `file${next++}`
      assert(metadata)
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

test('pasta automática removida definitivamente é recriada e os filhos obsoletos são esquecidos', async () => {
  const drive = fakeDrive(), ctx = context(drive)
  await ensurePath(ctx, contract)
  const section = ctx.store.rows.get('section:contracts')
  drive.files.delete(section.drive_id)
  const fresh = context(drive, ctx.store)
  const folder = await ensureFolder(fresh, { key: 'section:contracts', name: 'Contratos', parent: { id: ctx.store.rows.get('root').drive_id, key: 'root' } })
  assert.notEqual(folder.id, section.drive_id)
  assert.equal(ctx.store.rows.get('section:contracts').drive_id, folder.id)
  assert(!ctx.store.rows.has('client:contracts:crm:abc'))
})

test('pasta na lixeira do Google interrompe a fila sem recriar, esquecer referências ou reenviar arquivos', async () => {
  const drive = fakeDrive(), ctx = context(drive), bytes = pdf('original'), digest = await sha(bytes)
  await ensurePath(ctx, contract)
  const section = ctx.store.rows.get('section:contracts'), created = drive.ids.create, saved = [...ctx.store.rows.entries()]
  drive.files.get(section.drive_id).trashed = true
  await assert.rejects(() => syncDocument(context(drive, ctx.store), { ...contract, source_sha256: digest }, bytes), error => error instanceof SourceError && /lixeira/.test(error.message))
  assert.equal(drive.ids.create, created)
  assert.equal(drive.ids.upload, 0)
  assert.deepEqual([...ctx.store.rows.entries()], saved)
})

test('lixeira registrada no painel é respeitada mesmo com pasta verificada e sem consultar o Google', async () => {
  const drive = fakeDrive(), ctx = context(drive)
  const root = await ensureFolder(ctx, { key: 'root', name: 'DUUK' })
  ctx.store.rows.get('root').trashed_at = new Date().toISOString()
  const calls = drive.calls.length, created = drive.ids.create
  await assert.rejects(() => ensureFolder(ctx, { key: 'root', name: 'DUUK' }), error => error instanceof SourceError && /lixeira/.test(error.message))
  assert.equal(drive.calls.length, calls)
  assert.equal(drive.ids.create, created)
  assert.equal(ctx.store.rows.get('root').drive_id, root.id)
})

test('arquivo enviado à pasta escolhida mantém esse destino sem recriar a organização automática', async () => {
  const drive = fakeDrive(), ctx = context(drive), bytes = new TextEncoder().encode('Briefing organizado')
  const root = await ensureFolder(ctx, { key: 'root', name: 'DUUK' })
  const selected = await ensureFolder(ctx, { key: 'custom:production', name: 'Produção', parent: root }), created = drive.ids.create
  const result = await syncDocument(context(drive, ctx.store), { ...contract, kind: 'file', managed_folder_key: selected.key, mime_type: 'text/plain', file_name: 'Briefing.txt', source_sha256: await sha(bytes) }, bytes)
  assert.equal(result.drive_folder_id, selected.id)
  assert.equal(drive.ids.create, created)
  assert.equal(pathOf(drive, result.drive_file_id), 'DUUK/Produção/Briefing.txt')
  assert(!ctx.store.rows.has('section:documents'))
})

test('pasta personalizada ausente não é recriada nem substituída pela pasta automática', async () => {
  const drive = fakeDrive(), ctx = context(drive)
  const root = await ensureFolder(ctx, { key: 'root', name: 'DUUK' })
  const selected = await ensureFolder(ctx, { key: 'custom:production', name: 'Produção', parent: root }), created = drive.ids.create
  drive.files.delete(selected.id)
  await assert.rejects(() => ensurePath(context(drive, ctx.store), { ...contract, managed_folder_key: selected.key }), error => error instanceof SourceError && /Escolha outra pasta/.test(error.message))
  assert.equal(drive.ids.create, created)
  assert.equal(drive.ids.upload, 0)
  assert.equal(ctx.store.rows.get(selected.key).drive_id, selected.id)
  const calls = drive.calls.length
  ctx.store.rows.delete(selected.key)
  await assert.rejects(() => ensurePath(context(drive, ctx.store), { ...contract, managed_folder_key: selected.key }), SourceError)
  assert.equal(drive.calls.length, calls)
})

test('arquivo na lixeira não volta ao Drive por nova tentativa de sincronização', async () => {
  const drive = fakeDrive(), bytes = pdf('original'), digest = await sha(bytes)
  await assert.rejects(() => syncDocument(context(drive), { ...contract, drive_trashed_at: new Date().toISOString(), source_sha256: digest }, bytes), error => error instanceof SourceError && /lixeira/.test(error.message))
  assert.equal(drive.calls.length, 0)
  assert.equal(drive.ids.upload, 0)
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

test('PDF acima de 5 MB usa sessão resumível oficial', async () => {
  const drive = fakeDrive(), bytes = new Uint8Array(5 * 1024 * 1024 + 1)
  bytes.set(new TextEncoder().encode('%PDF-1.7\n'))
  const result = await syncDocument(context(drive), { ...contract, source_sha256: await sha(bytes) }, bytes)
  assert.equal(drive.ids.resumable, 1)
  assert.equal(drive.ids.upload, 1)
  assert.equal(drive.files.get(result.drive_file_id).bytes.length, bytes.length)
  assert(drive.calls.some(([, path, search]) => path === '/upload/drive/v3/files' && search.includes('uploadType=resumable')))
})

test('biblioteca envia arquivo interno com MIME original e repetir não duplica', async () => {
 const drive = fakeDrive(), ctx = context(drive), bytes = new TextEncoder().encode('Briefing da DUUK')
 const doc = { ...contract, kind: 'file', client_key: 'internal', client_name: 'Internos', file_name: 'Briefing.txt', mime_type: 'text/plain', source_sha256: await sha(bytes) }
 const first = await syncDocument(ctx, doc, bytes), second = await syncDocument(context(drive, ctx.store), doc, bytes)
 assert.equal(first.drive_file_id, second.drive_file_id)
 assert.equal(drive.ids.upload, 1)
 const file = drive.files.get(first.drive_file_id)
 assert.equal(file.mimeType, 'text/plain')
 assert.match(new TextDecoder().decode(file.bytes), /Content-Type: text\/plain/)
 assert.equal(pathOf(drive, first.drive_folder_id), 'DUUK/Documentos/Internos')
})

test('vídeo da biblioteca usa upload resumível preservando MIME e tamanho', async () => {
 const drive = fakeDrive(), bytes = new Uint8Array(5 * 1024 * 1024 + 1)
 bytes.set(new TextEncoder().encode('ftyp'), 4)
 const doc = { ...contract, kind: 'file', file_name: 'Cena.mp4', mime_type: 'video/mp4', source_sha256: await sha(bytes) }
 const result = await syncDocument(context(drive), doc, bytes)
 assert.equal(drive.ids.resumable, 1)
 assert.equal(drive.files.get(result.drive_file_id).mimeType, 'video/mp4')
 assert.equal(drive.files.get(result.drive_file_id).bytes.length, bytes.length)
})

test('nova tentativa depois de resposta perdida adota o arquivo existente sem duplicar', async () => {
  const drive = fakeDrive(), bytes = pdf('assinado'), doc = { ...contract, kind: 'contract_signed', file_name: 'Contrato Apollo Grill - Assinado.pdf', source_sha256: await sha(bytes) }
  const first = await syncDocument(context(drive), doc, bytes)
  const second = await syncDocument(context(drive, memoryStore()), doc, bytes)
  assert.equal(drive.ids.upload, 1)
  assert.equal(second.drive_file_id, first.drive_file_id)
  assert.equal(pathOf(drive, drive.files.get(first.drive_file_id).id), 'DUUK/Contratos/Apollo Grill/Contratos Assinados/Contrato Apollo Grill - Assinado.pdf')
})

test('arquivo com marcador do documento mas conteúdo diferente nunca é adotado nem sobrescrito', async () => {
  const drive = fakeDrive(), bytes = pdf('versao final'), doc = { ...contract, kind: 'contract_signed', source_sha256: await sha(bytes) }
  const first = await syncDocument(context(drive), doc, bytes)
  const other = pdf('outra versao'), otherSha = await sha(other)
  await assert.rejects(() => syncDocument(context(drive), { ...doc, source_sha256: otherSha }, other), SourceError)
  assert.equal(drive.ids.upload, 1)
  assert.equal(drive.files.get(first.drive_file_id).appProperties.duuk_sha256, doc.source_sha256)
  drive.files.get(first.drive_file_id).appProperties.duuk_kind = 'contract_original'
  await assert.rejects(() => syncDocument(context(drive), doc, bytes), SourceError)
  assert.equal(drive.ids.upload, 1)
  drive.files.get(first.drive_file_id).appProperties.duuk_kind = doc.kind
  drive.files.get(first.drive_file_id).sha256Checksum = otherSha
  await assert.rejects(() => syncDocument(context(drive), doc, bytes), SourceError)
  assert.equal(drive.ids.upload, 1)
})

test('worker que perdeu autorização ou revisão interrompe antes de acessar o Google', async () => {
  const drive = fakeDrive(), ctx = context(drive), bytes = pdf('original')
  ctx.checkDocument = async () => { throw new Error('Conexão ou origem mudou') }
  const digest = await sha(bytes)
  await assert.rejects(() => syncDocument(ctx, { ...contract, source_sha256: digest }, bytes), /Conexão ou origem mudou/)
  assert.equal(drive.calls.length, 0)
})

test('desconexão durante a organização ou sessão resumível impede o envio dos bytes', async () => {
  const drive = fakeDrive(), ctx = context(drive), bytes = pdf('original'), digest = await sha(bytes)
  let checks = 0
  ctx.checkDocument = async () => { if (++checks === 2) throw new Error('Conexão mudou') }
  await assert.rejects(() => syncDocument(ctx, { ...contract, source_sha256: digest }, bytes), /Conexão mudou/)
  assert(drive.ids.create > 0)
  assert.equal(drive.ids.upload, 0)
  checks = 0
  const large = new Uint8Array(5 * 1024 * 1024 + 1)
  await assert.rejects(() => uploadDocument(ctx, contract, { id: 'folder' }, large), /Conexão mudou/)
  assert.equal(drive.ids.resumable, 1)
  assert.equal(drive.ids.upload, 0)
  assert(!drive.calls.some(([method]) => method === 'PUT'))
})

test('sessão resumível nunca encaminha token e PDF para um endereço externo ao Google', async () => {
  const bytes = new Uint8Array(5 * 1024 * 1024 + 1)
  for (const location of ['https://attacker.invalid/upload', 'http://www.googleapis.com/upload', 'https://www.googleapis.com.attacker.invalid/upload', 'invalid']) {
    let calls = 0
    const ctx = { token: 'token-privado', request: async (url, options) => {
      calls++
      assert.equal(new URL(url).hostname, 'www.googleapis.com')
      assert.equal(options.method, 'POST')
      return new Response(null, { status: 200, headers: { Location: location } })
    } }
    await assert.rejects(() => uploadDocument(ctx, contract, { id: 'folder' }, bytes), DriveError)
    assert.equal(calls, 1)
  }
})

test('renovação OAuth envia credenciais somente no corpo e mantém falhas seguras', async () => {
  const config = { id: 'cliente', secret: 'segredo&privado' }
  const result = await exchangeToken({ grant_type: 'refresh_token', refresh_token: 'refresh+privado' }, config, async (url, options) => {
    assert.equal(url, 'https://oauth2.googleapis.com/token')
    assert.equal(options.method, 'POST')
    assert.equal(options.redirect, 'error')
    assert(options.signal instanceof AbortSignal)
    const body = new URLSearchParams(options.body)
    assert.equal(body.get('refresh_token'), 'refresh+privado')
    assert.equal(body.get('client_secret'), config.secret)
    assert.equal(body.get('grant_type'), 'refresh_token')
    return json(200, { access_token: 'acesso-renovado', expires_in: 3600 })
  })
  assert.equal(result.access_token, 'acesso-renovado')
  await assert.rejects(() => exchangeToken({}, config, async () => new Response('segredo&privado', { status: 502 })), e => e.retryable && !e.message.includes(config.secret))
})

test('estado visual do contrato só informa sucesso quando original e final estão sincronizados', () => {
  const original = { kind: 'contract_original', status: 'synced' }
  const signed = { kind: 'contract_signed', status: 'synced' }
  assert.equal(driveState({ status: 'draft' }, []), null)
  assert.equal(driveState({ status: 'signed' }, []), 'pending')
  assert.equal(driveState({ status: 'partial' }, [original]), 'synced')
  assert.equal(driveState({ status: 'signed' }, [original]), 'pending')
  assert.equal(driveState({ status: 'signed' }, [original, signed]), 'synced')
  assert.equal(driveState({ status: 'signed' }, [original, { ...signed, status: 'error' }]), 'error')
})

test('URLs de visualização rejeitam protocolos, origens e caminhos de documentos indevidos', () => {
  const drive = 'https://drive.google.com/file/d/privado/view'
  assert.equal(safeDriveLink(drive), drive)
  for (const url of ['javascript:alert(1)', 'http://drive.google.com/file/d/a', 'https://drive.google.com.attacker.invalid/a', 'https://u:p@drive.google.com/file/d/a']) assert.equal(safeDriveLink(url), '')
  const origin = 'https://project.supabase.co'
  const signed = `${origin}/storage/v1/object/sign/duuk-documents/original/a.pdf?token=privado`
  assert.equal(safeDocumentUrl(signed, origin), signed)
  for (const url of [signed.replace('project.supabase.co', 'attacker.invalid'), signed.replace('/sign/', '/public/'), signed.replace('/duuk-documents/', '/duuk-media/'), signed.replace('https://', 'https://u:p@')]) assert.equal(safeDocumentUrl(url, origin), '')
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
