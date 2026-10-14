import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { LayoutGrid } from 'lucide-react'
import { useAuth } from '../content/AuthContext'
import { supabase } from '../content/supabase'
import { driveRequest } from '../office/api'
import { useQuery } from '../office/useQuery'
import { DriveChip } from '../office/DriveDocuments'
import { safeDocumentUrl, safeDriveLink } from '../office/driveModel'
import { driveMetadataError, driveNameLimit } from '../office/driveMetadata.mjs'
import { fmtTime } from '../crm/model'
import { ConfirmModal, Icon, Modal, RefreshButton } from './components'
import { EmptyState, ErrorState, FieldError, PageTitle } from './forms'
import { useUnsavedChanges } from './unsavedChanges'
import { platformRequest } from './api'
import AppLogo from './AppLogo'
import { usePdf } from '../office/usePdf'
import PdfPage from '../office/PdfPage'
import '../office/drive.css'

const categories = [['', 'Todas as categorias'], ['contract_original', 'Contratos originais'], ['contract_signed', 'Assinados'], ['proposal', 'Propostas'], ['document', 'Documentos'], ['file', 'Arquivos']]
const bytesLabel = value => value ? value < 1048576 ? `${Math.ceil(value / 1024)} KB` : `${(value / 1048576).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB` : 'PDF'
const formats = '.pdf,.jpg,.jpeg,.png,.webp,.docx,.xlsx,.pptx,.txt,.csv,.zip,.mp4,.mov'
const uploadLimit = 20971520
const itemName = item => item.name || item.file_name || item.title
const categoryLabel = kind => categories.find(([value]) => value && value === kind)?.[1] || ''
const fileIcon = item => item.mime_type?.startsWith('image/') ? 'media' : item.mime_type?.startsWith('video/') ? 'film' : item.mime_type === 'application/pdf' ? 'document' : 'file'
const extension = name => (String(name || '').match(/\.([a-z0-9]{1,5})$/i)?.[1] || '').toUpperCase()
const joined = (...parts) => parts.filter(Boolean).join(' · ')
// List or grid is a per-device convenience; the page works the same without storage.
const viewKey = 'duuk-drive-view'
const readView = () => { try { return localStorage.getItem(viewKey) === 'grid' ? 'grid' : 'list' } catch { return 'list' } }
const storeView = value => { try { localStorage.setItem(viewKey, value) } catch { /* Kept for this visit only. */ } }

function useMutationRequest() {
 const last = useRef(null)
 return useCallback(payload => {
  const key = JSON.stringify(payload)
  if (last.current?.key !== key) last.current = { key, id: crypto.randomUUID() }
  return { ...payload, request_id: last.current.id }
 }, [])
}

// Long folder lists open in steps. A new folder, tab or search starts again from the first step.
function useReveal(total, resetKey, step = 24) {
 const [state, setState] = useState({ key: resetKey, count: step })
 const count = state.key === resetKey ? state.count : step
 return { count: Math.min(count, total), remaining: Math.max(0, total - count), more: () => setState({ key: resetKey, count: count + step }) }
}

function PdfPreview({ url }) {
 const pdf = usePdf(url), [page, setPage] = useState(0)
 if (pdf.error) return <ErrorState>{pdf.error}</ErrorState>
 if (!pdf.document) return <div className="drive-preview__loading" role="status"><span className="ds-visually-hidden">Carregando PDF…</span><span className="ds-skeleton" aria-hidden="true" /></div>
 return <><div className="office-pdf-toolbar"><label>Página <select aria-label="Página do arquivo PDF" value={page} onChange={event => setPage(Number(event.target.value))}>{Array.from({ length: pdf.document.numPages }, (_, index) => <option key={index} value={index}>{index + 1} de {pdf.document.numPages}</option>)}</select></label></div><div className="drive-library-pdf"><PdfPage document={pdf.document} page={page} /></div></>
}

function folderOptions(folders, excludedId) {
 const byParent = new Map(), result = [], excluded = new Set(excludedId ? [excludedId] : [])
 for (const folder of folders) { const key = folder.parent_id || ''; if (!byParent.has(key)) byParent.set(key, []); byParent.get(key).push(folder) }
 const descend = id => { for (const folder of byParent.get(id) || []) { if (excluded.has(folder.id)) continue; excluded.add(folder.id); descend(folder.id) } }
 if (excludedId) descend(excludedId)
 const visit = (parent, depth = 0, path = '') => {
  for (const folder of [...(byParent.get(parent) || [])].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))) {
   if (excluded.has(folder.id) || result.some(item => item.id === folder.id)) continue
   const label = path ? `${path} / ${folder.name}` : folder.name
   result.push({ ...folder, label, depth }); visit(folder.id, depth + 1, label)
  }
 }
 visit('')
 // Roots hidden by permissions still have navigable child folders.
 for (const folder of folders) if (!excluded.has(folder.id) && !result.some(item => item.id === folder.id)) { result.push({ ...folder, label: folder.name, depth: 0 }); visit(folder.id, 1, folder.name) }
 return result
}

