import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ConfirmModal, Icon, Modal, RefreshButton } from '../admin/components'
import { EmptyState, ErrorState, PageTitle, Pagination, SearchField } from '../admin/forms'
import { matchesQuery, usePagination } from '../admin/ds/list'
import { useCreateIntent } from '../admin/shell/hooks'
import { useUnsavedChanges } from '../admin/unsavedChanges'
import { listContracts, listDriveStatuses, officeRequest } from './api'
import { contractStatuses, dateLabel, downloadFile, fieldTypes, partyLabels } from './model'
import { useQuery } from './useQuery'
import PdfPage from './PdfPage'
import { DriveChip, DriveDocuments } from './DriveDocuments'
import { driveState } from './driveModel'
import { usePdf } from './usePdf'
import SignatureInviteModal from './SignatureInviteModal'
import { ListSkeleton, OfficeField } from './OfficeParts'
import { emailPattern, formatBytes, isPdf, useValidation } from './officeHelpers'

const statusTones = { draft: 'ds-badge--neutral', pending: 'ds-badge--warning', partial: 'ds-badge--warning', signed: 'ds-badge--success', cancelled: 'ds-badge--neutral' }
const statusFilters = [['all', 'Todos'], ['draft', 'Preparar'], ['pending', 'Aguardando'], ['partial', 'Uma assinatura'], ['signed', 'Concluídos'], ['cancelled', 'Cancelados']]
const maxPdfBytes = 10485760

function StatusBadge({ status }) {
  return <span className={`ds-badge ${statusTones[status] || 'ds-badge--neutral'}`}><i />{contractStatuses[status] || status}</span>
}

// Mirrors what duuk-office checks on upload, so problems show next to each field before sending.
function uploadErrors({ form, file }) {
  const errors = {}
  if (!form.title.trim()) errors.title = 'Informe o título do contrato.'
  if (!form.client_name.trim()) errors.client_name = 'Informe o nome do cliente.'
  if (!form.duuk_name.trim()) errors.duuk_name = 'Informe o representante da DUUK.'
  if (form.client_email.trim() && !emailPattern.test(form.client_email.trim())) errors.client_email = 'Confira o e-mail do cliente.'
  if (!file) errors.file = 'Escolha o PDF do contrato.'
  else if (!isPdf(file)) errors.file = 'Use um arquivo PDF.'
  else if (!file.size || file.size > maxPdfBytes) errors.file = 'Escolha um PDF de até 10 MB.'
  return errors
}

