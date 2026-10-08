import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../content/AuthContext'
import { supabase } from '../content/supabase'
import { driveRequest } from '../office/api'
import { useQuery } from '../office/useQuery'
import { DriveChip } from '../office/DriveDocuments'
import { safeDocumentUrl, safeDriveLink } from '../office/driveModel'
import { fmtTime } from '../crm/model'
import { Icon, Modal, RefreshButton } from './components'
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

function PdfPreview({ url }) {
 const pdf = usePdf(url), [page, setPage] = useState(0)
 if (pdf.error) return <p className="admin-error" role="alert">{pdf.error}</p>
 if (!pdf.document) return <p role="status" className="platform-muted">Carregando PDF…</p>
 return <><div className="office-pdf-toolbar"><label>Página <select aria-label="Página do arquivo PDF" value={page} onChange={event => setPage(Number(event.target.value))}>{Array.from({ length: pdf.document.numPages }, (_, index) => <option key={index} value={index}>{index + 1} de {pdf.document.numPages}</option>)}</select></label></div><div className="drive-library-pdf"><PdfPage document={pdf.document} page={page} /></div></>
}

function UploadFile({ onClose, onSaved, connected }) {
 const auth = useAuth(), canClients = auth.hasPermission('crm.clients'), [file, setFile] = useState(null), [title, setTitle] = useState(''), [client, setClient] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), working = useRef(false)
 useUnsavedChanges(!!file || !!title.trim() || busy)
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
   const body = new FormData(); body.append('file', file); body.append('title', title); if (client) body.append('client_id', client)
   await platformRequest('duuk-drive?library=1', body)
   onSaved()
  } catch (cause) { setError(cause.message) } finally { working.current = false; setBusy(false) }
 }
 return <Modal title="Enviar arquivo" subtitle="GOOGLE DRIVE / DUUK" onClose={() => { if (!busy) onClose() }}>
  <form onSubmit={upload} className="drive-library-upload">
   <label className="admin-field"><span>Arquivo</span><input type="file" accept={formats} disabled={busy} onChange={event => setFile(event.target.files[0] || null)} required /><small>PDF, imagens, Office, TXT, CSV, ZIP e vídeos MP4/MOV. Até 20 MB por arquivo.</small></label>
   {file && <p className="drive-selected-file"><Icon name="file" /><span>{file.name}<small>{bytesLabel(file.size)}</small></span></p>}
   <label className="admin-field"><span>Título <small>(opcional)</small></span><input value={title} maxLength={160} disabled={busy} onChange={event => setTitle(event.target.value)} placeholder="Ex.: Briefing de produção" /></label>
   <label className="admin-field"><span>Pasta do cliente</span><select value={client} disabled={busy || clients.loading} onChange={event => setClient(event.target.value)}><option value="">Documentos / Internos</option>{clients.data?.map(item => <option key={item.id} value={item.id}>{item.company || item.name}</option>)}</select></label>
   {clients.error && <p className="admin-error" role="alert">{clients.error}<button type="button" className="admin-text-button" onClick={clients.reload}>Tentar novamente</button></p>}
   <p className="platform-muted">{connected ? 'O arquivo será salvo no painel e enviado à pasta privada da DUUK no Google Drive.' : 'O arquivo ficará salvo no painel, aguardando a conexão do Google Drive para ser enviado.'}</p>
   {error && <p className="admin-error" role="alert">{error}</p>}
   <footer className="admin-form-actions"><button type="button" className="admin-button admin-button--secondary" disabled={busy} onClick={onClose}>Cancelar</button><button className="admin-button" disabled={busy || !file}><Icon name="upload" />{busy ? 'Enviando arquivo…' : 'Enviar arquivo'}</button></footer>
  </form>
 </Modal>
}

