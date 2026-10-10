import test from 'node:test'
import assert from 'node:assert/strict'
import { createManagedFolder, managedMetadata, updateManagedItem } from '../supabase/functions/_shared/drive-manager.mjs'
import { tagFor } from '../supabase/functions/_shared/google-drive.mjs'

const folderMime = 'application/vnd.google-apps.folder'
const response = (status, data = {}) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
const clone = value => JSON.parse(JSON.stringify(value))

function googleFixture(initial = []) {
 const files = new Map(initial.map(file => [file.id, clone(file)])), calls = []
 let next = 0, loseCreate = false, loseUpdate = false
 const request = async (raw, options = {}) => {
  const url = new URL(raw), method = options.method || 'GET', body = options.body ? JSON.parse(options.body) : null
  assert.equal(url.origin, 'https://www.googleapis.com')
  assert.equal(options.redirect, 'error')
  assert.equal(options.headers.Authorization, 'Bearer access-fixture')
  assert(!url.pathname.includes('/permissions'), 'a organização não cria compartilhamentos')
  assert(!url.pathname.startsWith('/upload/'), 'a organização nunca troca os bytes de um documento')
  assert.notEqual(method, 'DELETE', 'exclusão é uma lixeira reversível')
  calls.push({ method, path: url.pathname, query: url.searchParams, body })
  if (url.pathname === '/drive/v3/files' && method === 'GET') {
   const query = url.searchParams.get('q') || '', tag = /key='duuk_folder' and value='([^']+)'/.exec(query)?.[1]
   assert(tag, 'criação procura o marcador privado da pasta antes de enviar')
   return response(200, { files: [...files.values()].filter(file => (!query.includes('trashed=false') || !file.trashed) && file.appProperties?.duuk_folder === tag) })
  }
  if (url.pathname === '/drive/v3/files' && method === 'POST') {
   const file = { id: `created-${++next}`, trashed: false, ...body }
   files.set(file.id, file)
   if (loseCreate) { loseCreate = false; throw new Error('Resposta perdida após criação') }
   return response(200, clone(file))
  }
  const id = decodeURIComponent(url.pathname.split('/').pop()), file = files.get(id)
  if (!file) return response(404, { error: { errors: [{ reason: 'notFound' }] } })
  if (method === 'GET') return response(200, clone(file))
  if (method === 'PATCH') {
   assert.equal(options.headers['Content-Type'], 'application/json')
   assert(!Object.hasOwn(body, 'parents'), 'Google Drive move itens pelos parâmetros addParents/removeParents')
   for (const key of Object.keys(body)) assert(['name', 'description', 'trashed'].includes(key), `Campo protegido alterado: ${key}`)
   Object.assign(file, body)
   if (url.searchParams.has('addParents') || url.searchParams.has('removeParents')) {
    const removed = new Set((url.searchParams.get('removeParents') || '').split(',').filter(Boolean))
    file.parents = [...new Set([...(file.parents || []).filter(parent => !removed.has(parent)), ...(url.searchParams.get('addParents') || '').split(',').filter(Boolean)])]
    assert(file.parents.length <= 1, 'Drive mantém um único pai')
   }
   if (loseUpdate) { loseUpdate = false; throw new Error('Resposta perdida após alteração') }
   return response(200, clone(file))
  }
  throw new Error(`Requisição inesperada: ${method} ${url.pathname}`)
 }
 return { files, calls, request, loseNextCreate() { loseCreate = true }, loseNextUpdate() { loseUpdate = true } }
}

const context = fixture => ({ token: 'access-fixture', request: fixture.request, check: async () => {} })
const folderTarget = async (id = 'custom:folder-fixture', driveId = 'folder-fixture', overrides = {}) => ({
 target: { type: 'folder', id, drive_id: driveId, name: 'Pasta', parent_drive_id: 'root-fixture', revision: 1 },
 file: { id: driveId, name: 'Pasta', mimeType: folderMime, parents: ['root-fixture'], trashed: false, appProperties: { duuk_folder: await tagFor(id) }, ...overrides },
})
const documentTarget = () => ({
 target: { type: 'file', id: 'document-fixture', drive_id: 'file-fixture', name: 'Contrato assinado.pdf', parent_drive_id: 'root-fixture', revision: 1 },
 file: { id: 'file-fixture', name: 'Contrato assinado.pdf', mimeType: 'application/pdf', parents: ['root-fixture'], trashed: false, sha256Checksum: 'a'.repeat(64), appProperties: { duuk_document: 'document-fixture', duuk_kind: 'contract_signed', duuk_sha256: 'a'.repeat(64) } },
})