function FolderSelect({ query, value, onChange, disabled, excludedId, automatic = false, label = 'Pasta de destino' }) {
 const id = useId(), options = folderOptions(query.data?.folders || [], excludedId)
 return <div className="admin-field">
  <label className="admin-label" htmlFor={id}>{label}</label>
  <select id={id} value={value || ''} onChange={event => onChange(event.target.value)} disabled={disabled || query.loading}>{query.loading && !query.data ? <option value={value || ''}>Carregando pastas…</option> : <><option value="root">DUUK</option>{automatic && <option value="">Organização automática</option>}{options.filter(folder => folder.id !== 'root' && folder.can_upload !== false).map(folder => <option key={folder.id} value={folder.id}>{folder.label}</option>)}</>}</select>
  {query.error && <p className="drive-inline-error" role="alert"><Icon name="alertCircle" size={14} /><span>{query.error}</span><button className="admin-text-button" type="button" onClick={query.reload}>Tentar novamente</button></p>}
 </div>
}

function MetadataDialog({ item, type, folderId, onClose, onSaved }) {
 const creating = !item, originalName = item ? itemName(item) : '', originalDescription = item?.description || '', mutationRequest = useMutationRequest(), fieldId = useId()
 const [name, setName] = useState(originalName), [description, setDescription] = useState(originalDescription), [busy, setBusy] = useState(false), [error, setError] = useState(''), [discard, setDiscard] = useState(false), [attempted, setAttempted] = useState(false), working = useRef(false), form = useRef(null)
 const dirty = name !== originalName || description !== originalDescription
 // The same rules the private RPC applies, shown beside the field they concern.
 const validation = attempted ? driveMetadataError({ name, description, type, originalName }) : ''
 const descriptionError = /descrição/i.test(validation) ? validation : '', nameError = validation && !descriptionError ? validation : ''
 useUnsavedChanges(dirty || busy)
 const close = () => { if (!busy) { if (dirty) setDiscard(true); else onClose() } }
 const submit = async event => {
  event.preventDefault(); if (working.current) return
  if (driveMetadataError({ name, description, type, originalName })) { setAttempted(true); setError(''); requestAnimationFrame(() => form.current?.querySelector('[aria-invalid="true"]')?.focus()); return }
  working.current = true; setBusy(true); setError('')
  try {
   await driveRequest(mutationRequest({ action: type === 'folder' ? creating ? 'folder_create' : 'folder_update' : 'document_update', id: item?.id, parent_id: creating ? folderId || 'root' : undefined, name: name.trim(), description: description.trim(), revision: item?.revision }))
   await onSaved(creating ? 'Pasta criada.' : 'Alterações salvas.'); onClose()
  } catch (cause) { setError(cause.message) } finally { working.current = false; setBusy(false) }
 }
 return <><Modal title={creating ? 'Nova pasta' : type === 'folder' ? 'Editar pasta' : 'Editar arquivo'} subtitle={creating ? 'A pasta será criada dentro da pasta aberta, com acesso privado.' : 'O nome e a descrição ajudam a equipe a encontrar este conteúdo.'} onClose={close}>
  <form ref={form} onSubmit={submit} noValidate aria-busy={busy}>
   <div className="admin-modal__body drive-dialog">
    <div className="admin-field"><label className="admin-label" htmlFor={`${fieldId}-name`}>{type === 'folder' ? 'Nome da pasta' : 'Nome do arquivo'}</label><input id={`${fieldId}-name`} value={name} onChange={event => setName(event.target.value)} maxLength={driveNameLimit(type)} required disabled={busy} autoFocus aria-invalid={nameError ? true : undefined} aria-describedby={`${fieldId}-name-hint${nameError ? ` ${fieldId}-name-error` : ''}`} /><small id={`${fieldId}-name-hint`}>Até {driveNameLimit(type)} caracteres.{type === 'file' && ' Preserve a extensão do arquivo.'}</small><FieldError id={`${fieldId}-name-error`}>{nameError}</FieldError></div>
    <div className="admin-field"><label className="admin-label" htmlFor={`${fieldId}-description`}>Descrição <small>(opcional)</small></label><textarea id={`${fieldId}-description`} value={description} onChange={event => setDescription(event.target.value)} maxLength={2000} rows={4} disabled={busy} placeholder="Detalhes para ajudar a equipe a encontrar este conteúdo." aria-invalid={descriptionError ? true : undefined} aria-describedby={descriptionError ? `${fieldId}-description-error` : undefined} /><FieldError id={`${fieldId}-description-error`}>{descriptionError}</FieldError></div>
    {type === 'file' && <p className="drive-dialog__note"><Icon name="shield" size={16} /><span>A organização do arquivo preserva o contrato, as assinaturas e os registros de origem.</span></p>}
    {error && <ErrorState>{error}</ErrorState>}
   </div>
   <div className="admin-modal__foot"><button className="admin-button admin-button--secondary" type="button" onClick={close} disabled={busy}>Cancelar</button><button className="admin-button" disabled={busy || !name.trim()} aria-busy={busy}><Icon name={creating ? 'plus' : 'check'} />{busy ? 'Salvando…' : creating ? 'Criar pasta' : 'Salvar alterações'}</button></div>
  </form>
 </Modal>{discard && <ConfirmModal title="Descartar alterações?" message="As alterações deste formulário ainda não foram salvas." action="Descartar" onConfirm={async () => onClose()} onClose={() => setDiscard(false)} />}</>
}

