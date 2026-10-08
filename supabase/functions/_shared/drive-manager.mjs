import { driveRequest, DriveError, SourceError, tagFor } from './google-drive.mjs'

const api = 'https://www.googleapis.com/drive/v3/files'
const folderType = 'application/vnd.google-apps.folder'
const fields = 'id,name,description,mimeType,parents,trashed,appProperties'
const headers = ctx => ({ Authorization: `Bearer ${ctx.token}` })
const normalized = file => ({ drive_id: file.id, name: file.name || '', description: file.description || '', parent_drive_id: file.parents?.[0] || null })
const folder = item => item.type === 'folder'

// Only IDs resolved by the private database RPC reach this helper. Google markers
// additionally prevent changing a foreign item if stored metadata is corrupted.
export async function managedMetadata(ctx, target) {
 await ctx.check?.()
 if (!target?.id || !target.drive_id) throw new SourceError('Este item ainda não foi sincronizado com o Google Drive.')
 const file = await driveRequest(`${api}/${encodeURIComponent(target.drive_id)}?${new URLSearchParams({ fields })}`, { headers: headers(ctx) }, ctx.request)
 const marker = folder(target) ? file?.appProperties?.duuk_folder === await tagFor(target.id) && file.mimeType === folderType : file?.appProperties?.duuk_document === target.id && file.mimeType !== folderType
 if (file?.id !== target.drive_id || !marker) throw new SourceError('Não foi possível confirmar que este item pertence à DUUK. Nenhuma alteração foi feita.')
 return file
}

async function destination(ctx, parent) {
 const metadata = await managedMetadata(ctx, { ...parent, type: 'folder' })
 if (metadata.trashed) throw new SourceError('A pasta de destino está na lixeira. Restaure-a antes de continuar.')
 return metadata
}

export async function createManagedFolder(ctx, change) {
 const desired = change.desired || change
 await destination(ctx, change.parent)
 const key = change.folder_key || change.target?.id
 if (!key?.startsWith('custom:')) throw new SourceError('Identificador de pasta inválido.')
 const tag = await tagFor(key)
 const q = `appProperties has { key='duuk_folder' and value='${tag}' } and mimeType='${folderType}'`
 const found = await driveRequest(`${api}?${new URLSearchParams({ q, fields: `files(${fields})`, orderBy: 'createdTime', pageSize: '2', spaces: 'drive' })}`, { headers: headers(ctx) }, ctx.request)
 if (found?.files?.length > 1) throw new SourceError('Existem cópias conflitantes desta pasta no Drive. Revise-as antes de continuar.')
 let file = found?.files?.[0]
 if (file) {
  if (file.trashed || file.parents?.[0] !== change.parent.drive_id || file.name !== desired.name || (file.description || '') !== (desired.description || '')) throw new SourceError('A pasta desta operação já existe com outras informações no Google Drive. Revise-a antes de continuar.')
 } else {
  await ctx.check?.()
  file = await driveRequest(`${api}?${new URLSearchParams({ fields })}`, { method: 'POST', headers: { ...headers(ctx), 'Content-Type': 'application/json' }, body: JSON.stringify({ name: desired.name, description: desired.description || '', mimeType: folderType, parents: [change.parent.drive_id], appProperties: { duuk_folder: tag } }) }, ctx.request)
 }
 if (!file?.id) throw new DriveError(500)
 return normalized(file)
}

export async function updateManagedItem(ctx, change) {
 const { action, target, parent } = change, desired = change.desired || change
 if (target.id === 'root' && /_(move|trash|restore)$/.test(action)) throw new SourceError('A pasta principal DUUK deve permanecer disponível.')
 const current = await managedMetadata(ctx, target)
 const query = new URLSearchParams({ fields }), body = {}
 if (action.endsWith('_update')) {
  if (current.trashed) throw new SourceError('Restaure este item antes de editar.')
  body.name = desired.name; body.description = desired.description || ''
 } else if (action.endsWith('_move')) {
  if (current.trashed) throw new SourceError('Restaure este item antes de mover.')
  await destination(ctx, parent)
  if (current.id === parent.drive_id) throw new SourceError('Uma pasta não pode ser movida para dentro dela mesma.')
  if (!current.parents?.includes(parent.drive_id)) {
   query.set('addParents', parent.drive_id)
   if (current.parents?.length) query.set('removeParents', current.parents.join(','))
  }
 } else if (action.endsWith('_trash')) body.trashed = true
 else if (action.endsWith('_restore')) {
  if (parent) await destination(ctx, parent)
  body.trashed = false
 } else throw new SourceError('Operação de organização inválida.')
 await ctx.check?.()
 const result = await driveRequest(`${api}/${encodeURIComponent(target.drive_id)}?${query}`, { method: 'PATCH', headers: { ...headers(ctx), 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, ctx.request)
 if (result?.id !== target.drive_id) throw new DriveError(500)
 return normalized(result)
}