test('gerenciador reconhece apenas a pasta e o documento vinculados aos marcadores privados DUUK', async () => {
 const folder = await folderTarget(), document = documentTarget(), fixture = googleFixture([folder.file, document.file]), ctx = context(fixture)
 assert.equal((await managedMetadata(ctx, folder.target)).id, folder.file.id)
 assert.equal((await managedMetadata(ctx, document.target)).id, document.file.id)
 fixture.files.get(folder.file.id).appProperties.duuk_folder = 'outro-marcador'
 await assert.rejects(() => managedMetadata(ctx, folder.target))
 fixture.files.get(document.file.id).appProperties.duuk_document = 'outro-documento'
 await assert.rejects(() => managedMetadata(ctx, document.target))
 assert(fixture.calls.every(call => call.method === 'GET'))
})

test('nova pasta permanece privada e uma resposta perdida é recuperada sem duplicar a pasta', async () => {
 const root = await folderTarget('root', 'root-fixture'), fixture = googleFixture([root.file]), ctx = context(fixture), change = { action: 'folder_create', folder_key: 'custom:11111111-1111-4111-8111-111111111111', parent: { id: 'root', drive_id: 'root-fixture' }, desired: { name: 'Produção & Ação', description: 'Documentos da produção' } }
 fixture.loseNextCreate()
 await assert.rejects(() => createManagedFolder(ctx, change), /Resposta perdida/)
 const result = await createManagedFolder(ctx, change)
 assert.equal(result.drive_id, 'created-1')
 assert.equal(result.name, change.desired.name)
 assert.equal(result.parent_drive_id, change.parent.drive_id)
 assert.equal(fixture.calls.filter(call => call.method === 'POST').length, 1)
 const file = fixture.files.get(result.drive_id)
 assert.equal(file.mimeType, folderMime)
 assert.equal(file.description, change.desired.description)
 assert.deepEqual(file.parents, ['root-fixture'])
 assert.equal(file.appProperties.duuk_folder, await tagFor(change.folder_key))
})

test('renomear e editar descrição de PDF assinado altera somente metadados e preserva evidências', async () => {
 const { target, file } = documentTarget(), fixture = googleFixture([file]), before = clone(file), change = { action: 'document_update', target, desired: { name: 'Contrato final.pdf', description: 'Versão com todas as assinaturas' } }
 const result = await updateManagedItem(context(fixture), change)
 assert.equal(result.name, change.desired.name)
 const updated = fixture.files.get(file.id)
 assert.equal(updated.description, change.desired.description)
 assert.deepEqual(updated.appProperties, before.appProperties)
 assert.equal(updated.sha256Checksum, before.sha256Checksum)
 assert.equal(updated.mimeType, before.mimeType)
 assert.deepEqual(updated.parents, before.parents)
 const patches = fixture.calls.filter(call => call.method === 'PATCH')
 assert.equal(patches.length, 1)
 assert.deepEqual(patches[0].body, { name: change.desired.name, description: change.desired.description })
})

test('renomear pasta mantém ID, pai e marcadores e recupera resposta perdida sem criar outra pasta', async () => {
 const { target, file } = await folderTarget(), fixture = googleFixture([file]), before = clone(file), change = { action: 'folder_update', target, desired: { name: 'Pasta renomeada', description: 'Documentos da equipe' } }
 fixture.loseNextUpdate()
 await assert.rejects(() => updateManagedItem(context(fixture), change), /Resposta perdida/)
 const result = await updateManagedItem(context(fixture), change)
 assert.equal(result.drive_id, file.id)
 assert.equal(result.name, change.desired.name)
 assert.equal(result.description, change.desired.description)
 assert.deepEqual(fixture.files.get(file.id).parents, before.parents)
 assert.deepEqual(fixture.files.get(file.id).appProperties, before.appProperties)
 assert.equal(fixture.files.size, 1)
 assert.equal(fixture.calls.filter(call => call.method === 'POST').length, 0)
 assert(fixture.calls.filter(call => call.method === 'PATCH').every(call => !call.query.has('addParents') && !call.query.has('removeParents')))
})

test('mover usa o pai atual do Google e repete a operação sem duplicar ou voltar à pasta antiga', async () => {
 const { target, file } = await folderTarget(undefined, undefined, { parents: ['externally-moved-parent'] }), destination = await folderTarget('custom:destination', 'destination-fixture'), fixture = googleFixture([file, destination.file]), change = { action: 'folder_move', target, parent: { id: 'custom:destination', drive_id: 'destination-fixture' } }
 fixture.loseNextUpdate()
 await assert.rejects(() => updateManagedItem(context(fixture), change), /Resposta perdida/)
 const result = await updateManagedItem(context(fixture), change)
 assert.equal(result.parent_drive_id, 'destination-fixture')
 assert.deepEqual(fixture.files.get(file.id).parents, ['destination-fixture'])
 const firstPatch = fixture.calls.find(call => call.method === 'PATCH')
 assert.equal(firstPatch.query.get('addParents'), 'destination-fixture')
 assert.equal(firstPatch.query.get('removeParents'), 'externally-moved-parent')
 assert.deepEqual(firstPatch.body, {})
})

