import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../content/AuthContext'
import { supabase } from '../content/supabase'
import { driveRequest } from '../office/api'
import { useQuery } from '../office/useQuery'
import { DriveChip } from '../office/DriveDocuments'
import { safeDocumentUrl, safeDriveLink } from '../office/driveModel'
import { fmtTime } from '../crm/model'
import { ConfirmModal, Icon, Modal, RefreshButton } from './components'
import { PageTitle, QueryState } from './forms'
import { useUnsavedChanges } from './unsavedChanges'
import { platformRequest } from './api'
import AppLogo from './AppLogo'
import { usePdf } from '../office/usePdf'
import PdfPage from '../office/PdfPage'
import '../office/drive.css'

const categories = [['', 'Todos'], ['contract_original', 'Contratos originais'], ['contract_signed', 'Assinados'], ['proposal', 'Propostas'], ['document', 'Documentos'], ['file', 'Arquivos']]
const bytesLabel = value => value ? value < 1048576 ? `${Math.ceil(value / 1024)} KB` : `${(value / 1048576).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB` : 'PDF'
const formats = '.pdf,.jpg,.jpeg,.png,.webp,.docx,.xlsx,.pptx,.txt,.csv,.zip,.mp4,.mov'
const itemName = item => item.name || item.file_name || item.title

function useMutationRequest() {
 const last = useRef(null)
 return useCallback(payload => {
  const key = JSON.stringify(payload)
  if (last.current?.key !== key) last.current = { key, id: crypto.randomUUID() }
  return { ...payload, request_id: last.current.id }
 }, [])
}

function PdfPreview({ url }) {
 const pdf = usePdf(url), [page, setPage] = useState(0)
 if (pdf.error) return <p className="admin-error" role="alert">{pdf.error}</p>
 if (!pdf.document) return <p role="status" className="platform-muted">Carregando PDF…</p>
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
 const options = folderOptions(query.data?.folders || [], excludedId)
 return <label className="admin-field"><span>{label}</span><select value={value || ''} onChange={event => onChange(event.target.value)} disabled={disabled || query.loading}>{query.loading && !query.data ? <option value={value || ''}>Carregando pastas…</option> : <><option value="root">DUUK</option>{automatic && <option value="">Organização automática</option>}{options.filter(folder => folder.id !== 'root' && folder.can_upload !== false).map(folder => <option key={folder.id} value={folder.id}>{folder.label}</option>)}</>}</select>{query.error && <small className="drive-library-error">{query.error} <button className="admin-text-button" type="button" onClick={query.reload}>Tentar novamente</button></small>}</label>
}