export default function DrivePage({ notify }) {
 const auth = useAuth(), [search, setSearch] = useState(''), [term, setTerm] = useState(''), [kind, setKind] = useState(''), [offset, setOffset] = useState(0), [uploading, setUploading] = useState(false), [busy, setBusy] = useState(''), [preview, setPreview] = useState(null), working = useRef(false), alive = useRef(true)
 useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
 useEffect(() => { const timer = setTimeout(() => { setTerm(search.trim()); setOffset(0) }, 300); return () => clearTimeout(timer) }, [search])
 const query = useQuery(useCallback(() => driveRequest({ action: 'library', search: term, kind, offset }), [term, kind, offset])), reload = query.reload
 useEffect(() => { const timer = setInterval(() => { if (!document.hidden && navigator.onLine && !working.current) reload() }, 15000); return () => clearInterval(timer) }, [reload])
 const documents = query.data?.documents?.slice(0, 50) || [], connected = !!query.data?.connected
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
 return <>
  <PageTitle eyebrow="DOCUMENTOS / DUUK" title="Google Drive" description="Os arquivos da produtora, no mesmo lugar."><RefreshButton onRefresh={reload} disabled={!!busy} /><button className="admin-button" onClick={() => setUploading(true)}><Icon name="upload" />Enviar arquivo</button></PageTitle>
  <div className="drive-library-account"><AppLogo app="drive" /><div><strong>{query.data?.account_email || 'Armazenamento central da DUUK'}</strong><span>{connected ? 'Conta conectada · arquivos privados' : 'Aguardando conexão · arquivos preservados no painel'}</span></div>{auth.profile?.is_super_admin && <Link className="admin-text-button" to="/admin/configuracoes/integracoes">Gerenciar conexão<Icon name="arrow" size={16} /></Link>}</div>
  <section className="admin-panel drive-library" aria-label="Arquivos do Google Drive">
   <div className="drive-library-toolbar"><label className="admin-search"><Icon name="search" /><input type="search" aria-label="Buscar arquivos" placeholder="Buscar arquivo ou cliente…" value={search} maxLength={120} onChange={event => setSearch(event.target.value)} /></label><label className="admin-field"><span>Categoria</span><select value={kind} onChange={event => { setKind(event.target.value); setOffset(0) }}>{categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
   <QueryState query={query}>
    <div className="drive-library-list" aria-busy={query.loading}>
     {documents.map(item => <article className="drive-library-row" key={item.id}>
      <span className="drive-library-file-icon"><Icon name={item.mime_type?.startsWith('image/') ? 'media' : item.mime_type?.startsWith('video/') ? 'film' : 'file'} size={24} /></span>
      <div className="drive-library-file"><button className="drive-file-name" onClick={() => act('view', item)} disabled={!!busy}>{item.title || item.file_name}</button><small>{item.title && `${item.file_name} · `}{item.client_name} · {bytesLabel(item.byte_size)}</small><small>{categories.find(([value]) => value === item.kind)?.[1]} · {fmtTime(item.synced_at || item.created_at)}</small>{item.last_error && <p className="drive-library-error">{item.last_error}</p>}</div>
      <DriveChip state={item.status} />
      <div className="drive-library-actions"><button className="admin-icon-button" title="Visualizar arquivo" aria-label={`Visualizar ${item.file_name}`} disabled={!!busy} onClick={() => act('view', item)}><Icon name="eye" /></button><button className="admin-icon-button" title="Baixar arquivo" aria-label={`Baixar ${item.file_name}`} disabled={!!busy} onClick={() => act('download', item)}><Icon name="download" /></button>{item.status !== 'synced' && <button className="admin-icon-button" title={connected ? 'Sincronizar arquivo' : 'Conecte o Google Drive para sincronizar'} aria-label={`Sincronizar ${item.file_name}`} disabled={!!busy || !connected} onClick={() => act('retry', item)}><Icon name="refresh" /></button>}{safeDriveLink(item.drive_link) && <a className="admin-icon-button" title="Abrir no Google Drive" aria-label={`Abrir ${item.file_name} no Google Drive`} href={safeDriveLink(item.drive_link)} target="_blank" rel="noopener noreferrer"><Icon name="external" /></a>}</div>
     </article>)}
     {!documents.length && <div className="admin-empty"><Icon name="file" size={36} /><h2>{term || kind ? 'Nenhum arquivo encontrado' : 'Seu acervo começa aqui'}</h2><p>{term || kind ? 'Ajuste a busca ou escolha outra categoria.' : 'Envie arquivos ou crie contratos. Eles serão organizados automaticamente.'}</p></div>}
    </div>
    <footer className="drive-library-pagination"><span>{documents.length ? `${offset + 1}–${offset + documents.length}` : '0 arquivos'}</span><div><button className="admin-icon-button" aria-label="Página anterior" disabled={!offset || query.loading} onClick={() => setOffset(value => Math.max(0, value - 50))}><Icon name="left" /></button><button className="admin-icon-button" aria-label="Próxima página" disabled={query.loading || (query.data?.documents?.length || 0) <= 50} onClick={() => setOffset(value => value + 50)}><Icon name="right" /></button></div></footer>
   </QueryState>
  </section>
  <p className="drive-library-note"><Icon name="shield" size={16} />Mostra os arquivos gerenciados pelo DUUK Admin, conforme suas permissões. O restante da conta Google permanece privado. O espaço também é compartilhado com Gmail e Google Fotos.</p>
  {uploading && <UploadFile connected={connected} onClose={() => setUploading(false)} onSaved={() => { setUploading(false); reload(); notify('Arquivo salvo. Acompanhe o envio ao Google Drive nesta lista.') }} />}
  {preview && <Modal title={preview.name} subtitle="ARQUIVO PRIVADO / DUUK" wide onClose={() => setPreview(null)}><div className="drive-library-preview">{preview.mime.startsWith('image/') ? <img src={preview.url} alt={preview.name} /> : preview.mime.startsWith('video/') ? <video src={preview.url} controls playsInline /> : preview.mime === 'application/pdf' ? <PdfPreview key={preview.url} url={preview.url} /> : <div className="admin-empty"><Icon name="file" size={36} /><p>Baixe este arquivo para abrir no aplicativo correspondente.</p></div>}<button className="admin-button admin-button--secondary" disabled={!!busy} onClick={() => act('download', preview.item)}><Icon name="download" />Baixar arquivo</button></div></Modal>}
 </>
}