test('exclusão e restauração usam a lixeira do Google sem apagar o arquivo ou modificar seu conteúdo', async () => {
 const { target, file } = documentTarget(), fixture = googleFixture([file]), ctx = context(fixture)
 await updateManagedItem(ctx, { action: 'document_trash', target })
 assert.equal(fixture.files.get(file.id).trashed, true)
 await updateManagedItem(ctx, { action: 'document_restore', target })
 assert.equal(fixture.files.get(file.id).trashed, false)
 assert.deepEqual(fixture.files.get(file.id).appProperties, file.appProperties)
 assert.deepEqual(fixture.calls.filter(call => call.method === 'PATCH').map(call => call.body), [{ trashed: true }, { trashed: false }])
})

test('conexão ou permissão invalidada interrompe antes da alteração externa', async () => {
 const { target, file } = documentTarget(), fixture = googleFixture([file]), ctx = context(fixture)
 ctx.check = async () => { throw new Error('Conexão ou permissão mudou') }
 await assert.rejects(() => updateManagedItem(ctx, { action: 'document_update', target, name: 'Não alterar.pdf', description: '' }), /Conexão ou permissão mudou/)
 assert.equal(fixture.calls.filter(call => call.method !== 'GET').length, 0)
})

test('perda de autorização após leitura dos metadados impede o PATCH', async () => {
 const { target, file } = documentTarget(), fixture = googleFixture([file]), ctx = context(fixture)
 let checks = 0
 ctx.check = async () => { if (++checks === 2) throw new Error('Permissão removida após leitura') }
 await assert.rejects(() => updateManagedItem(ctx, { action: 'document_trash', target }), /Permissão removida após leitura/)
 assert.equal(fixture.calls.length, 1)
 assert.equal(fixture.calls[0].method, 'GET')
 assert.equal(fixture.files.get(file.id).trashed, false)
})

test('pasta principal não pode ser movida ou enviada à lixeira', async () => {
 const { target, file } = await folderTarget('root', 'root-fixture'), fixture = googleFixture([file]), ctx = context(fixture)
 for (const action of ['folder_move', 'folder_trash', 'folder_restore']) await assert.rejects(() => updateManagedItem(ctx, { action, target, parent: { id: 'custom:another', drive_id: 'other-fixture' } }), /principal DUUK/)
 assert.equal(fixture.calls.length, 0)
})

test('destino externo, pasta na lixeira ou MIME divergente não recebe arquivos da DUUK', async () => {
 const document = documentTarget(), folder = await folderTarget('custom:destination', 'destination-fixture'), fixture = googleFixture([document.file, folder.file]), ctx = context(fixture), change = { action: 'document_move', target: document.target, parent: { id: 'custom:destination', drive_id: 'destination-fixture' } }
 fixture.files.get(folder.file.id).appProperties.duuk_folder = 'foreign-marker'
 await assert.rejects(() => updateManagedItem(ctx, change))
 fixture.files.get(folder.file.id).appProperties.duuk_folder = await tagFor('custom:destination')
 fixture.files.get(folder.file.id).trashed = true
 await assert.rejects(() => updateManagedItem(ctx, change), /lixeira/)
 fixture.files.get(folder.file.id).trashed = false
 fixture.files.get(folder.file.id).mimeType = 'application/pdf'
 await assert.rejects(() => updateManagedItem(ctx, change))
 assert(fixture.calls.every(call => call.method === 'GET'))
 assert.deepEqual(fixture.files.get(document.file.id).parents, document.file.parents)
})

test('criação não adota pasta conflitante ou apagada e nunca cria cópia para contornar o conflito', async () => {
 const key = 'custom:11111111-1111-4111-8111-111111111111', root = await folderTarget('root', 'root-fixture'), existing = await folderTarget(key, 'existing-fixture'), fixture = googleFixture([root.file, existing.file]), ctx = context(fixture), change = { action: 'folder_create', folder_key: key, parent: { id: 'root', drive_id: 'root-fixture' }, desired: { name: 'Nova pasta', description: '' } }
 await assert.rejects(() => createManagedFolder(ctx, change), /outras informações/)
 Object.assign(fixture.files.get(existing.file.id), { name: 'Nova pasta', trashed: true })
 await assert.rejects(() => createManagedFolder(ctx, change), /outras informações/)
 Object.assign(fixture.files.get(existing.file.id), { trashed: false })
 fixture.files.set('duplicate-fixture', { ...clone(fixture.files.get(existing.file.id)), id: 'duplicate-fixture' })
 await assert.rejects(() => createManagedFolder(ctx, change), /cópias conflitantes/)
 assert.equal(fixture.calls.filter(call => call.method === 'POST').length, 0)
})
