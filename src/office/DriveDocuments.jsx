import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { Icon, RefreshButton } from '../admin/components'
import { useUnsavedChanges } from '../admin/unsavedChanges'
import { useAuth } from '../content/AuthContext'
import { supabase } from '../content/supabase'
import { driveRequest } from './api'
import { driveState, safeDocumentUrl, safeDriveLink } from './driveModel'
import { dateLabel } from './model'
import { useQuery } from './useQuery'
import './drive.css'

const FeedbackContext = createContext(() => {})
const states = {
  trashed: { icon: 'trash', label: 'Na lixeira do Drive', hint: 'A cópia do Drive está na lixeira. O original e as assinaturas continuam preservados no painel.' },
  synced: { icon: 'cloudCheck', label: 'Sincronizado', hint: 'Guardado no Google Drive da DUUK.' },
  pending: { icon: 'cloudUpload', label: 'Pendente', hint: 'Aguardando o envio automático ao Google Drive.' },
  error: { icon: 'cloudAlert', label: 'Erro de sincronização', hint: 'Não foi possível guardar no Google Drive. O documento continua salvo no DUUK Admin.' },
}
const kindLabels = { contract_original: 'Contrato original', contract_signed: 'Contrato assinado', proposal: 'Proposta comercial', document: 'Documento' }

export function DriveChip({ state }) {
  if (!state) return null
  const item = states[state] || states.pending
  return <span className={`drive-chip is-${state}`} title={item.hint}><Icon name={item.icon} size={14} />{item.label}</span>
}

function DriveDocumentRow({ document, busy, onView, onDownload, onRetry, canManage }) {
  const status = document.drive_trashed_at ? 'trashed' : document.status, state = states[status] || states.pending, link = status === 'trashed' ? '' : safeDriveLink(document.drive_link)
  return <article className="drive-document">
    <div className="drive-document__head"><div><strong>{kindLabels[document.kind] || 'Documento'}</strong><small>{document.file_name}</small></div><DriveChip state={status} /></div>
    <p className="drive-document__note">{status === 'error' && document.last_error ? document.last_error : status === 'synced' && document.synced_at ? `Salvo em ${dateLabel(document.synced_at)}.` : state.hint}</p>
    <div className="drive-document__actions">
      <button type="button" className="admin-icon-button" disabled={busy} onClick={() => onView(document)} aria-label={`Visualizar ${document.file_name}`} title="Visualizar"><Icon name="eye" /></button>
      <button type="button" className="admin-icon-button" disabled={busy} onClick={() => onDownload(document)} aria-label={`Baixar ${document.file_name}`} title="Baixar"><Icon name="download" /></button>
      {link && document.can_open && <a className="admin-icon-button" href={link} target="_blank" rel="noopener noreferrer" aria-label={`Abrir ${document.file_name} no Google Drive`} title="Abrir no Google Drive"><Icon name="external" /></a>}
      {status !== 'synced' && status !== 'trashed' && canManage && <button type="button" className="admin-icon-button" disabled={busy} onClick={() => onRetry(document)} aria-label={`Sincronizar ${document.file_name} novamente`} title="Sincronizar novamente"><Icon name="refresh" /></button>}
    </div>
  </article>
}

