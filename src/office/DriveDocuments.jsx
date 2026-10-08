import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { Icon } from '../admin/components'
import { driveRequest } from './api'
import { driveState } from './driveModel'
import { dateLabel } from './model'
import { useQuery } from './useQuery'

const FeedbackContext = createContext(() => {})
const states = {
  synced: { icon: 'cloudCheck', label: 'Sincronizado', hint: 'Guardado no Google Drive da DUUK.' },
  pending: { icon: 'cloudUpload', label: 'Pendente', hint: 'Aguardando o envio automático ao Google Drive.' },
  error: { icon: 'cloudAlert', label: 'Erro de sincronização', hint: 'Não foi possível guardar no Google Drive. O documento continua salvo no DUUK Admin.' },
}
const kindLabels = { contract_original: 'Contrato original', contract_signed: 'Contrato assinado', proposal: 'Proposta comercial' }

export function DriveChip({ state }) {
  if (!state) return null
  const item = states[state]
  return <span className={`drive-chip is-${state}`} title={item.hint}><Icon name={item.icon} size={14} />{item.label}</span>
}

function safeDriveLink(value) {
  try { const url = new URL(value); return url.origin === 'https://drive.google.com' ? url.href : '' } catch { return '' }
}

function DriveDocumentRow({ document, busy, onView, onDownload, onRetry }) {
  const state = states[document.status] || states.pending, link = safeDriveLink(document.drive_link)
  return <article className="drive-document">
    <div className="drive-document__head"><div><strong>{kindLabels[document.kind] || 'Documento'}</strong><small>{document.file_name}</small></div><DriveChip state={document.status} /></div>
    <p className="drive-document__note">{document.status === 'error' && document.last_error ? document.last_error : document.status === 'synced' && document.synced_at ? `Salvo em ${dateLabel(document.synced_at)}.` : state.hint}</p>
    <div className="drive-document__actions">
      <button type="button" className="admin-icon-button" disabled={busy} onClick={() => onView(document)} aria-label={`Visualizar ${document.file_name}`} title="Visualizar"><Icon name="eye" /></button>
      <button type="button" className="admin-icon-button" disabled={busy} onClick={() => onDownload(document)} aria-label={`Baixar ${document.file_name}`} title="Baixar"><Icon name="download" /></button>
      {link && document.can_open && <a className="admin-icon-button" href={link} target="_blank" rel="noopener noreferrer" aria-label={`Abrir ${document.file_name} no Google Drive`} title="Abrir no Google Drive"><Icon name="external" /></a>}
      {document.status !== 'synced' && <button type="button" className="admin-icon-button" disabled={busy} onClick={() => onRetry(document)} aria-label={`Sincronizar ${document.file_name} novamente`} title="Sincronizar novamente"><Icon name="refresh" /></button>}
    </div>
  </article>
}

export function DriveDocuments({ scope, contract = null, title = 'Google Drive', empty, notify, children }) {
  const [busy, setBusy] = useState(false), [feedback, setFeedback] = useState(null), alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const say = useCallback((message, failed = false) => { if (alive.current) setFeedback({ message, failed }); notify(message, failed) }, [notify])
  const key = JSON.stringify(scope)
  const query = useQuery(useCallback(async () => (await driveRequest({ action: 'documents', ...JSON.parse(key) })).documents, [key])), reload = query.reload
  const documents = query.data || [], pending = documents.some(item => item.status !== 'synced')
  useEffect(() => {
    if (!pending) return undefined
    const timer = setInterval(() => { if (document.visibilityState === 'visible' && navigator.onLine) reload() }, 30000)
    return () => clearInterval(timer)
  }, [pending, reload])
  const run = async work => { setBusy(true); try { await work() } catch (cause) { say(cause.message, true) } finally { if (alive.current) setBusy(false) } }
  const view = item => run(async () => {
    const tab = window.open('about:blank', '_blank')
    if (tab) tab.opener = null
    try { const { url } = await driveRequest({ action: 'file', id: item.id, disposition: 'view' }); if (tab) tab.location.href = url; else window.location.assign(url) } catch (cause) { tab?.close(); throw cause }
  })
  const download = item => run(async () => { const { url, file_name: name } = await driveRequest({ action: 'file', id: item.id, disposition: 'download' }); const link = document.createElement('a'); link.href = url; link.download = name; link.rel = 'noopener'; link.click() })
  const retry = item => run(async () => { await driveRequest({ action: 'retry', id: item.id }); await reload(); say('Nova tentativa solicitada. O estado será atualizado em instantes.') })
  const state = driveState(contract, documents)
  return <section className="drive-panel" aria-label={title}>
    <div className="drive-panel__head"><h3><Icon name="cloud" size={16} />{title}</h3><DriveChip state={state} /></div>
    {query.error && !query.data ? <p className="office-muted office-small">O estado do Google Drive não está disponível agora. O documento continua seguro no DUUK Admin.</p>
      : documents.length ? <div className="drive-documents">{documents.map(item => <DriveDocumentRow key={item.id} document={item} busy={busy} onView={view} onDownload={download} onRetry={retry} />)}</div>
        : <p className="office-muted office-small">{query.loading ? 'Consultando o armazenamento…' : empty}</p>}
    {contract?.status === 'signed' && documents.length > 0 && !documents.some(item => item.kind === 'contract_signed') && <p className="office-muted office-small">O PDF final será enviado assim que for gerado.</p>}
    {feedback && <p className={`drive-feedback${feedback.failed ? ' is-error' : ''}`} role={feedback.failed ? 'alert' : 'status'}>{feedback.message}</p>}
    <FeedbackContext.Provider value={say}>{children}</FeedbackContext.Provider>
  </section>
}

function ProposalUpload({ client, onUploaded }) {
  const say = useContext(FeedbackContext), [busy, setBusy] = useState(false), input = useRef(null)
  const upload = async event => {
    const file = event.target.files[0]
    event.target.value = ''
    if (!file) return
    setBusy(true)
    try {
      if (file.size > 10485760) throw new Error('Escolha um PDF de até 10 MB.')
      const body = new FormData()
      body.append('file', file); body.append('client_id', client.id)
      await driveRequest(body)
      onUploaded()
      say('Proposta anexada. Ela será guardada no Google Drive automaticamente.')
    } catch (cause) { say(cause.message, true) } finally { setBusy(false) }
  }
  return <>
    <input ref={input} className="drive-file-input" type="file" accept="application/pdf,.pdf" aria-label="Anexar proposta em PDF" onChange={upload} />
    <button type="button" className="admin-button admin-button--secondary" disabled={busy} onClick={() => input.current.click()}><Icon name="upload" />{busy ? 'Enviando…' : 'Anexar proposta em PDF'}</button>
  </>
}

export function ClientProposals({ client, notify }) {
  const [version, setVersion] = useState(0)
  return <DriveDocuments scope={{ client_id: client.id, version }} title="Propostas em PDF" empty="Nenhuma proposta anexada a este cliente." notify={notify}>
    <ProposalUpload client={client} onUploaded={() => setVersion(old => old + 1)} />
  </DriveDocuments>
}