function UploadContract({ onClose, onSaved }) {
  const [form, setForm] = useState({ title: '', client_name: '', client_email: '', duuk_name: '' }), [file, setFile] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [dragging, setDragging] = useState(false)
  useUnsavedChanges(true)
  const { errors, control, field, check } = useValidation(uploadErrors, { form, file })
  const update = (key, value) => setForm(old => ({ ...old, [key]: value }))
  const pick = selected => { if (selected) setFile(selected) }
  const save = async event => {
    event.preventDefault()
    if (busy || !check()) return
    setBusy(true); setError('')
    try {
      if (!file || file.size > maxPdfBytes) throw new Error('Escolha um PDF de até 10 MB.')
      const body = new FormData()
      body.append('file', file)
      for (const [key, value] of Object.entries(form)) body.append(key, value)
      await onSaved(await officeRequest(body))
    } catch (cause) { setError(cause.message) } finally { setBusy(false) }
  }
  return (
    <Modal title="Novo contrato" subtitle="Envie o PDF pronto e prepare os campos de assinatura." onClose={() => { if (!busy) onClose() }}>
      <form onSubmit={save} noValidate>
        <fieldset disabled={busy} className="office-form">
          <div className="admin-form-grid">
            <OfficeField label="Título do contrato" className="ds-span-2" {...field('title')}>
              <input {...control('title')} maxLength={160} autoComplete="off" value={form.title} onChange={e => update('title', e.target.value)} />
            </OfficeField>
            <OfficeField label="Nome do cliente" {...field('client_name')}>
              <input {...control('client_name')} maxLength={160} autoComplete="off" value={form.client_name} onChange={e => update('client_name', e.target.value)} />
            </OfficeField>
            <OfficeField label="Representante da DUUK" {...field('duuk_name')}>
              <input {...control('duuk_name')} maxLength={160} autoComplete="off" value={form.duuk_name} onChange={e => update('duuk_name', e.target.value)} />
            </OfficeField>
            <OfficeField label="E-mail do cliente" optional className="ds-span-2" hint="Será sugerido ao gerar o link com código de confirmação. Você compartilha o link manualmente." {...field('client_email')}>
              <input {...control('client_email', true)} type="email" inputMode="email" maxLength={254} autoComplete="off" value={form.client_email} onChange={e => update('client_email', e.target.value)} />
            </OfficeField>
            <OfficeField label="Arquivo PDF" className="ds-span-2" hint="Até 10 MB e 30 páginas, sem senha. Arquivo privado." {...field('file')}>
              <label
                className={`office-dropzone${dragging ? ' is-dragging' : ''}${file ? ' is-filled' : ''}${errors.file ? ' is-invalid' : ''}`}
                onDragOver={event => { event.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={event => { event.preventDefault(); setDragging(false); pick(event.dataTransfer.files[0]) }}
              >
                <input {...control('file', true)} aria-label="Arquivo PDF" type="file" accept="application/pdf,.pdf" onChange={e => pick(e.target.files[0])} />
                <span className="office-dropzone__icon" aria-hidden="true"><Icon name={file ? 'document' : 'upload'} /></span>
                <span className="office-dropzone__copy">
                  <strong>{file ? file.name : 'Escolher arquivo PDF'}</strong>
                  <small>{file ? `${formatBytes(file.size)} · toque ou arraste outro arquivo para trocar` : 'Clique para escolher ou arraste o arquivo para cá'}</small>
                </span>
              </label>
            </OfficeField>
          </div>
          {error && <ErrorState>{error}</ErrorState>}
        </fieldset>
        <div className="admin-modal__foot">
          <button type="button" className="admin-button admin-button--secondary" disabled={busy} onClick={onClose}>Cancelar</button>
          <button type="submit" className="admin-button" disabled={busy} aria-busy={busy}>{busy ? 'Enviando PDF…' : 'Enviar e preparar PDF'}</button>
        </div>
      </form>
    </Modal>
  )
}

function KpiValue({ loading, value }) {
  if (loading) return <strong><span className="ds-skeleton office-kpi-skeleton" aria-hidden="true" /><span className="ds-visually-hidden">Carregando</span></strong>
  return <strong>{value}</strong>
}

export default function ContractsPage({ notify }) {
  const navigate = useNavigate(), [uploading, setUploading] = useState(false), [filter, setFilter] = useState('all'), [trash, setTrash] = useState(false), [action, setAction] = useState(null), [search, setSearch] = useState('')
  const query = useCallback(() => listContracts(true), [])
  const { data, loading, error, reload: load } = useQuery(query)
  const driveQuery = useQuery(useCallback(() => listDriveStatuses(['contract_original', 'contract_signed']), [])), reloadDrive = driveQuery.reload
  const drive = (driveQuery.data || []).reduce((groups, item) => { (groups[item.contract_id] ??= []).push(item); return groups }, {})
  const refresh = async () => { const [result] = await Promise.all([load(), reloadDrive()]); return result }
  const contracts = data || []
  useCreateIntent('contrato', () => setUploading(true))
  const active = contracts.filter(c => !c.deleted_at), deleted = contracts.filter(c => c.deleted_at)
  const visible = trash ? deleted : active.filter(c => filter === 'all' || c.status === filter)
  const listed = visible.filter(c => matchesQuery(search, c.title, c.client_name, c.client_email, c.duuk_name, contractStatuses[c.status]))
  const pager = usePagination(listed, { pageSize: 25, resetKey: `${trash}|${filter}|${search}` })
  const initial = loading && !data, failed = Boolean(error) && !data, searching = Boolean(search.trim())
  const noun = count => `${count} ${count === 1 ? 'documento' : 'documentos'}`
  const count = searching ? `${listed.length} de ${noun(visible.length)}` : noun(visible.length)
  const stat = value => failed ? '—' : value
  const clearFilters = () => { setSearch(''); setFilter('all') }
  let empty = null
  if (!listed.length) {
    if (trash && !deleted.length) empty = <EmptyState icon="trash" title="Lixeira vazia">Contratos excluídos aparecem aqui para você revisar ou restaurar.</EmptyState>
    else if (!trash && !active.length) empty = <EmptyState icon="document" title="Um novo acordo começa aqui" action={<button type="button" className="admin-button admin-button--secondary" onClick={() => setUploading(true)}><Icon name="upload" />Enviar primeiro PDF</button>}>Envie um PDF, prepare os campos e compartilhe os links de assinatura.</EmptyState>
    else if (searching) empty = <EmptyState icon="search" title="Nenhum contrato encontrado" action={<button type="button" className="admin-button admin-button--secondary" onClick={() => setSearch('')}>Limpar busca</button>}>Tente buscar pelo título, cliente ou e-mail.</EmptyState>
    else empty = <EmptyState icon="filter" title="Nenhum contrato neste filtro" action={<button type="button" className="admin-button admin-button--secondary" onClick={clearFilters}>Ver todos</button>}>Escolha outro status para ver seus documentos.</EmptyState>
  }
  return (
    <>
      <PageTitle eyebrow="ADMINISTRATIVO / DOCUMENTOS" title="Contratos" description="Todo acordo merece uma história bem documentada.">
        <RefreshButton onRefresh={refresh} />
        <button type="button" className="admin-button" onClick={() => setUploading(true)}><Icon name="plus" />Novo contrato</button>
      </PageTitle>
      <div className="admin-stats office-stats-3">
        <div><span>Contratos ativos</span><KpiValue loading={initial} value={stat(active.length)} /></div>
        <div><span>Aguardando assinatura</span><KpiValue loading={initial} value={stat(active.filter(c => ['pending', 'partial'].includes(c.status)).length)} /></div>
        <div><span>Concluídos</span><KpiValue loading={initial} value={stat(active.filter(c => c.status === 'signed').length)} /></div>
      </div>
      <section className="admin-panel office-list" aria-label="Lista de contratos">
        <div className="office-list-toolbar">
          <div className="ds-segmented" role="group" aria-label="Local dos contratos">
            <button type="button" aria-pressed={!trash} onClick={() => setTrash(false)}><Icon name="document" />Contratos</button>
            <button type="button" aria-pressed={trash} onClick={() => setTrash(true)}><Icon name="trash" />Lixeira{deleted.length ? ` (${deleted.length})` : ''}</button>
          </div>
          <SearchField value={search} onChange={setSearch} label="Buscar contratos" placeholder="Buscar por título ou cliente…" />
        </div>
        <div className="office-list-toolbar is-sub">
          {trash ? (
            <p className="office-list-note"><Icon name="lock" />Os links foram revogados. PDFs e assinaturas permanecem guardados; você pode restaurar os contratos.</p>
          ) : (
            <div className="admin-filter-tabs" role="group" aria-label="Situação dos contratos">
              {statusFilters.map(([key, label]) => <button type="button" key={key} aria-pressed={filter === key} className={filter === key ? 'is-active' : ''} onClick={() => setFilter(key)}>{label}</button>)}
            </div>
          )}
          {!initial && !failed && <span className="office-list-count" aria-live="polite">{count}</span>}
        </div>
        {error && <ErrorState onRetry={refresh}>{error}</ErrorState>}
        <div className="office-list-body">
          {initial ? <ListSkeleton label="Carregando contratos…" rows={5} /> : failed ? null : pager.items.length ? (
            <ul className="office-contract-list">
              {pager.items.map(contract => (
                <li key={contract.id} className={`office-contract-item${trash ? ' is-trashed' : ''}`}>
                  <Link className="office-contract-link" to={`/admin/contratos/${contract.id}`}>
                    <span className="office-contract-icon" aria-hidden="true"><Icon name="document" /></span>
                    <span className="office-contract-main">
                      <strong>{contract.title}</strong>
                      <small>{contract.client_name} · {trash ? `Excluído em ${dateLabel(contract.deleted_at)}` : `Criado em ${dateLabel(contract.created_at)}`}</small>
                    </span>
                    <span className="office-contract-status">
                      <StatusBadge status={contract.status} />
                      <DriveChip state={driveState(contract, drive[contract.id] || [])} />
                    </span>
                    <Icon name="right" size={16} className="office-contract-chevron" />
                  </Link>
                  <button
                    type="button"
                    className={`admin-icon-button${trash ? '' : ' admin-icon-button--danger'}`}
                    aria-label={`${trash ? 'Restaurar' : 'Excluir'} ${contract.title}`}
                    title={trash ? 'Restaurar contrato' : 'Mover para lixeira'}
                    onClick={() => setAction({ contract, kind: trash ? 'restore' : 'trash' })}
                  >
                    <Icon name={trash ? 'restore' : 'trash'} />
                  </button>
                </li>
              ))}
            </ul>
          ) : empty}
        </div>
        <Pagination pager={pager} noun="contratos" label="Páginas de contratos" />
      </section>
      <div className="admin-tip"><Icon name="info" /><p>Assinatura eletrônica por aceite e desenho, com registro de data, nome, IP e navegador. Novos links confirmam o acesso ao e-mail por código antes da assinatura. O fluxo continua sem certificado ICP-Brasil.</p></div>
      {uploading && <UploadContract onClose={() => setUploading(false)} onSaved={contract => navigate(`/admin/contratos/${contract.id}`)} />}
      {action && (
        <ConfirmModal
          tone={action.kind === 'trash' ? 'danger' : undefined}
          title={action.kind === 'trash' ? 'Excluir contrato?' : 'Restaurar contrato?'}
          message={action.kind === 'trash' ? `“${action.contract.title}” vai para a lixeira. Os links deixam de funcionar e os documentos e assinaturas são preservados.` : 'O contrato volta para a lista. Os links antigos continuam revogados; gere novos links para quem ainda não assinou.'}
          action={action.kind === 'trash' ? 'Mover para lixeira' : 'Restaurar contrato'}
          onClose={() => setAction(null)}
          onConfirm={async () => { await officeRequest({ action: action.kind, id: action.contract.id, version: action.contract.version }); await load(); notify(action.kind === 'trash' ? 'Contrato movido para a lixeira.' : 'Contrato restaurado.') }}
        />
      )}
    </>
  )
}

function EditorSkeleton() {
  return (
    <div className="office-editor" role="status">
      <span className="ds-visually-hidden">Carregando contrato…</span>
      <div className="office-contract-layout" aria-hidden="true">
        <div className="office-document"><span className="ds-skeleton office-pdf-skeleton" style={{ aspectRatio: 210 / 297 }} /></div>
        <div className="office-contract-sidebar">
          <div className="admin-panel office-panel office-skeleton-stack">
            <span className="ds-skeleton ds-skeleton--title" />
            <span className="ds-skeleton ds-skeleton--text" />
            <span className="ds-skeleton" />
            <span className="ds-skeleton" />
          </div>
          <div className="admin-panel office-panel office-skeleton-stack">
            <span className="ds-skeleton ds-skeleton--title" />
            <span className="ds-skeleton" />
            <span className="ds-skeleton" />
          </div>
        </div>
      </div>
    </div>
  )
}

const coordinateFields = [['x', 'Esquerda'], ['y', 'Topo'], ['width', 'Largura'], ['height', 'Altura']]
const confirmCopy = {
  delete: { title: 'Excluir definitivamente?', message: 'O registro e o PDF original serão apagados permanentemente. Esta ação não pode ser desfeita.', action: 'Excluir definitivamente', tone: 'danger' },
  trash: { title: 'Excluir contrato?', message: 'O contrato vai para a lixeira e os links deixam de funcionar. PDFs, campos e assinaturas recebidas são preservados.', action: 'Mover para lixeira', tone: 'danger' },
  restore: { title: 'Restaurar contrato?', message: 'O contrato volta para a lista. Os links antigos continuam revogados; gere novos links para quem ainda não assinou.', action: 'Restaurar contrato' },
  cancel: { title: 'Cancelar contrato?', message: 'Os links deixam de funcionar. Assinaturas já recebidas são preservadas.', action: 'Cancelar contrato', tone: 'danger' },
}

export function ContractEditor({ notify }) {
  const { id } = useParams(), navigate = useNavigate(), [details, setDetails] = useState(null), [fields, setFields] = useState([]), [page, setPage] = useState(0), [selected, setSelected] = useState(null), [type, setType] = useState('signature'), [party, setParty] = useState('client'), [busy, setBusy] = useState(false), [error, setError] = useState(''), [action, setAction] = useState(null), [share, setShare] = useState(null), [copied, setCopied] = useState(false), [copyFailed, setCopyFailed] = useState(false), [leaving, setLeaving] = useState(false)
  const uid = useId(), errorBox = useRef(null)
  const load = useCallback(async () => { try { const data = await officeRequest({ action: 'details', id }); setDetails(data); setFields(data.contract.fields); setError('') } catch (cause) { setError(cause.message) } }, [id])
  useEffect(() => { const timer = window.setTimeout(load, 0); return () => window.clearTimeout(timer) }, [load])
  const pdf = usePdf(details?.original_url), contract = details?.contract, dirty = contract && JSON.stringify(fields) !== JSON.stringify(contract.fields), current = fields.find(f => f.id === selected), editable = contract?.status === 'draft' && !contract?.deleted_at
  useEffect(() => { if (!dirty) return; const handler = event => { event.preventDefault(); event.returnValue = '' }; window.addEventListener('beforeunload', handler); return () => window.removeEventListener('beforeunload', handler) }, [dirty])
  useUnsavedChanges(dirty || busy)
  // Operation errors appear at the top of the editor; bring them into view on small screens.
  useEffect(() => { if (error && contract) errorBox.current?.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }) }, [error, contract])
  const update = (fieldId, patch) => setFields(old => old.map(f => f.id === fieldId ? { ...f, ...patch } : f))
  const add = (kind = type, side = party) => { if (fields.length >= 30) { setError('Use até 30 campos.'); return } const field = { id: crypto.randomUUID(), page, type: kind, party: side, x: side === 'client' ? .1 : .54, y: kind === 'signature' ? .72 : .87, width: .35, height: kind === 'signature' ? .1 : .035, label: '' }; setFields(old => [...old, field]); setSelected(field.id) }
  const save = async () => { setBusy(true); setError(''); try { const next = await officeRequest({ action: 'fields', id, fields, version: contract.version }); setDetails(old => ({ ...old, contract: next })); setFields(next.fields); notify('Campos salvos. Agora você pode gerar os links.') } catch (cause) { setError(cause.message) } finally { setBusy(false) } }
  const invite = async (side, email) => { setBusy(true); try { const result = await officeRequest({ action: 'invite', id, party: side, email, version: contract.version }); setDetails(old => ({ ...old, contract: result.contract })); setShare({ party: side, url: result.url, expires_at: result.expires_at, email }); setCopied(false); setCopyFailed(false); setError('') } catch (cause) { setError(cause.message); throw cause } finally { setBusy(false) } }
  const download = async (signed = false) => { setBusy(true); setError(''); try { const fresh = await officeRequest({ action: 'details', id }); const url = signed ? fresh.signed_url : fresh.original_url; if (!url) throw new Error('O PDF assinado ainda está sendo preparado.'); const response = await fetch(url); if (!response.ok) throw new Error('Não foi possível baixar o arquivo.'); downloadFile(await response.blob(), `duuk-${signed ? 'assinado' : 'original'}-${id.slice(0, 8)}.pdf`) } catch (cause) { setError(cause.message) } finally { setBusy(false) } }
  const render = async () => { setBusy(true); setError(''); try { const result = await officeRequest({ action: 'render', id }); setDetails(old => ({ ...old, contract: result.contract, signed_url: result.signed_url })); notify('PDF atualizado.') } catch (cause) { setError(cause.message) } finally { setBusy(false) } }
  const copyLink = async () => { try { await navigator.clipboard.writeText(share.url); setCopied(true); setCopyFailed(false) } catch { setCopied(false); setCopyFailed(true) } }
  const goToPage = next => { setPage(next); setSelected(null) }
  const back = <Link className="office-back-link" to="/admin/contratos" onClick={e => { if (e.defaultPrevented) return; if (dirty) { e.preventDefault(); setLeaving(true) } }}><Icon name="back" />Contratos</Link>

  if (!contract) return (
    <>
      <div className="admin-page-title office-editor-title">
        <div>{back}{error ? <h1>Contrato indisponível<span>.</span></h1> : <span className="ds-skeleton ds-skeleton--title" aria-hidden="true" />}</div>
      </div>
      {error ? <ErrorState onRetry={() => { setError(''); load() }}>{error}</ErrorState> : <EditorSkeleton />}
    </>
  )

  const signedParties = new Set(details.signatures.map(s => s.party)), pageCount = contract.pages.length
  const sheet = contract.pages[page] || {}, turned = [90, 270].includes(sheet.rotation), ratio = sheet.width && sheet.height ? (turned ? sheet.height / sheet.width : sheet.width / sheet.height) : 210 / 297
  const blocked = busy || dirty || Boolean(contract.deleted_at) || contract.status === 'cancelled' || contract.status === 'signed'
  const evidence = () => downloadFile(new Blob([JSON.stringify({ contract: { id: contract.id, title: contract.title, status: contract.status, original_sha256: contract.original_sha256, signed_sha256: contract.signed_sha256 }, signatures: details.signatures }, null, 2)], { type: 'application/json' }), `duuk-evidencias-${id.slice(0, 8)}.json`)
  const confirm = action && action.kind !== 'invite' ? confirmCopy[action.kind] : null
  return (
    <>
      <div className="admin-page-title office-editor-title">
        <div>
          {back}
          <h1>{contract.title}<span>.</span></h1>
          <div className="office-editor-meta">
            <span><Icon name="user" />{contract.client_name}</span>
            {contract.deleted_at && <span className="ds-badge ds-badge--neutral"><Icon name="trash" size={13} />Na lixeira</span>}
            <StatusBadge status={contract.status} />
          </div>
        </div>
        <div className="admin-title-actions">
          <RefreshButton onRefresh={async () => { if (dirty || busy) throw new Error('Salve os campos antes de atualizar.'); await load() }} />
        </div>
      </div>
      <div className="office-editor">
        <div ref={errorBox}>{error && <ErrorState>{error}</ErrorState>}</div>
        <div className="office-contract-layout">
          <section className="office-document" aria-label="Documento PDF">
            <div className="office-pdf-toolbar">
              <div className="office-pdf-pager">
                <label><span>Página</span><select aria-label="Página do PDF" value={page} onChange={e => goToPage(Number(e.target.value))}>{contract.pages.map((_, i) => <option key={i} value={i}>{i + 1} de {pageCount}</option>)}</select></label>
                <button type="button" className="admin-icon-button" aria-label="Página anterior" disabled={page <= 0} onClick={() => goToPage(page - 1)}><Icon name="left" /></button>
                <button type="button" className="admin-icon-button" aria-label="Próxima página" disabled={page >= pageCount - 1} onClick={() => goToPage(page + 1)}><Icon name="right" /></button>
              </div>
              <button type="button" className="admin-button admin-button--secondary admin-button--sm" disabled={busy} onClick={() => download()}><Icon name="download" />Baixar original</button>
            </div>
            {pdf.error ? <ErrorState>{pdf.error}</ErrorState> : !pdf.document ? (
              <span className="ds-skeleton office-pdf-skeleton" role="status" style={{ aspectRatio: ratio }}><span className="ds-visually-hidden">Carregando PDF…</span></span>
            ) : <PdfPage document={pdf.document} page={page} fields={fields} editable={editable && !busy} selected={selected} onSelect={setSelected} onMove={update} />}
          </section>
          <aside className="office-contract-sidebar" aria-label="Campos, assinaturas e armazenamento">
            <section className="admin-panel office-panel" aria-labelledby={`${uid}-fields`}>
              <div className="office-panel-head">
                <h2 id={`${uid}-fields`}>{editable ? 'Preparar campos' : 'Campos do documento'}</h2>
                {editable && dirty && <span className="ds-badge ds-badge--warning"><i />Não salvo</span>}
              </div>
              {editable && <p className="office-muted office-small">Escolha a página, adicione campos e arraste para posicionar sobre o PDF.</p>}
              {editable && (
                <div className="office-field-create">
                  <label className="admin-field"><span>Campo</span><select aria-label="Campo" value={type} onChange={e => setType(e.target.value)}>{Object.entries(fieldTypes).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
                  <label className="admin-field"><span>Participante</span><select aria-label="Participante" value={party} onChange={e => setParty(e.target.value)}>{Object.entries(partyLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
                  <button type="button" className="admin-button admin-button--secondary" disabled={busy} onClick={() => add()}><Icon name="plus" />Adicionar campo</button>
                </div>
              )}
              {editable && !fields.length && (
                <div className="office-field-presets">
                  <p className="office-muted office-small">Comece com as duas assinaturas:</p>
                  <button type="button" className="admin-button admin-button--secondary" onClick={() => add('signature', 'client')}>Assinatura do cliente</button>
                  <button type="button" className="admin-button admin-button--secondary" onClick={() => add('signature', 'duuk')}>Assinatura da DUUK</button>
                </div>
              )}
              {fields.length > 0 && (
                <ul className="office-field-list" aria-label="Campos do contrato">
                  {fields.map(field => (
                    <li key={field.id}>
                      <button type="button" aria-pressed={selected === field.id} onClick={() => { setSelected(field.id); setPage(field.page) }}>
                        <span className={`office-field-swatch${field.party === 'duuk' ? ' is-duuk' : ''}`} aria-hidden="true" />
                        <span><strong>{field.label || fieldTypes[field.type]}</strong><small>{partyLabels[field.party]} · página {field.page + 1}</small></span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {!editable && !fields.length && <p className="office-muted office-small">Nenhum campo neste documento.</p>}
              {current && editable && (
                <div className="office-field-controls">
                  <label className="admin-field"><span>Rótulo do campo</span><input maxLength={80} value={current.label} onChange={e => update(current.id, { label: e.target.value })} /></label>
                  <div className="office-coordinate-grid">
                    {coordinateFields.map(([key, label]) => (
                      <label className="admin-field" key={key}>
                        <span>{label} (%)</span>
                        <input type="number" inputMode="decimal" min={key === 'width' ? 2 : key === 'height' ? 1.5 : 0} max={100} step={.5} value={Math.round(current[key] * 1000) / 10} onChange={e => { let value = Number(e.target.value) / 100; value = Math.max(key === 'width' ? .02 : key === 'height' ? .015 : 0, Math.min(1, value)); const patch = { [key]: value }; if (key === 'x') patch.x = Math.min(value, 1 - current.width); if (key === 'y') patch.y = Math.min(value, 1 - current.height); if (key === 'width') patch.width = Math.min(value, 1 - current.x); if (key === 'height') patch.height = Math.min(value, 1 - current.y); update(current.id, patch) }} />
                      </label>
                    ))}
                  </div>
                  <button type="button" className="admin-text-button admin-text-button--danger" onClick={() => { setFields(old => old.filter(f => f.id !== current.id)); setSelected(null) }}><Icon name="trash" />Remover campo</button>
                </div>
              )}
              {editable ? (
                <button type="button" className="admin-button office-full-button" disabled={!dirty || busy} aria-busy={busy} onClick={save}>{busy ? 'Salvando…' : 'Salvar campos'}</button>
              ) : <p className="office-muted office-small">Os campos e o PDF são preservados após gerar links de assinatura.</p>}
            </section>
            <section className="admin-panel office-panel" aria-labelledby={`${uid}-signatures`}>
              <div className="office-panel-head">
                <h2 id={`${uid}-signatures`}>Assinaturas</h2>
                <span className="ds-badge ds-badge--neutral">{signedParties.size} de 2</span>
              </div>
              <p className="office-muted office-small">Salve os campos antes de gerar os links. Cada participante precisa de um campo de assinatura.</p>
              <ul className="office-participants">
                {['client', 'duuk'].map(side => (
                  <li className="office-participant" key={side}>
                    <div>
                      <strong>{side === 'client' ? contract.client_name : contract.duuk_name}</strong>
                      <small>{partyLabels[side]}{side === 'client' && contract.client_email ? ` · ${contract.client_email}` : ''}</small>
                    </div>
                    {signedParties.has(side) ? <span className="ds-badge ds-badge--success"><Icon name="check" size={13} />Assinado</span> : (
                      <button type="button" className="admin-button admin-button--secondary" disabled={blocked} onClick={() => setAction({ kind: 'invite', party: side })}><Icon name="link" />Gerar link · {partyLabels[side]}</button>
                    )}
                  </li>
                ))}
              </ul>
              {details.signatures.length > 0 && (
                <div className="office-editor-actions">
                  <button type="button" className="admin-button" disabled={busy} onClick={() => download(true)}><Icon name="download" />Baixar PDF assinado</button>
                  {contract.rendered_version !== contract.version && <button type="button" className="admin-text-button" disabled={busy} onClick={render}><Icon name="refresh" />Gerar PDF atualizado</button>}
                  <button type="button" className="admin-text-button" onClick={evidence}><Icon name="document" />Baixar registro de aceite</button>
                </div>
              )}
              <div className="office-editor-actions">
                {!contract.deleted_at && !['signed', 'cancelled', 'draft'].includes(contract.status) && <button type="button" className="admin-text-button admin-text-button--danger" disabled={busy || dirty} onClick={() => setAction({ kind: 'cancel' })}><Icon name="xCircle" />Cancelar links e contrato</button>}
                {contract.deleted_at ? (
                  <>
                    <p className="office-muted office-small">Na lixeira desde {dateLabel(contract.deleted_at)}. Os links anteriores foram revogados.</p>
                    <button type="button" className="admin-button admin-button--secondary" disabled={busy} onClick={() => setAction({ kind: 'restore' })}><Icon name="restore" />Restaurar contrato</button>
                    {!details.signatures.length && <button type="button" className="admin-text-button admin-text-button--danger" disabled={busy} onClick={() => setAction({ kind: 'delete' })}><Icon name="trash" />Excluir definitivamente</button>}
                  </>
                ) : <button type="button" className="admin-text-button admin-text-button--danger" disabled={busy || dirty} onClick={() => setAction({ kind: 'trash' })}><Icon name="trash" />Excluir contrato</button>}
              </div>
            </section>
            <section className="admin-panel office-panel">
              <DriveDocuments scope={{ contract_id: id, version: contract.version }} contract={contract} empty="Este contrato ainda não foi registrado para armazenamento." notify={notify} />
            </section>
          </aside>
        </div>
      </div>
      {leaving && <ConfirmModal title="Sair sem salvar?" message="Os campos alterados ainda não foram salvos." action="Sair sem salvar" onClose={() => setLeaving(false)} onConfirm={() => navigate('/admin/contratos')} />}
      {action?.kind === 'invite' && <SignatureInviteModal party={action.party} contract={contract} onClose={() => setAction(null)} onConfirm={async email => { await invite(action.party, email); setAction(null) }} />}
      {confirm && (
        <ConfirmModal
          tone={confirm.tone}
          title={confirm.title}
          message={confirm.message}
          action={confirm.action}
          onClose={() => setAction(null)}
          onConfirm={async () => { await officeRequest({ action: action.kind, id, version: contract.version }); if (['delete', 'trash'].includes(action.kind)) navigate('/admin/contratos'); else await load(); notify(action.kind === 'restore' ? 'Contrato restaurado.' : action.kind === 'trash' ? 'Contrato movido para a lixeira.' : action.kind === 'delete' ? 'Contrato excluído definitivamente.' : 'Contrato cancelado.') }}
        />
      )}
      {share && (
        <Modal title={`Link de assinatura · ${partyLabels[share.party]}`} subtitle={`Válido até ${dateLabel(share.expires_at)}. Copie agora; o token não fica armazenado em texto no painel.`} onClose={() => setShare(null)}>
          <div className="admin-modal__body office-share">
            <div className="admin-field">
              <label className="admin-label" htmlFor={`${uid}-link`}>Link privado</label>
              <div className="office-copy-field"><input id={`${uid}-link`} readOnly value={share.url} onFocus={e => e.target.select()} /></div>
              <p className={`office-copy-status${copyFailed ? ' is-error' : ''}`} role="status">
                {copied && <><Icon name="checkCircle" />Link copiado para a área de transferência.</>}
                {copyFailed && <><Icon name="alertCircle" />Não foi possível copiar automaticamente. Selecione o link e copie.</>}
              </p>
            </div>
            <p className="office-muted">Compartilhe diretamente com {share.party === 'client' ? contract.client_name : contract.duuk_name}. Gerar outro link invalida este. O código será enviado para {share.email}.</p>
          </div>
          <div className="admin-modal__foot">
            <a className="admin-button admin-button--secondary" href={share.url} target="_blank" rel="noreferrer"><Icon name="external" />Abrir assinatura</a>
            <button type="button" className="admin-button" onClick={copyLink}><Icon name={copied ? 'check' : 'copy'} />{copied ? 'Link copiado' : 'Copiar link'}</button>
          </div>
        </Modal>
      )}
    </>
  )
}