function MetadataDialog({ item, type, folderId, onClose, onSaved }) {
 const creating = !item, originalName = item ? itemName(item) : '', originalDescription = item?.description || '', mutationRequest = useMutationRequest()
 const [name, setName] = useState(originalName), [description, setDescription] = useState(originalDescription), [busy, setBusy] = useState(false), [error, setError] = useState(''), [discard, setDiscard] = useState(false), working = useRef(false)
 const dirty = name !== originalName || description !== originalDescription
 useUnsavedChanges(dirty || busy)
 const close = () => { if (!busy) { if (dirty) setDiscard(true); else onClose() } }
 const submit = async event => {
  event.preventDefault(); if (working.current) return
  if (!name.trim()) { setError('Informe um nome.'); return }
  working.current = true; setBusy(true); setError('')
  try {
   await driveRequest(mutationRequest({ action: type === 'folder' ? creating ? 'folder_create' : 'folder_update' : 'document_update', id: item?.id, parent_id: folderId || 'root', name: name.trim(), description: description.trim(), revision: item?.revision }))
   await onSaved(creating ? 'Pasta criada.' : 'Alterações salvas.'); onClose()
  } catch (cause) { setError(cause.message) } finally { working.current = false; setBusy(false) }
 }
 return <><Modal title={creating ? 'Nova pasta' : type === 'folder' ? 'Editar pasta' : 'Editar arquivo'} subtitle="GOOGLE DRIVE / ORGANIZAÇÃO" onClose={close}>
  <form className="drive-library-upload" onSubmit={submit}>
   <label className="admin-field"><span>{type === 'folder' ? 'Nome da pasta' : 'Nome do arquivo'}</span><input value={name} onChange={event => setName(event.target.value)} maxLength={160} required disabled={busy} autoFocus /></label>
   <label className="admin-field"><span>Descrição <small>(opcional)</small></span><textarea value={description} onChange={event => setDescription(event.target.value)} maxLength={2000} rows={4} disabled={busy} placeholder="Detalhes para ajudar a equipe a encontrar este conteúdo." /></label>
   {type === 'file' && <p className="platform-muted">A organização do arquivo preserva o contrato, as assinaturas e os registros de origem.</p>}
   {error && <p className="admin-error" role="alert">{error}</p>}
   <footer className="admin-form-actions"><button className="admin-button admin-button--secondary" type="button" onClick={close} disabled={busy}>Cancelar</button><button className="admin-button" disabled={busy || !name.trim()}><Icon name={creating ? 'plus' : 'check'} />{busy ? 'Salvando…' : creating ? 'Criar pasta' : 'Salvar alterações'}</button></footer>
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
 return <><Modal title="Mover para outra pasta" subtitle="GOOGLE DRIVE / ORGANIZAÇÃO" onClose={close}><form className="drive-library-upload" onSubmit={submit}>
  <p className="drive-dialog-item"><Icon name={type === 'folder' ? 'folder' : 'file'} /><strong>{itemName(item)}</strong></p>
  <FolderSelect query={folders} value={destination} onChange={setDestination} disabled={busy} excludedId={type === 'folder' ? item.id : null} />
  <p className="platform-muted">O conteúdo permanece privado e mantém suas permissões de acesso.</p>
  {error && <p className="admin-error" role="alert">{error}</p>}
  <footer className="admin-form-actions"><button className="admin-button admin-button--secondary" type="button" disabled={busy} onClick={close}>Cancelar</button><button className="admin-button" disabled={busy || folders.loading || !!folders.error || destination === originalDestination}><Icon name="move" />{busy ? 'Movendo…' : 'Mover'}</button></footer>
 </form></Modal>{discard && <ConfirmModal title="Descartar alterações?" message="A mudança de pasta ainda não foi salva." action="Descartar" onConfirm={async () => onClose()} onClose={() => setDiscard(false)} />}</>
}