function MoveDialog({ item, type, onClose, onSaved }) {
 const mutationRequest = useMutationRequest()
 const [destination, setDestination] = useState(item.parent_id || item.folder_id || 'root'), [busy, setBusy] = useState(false), [error, setError] = useState(''), [discard, setDiscard] = useState(false), working = useRef(false)
 const folders = useQuery(useCallback(() => driveRequest({ action: 'folders' }), [])), originalDestination = item.parent_id || item.folder_id || 'root'
 useUnsavedChanges(destination !== originalDestination || busy)
 const close = () => { if (!busy) { if (destination !== originalDestination) setDiscard(true); else onClose() } }
 const submit = async event => {
  event.preventDefault(); if (working.current) return
  working.current = true; setBusy(true); setError('')
  try { await driveRequest(mutationRequest({ action: type === 'folder' ? 'folder_move' : 'document_move', id: item.id, parent_id: destination || 'root', revision: item.revision })); await onSaved('Movido para a pasta selecionada.'); onClose() }
  catch (cause) { setError(cause.message) } finally { working.current = false; setBusy(false) }
 }
 return <><Modal title="Mover para outra pasta" subtitle="O conteúdo permanece privado e mantém suas permissões de acesso." onClose={close}><form onSubmit={submit} aria-busy={busy}>
  <div className="admin-modal__body drive-dialog">
   <p className="drive-dialog-item"><span className="drive-dialog-item__icon" aria-hidden="true"><Icon name={type === 'folder' ? 'folder' : 'file'} /></span><strong>{itemName(item)}</strong></p>
   <FolderSelect query={folders} value={destination} onChange={setDestination} disabled={busy} excludedId={type === 'folder' ? item.id : null} />
   {error && <ErrorState>{error}</ErrorState>}
  </div>
  <div className="admin-modal__foot"><button className="admin-button admin-button--secondary" type="button" disabled={busy} onClick={close}>Cancelar</button><button className="admin-button" disabled={busy || folders.loading || !!folders.error || destination === originalDestination} aria-busy={busy}><Icon name="move" />{busy ? 'Movendo…' : 'Mover'}</button></div>
 </form></Modal>{discard && <ConfirmModal title="Descartar alterações?" message="A mudança de pasta ainda não foi salva." action="Descartar" onConfirm={async () => onClose()} onClose={() => setDiscard(false)} />}</>
}