export function DriveDocuments({ scope, contract = null, title = 'Google Drive', empty = 'Nenhum documento registrado.', notify, children }) {
  const auth = useAuth(), [busy, setBusy] = useState(false), [feedback, setFeedback] = useState(null), alive = useRef(true), working = useRef(false)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const key = JSON.stringify(scope), identity = JSON.stringify([scope.contract_id, scope.client_id, scope.kind])
  const say = useCallback((message, failed = false) => { if (alive.current) { setFeedback({ identity, message, failed }); notify?.(message, failed) } }, [notify, identity])
  const query = useQuery(useCallback(async () => ({ identity, documents: (await driveRequest({ action: 'documents', ...JSON.parse(key) })).documents || [] }), [key, identity])), reload = query.reload
  const current = query.data?.identity === identity, documents = current ? query.data.documents : [], state = driveState(contract, documents)
  const pending = state === 'pending' || documents.some(item => item.status !== 'synced')
  const canManage = auth.hasPermission(contract || scope.contract_id ? 'contracts' : 'crm.clients')
  useEffect(() => {
    if (!pending) return undefined
    const timer = setInterval(() => { if (document.visibilityState === 'visible' && navigator.onLine) reload() }, 30000)
    return () => clearInterval(timer)
  }, [pending, reload])
  const run = async work => { if (working.current) return; working.current = true; setBusy(true); try { await work() } catch (cause) { say(cause.message, true) } finally { working.current = false; if (alive.current) setBusy(false) } }
  const view = item => run(async () => {
    const tab = window.open('about:blank', '_blank')
    if (!tab) throw new Error('Permita abrir uma nova aba para visualizar este PDF e tente novamente.')
    if (tab) tab.opener = null
    try {
      const result = await driveRequest({ action: 'file', id: item.id, disposition: 'view' }), url = safeDocumentUrl(result.url, supabase.supabaseUrl)
      if (!url) throw new Error('Não foi possível confirmar o endereço privado deste PDF.')
      tab.location.href = url
    } catch (cause) { tab.close(); throw cause }
  })
  const download = item => run(async () => {
    const result = await driveRequest({ action: 'file', id: item.id, disposition: 'download' }), url = safeDocumentUrl(result.url, supabase.supabaseUrl)
    if (!url) throw new Error('Não foi possível confirmar o endereço privado deste PDF.')
    const link = document.createElement('a'); link.href = url; link.download = result.file_name || item.file_name; link.rel = 'noopener'; link.click()
  })
  const retry = item => run(async () => { await driveRequest({ action: 'retry', id: item.id }); await reload(); say('Nova tentativa solicitada. O estado será atualizado em instantes.') })
  return <section className="drive-panel" aria-label={title}>
    <div className="drive-panel__head"><h3><Icon name="cloud" size={16} />{title}</h3><div className="drive-panel__tools"><DriveChip state={current ? state : null} /><RefreshButton onRefresh={reload} disabled={busy} /></div></div>
    {query.error && <p className="office-muted office-small" role="status">Não foi possível atualizar o estado do Google Drive. Os PDFs continuam no DUUK Admin. Use Atualizar para tentar novamente.</p>}
    {documents.length ? <div className="drive-documents">{documents.map(item => <DriveDocumentRow key={item.id} document={item} busy={busy} canManage={canManage} onView={view} onDownload={download} onRetry={retry} />)}</div>
      : <p className="office-muted office-small">{query.loading || !current && !query.error ? 'Consultando o armazenamento…' : empty}</p>}
    {contract?.status === 'signed' && !documents.some(item => item.kind === 'contract_signed') && <p className="office-muted office-small">O PDF final será enviado assim que for gerado.</p>}
    {feedback?.identity === identity && <p className={`drive-feedback${feedback.failed ? ' is-error' : ''}`} role={feedback.failed ? 'alert' : 'status'}>{feedback.message}</p>}
    <FeedbackContext.Provider value={say}>{children}</FeedbackContext.Provider>
  </section>
}

function DocumentUpload({ client, kind, onUploaded }) {
  const say = useContext(FeedbackContext), [busy, setBusy] = useState(false), [title, setTitle] = useState(''), input = useRef(null), working = useRef(false), alive = useRef(true)
  const proposal = kind === 'proposal', label = proposal ? 'proposta' : 'documento'
  useUnsavedChanges(busy || Boolean(title.trim()))
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const upload = async event => {
    const file = event.target.files[0]
    event.target.value = ''
    if (!file || working.current) return
    working.current = true
    setBusy(true)
    try {
      if (!file.size || !/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') throw new Error('Escolha um arquivo PDF válido, sem senha.')
      if (file.size > 10485760) throw new Error('Escolha um PDF de até 10 MB.')
      const body = new FormData()
      body.append('file', file); body.append('client_id', client.id); body.append('kind', kind); body.append('title', title.trim())
      await driveRequest(body)
      if (alive.current) { setTitle(''); onUploaded(); say(`${proposal ? 'Proposta anexada' : 'Documento anexado'}. O PDF foi salvo no DUUK Admin e entrou na fila do Google Drive.`) }
    } catch (cause) { if (alive.current) say(cause.message, true) } finally { working.current = false; if (alive.current) setBusy(false) }
  }
  return <div className="drive-upload" aria-busy={busy}>
    <label className="admin-field"><span>Título {proposal ? 'da proposta' : 'do documento'} <small>(opcional)</small></span><input value={title} maxLength={160} disabled={busy} onChange={event => setTitle(event.target.value)} placeholder={proposal ? 'Ex.: Proposta de produção' : 'Ex.: Briefing de produção'} /></label>
    <input ref={input} className="drive-file-input" type="file" accept="application/pdf,.pdf" aria-label={`Selecionar ${label} em PDF`} disabled={busy} onChange={upload} />
    <button type="button" className="admin-button admin-button--secondary" disabled={busy} onClick={() => input.current.click()}><Icon name="upload" />{busy ? 'Enviando…' : `Anexar ${label} em PDF`}</button>
    <small className="office-muted">PDF sem senha, até 10 MB. A cópia no Drive permanece privada.</small>
  </div>
}

function ClientFiles({ client, notify, kind }) {
  const auth = useAuth(), proposal = kind === 'proposal'
  const [version, setVersion] = useState(0)
  if (!auth.hasPermission('crm.clients')) return null
  return <DriveDocuments scope={{ client_id: client.id, kind, version }} title={proposal ? 'Propostas em PDF' : 'Documentos em PDF'} empty={proposal ? 'Nenhuma proposta anexada a este cliente.' : 'Nenhum documento anexado a este cliente.'} notify={notify}>
    <DocumentUpload client={client} kind={kind} onUploaded={() => setVersion(old => old + 1)} />
  </DriveDocuments>
}

export const ClientProposals = props => <ClientFiles key={props.client.id} {...props} kind="proposal" />
export const ClientDocuments = props => <ClientFiles key={props.client.id} {...props} kind="document" />