function UploadFile({ onClose, onSaved, connected, folderId }) {
 const auth = useAuth(), canClients = auth.hasPermission('crm.clients'), [file, setFile] = useState(null), [title, setTitle] = useState(''), [client, setClient] = useState(''), [destination, setDestination] = useState(folderId || ''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [discard, setDiscard] = useState(false), working = useRef(false)
 const dirty = !!file || !!title.trim() || !!client || destination !== (folderId || '')
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
  if (!file || !file.size || file.size > 20971520) { setError('Escolha um arquivo de até 20 MB.'); return }
  working.current = true; setBusy(true)
  try {
   const body = new FormData(); body.append('file', file); body.append('title', title); if (client) body.append('client_id', client); if (destination) body.append('folder_id', destination)
   await platformRequest('duuk-drive?library=1', body)
   onSaved()
  } catch (cause) { setError(cause.message) } finally { working.current = false; setBusy(false) }
 }
 return <><Modal title="Enviar arquivo" subtitle="GOOGLE DRIVE / DUUK" onClose={close}>
  <form onSubmit={upload} className="drive-library-upload">
   <label className="admin-field"><span>Arquivo</span><input type="file" accept={formats} disabled={busy} onChange={event => setFile(event.target.files[0] || null)} required /><small>PDF, imagens, Office, TXT, CSV, ZIP e vídeos MP4/MOV. Até 20 MB por arquivo.</small></label>
   {file && <p className="drive-selected-file"><Icon name="file" /><span>{file.name}<small>{bytesLabel(file.size)}</small></span></p>}
   <label className="admin-field"><span>Título <small>(opcional)</small></span><input value={title} maxLength={160} disabled={busy} onChange={event => setTitle(event.target.value)} placeholder="Ex.: Briefing de produção" /></label>
   <FolderSelect query={folders} value={destination} onChange={setDestination} disabled={busy} automatic />
   {canClients && <label className="admin-field"><span>Vincular ao cliente <small>(opcional)</small></span><select value={client} disabled={busy || clients.loading} onChange={event => setClient(event.target.value)}><option value="">Sem vínculo com cliente</option>{clients.data?.map(item => <option key={item.id} value={item.id}>{item.company || item.name}</option>)}</select><small>Sem uma pasta escolhida, o arquivo será organizado em Documentos / Cliente ou Internos.</small></label>}
   {clients.error && <p className="admin-error" role="alert">{clients.error}<button type="button" className="admin-text-button" onClick={clients.reload}>Tentar novamente</button></p>}
   <p className="platform-muted">{connected ? 'O arquivo será salvo no painel e enviado à pasta privada da DUUK no Google Drive.' : 'O arquivo ficará salvo no painel, aguardando a conexão do Google Drive para ser enviado.'}</p>
   {error && <p className="admin-error" role="alert">{error}</p>}
   <footer className="admin-form-actions"><button type="button" className="admin-button admin-button--secondary" disabled={busy} onClick={close}>Cancelar</button><button className="admin-button" disabled={busy || !file || folders.loading || !!folders.error}><Icon name="upload" />{busy ? 'Enviando arquivo…' : 'Enviar arquivo'}</button></footer>
  </form>
 </Modal>{discard && <ConfirmModal title="Descartar envio?" message="O arquivo selecionado ainda não foi enviado." action="Descartar" onConfirm={async () => onClose()} onClose={() => setDiscard(false)} />}</>
}