function UploadFile({ onClose, onSaved, connected, folderId }) {
 const auth = useAuth(), canClients = auth.hasPermission('crm.clients'), fieldId = useId(), [file, setFile] = useState(null), [title, setTitle] = useState(''), [client, setClient] = useState(''), [destination, setDestination] = useState(folderId || ''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [discard, setDiscard] = useState(false), working = useRef(false)
 const dirty = !!file || !!title.trim() || !!client || destination !== (folderId || '')
 // The same size rule the upload already enforced, shown as soon as a file is chosen.
 const fileError = file && (!file.size || file.size > uploadLimit) ? 'Escolha um arquivo de até 20 MB.' : ''
 useUnsavedChanges(dirty || busy)
 const close = () => { if (!busy) { if (dirty) setDiscard(true); else onClose() } }
 const folders = useQuery(useCallback(() => driveRequest({ action: 'folders' }), []))
 const clients = useQuery(useCallback(async () => {
  if (!canClients) return []
  const { data, error } = await supabase.from('duuk_clients').select('id,name,company').order('name').limit(1000)
  if (error) throw new Error('Não foi possível carregar os clientes. Tente novamente.')
  return data
 }, [canClients]))
 const upload = async event => {
  event.preventDefault(); if (working.current) return
  setError('')
  if (!file || !file.size || file.size > uploadLimit) { if (!file) setError('Escolha um arquivo de até 20 MB.'); window.document.getElementById(`${fieldId}-file`)?.focus(); return }
  working.current = true; setBusy(true)
  try {
   const body = new FormData(); body.append('file', file); body.append('title', title); if (client) body.append('client_id', client); if (destination) body.append('folder_id', destination)
   await platformRequest('duuk-drive?library=1', body)
   onSaved()
  } catch (cause) { setError(cause.message) } finally { working.current = false; setBusy(false) }
 }
 return <><Modal title="Enviar arquivo" subtitle={connected ? 'O arquivo fica salvo no painel e segue para a pasta privada da DUUK no Google Drive.' : 'O arquivo fica salvo no painel e aguarda a conexão do Google Drive para ser enviado.'} onClose={close}>
  <form onSubmit={upload} aria-busy={busy}>
   <div className="admin-modal__body drive-dialog">
    <div className="admin-field">
     <span className="admin-label" id={`${fieldId}-file-label`}>Arquivo</span>
     <div className={`drive-dropzone${fileError ? ' is-invalid' : ''}${busy ? ' is-disabled' : ''}`}>
      <input id={`${fieldId}-file`} className="drive-dropzone__input" type="file" accept={formats} disabled={busy} onChange={event => { setFile(event.target.files[0] || null); setError('') }} required aria-labelledby={`${fieldId}-file-label`} aria-describedby={`${fieldId}-file-hint${fileError ? ` ${fieldId}-file-error` : ''}`} aria-invalid={fileError ? true : undefined} />
      <span className="drive-dropzone__icon" aria-hidden="true"><Icon name="cloudUpload" size={20} /></span>
      <span className="drive-dropzone__text"><strong>{file ? 'Trocar arquivo' : 'Escolha ou arraste um arquivo'}</strong><small id={`${fieldId}-file-hint`}>PDF, imagens, Office, TXT, CSV, ZIP e vídeos MP4/MOV. Até 20 MB por arquivo.</small></span>
     </div>
     {file && <p className={`drive-selected-file${fileError ? ' is-invalid' : ''}`}><span className="drive-selected-file__icon" aria-hidden="true"><Icon name={fileIcon({ mime_type: file.type })} /></span><span>{file.name}<small>{file.size ? bytesLabel(file.size) : '0 KB'}</small></span></p>}
     <FieldError id={`${fieldId}-file-error`}>{fileError}</FieldError>
    </div>
    <div className="admin-field"><label className="admin-label" htmlFor={`${fieldId}-title`}>Título <small>(opcional)</small></label><input id={`${fieldId}-title`} value={title} maxLength={160} disabled={busy} onChange={event => setTitle(event.target.value)} placeholder="Ex.: Briefing de produção" /></div>
    <FolderSelect query={folders} value={destination} onChange={setDestination} disabled={busy} automatic />
    {canClients && <div className="admin-field"><label className="admin-label" htmlFor={`${fieldId}-client`}>Vincular ao cliente <small>(opcional)</small></label><select id={`${fieldId}-client`} value={client} disabled={busy || clients.loading} onChange={event => setClient(event.target.value)}><option value="">Sem vínculo com cliente</option>{clients.data?.map(item => <option key={item.id} value={item.id}>{item.company || item.name}</option>)}</select><small>Sem uma pasta escolhida, o arquivo será organizado em Documentos / Cliente ou Internos.</small></div>}
    {clients.error && <ErrorState onRetry={clients.reload}>{clients.error}</ErrorState>}
    {busy && <div className="drive-progress" role="status"><span className="ds-progress drive-progress__bar" aria-hidden="true"><span /></span><small>Enviando {file?.name}… Mantenha esta janela aberta.</small></div>}
    {error && <ErrorState>{error}</ErrorState>}
   </div>
   <div className="admin-modal__foot"><button type="button" className="admin-button admin-button--secondary" disabled={busy} onClick={close}>Cancelar</button><button className="admin-button" disabled={busy || !file || folders.loading || !!folders.error} aria-busy={busy}><Icon name="upload" />{busy ? 'Enviando arquivo…' : 'Enviar arquivo'}</button></div>
  </form>
 </Modal>{discard && <ConfirmModal title="Descartar envio?" message="O arquivo selecionado ainda não foi enviado." action="Descartar" onConfirm={async () => onClose()} onClose={() => setDiscard(false)} />}</>
}

function LibrarySkeleton({ view }) {
 return <div className={`drive-skeleton drive-skeleton--${view}`} role="status"><span className="ds-visually-hidden">Carregando arquivos e pastas…</span>{[0, 1, 2, 3].map(index => <span key={index} className="drive-skeleton__item" aria-hidden="true"><span className="ds-skeleton" /><span className="ds-skeleton ds-skeleton--text" /><span className="ds-skeleton ds-skeleton--text" /></span>)}</div>
}

export default function DrivePage({ notify }) {
 const auth = useAuth(), [search, setSearch] = useState(''), [term, setTerm] = useState(''), [kind, setKind] = useState(''), [offset, setOffset] = useState(0), [mode, setMode] = useState('folders'), [folderId, setFolderId] = useState(null), [uploading, setUploading] = useState(false), [busy, setBusy] = useState(''), [preview, setPreview] = useState(null), [editor, setEditor] = useState(null), [moving, setMoving] = useState(null), [organizing, setOrganizing] = useState(null), [deleting, setDeleting] = useState(null), [view, setView] = useState(readView), working = useRef(false), alive = useRef(true)
 useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
 useEffect(() => { const timer = setTimeout(() => { setTerm(search.trim()); setOffset(0) }, 300); return () => clearTimeout(timer) }, [search])
 const mutationRequest = useMutationRequest()
 const query = useQuery(useCallback(() => driveRequest({ action: 'browse', folder_id: mode === 'folders' ? folderId : null, view: mode === 'all' ? 'all' : 'folder', trashed: mode === 'trash', search: term, kind, offset }), [term, kind, offset, folderId, mode])), reload = query.reload
 useEffect(() => { const timer = setInterval(() => { if (!document.hidden && navigator.onLine && !working.current) reload() }, 15000); return () => clearInterval(timer) }, [reload])
 const documents = query.data?.documents?.slice(0, 50) || [], folders = query.data?.folders || [], connected = !!query.data?.connected, breadcrumbs = query.data?.breadcrumbs || [], currentFolder = mode === 'folders' && query.data?.folder?.id === (folderId || 'root') ? query.data.folder : null
 const hasNext = (query.data?.documents?.length || 0) > 50, reveal = useReveal(folders.length, `${mode}|${folderId}|${term}|${kind}`)
 const navigateFolder = id => { setMode('folders'); setFolderId(id); setSearch(''); setTerm(''); setKind(''); setOffset(0) }
 const changeMode = next => { setMode(next); setFolderId(null); setSearch(''); setTerm(''); setKind(''); setOffset(0) }
 const clearFilters = () => { setSearch(''); setTerm(''); setKind(''); setOffset(0) }
 const changeView = next => { setView(next); storeView(next) }
 const saved = async message => { await reload(); if (alive.current) notify(message) }
 const mutate = async (action, entry) => { await driveRequest(mutationRequest({ action: `${entry.type === 'folder' ? 'folder' : 'document'}_${action}`, id: entry.item.id, revision: entry.item.revision })); await saved(action === 'trash' ? 'Movido para a lixeira. O conteúdo de origem foi preservado.' : 'Restaurado.'); setOrganizing(null) }
 const act = async (action, item) => {
  if (working.current) return
  working.current = true; setBusy(item.id)
  try {
   if (action === 'retry') { await driveRequest({ action, id: item.id }); await reload(); notify('Sincronização solicitada. Confira o estado do arquivo.'); return }
   const result = await driveRequest({ action: 'file', id: item.id, disposition: action === 'download' ? 'download' : 'view' }), url = safeDocumentUrl(result.url, supabase.supabaseUrl)
   if (!url) throw new Error('O servidor não confirmou o endereço privado do arquivo.')
   if (action === 'download') { const anchor = document.createElement('a'); anchor.href = url; anchor.download = result.file_name; anchor.rel = 'noopener'; document.body.append(anchor); anchor.click(); anchor.remove() }
   else if (alive.current) setPreview({ url, name: result.file_name, mime: result.mime_type || 'application/pdf', item })
  } catch (cause) { if (alive.current) notify(cause.message, true) } finally { working.current = false; if (alive.current) setBusy('') }
 }
 const resumeChange = async item => {
  if (working.current || !item.pending_change) return
  working.current = true; setBusy(item.id)
  try { await driveRequest(item.pending_change); await saved('Organização concluída.') }
  catch (cause) { if (alive.current) notify(cause.message, true) }
  finally { working.current = false; if (alive.current) setBusy('') }
 }
 const options = (item, type) => { if (item.pending_change) return <button type="button" className="admin-icon-button" title="Tentar concluir organização" aria-label={`Concluir organização de ${itemName(item)}`} disabled={!!busy || query.loading || !connected} onClick={() => resumeChange(item)}><Icon name="refresh" /></button>; return <button type="button" className="admin-icon-button" title={type === 'folder' ? 'Organizar pasta' : 'Organizar arquivo'} aria-label={`Organizar ${itemName(item)}`} disabled={!!busy || query.loading} onClick={() => setOrganizing({ item, type })}><Icon name="more" /></button> }
 const fileActions = (item, withView) => <div className="drive-file__actions">
  {busy === item.id && <span className="ds-spinner drive-file__spinner" aria-hidden="true" />}
  {mode !== 'trash' && <>{withView && <button type="button" className="admin-icon-button" title="Visualizar arquivo" aria-label={`Visualizar ${item.file_name}`} disabled={!!busy} onClick={() => act('view', item)}><Icon name="eye" /></button>}<button type="button" className="admin-icon-button" title="Baixar arquivo" aria-label={`Baixar ${item.file_name}`} disabled={!!busy} onClick={() => act('download', item)}><Icon name="download" /></button>{item.status !== 'synced' && <button type="button" className="admin-icon-button" title={connected ? 'Sincronizar arquivo' : 'Conecte o Google Drive para sincronizar'} aria-label={`Sincronizar ${item.file_name}`} disabled={!!busy || !connected} onClick={() => act('retry', item)}><Icon name="refresh" /></button>}{safeDriveLink(item.drive_link) && <a className="admin-icon-button" title="Abrir no Google Drive" aria-label={`Abrir ${item.file_name} no Google Drive`} href={safeDriveLink(item.drive_link)} target="_blank" rel="noopener noreferrer"><Icon name="external" /></a>}</>}
  {options(item, 'file')}
 </div>
 const fileNotes = item => <>{item.description && <p className="drive-file__description">{item.description}</p>}{item.pending_change && <p className="drive-file__warning"><Icon name="warning" size={14} /><span>Organização pendente. Use a nova tentativa para concluir.</span></p>}{item.last_error && <p className="drive-file__error"><Icon name="alertCircle" size={14} /><span>{item.last_error}</span></p>}</>
 const filtered = Boolean(term || kind), searchLabel = mode === 'folders' ? 'Buscar nesta pasta…' : mode === 'trash' ? 'Buscar na lixeira…' : 'Buscar arquivo ou cliente…'
 const empty = mode === 'trash' ? { icon: 'trash', title: filtered ? 'Nenhum resultado na lixeira' : 'A lixeira está vazia', text: filtered ? 'Ajuste a busca ou escolha outra categoria.' : 'O conteúdo excluído pelo painel aparecerá aqui e poderá ser restaurado.' }
  : filtered ? { icon: 'search', title: 'Nenhum resultado encontrado', text: 'Ajuste a busca ou escolha outra categoria.' }
  : folderId ? { icon: 'folder', title: 'Esta pasta está vazia', text: 'Envie um arquivo ou crie uma pasta aqui dentro.' }
  : { icon: 'folder', title: 'Seu acervo começa aqui', text: 'Crie uma pasta ou envie arquivos para organizar o acervo.' }
 return <div className="drive-page">
  <PageTitle eyebrow="DOCUMENTOS / DUUK" title="Google Drive" description="Os arquivos da produtora, no mesmo lugar."><RefreshButton onRefresh={reload} disabled={!!busy} /><button type="button" className="admin-button admin-button--secondary" disabled={mode === 'trash' || !connected} onClick={() => setEditor({ type: 'folder' })}><Icon name="folderPlus" />Nova pasta</button><button type="button" className="admin-button" disabled={mode === 'trash'} onClick={() => setUploading(true)}><Icon name="upload" />Enviar arquivo</button></PageTitle>
  <div className="drive-account">
   <span className="drive-account__logo"><AppLogo app="drive" size={22} /></span>
   <div className="drive-account__text"><strong>{query.data?.account_email || 'Armazenamento central da DUUK'}</strong>{query.data ? <span className={`drive-account__status${connected ? ' is-connected' : ''}`}><i aria-hidden="true" />{connected ? 'Conta conectada · arquivos privados' : 'Aguardando conexão · arquivos preservados no painel'}</span> : <span className="drive-account__status">{query.error ? 'Estado da conexão indisponível' : 'Consultando a conexão…'}</span>}</div>
   {auth.profile?.is_super_admin && <Link className="admin-button admin-button--ghost admin-button--sm drive-account__manage" to="/admin/configuracoes/integracoes">Gerenciar conexão<Icon name="arrow" /></Link>}
  </div>
  {!!query.data?.pending_changes?.length && <section className="ds-alert ds-alert--warning drive-pending" aria-label="Organizações pendentes"><Icon name="cloudAlert" /><div className="drive-pending__body"><p><strong>Organização pendente.</strong> Há alterações aguardando conclusão. Continue a operação para evitar duplicações.</p><ul>{query.data.pending_changes.map(change => <li key={change.request_id}><span>{change.name || (change.action.startsWith('folder_') ? 'Pasta' : 'Arquivo')}</span><button type="button" className="admin-button admin-button--secondary admin-button--sm" disabled={!!busy || !connected} onClick={() => resumeChange({ id: change.request_id, pending_change: change })} aria-label={`Concluir organização: ${change.name || 'conteúdo'}`}><Icon name="refresh" />Concluir</button></li>)}</ul></div></section>}
  <section className="admin-panel drive-library" aria-label="Arquivos do Google Drive">
   <div className="ds-tabs drive-library__tabs" role="group" aria-label="Visualização do Google Drive">{[['folders', 'Pastas', 'folder'], ['all', 'Todos os arquivos', 'file'], ['trash', 'Lixeira', 'trash']].map(([value, label, icon]) => <button type="button" key={value} className={mode === value ? 'is-active' : ''} aria-pressed={mode === value} onClick={() => changeMode(value)}><Icon name={icon} size={16} />{label}</button>)}</div>
   {mode === 'folders' && <div className="drive-location">
    <nav className="drive-breadcrumbs" aria-label="Caminho da pasta"><ol>
     <li><button type="button" onClick={() => navigateFolder(null)} aria-current={!folderId ? 'page' : undefined}><AppLogo app="drive" size={16} /><span>{breadcrumbs.find(item => item.id === 'root')?.name || 'DUUK'}</span></button></li>
     {breadcrumbs.filter(item => item.id && item.id !== 'root').map(item => <li key={item.id}><Icon name="right" size={14} /><button type="button" onClick={() => navigateFolder(item.id)} aria-current={item.id === folderId ? 'page' : undefined}><span>{item.name}</span></button></li>)}
    </ol></nav>
    {currentFolder && <div className="drive-location__actions">{connected && currentFolder.can_edit !== false && !currentFolder.pending_change && <button type="button" className="admin-button admin-button--secondary admin-button--sm" disabled={!!busy || query.loading} onClick={() => setEditor({ item: currentFolder, type: 'folder' })}><Icon name="edit" />Renomear pasta</button>}{options(currentFolder, 'folder')}</div>}
   </div>}
   <div className="drive-toolbar">
    <label className="admin-search drive-toolbar__search"><Icon name="search" /><input type="search" aria-label="Buscar arquivos e pastas" placeholder={searchLabel} value={search} maxLength={120} autoComplete="off" onChange={event => setSearch(event.target.value)} /></label>
    <select className="ds-input ds-select drive-toolbar__category" aria-label="Categoria" value={kind} onChange={event => { setKind(event.target.value); setOffset(0) }}>{categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
    <div className="ds-segmented drive-toolbar__view" role="group" aria-label="Exibição dos arquivos"><button type="button" aria-pressed={view === 'list'} aria-label="Lista" title="Lista" onClick={() => changeView('list')}><Icon name="list" /></button><button type="button" aria-pressed={view === 'grid'} aria-label="Grade" title="Grade" onClick={() => changeView('grid')}><LayoutGrid size={18} strokeWidth={1.6} aria-hidden="true" /></button></div>
   </div>
   {mode === 'trash' && <p className="drive-trash-note"><Icon name="info" size={16} /><span>Arquivos e pastas na lixeira podem ser restaurados. Contratos, assinaturas e evidências permanecem preservados no painel.</span></p>}
   {query.loading && !query.data ? <LibrarySkeleton view={view} /> : query.error && !query.data ? <div className="drive-library__state"><ErrorState onRetry={reload}>{query.error}</ErrorState></div> : <div className="drive-library__content" aria-busy={query.loading}>
    {query.error && <div className="drive-library__state"><ErrorState onRetry={reload}>{query.error}</ErrorState></div>}
    {!!folders.length && <section className="drive-section" aria-label={mode === 'trash' ? 'Pastas na lixeira' : 'Pastas'}>
     <h2 className="drive-section__title">{mode === 'trash' ? 'Pastas na lixeira' : 'Pastas'}<span>{folders.length}</span></h2>
     <ul className="drive-folder-grid">{folders.slice(0, reveal.count).map(item => <li className="drive-folder-card" key={item.id}>
      <button type="button" className="drive-folder-open" disabled={mode === 'trash'} onClick={() => navigateFolder(item.id)} aria-label={`Abrir pasta ${item.name}`}><span className="drive-folder-icon" aria-hidden="true"><Icon name="folder" size={20} /></span><span className="drive-folder-text"><strong>{item.name}</strong><small>{item.pending_change ? 'Organização pendente · tente novamente' : item.description || (item.can_edit === false ? 'Pasta organizada pela DUUK' : 'Pasta da equipe')}</small></span></button>
      <div className="drive-folder-actions">{connected && mode !== 'trash' && item.can_edit !== false && !item.pending_change && <button type="button" className="admin-icon-button" title="Renomear" disabled={!!busy || query.loading} onClick={() => setEditor({ item, type: 'folder' })} aria-label={`Renomear pasta ${item.name}`}><Icon name="edit" /></button>}{options(item, 'folder')}</div>
     </li>)}</ul>
     {reveal.remaining > 0 && <button type="button" className="admin-button admin-button--secondary admin-button--sm drive-section__more" onClick={reveal.more}>Mostrar mais pastas ({reveal.remaining})</button>}
    </section>}
    {!!documents.length && <section className="drive-section" aria-label="Arquivos">
     {!!folders.length && <h2 className="drive-section__title">Arquivos</h2>}
     {view === 'grid' ? <ul className="drive-tile-grid">{documents.map(item => <li className={`drive-tile${busy === item.id ? ' is-busy' : ''}`} key={item.id} aria-busy={busy === item.id || undefined}>
      <button type="button" className="drive-tile__open" onClick={() => act('view', item)} disabled={!!busy || mode === 'trash'} aria-label={`Visualizar ${item.file_name}`} title={item.file_name}>
       <span className="drive-tile__preview" aria-hidden="true"><Icon name={fileIcon(item)} size={26} />{extension(item.file_name) && <small>{extension(item.file_name)}</small>}</span>
       <span className="drive-tile__name">{item.file_name}</span>
       <span className="drive-tile__meta">{joined(item.client_name || categoryLabel(item.kind), bytesLabel(item.byte_size))}</span>
       <span className="drive-tile__meta">{fmtTime(item.synced_at || item.created_at)}</span>
      </button>
      {fileNotes(item)}
      <div className="drive-tile__foot"><DriveChip state={item.trashed ? 'trashed' : item.status} />{fileActions(item, false)}</div>
     </li>)}</ul> : <ul className="drive-file-list">{documents.map(item => <li className={`drive-file${busy === item.id ? ' is-busy' : ''}`} key={item.id} aria-busy={busy === item.id || undefined}>
      <span className="drive-file__icon" aria-hidden="true"><Icon name={fileIcon(item)} /></span>
      <div className="drive-file__main"><button type="button" className="drive-file__name" onClick={() => act('view', item)} disabled={!!busy || mode === 'trash'}>{item.file_name}</button><p className="drive-file__meta">{joined(item.title && item.title !== item.file_name && item.title, item.client_name, bytesLabel(item.byte_size), categoryLabel(item.kind), fmtTime(item.synced_at || item.created_at))}</p>{fileNotes(item)}</div>
      <DriveChip state={item.trashed ? 'trashed' : item.status} />
      {fileActions(item, true)}
     </li>)}</ul>}
    </section>}
    {!documents.length && !folders.length && <EmptyState icon={empty.icon} title={empty.title} action={filtered ? <button type="button" className="admin-button admin-button--secondary" onClick={clearFilters}><Icon name="close" />Limpar busca e filtros</button> : mode !== 'trash' && <div className="drive-empty-actions"><button type="button" className="admin-button" onClick={() => setUploading(true)}><Icon name="upload" />Enviar arquivo</button>{connected && <button type="button" className="admin-button admin-button--secondary" onClick={() => setEditor({ type: 'folder' })}><Icon name="folderPlus" />Nova pasta</button>}</div>}>{empty.text}</EmptyState>}
    {(!!documents.length || offset > 0) && <nav className="ds-pagination drive-pager" aria-label="Páginas de arquivos"><p>{documents.length ? `${offset + 1}–${offset + documents.length} arquivos` : 'Nenhum arquivo nesta página'}</p>{(offset > 0 || hasNext) && <div className="ds-pagination__pages"><button type="button" aria-label="Página anterior" disabled={!offset || query.loading} onClick={() => setOffset(value => Math.max(0, value - 50))}><Icon name="left" size={16} /></button><span className="drive-pager__page">Página {Math.floor(offset / 50) + 1}</span><button type="button" aria-label="Próxima página" disabled={query.loading || !hasNext} onClick={() => setOffset(value => value + 50)}><Icon name="right" size={16} /></button></div>}</nav>}
   </div>}
  </section>
  <p className="drive-library-note"><Icon name="shield" size={16} /><span>Mostra os arquivos gerenciados pelo DUUK Admin, conforme suas permissões. O restante da conta Google permanece privado. O espaço também é compartilhado com Gmail e Google Fotos.</span></p>
  {uploading && <UploadFile folderId={folderId} connected={connected} onClose={() => setUploading(false)} onSaved={() => { setUploading(false); reload(); notify('Arquivo salvo. Acompanhe o envio ao Google Drive nesta lista.') }} />}
  {editor && <MetadataDialog item={editor.item} type={editor.type} folderId={folderId} onClose={() => setEditor(null)} onSaved={saved} />}
  {moving && <MoveDialog {...moving} onClose={() => setMoving(null)} onSaved={saved} />}
  {organizing && <Modal title={itemName(organizing.item)} subtitle={organizing.type === 'folder' ? 'Organizar pasta' : 'Organizar arquivo'} onClose={() => setOrganizing(null)}><div className="admin-modal__body drive-organize">
   {!connected && <div className="ds-alert ds-alert--info"><Icon name="info" /><span>Conecte o Google Drive para organizar pastas e arquivos.</span></div>}
   {mode === 'trash' ? <ul className="drive-organize__list"><li><button type="button" className="drive-organize__action" disabled={!connected || organizing.item.can_restore === false} onClick={() => { setDeleting({ ...organizing, restore: true }); setOrganizing(null) }}><Icon name="restore" /><span><strong>Restaurar</strong><small>Volta para a pasta de origem, quando disponível.</small></span></button></li></ul> : <>
    <ul className="drive-organize__list">
     {connected && organizing.item.can_edit !== false && <li><button type="button" className="drive-organize__action" onClick={() => { setEditor(organizing); setOrganizing(null) }}><Icon name="edit" /><span><strong>Renomear e editar descrição</strong><small>Ajuda a equipe a encontrar este conteúdo.</small></span></button></li>}
     {connected && organizing.item.can_move !== false && <li><button type="button" className="drive-organize__action" onClick={() => { setMoving(organizing); setOrganizing(null) }}><Icon name="move" /><span><strong>Mover para outra pasta</strong><small>O conteúdo continua privado e com as mesmas permissões.</small></span></button></li>}
     {connected && organizing.item.can_trash !== false && <li><button type="button" className="drive-organize__action is-danger" onClick={() => { setDeleting(organizing); setOrganizing(null) }}><Icon name="trash" /><span><strong>Mover para a lixeira</strong><small>Pode ser restaurado depois. Os registros de origem continuam no painel.</small></span></button></li>}
    </ul>
    {organizing.item.can_edit === false && organizing.item.can_move === false && organizing.item.can_trash === false && <p className="drive-organize__note">{organizing.type === 'file' && organizing.item.status !== 'synced' ? 'Aguarde a sincronização para organizar este arquivo. Você pode acompanhar ou tentar o envio novamente na lista.' : 'As permissões deste conteúdo não permitem alterações de organização.'}</p>}
   </>}
  </div></Modal>}
  {deleting && <ConfirmModal title={deleting.restore ? 'Restaurar conteúdo?' : 'Mover para a lixeira?'} message={deleting.restore ? `“${itemName(deleting.item)}” voltará para a pasta de origem, quando disponível.` : deleting.type === 'folder' ? `“${itemName(deleting.item)}” e seu conteúdo serão movidos para a lixeira do Drive. Os registros de contratos e assinaturas permanecem no painel.` : `“${itemName(deleting.item)}” será movido para a lixeira do Drive. Os registros e documentos de origem permanecem preservados no painel.`} action={deleting.restore ? 'Restaurar' : 'Mover para a lixeira'} onConfirm={() => mutate(deleting.restore ? 'restore' : 'trash', deleting)} onClose={() => setDeleting(null)} />}
  {preview && <Modal title={preview.name} subtitle="Arquivo privado da DUUK." wide onClose={() => setPreview(null)}>
   <div className="admin-modal__body drive-preview">{preview.mime.startsWith('image/') ? <img src={preview.url} alt={preview.name} /> : preview.mime.startsWith('video/') ? <video src={preview.url} controls playsInline /> : preview.mime === 'application/pdf' ? <PdfPreview key={preview.url} url={preview.url} /> : <EmptyState icon="file" title="Pré-visualização indisponível">Baixe este arquivo para abrir no aplicativo correspondente.</EmptyState>}</div>
   <div className="admin-modal__foot"><button type="button" className="admin-button admin-button--secondary" onClick={() => setPreview(null)}>Fechar</button><button type="button" className="admin-button" disabled={!!busy} aria-busy={busy === preview.item.id} onClick={() => act('download', preview.item)}><Icon name="download" />{busy === preview.item.id ? 'Preparando download…' : 'Baixar arquivo'}</button></div>
  </Modal>}
 </div>
}
