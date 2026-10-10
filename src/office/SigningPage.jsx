import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { signRequest } from './api'
import { dateLabel, downloadFile, fieldTypes } from './model'
import PdfPage from './PdfPage'
import { usePdf } from './usePdf'
import SignaturePad from './SignaturePad'
import SigningEmailGate from './SigningEmailGate'
import '../admin/admin.css'
import './office.css'

export default function SigningPage() {
  const { token } = useParams()
  return <SigningDocument key={token} token={token} />
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
  return <div className="admin-shell office-signing">
    <header className="office-signing-header"><div className="office-signing-brand"><img src="/media/duuk-logo-white.png" width="44" height="54" alt="DUUK" /><span>ASSINATURA DE CONTRATO<small>Um novo acordo começa aqui.</small></span></div><span>LINK PRIVADO</span></header>
    <main className="office-signing-main">
      {loading ? <p className="office-empty">Abrindo documento…</p> : !record ? <section className="admin-panel office-panel"><h1>Não foi possível abrir o contrato.</h1><p role="alert" className="admin-error">{error}</p><p className="office-muted">Peça um novo link à DUUK.</p></section> : gated ? <><SigningEmailGate token={token} hint={record.verification.email_hint} name={name} onNameChange={setName} onVerified={verified} onUnavailable={fail} />{error && <p className="admin-error" role="alert">{error}</p>}</> : <>
        <div className="admin-page-title"><div><p className="admin-eyebrow">{record.party === 'client' ? 'CLIENTE' : 'REPRESENTANTE DUUK'} / ASSINATURA ELETRÔNICA</p><h1>{record.title}<span>.</span></h1><p>Link válido até {dateLabel(record.expires_at)}.</p></div></div>
        {record.signed ? <section className="admin-panel office-panel office-signing-success"><span className="office-badge is-done">Sua assinatura foi registrada</span><h2>{record.status === 'signed' ? 'Documento concluído.' : 'Aguardando a outra assinatura.'}</h2><p>O PDF inclui as assinaturas recebidas e uma página de registro. Reabra este link para acompanhar a conclusão.</p><button className="admin-button" disabled={busy || !record.signed_url} onClick={download}>{busy ? 'Preparando…' : 'Baixar PDF assinado'}</button><button className="admin-button admin-button--secondary" disabled={busy} onClick={load}>Atualizar situação</button>{error && <p className="admin-error" role="alert">{error}</p>}</section> : <div className="office-signing-grid">
          <section className="office-document"><div className="office-pdf-toolbar"><strong>Leia o documento completo</strong><label>Página <select aria-label="Página do documento" value={page} onChange={event => setPage(Number(event.target.value))}>{record.pages.map((_, index) => <option key={index} value={index}>{index + 1} de {record.pages.length}</option>)}</select></label></div>{pdf.error ? <p className="admin-error" role="alert">{pdf.error}</p> : !pdf.document ? <p className="office-empty">Carregando PDF…</p> : <PdfPage document={pdf.document} page={page} fields={record.fields} values={values} signature={png} name={name} />}</section>
          <form className="admin-panel office-panel office-signing-form" onSubmit={sign}><h2>Sua assinatura</h2><fieldset disabled={busy}>
            <label className="admin-field"><span>Nome completo</span><input required minLength={2} maxLength={160} autoComplete="name" value={name} onChange={event => setName(event.target.value)} /></label>
            {record.fields.filter(field => field.type === 'text').map(field => <label key={field.id} className="admin-field"><span>{field.label || fieldTypes[field.type]} · página {field.page + 1}</span><input required maxLength={200} value={values[field.id] || ''} onChange={event => setValues(old => ({ ...old, [field.id]: event.target.value }))} /></label>)}
            <SignaturePad onChange={setPng} disabled={busy} />
            <label className="admin-checkbox office-consent"><input type="checkbox" required checked={accepted} onChange={event => setAccepted(event.target.checked)} /><span>Li o documento e concordo em assiná-lo eletronicamente, registrando meu nome, assinatura, data, endereço IP e navegador{record.verification?.required ? ', e a confirmação de acesso ao meu e-mail,' : ''} como evidências de aceite.</span></label>
            <p className="office-muted office-small">O acesso é autorizado por este link privado{record.verification?.required ? ' e pela confirmação de e-mail' : ''}. Assinatura por aceite e desenho, sem certificado ICP-Brasil.</p>
            {error && <p className="admin-error" role="alert">{error}</p>}
            <button className="admin-button" disabled={!png || !accepted || busy || !pdf.document}>{busy ? 'Registrando assinatura…' : 'Assinar documento'}</button>
          </fieldset></form>
        </div>}
      </>}
    </main><footer className="office-signing-footer">DUUK / Assinatura eletrônica · contato@duukfilms.com</footer>
  </div>
}
