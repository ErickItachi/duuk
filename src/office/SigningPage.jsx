import '../admin/ds/tokens.css'
import '../admin/ds/base.css'
import '../admin/ds/components.css'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Icon } from '../admin/components'
import { ErrorState } from '../admin/forms'
import { signRequest } from './api'
import { fieldTypes } from './model'
import { supabase } from '../content/supabase'
import { prepareContractDownload, privateContractUrl, signingDateTime } from './contractDocuments'
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
  const [downloadLink, setDownloadLink] = useState('')
  useEffect(() => { if (!downloadLink) return; const timer = window.setTimeout(() => setDownloadLink(''), 60000); return () => window.clearTimeout(timer) }, [downloadLink])
  const proof = useRef(''), alive = useRef(true), operation = useRef(false), loadSequence = useRef(0)
  useEffect(() => { alive.current = true; return () => { alive.current = false; proof.current = '' } }, [])
  const load = useCallback(async () => {
    const sequence = ++loadSequence.current
    setLoading(true)
    try {
      const result = await signRequest({ action: 'get', token, verification_token: proof.current || undefined })
      if (!alive.current || sequence !== loadSequence.current) return
      setRecord(result); setName(old => old || result.name || ''); setError('')
      if (result.verification?.required && !result.verification.verified) { proof.current = ''; setDownloadLink('') }
    } catch (cause) {
      if (alive.current && sequence === loadSequence.current) {
        setError(cause.message)
        if (cause.status === 403) {
          proof.current = ''
          setRecord(old => old?.verification?.required ? { ...old, title: '', pages: [], fields: [], original_url: null, signed_url: null, verification: { ...old.verification, verified: false } } : old)
          setAccepted(false); setDownloadLink('')
        }
        if ([404, 410].includes(cause.status)) { proof.current = ''; setRecord(null); setAccepted(false); setPng(''); setValues({}); setDownloadLink('') }
      }
    }
    finally { if (alive.current && sequence === loadSequence.current) setLoading(false) }
  }, [token])
  useEffect(() => { document.title = 'Assinar contrato — DUUK'; const timer = window.setTimeout(load, 0); return () => window.clearTimeout(timer) }, [load])
  const gated = Boolean(record?.verification?.required && !record.verification.verified)
  const documentUrl = gated ? '' : privateContractUrl(record?.signed ? record?.signed_url : record?.original_url, supabase.supabaseUrl)
  const pdf = usePdf(documentUrl)
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
      setAccepted(false); setDownloadLink('')
    }
    if ([404, 410].includes(cause.status)) { proof.current = ''; setRecord(null); setAccepted(false); setPng(''); setValues({}); setDownloadLink('') }
  }
  const sign = async event => {
    event.preventDefault()
    if (operation.current) return
    if (!check()) return
    operation.current = true; setBusy(true); setError(''); setDownloadLink('')
    try {
      if (!png) throw new Error('Desenhe sua assinatura antes de continuar.')
      if (!accepted) throw new Error('Leia o documento e marque o aceite antes de assinar.')
      if (!pdf.document) throw new Error('Aguarde o documento carregar antes de assinar.')
      const result = await signRequest({ action: 'sign', token, verification_token: proof.current || undefined, name, png, values, accepted })
      if (alive.current) { setRecord(old => ({ ...old, ...result })); setPage(0); setAccepted(false); setPng('') }
    } catch (cause) { if (alive.current) fail(cause) }
    finally { if (alive.current) { operation.current = false; setBusy(false) } }
  }
  const download = async () => {
    if (operation.current) return
    const destination = prepareContractDownload()
    operation.current = true; setBusy(true); setError(''); setDownloadLink('')
    try {
      const current = await signRequest({ action: 'get', token, verification_token: proof.current || undefined })
      if (!alive.current) { destination.cancel(); return }
      if (current.verification?.required && !current.verification.verified) { proof.current = ''; setRecord(current); throw new Error('Confirme novamente seu e-mail para baixar o documento.') }
      if (!current.signed_url) throw new Error('O PDF está sendo preparado. Tente novamente em alguns instantes.')
      setDownloadLink(destination.complete(current.signed_url, supabase.supabaseUrl, `duuk-contrato-${current.id.slice(0, 8)}.pdf`))
      setRecord(current)
    } catch (cause) { destination.cancel(); if (alive.current) fail(cause) }
    finally { if (alive.current) { operation.current = false; setBusy(false) } }
  }
  const pageCount = pdf.document?.numPages || record?.pages?.length || 0, displayedPage = Math.min(page, Math.max(0, pageCount - 1))
  const documentPreview = record && !gated && (
    <section className={`office-document${record.signed ? ' office-signing-signed-document' : ''}`} aria-label={record.signed ? 'Documento assinado' : 'Documento para leitura'}>
      <div className="office-pdf-toolbar">
        <strong>{record.signed ? 'PDF assinado e registro de aceite' : 'Leia o documento completo'}</strong>
        <div className="office-pdf-pager">
          <label><span>Página</span><select aria-label="Página do documento" value={displayedPage} disabled={!pdf.document} onChange={event => setPage(Number(event.target.value))}>{Array.from({ length: pageCount }, (_, index) => <option key={index} value={index}>{index + 1} de {pageCount}</option>)}</select></label>
          <button type="button" className="admin-icon-button" aria-label="Página anterior" disabled={!pdf.document || displayedPage <= 0} onClick={() => setPage(displayedPage - 1)}><Icon name="left" /></button>
          <button type="button" className="admin-icon-button" aria-label="Próxima página" disabled={!pdf.document || displayedPage >= pageCount - 1} onClick={() => setPage(displayedPage + 1)}><Icon name="right" /></button>
        </div>
      </div>
      {record.signed && !documentUrl ? <ErrorState onRetry={load}>{record.pdf_error || 'Sua assinatura foi registrada. O PDF está sendo preparado; atualize a situação para abrir o documento.'}</ErrorState> : pdf.error ? <ErrorState onRetry={load}>{pdf.error}</ErrorState> : !pdf.document ? (
        <span className="ds-skeleton office-pdf-skeleton" role="status" style={{ aspectRatio: 210 / 297 }}><span className="ds-visually-hidden">Carregando PDF…</span></span>
      ) : <PdfPage document={pdf.document} page={displayedPage} fields={record.signed ? [] : record.fields} values={values} signature={png} name={name} />}
    </section>
  )
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
              <p><Icon name="clock" />Link válido até {signingDateTime(record.expires_at)}.</p>
            </div>
            {record.signed ? (
              <>
              <section className="admin-panel office-panel office-signing-success">
                <span className="office-signing-success__mark" aria-hidden="true"><Icon name="check" /></span>
                <span className="ds-badge ds-badge--success"><i />Sua assinatura foi registrada</span>
                <h2>{record.status === 'signed' ? 'Documento concluído.' : 'Aguardando a outra assinatura.'}</h2>
                <p>O PDF inclui as assinaturas recebidas e o registro de aceite nas páginas finais. Você pode acompanhar a conclusão por este link enquanto ele estiver válido.</p>
                <div className="office-signing-success__actions">
                  <button type="button" className="admin-button" disabled={busy} aria-busy={busy} onClick={download}><Icon name="download" />{busy ? 'Preparando…' : 'Baixar PDF assinado'}</button>
                  <button type="button" className="admin-button admin-button--secondary" disabled={busy} onClick={load}><Icon name="refresh" />Atualizar situação</button>
                </div>
                {downloadLink && <div className="office-download-ready" role="status"><a className="admin-button admin-button--secondary" href={downloadLink} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"><Icon name="download" />Baixar PDF preparado</a><p className="office-small office-muted">Link disponível por um minuto. Se expirar, toque em baixar novamente.</p></div>}
                <p className="office-small">No iPhone, se o PDF abrir no visualizador, use Compartilhar → Salvar em Arquivos.</p>
                {error && <ErrorState>{error}</ErrorState>}
              </section>
              {documentPreview}
              </>
            ) : (
              <>
              <ol className="office-signing-steps" aria-label="Etapas da assinatura"><li><strong>Leia o contrato</strong><span>Confira todas as páginas do documento.</span></li><li><strong>Confira seus dados</strong><span>Preencha os campos e desenhe sua assinatura.</span></li><li><strong>Confirme o aceite</strong><span>Revise e selecione Assinar documento.</span></li></ol>
              <div className="office-signing-grid">
                {documentPreview}
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
                    <div className="office-signing-consent-summary"><h3>Seu aceite fica registrado</h3><p>Ao confirmar, serão registrados seu nome, desenho da assinatura, data e hora, endereço IP e navegador{record.verification?.required ? ', além da confirmação de acesso ao e-mail' : ''}. As datas são apresentadas no horário de Brasília.</p><p>Confira os dados e o documento antes de assinar. A assinatura recebida é preservada no contrato.</p></div>
                    <label className="admin-checkbox office-consent"><input type="checkbox" required checked={accepted} onChange={event => setAccepted(event.target.checked)} /><span>Li o documento e concordo em assiná-lo eletronicamente, registrando meu nome, assinatura, data, endereço IP e navegador como evidências de aceite.{record.verification?.required ? ' Confirmo o acesso ao e-mail do participante por código e autorizo o registro dessa confirmação como evidência.' : ''}</span></label>
                    <p className="office-signing-legal"><Icon name="lock" /><span>O acesso é autorizado por este link privado{record.verification?.required ? ' e pela confirmação de e-mail, que comprova acesso à caixa, sem verificar a identidade civil' : ''}. Assinatura por aceite e desenho, sem certificado ICP-Brasil.</span></p>
                    {error && <ErrorState>{error}</ErrorState>}
                    <button type="submit" className="admin-button" disabled={!png || !accepted || busy || !pdf.document} aria-busy={busy}>{busy ? 'Registrando assinatura…' : 'Assinar documento'}</button>
                  </fieldset>
                </form>
              </div>
              </>
            )}
          </>
        )}
      </main>
      <footer className="office-signing-footer">DUUK / Assinatura eletrônica · contato@duukfilms.com</footer>
    </div>
  )
}
