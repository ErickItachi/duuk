import '../admin/ds/tokens.css'
import '../admin/ds/base.css'
import '../admin/ds/components.css'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Icon } from '../admin/components'
import { ErrorState } from '../admin/forms'
import { signRequest } from './api'
import { dateLabel, downloadFile, fieldTypes } from './model'
import PdfPage from './PdfPage'
import { usePdf } from './usePdf'
import SignaturePad from './SignaturePad'
import SigningEmailGate from './SigningEmailGate'
import { OfficeField } from './OfficeParts'
import { useValidation } from './officeHelpers'
import '../admin/admin.css'
import './office.css'

export default function SigningPage() {
  const { token } = useParams()
  return <SigningDocument key={token} token={token} />
}

// Mirrors what duuk-sign checks before registering a signature.
function signingErrors({ name, values, textFields }) {
  const errors = {}
  if (name.trim().length < 2) errors.name = 'Informe seu nome completo.'
  for (const field of textFields) if (!String(values[field.id] || '').trim()) errors[`text-${field.id}`] = 'Preencha este campo.'
  return errors
}

function SigningDocument({ token }) {
  const [record, setRecord] = useState(null), [error, setError] = useState(''), [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false), [name, setName] = useState(''), [png, setPng] = useState('')
  const [values, setValues] = useState({}), [accepted, setAccepted] = useState(false), [page, setPage] = useState(0)
  const proof = useRef(''), alive = useRef(true), operation = useRef(false), loadSequence = useRef(0)
  useEffect(() => { alive.current = true; return () => { alive.current = false; proof.current = '' } }, [])
  const load = useCallback(async () => {
    const sequence = ++loadSequence.current
    setLoading(true)
    try {
      const result = await signRequest({ action: 'get', token, verification_token: proof.current || undefined })
      if (!alive.current || sequence !== loadSequence.current) return
      setRecord(result); setName(old => old || result.name || ''); setError('')
      if (result.verification?.required && !result.verification.verified) proof.current = ''
    } catch (cause) {
      if (alive.current && sequence === loadSequence.current) {
        setError(cause.message)
        if (cause.status === 403) {
          proof.current = ''
          setRecord(old => old?.verification?.required ? { ...old, title: '', pages: [], fields: [], original_url: null, signed_url: null, verification: { ...old.verification, verified: false } } : old)
          setAccepted(false)
        }
        if ([404, 410].includes(cause.status)) { proof.current = ''; setRecord(null); setAccepted(false); setPng(''); setValues({}) }
      }
    }
    finally { if (alive.current && sequence === loadSequence.current) setLoading(false) }
  }, [token])
  useEffect(() => { document.title = 'Assinar contrato — DUUK'; const timer = window.setTimeout(load, 0); return () => window.clearTimeout(timer) }, [load])
  const gated = Boolean(record?.verification?.required && !record.verification.verified)
  const pdf = usePdf(gated ? null : record?.original_url)
  const textFields = (record?.fields || []).filter(field => field.type === 'text')
  const { control, field, check } = useValidation(signingErrors, { name, values, textFields })
  const verified = result => {
    ++loadSequence.current
    proof.current = result.verification_token
    setRecord(result.record); setName(old => old || result.record.name || ''); setError(''); setLoading(false)
  }
  const fail = cause => {
    setError(cause.message)
    if (cause.status === 403 && record?.verification?.required) {
      proof.current = ''
      setRecord(old => ({ ...old, title: '', pages: [], fields: [], original_url: null, signed_url: null, verification: { ...old.verification, verified: false } }))
      setAccepted(false)
    }
    if ([404, 410].includes(cause.status)) { proof.current = ''; setRecord(null); setAccepted(false); setPng(''); setValues({}) }
  }
  const sign = async event => {
    event.preventDefault()
    if (operation.current) return
    if (!check()) return
    operation.current = true; setBusy(true); setError('')
    try {
      if (!png) throw new Error('Desenhe sua assinatura antes de continuar.')
      const result = await signRequest({ action: 'sign', token, verification_token: proof.current || undefined, name, png, values, accepted })
      if (alive.current) setRecord(result)
    } catch (cause) { if (alive.current) fail(cause) }
    finally { if (alive.current) { operation.current = false; setBusy(false) } }
  }
  const download = async () => {
    if (operation.current) return
    operation.current = true; setBusy(true); setError('')
    try {
      const current = await signRequest({ action: 'get', token, verification_token: proof.current || undefined })
      if (!alive.current) return
      if (current.verification?.required && !current.verification.verified) { proof.current = ''; setRecord(current); throw new Error('Confirme novamente seu e-mail para baixar o documento.') }
      if (!current.signed_url) throw new Error('O PDF está sendo preparado. Tente novamente em alguns instantes.')
      const response = await fetch(current.signed_url)
      if (!response.ok) throw new Error('Reabra o link para baixar o PDF.')
      const blob = await response.blob()
      if (alive.current) downloadFile(blob, `duuk-contrato-${current.id.slice(0, 8)}.pdf`)
    } catch (cause) { if (alive.current) fail(cause) }
    finally { if (alive.current) { operation.current = false; setBusy(false) } }
  }
  const pageCount = record?.pages?.length || 0
  return (
    <div className="admin-shell office-signing">
      <header className="office-signing-header">
        <div className="office-signing-brand">
          <img src="/media/duuk-logo-white.png" width="44" height="54" alt="DUUK" />
          <span>Assinatura de contrato<small>Um novo acordo começa aqui.</small></span>
        </div>
        <span className="ds-badge ds-badge--neutral"><Icon name="lock" />Link privado</span>
      </header>
      <main className="office-signing-main">
        {loading ? (
          <div className="office-signing-opening" role="status"><span className="ds-spinner" aria-hidden="true" />Abrindo documento…</div>
        ) : !record ? (
          <section className="admin-panel office-panel office-signing-status">
            <span className="office-signing-status__icon" aria-hidden="true"><Icon name="lock" /></span>
            <h1>Não foi possível abrir o contrato.</h1>
            {error && <ErrorState>{error}</ErrorState>}
            <p className="office-muted">Peça um novo link à DUUK.</p>
          </section>
        ) : gated ? (
          <>
            <SigningEmailGate token={token} hint={record.verification.email_hint} name={name} onNameChange={setName} onVerified={verified} onUnavailable={fail} />
            {error && <div className="office-signing-gate-error"><ErrorState>{error}</ErrorState></div>}
          </>
        ) : (
          <>
            <div className="office-signing-title">
              <p className="admin-eyebrow">{record.party === 'client' ? 'CLIENTE' : 'REPRESENTANTE DUUK'} / ASSINATURA ELETRÔNICA</p>
              <h1>{record.title}<span>.</span></h1>
              <p><Icon name="clock" />Link válido até {dateLabel(record.expires_at)}.</p>
            </div>
            {record.signed ? (
              <section className="admin-panel office-panel office-signing-success">
                <span className="office-signing-success__mark" aria-hidden="true"><Icon name="check" /></span>
                <span className="ds-badge ds-badge--success"><i />Sua assinatura foi registrada</span>
                <h2>{record.status === 'signed' ? 'Documento concluído.' : 'Aguardando a outra assinatura.'}</h2>
                <p>O PDF inclui as assinaturas recebidas e uma página de registro. Reabra este link para acompanhar a conclusão.</p>
                <div className="office-signing-success__actions">
                  <button type="button" className="admin-button" disabled={busy || !record.signed_url} aria-busy={busy} onClick={download}><Icon name="download" />{busy ? 'Preparando…' : 'Baixar PDF assinado'}</button>
                  <button type="button" className="admin-button admin-button--secondary" disabled={busy} onClick={load}><Icon name="refresh" />Atualizar situação</button>
                </div>
                {error && <ErrorState>{error}</ErrorState>}
              </section>
            ) : (
              <div className="office-signing-grid">
                <section className="office-document" aria-label="Documento">
                  <div className="office-pdf-toolbar">
                    <strong>Leia o documento completo</strong>
                    <div className="office-pdf-pager">
                      <label><span>Página</span><select aria-label="Página do documento" value={page} onChange={event => setPage(Number(event.target.value))}>{record.pages.map((_, index) => <option key={index} value={index}>{index + 1} de {pageCount}</option>)}</select></label>
                      <button type="button" className="admin-icon-button" aria-label="Página anterior" disabled={page <= 0} onClick={() => setPage(page - 1)}><Icon name="left" /></button>
                      <button type="button" className="admin-icon-button" aria-label="Próxima página" disabled={page >= pageCount - 1} onClick={() => setPage(page + 1)}><Icon name="right" /></button>
                    </div>
                  </div>
                  {pdf.error ? <ErrorState>{pdf.error}</ErrorState> : !pdf.document ? (
                    <span className="ds-skeleton office-pdf-skeleton" role="status" style={{ aspectRatio: 210 / 297 }}><span className="ds-visually-hidden">Carregando PDF…</span></span>
                  ) : <PdfPage document={pdf.document} page={page} fields={record.fields} values={values} signature={png} name={name} />}
                </section>
                <form className="admin-panel office-panel office-signing-form" onSubmit={sign} noValidate aria-labelledby="signing-form-title">
                  <h2 id="signing-form-title">Sua assinatura</h2>
                  <p className="office-muted office-small">Confira seu nome, desenhe a assinatura e confirme o aceite.</p>
                  <fieldset disabled={busy}>
                    <OfficeField label="Nome completo" {...field('name')}>
                      <input {...control('name')} minLength={2} maxLength={160} autoComplete="name" value={name} onChange={event => setName(event.target.value)} />
                    </OfficeField>
                    {textFields.map(item => (
                      <OfficeField key={item.id} label={`${item.label || fieldTypes[item.type]} · página ${item.page + 1}`} {...field(`text-${item.id}`)}>
                        <input {...control(`text-${item.id}`)} maxLength={200} value={values[item.id] || ''} onChange={event => setValues(old => ({ ...old, [item.id]: event.target.value }))} />
                      </OfficeField>
                    ))}
                    <SignaturePad onChange={setPng} disabled={busy} />
                    <label className="admin-checkbox office-consent"><input type="checkbox" required checked={accepted} onChange={event => setAccepted(event.target.checked)} /><span>Li o documento e concordo em assiná-lo eletronicamente, registrando meu nome, assinatura, data, endereço IP e navegador{record.verification?.required ? ', e a confirmação de acesso ao meu e-mail,' : ''} como evidências de aceite.</span></label>
                    <p className="office-signing-legal"><Icon name="lock" /><span>O acesso é autorizado por este link privado{record.verification?.required ? ' e pela confirmação de e-mail' : ''}. Assinatura por aceite e desenho, sem certificado ICP-Brasil.</span></p>
                    {error && <ErrorState>{error}</ErrorState>}
                    <button type="submit" className="admin-button" disabled={!png || !accepted || busy || !pdf.document} aria-busy={busy}>{busy ? 'Registrando assinatura…' : 'Assinar documento'}</button>
                  </fieldset>
                </form>
              </div>
            )}
          </>
        )}
      </main>
      <footer className="office-signing-footer">DUUK / Assinatura eletrônica · contato@duukfilms.com</footer>
    </div>
  )
}