export default function DrivePage({ notify }) {
 const auth = useAuth(), [search, setSearch] = useState(''), [term, setTerm] = useState(''), [kind, setKind] = useState(''), [offset, setOffset] = useState(0), [mode, setMode] = useState('folders'), [folderId, setFolderId] = useState(null), [uploading, setUploading] = useState(false), [busy, setBusy] = useState(''), [preview, setPreview] = useState(null), [editor, setEditor] = useState(null), [moving, setMoving] = useState(null), [organizing, setOrganizing] = useState(null), [deleting, setDeleting] = useState(null), working = useRef(false), alive = useRef(true)
 useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
 useEffect(() => { const timer = setTimeout(() => { setTerm(search.trim()); setOffset(0) }, 300); return () => clearTimeout(timer) }, [search])
 const mutationRequest = useMutationRequest()
 const query = useQuery(useCallback(() => driveRequest({ action: 'browse', folder_id: mode === 'folders' ? folderId : null, view: mode === 'all' ? 'all' : 'folder', trashed: mode === 'trash', search: term, kind, offset }), [term, kind, offset, folderId, mode])), reload = query.reload
 useEffect(() => { const timer = setInterval(() => { if (!document.hidden && navigator.onLine && !working.current) reload() }, 15000); return () => clearInterval(timer) }, [reload])
 const documents = query.data?.documents?.slice(0, 50) || [], folders = query.data?.folders || [], connected = !!query.data?.connected, breadcrumbs = query.data?.breadcrumbs || []
 const navigateFolder = id => { setMode('folders'); setFolderId(id); setSearch(''); setTerm(''); setKind(''); setOffset(0) }
 const changeMode = next => { setMode(next); setFolderId(null); setSearch(''); setTerm(''); setKind(''); setOffset(0) }
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
 const options = (item, type) => { if (item.pending_change) return <button className="admin-icon-button" title="Tentar concluir organização" aria-label={`Concluir organização de ${itemName(item)}`} disabled={!!busy || !connected} onClick={() => resumeChange(item)}><Icon name="refresh" /></button>; return <button className="admin-icon-button" title={type === 'folder' ? 'Organizar pasta' : 'Organizar arquivo'} aria-label={`Organizar ${itemName(item)}`} disabled={!!busy} onClick={() => setOrganizing({ item, type })}><Icon name="edit" /></button> }
 return <div className="drive-page">
  <PageTitle eyebrow="DOCUMENTOS / DUUK" title="Google Drive" description="Os arquivos da produtora, no mesmo lugar."><RefreshButton onRefresh={reload} disabled={!!busy} /><button className="admin-button admin-button--secondary" disabled={mode === 'trash' || !connected} onClick={() => setEditor({ type: 'folder' })}><Icon name="folderPlus" />Nova pasta</button><button className="admin-button" disabled={mode === 'trash'} onClick={() => setUploading(true)}><Icon name="upload" />Enviar arquivo</button></PageTitle>
  <div className="drive-library-account"><AppLogo app="drive" /><div><strong>{query.data?.account_email || 'Armazenamento central da DUUK'}</strong><span>{connected ? 'Conta conectada · arquivos privados' : 'Aguardando conexão · arquivos preservados no painel'}</span></div>{auth.profile?.is_super_admin && <Link className="admin-text-button" to="/admin/configuracoes/integracoes">Gerenciar conexão<Icon name="arrow" size={16} /></Link>}</div>
  {!!query.data?.pending_changes?.length && <section className="drive-pending-changes" aria-label="Organizações pendentes"><div><Icon name="cloudAlert" size={21} /><span><strong>Organização pendente</strong><small>Há alterações aguardando conclusão. Continue a operação para evitar duplicações.</small></span></div><ul>{query.data.pending_changes.map(change => <li key={change.request_id}><span>{change.name || (change.action.startsWith('folder_') ? 'Pasta' : 'Arquivo')}</span><button className="admin-button admin-button--secondary" disabled={!!busy || !connected} onClick={() => resumeChange({ id: change.request_id, pending_change: change })} aria-label={`Concluir organização: ${change.name || 'conteúdo'}`}><Icon name="refresh" size={16} />Concluir</button></li>)}</ul></section>}
  <section className="admin-panel drive-library" aria-label="Arquivos do Google Drive">
   <div className="drive-library-tabs" role="group" aria-label="Visualização do Google Drive">{[['folders', 'Pastas', 'folder'], ['all', 'Todos os arquivos', 'file'], ['trash', 'Lixeira', 'trash']].map(([value, label, icon]) => <button key={value} className={mode === value ? 'is-active' : ''} aria-pressed={mode === value} onClick={() => changeMode(value)}><Icon name={icon} size={16} />{label}</button>)}</div>
   {mode === 'folders' && <nav className="drive-breadcrumbs" aria-label="Caminho da pasta"><button onClick={() => navigateFolder(null)} aria-current={!folderId ? 'page' : undefined}><AppLogo app="drive" size={16} />DUUK</button>{breadcrumbs.filter(item => item.id && item.id !== 'root').map(item => <span key={item.id}><Icon name="right" size={13} /><button onClick={() => navigateFolder(item.id)} aria-current={item.id === folderId ? 'page' : undefined}>{item.name}</button></span>)}</nav>}
   <div className="drive-library-toolbar"><label className="admin-search"><Icon name="search" /><input type="search" aria-label="Buscar arquivos e pastas" placeholder={mode === 'folders' ? 'Buscar nesta pasta…' : mode === 'trash' ? 'Buscar na lixeira…' : 'Buscar arquivo ou cliente…'} value={search} maxLength={120} onChange={event => setSearch(event.target.value)} /></label><label className="admin-field"><span>Categoria</span><select value={kind} onChange={event => { setKind(event.target.value); setOffset(0) }}>{categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
   {mode === 'trash' && <p className="drive-trash-note"><Icon name="info" size={16} />Arquivos e pastas na lixeira podem ser restaurados. Contratos, assinaturas e evidências permanecem preservados no painel.</p>}
   <QueryState query={query}>
    {!!folders.length && <div className="drive-folder-grid" aria-label={mode === 'trash' ? 'Pastas na lixeira' : 'Pastas'}>{folders.map(item => <article className="drive-folder-card" key={item.id}><button className="drive-folder-open" disabled={mode === 'trash'} onClick={() => navigateFolder(item.id)} aria-label={`Abrir pasta ${item.name}`}><Icon name="folder" size={27} /><span><strong>{item.name}</strong><small>{item.pending_change ? 'Organização pendente · tente novamente' : item.description || (item.can_edit === false ? 'Pasta organizada pela DUUK' : 'Pasta da equipe')}</small></span></button>{options(item, 'folder')}</article>)}</div>}
    <div className="drive-library-list" aria-busy={query.loading}>
     {documents.map(item => <article className="drive-library-row" key={item.id}>
      <span className="drive-library-file-icon"><Icon name={item.mime_type?.startsWith('image/') ? 'media' : item.mime_type?.startsWith('video/') ? 'film' : 'file'} size={24} /></span>
      <div className="drive-library-file"><button className="drive-file-name" onClick={() => act('view', item)} disabled={!!busy || mode === 'trash'}>{item.file_name}</button><small>{item.title && item.title !== item.file_name && `${item.title} · `}{item.client_name} · {bytesLabel(item.byte_size)}</small><small>{categories.find(([value]) => value === item.kind)?.[1]} · {fmtTime(item.synced_at || item.created_at)}</small>{item.description && <small>{item.description}</small>}{item.pending_change && <small className="drive-library-error">Organização pendente. Use a nova tentativa para concluir.</small>}{item.last_error && <p className="drive-library-error">{item.last_error}</p>}</div>
      <DriveChip state={item.trashed ? 'trashed' : item.status} />
      <div className="drive-library-actions">{mode !== 'trash' && <><button className="admin-icon-button" title="Visualizar arquivo" aria-label={`Visualizar ${item.file_name}`} disabled={!!busy} onClick={() => act('view', item)}><Icon name="eye" /></button><button className="admin-icon-button" title="Baixar arquivo" aria-label={`Baixar ${item.file_name}`} disabled={!!busy} onClick={() => act('download', item)}><Icon name="download" /></button>{item.status !== 'synced' && <button className="admin-icon-button" title={connected ? 'Sincronizar arquivo' : 'Conecte o Google Drive para sincronizar'} aria-label={`Sincronizar ${item.file_name}`} disabled={!!busy || !connected} onClick={() => act('retry', item)}><Icon name="refresh" /></button>}{safeDriveLink(item.drive_link) && <a className="admin-icon-button" title="Abrir no Google Drive" aria-label={`Abrir ${item.file_name} no Google Drive`} href={safeDriveLink(item.drive_link)} target="_blank" rel="noopener noreferrer"><Icon name="external" /></a>}</>}{options(item, 'file')}</div>
     </article>)}
     {!documents.length && !folders.length && <div className="admin-empty"><Icon name={mode === 'trash' ? 'trash' : 'folder'} size={36} /><h2>{term || kind ? 'Nenhum resultado encontrado' : mode === 'trash' ? 'A lixeira está vazia' : folderId ? 'Esta pasta está vazia' : 'Seu acervo começa aqui'}</h2><p>{term || kind ? 'Ajuste a busca ou escolha outra categoria.' : mode === 'trash' ? 'O conteúdo excluído pelo painel aparecerá aqui.' : 'Crie uma pasta ou envie arquivos para organizar o acervo.'}</p></div>}
    </div>
    <footer className="drive-library-pagination"><span>{documents.length ? `${offset + 1}–${offset + documents.length} arquivos` : `${folders.length} ${folders.length === 1 ? 'pasta' : 'pastas'}`}</span><div><button className="admin-icon-button" aria-label="Página anterior" disabled={!offset || query.loading} onClick={() => setOffset(value => Math.max(0, value - 50))}><Icon name="left" /></button><button className="admin-icon-button" aria-label="Próxima página" disabled={query.loading || (query.data?.documents?.length || 0) <= 50} onClick={() => setOffset(value => value + 50)}><Icon name="right" /></button></div></footer>
   </QueryState>
  </section>
  <p className="drive-library-note"><Icon name="shield" size={16} />Mostra os arquivos gerenciados pelo DUUK Admin, conforme suas permissões. O restante da conta Google permanece privado. O espaço também é compartilhado com Gmail e Google Fotos.</p>
  {uploading && <UploadFile folderId={folderId} connected={connected} onClose={() => setUploading(false)} onSaved={() => { setUploading(false); reload(); notify('Arquivo salvo. Acompanhe o envio ao Google Drive nesta lista.') }} />}
  {editor && <MetadataDialog item={editor.item} type={editor.type} folderId={folderId} onClose={() => setEditor(null)} onSaved={saved} />}
  {moving && <MoveDialog {...moving} onClose={() => setMoving(null)} onSaved={saved} />}
  {organizing && <Modal title={itemName(organizing.item)} subtitle={organizing.type === 'folder' ? 'GOOGLE DRIVE / PASTA' : 'GOOGLE DRIVE / ARQUIVO'} onClose={() => setOrganizing(null)}><div className="drive-organize-actions">{!connected && <p className="platform-muted">Conecte o Google Drive para organizar pastas e arquivos.</p>}{mode === 'trash' ? <button disabled={!connected || organizing.item.can_restore === false} className="admin-button admin-button--secondary" onClick={() => { setDeleting({ ...organizing, restore: true }); setOrganizing(null) }}><Icon name="restore" />Restaurar</button> : <>{connected && organizing.item.can_edit !== false && <button className="admin-button admin-button--secondary" onClick={() => { setEditor(organizing); setOrganizing(null) }}><Icon name="edit" />Renomear e editar descrição</button>}{connected && organizing.item.can_move !== false && <button className="admin-button admin-button--secondary" onClick={() => { setMoving(organizing); setOrganizing(null) }}><Icon name="move" />Mover para outra pasta</button>}{connected && organizing.item.can_trash !== false && <button className="admin-button admin-button--secondary drive-trash-action" onClick={() => { setDeleting(organizing); setOrganizing(null) }}><Icon name="trash" />Mover para a lixeira</button>}{organizing.item.can_edit === false && organizing.item.can_move === false && organizing.item.can_trash === false && <p className="platform-muted">{organizing.type === 'file' && organizing.item.status !== 'synced' ? 'Aguarde a sincronização para organizar este arquivo. Você pode acompanhar ou tentar o envio novamente na lista.' : 'As permissões deste conteúdo não permitem alterações de organização.'}</p>}</>}</div></Modal>}
  {deleting && <ConfirmModal title={deleting.restore ? 'Restaurar conteúdo?' : 'Mover para a lixeira?'} message={deleting.restore ? `“${itemName(deleting.item)}” voltará para a pasta de origem, quando disponível.` : deleting.type === 'folder' ? `“${itemName(deleting.item)}” e seu conteúdo serão movidos para a lixeira do Drive. Os registros de contratos e assinaturas permanecem no painel.` : `“${itemName(deleting.item)}” será movido para a lixeira do Drive. Os registros e documentos de origem permanecem preservados no painel.`} action={deleting.restore ? 'Restaurar' : 'Mover para a lixeira'} onConfirm={() => mutate(deleting.restore ? 'restore' : 'trash', deleting)} onClose={() => setDeleting(null)} />}
  {preview && <Modal title={preview.name} subtitle="ARQUIVO PRIVADO / DUUK" wide onClose={() => setPreview(null)}><div className="drive-library-preview">{preview.mime.startsWith('image/') ? <img src={preview.url} alt={preview.name} /> : preview.mime.startsWith('video/') ? <video src={preview.url} controls playsInline /> : preview.mime === 'application/pdf' ? <PdfPreview key={preview.url} url={preview.url} /> : <div className="admin-empty"><Icon name="file" size={36} /><p>Baixe este arquivo para abrir no aplicativo correspondente.</p></div>}<button className="admin-button admin-button--secondary" disabled={!!busy} onClick={() => act('download', preview.item)}><Icon name="download" />Baixar arquivo</button></div></Modal>}
 </div>
}
