import { useEffect, useId, useRef, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { Icon } from '../admin/components'
import { ErrorState } from '../admin/forms'
import { signRequest } from './api'
import { OfficeField } from './OfficeParts'
import { emailPattern, useValidation } from './officeHelpers'
import './signing-verification.css'

function gateErrors({ name, email }) {
  const errors = {}
  if (name.trim().length < 2) errors.name = 'Informe seu nome completo.'
  if (!email.trim()) errors.email = 'Informe o e-mail definido para este contrato.'
  else if (!emailPattern.test(email.trim())) errors.email = 'Confira o e-mail informado.'
  return errors
}

export default function SigningEmailGate({ token, hint, name, onNameChange, onVerified, onUnavailable }) {
  const [email, setEmail] = useState(''), [code, setCode] = useState(''), [challenge, setChallenge] = useState(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [clock, setClock] = useState(Date.now)
  const alive = useRef(true), sending = useRef(false), attempt = useRef(null)
  const titleId = useId(), codeId = useId()
  const { control, field, check } = useValidation(gateErrors, { name, email })
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => { if (!challenge) return; const timer = setInterval(() => setClock(Date.now()), 1000); return () => clearInterval(timer) }, [challenge])
  const remaining = challenge?.retry_at ? Math.max(0, Math.ceil((Date.parse(challenge.retry_at) - clock) / 1000)) : 0
  const expired = Boolean(challenge?.expires_at && Date.parse(challenge.expires_at) <= clock)
  const send = async (event, resend = false) => {
    event?.preventDefault()
    if (sending.current || remaining > 0) return
    if (!challenge && !check()) return
    if (!name.trim() || !email.trim()) { setError('Preencha seu nome e o e-mail definido para este contrato.'); return }
    sending.current = true; setBusy(true); setError(''); setNotice('')
    const recipient = email.trim().toLowerCase()
    if (resend || !attempt.current || attempt.current.email !== recipient) attempt.current = { action: 'request_otp', token, email: recipient, client_request_id: crypto.randomUUID() }
    try {
      const result = await signRequest(attempt.current)
      if (!alive.current) return
      if (!result.challenge_id) throw new Error('Não foi possível confirmar o envio. Tente novamente.')
      setChallenge(result); setClock(Date.now()); setCode(''); setNotice(`Código enviado para ${result.email_hint || hint}. Confira também a pasta de spam.`); attempt.current = null
    } catch (cause) {
      if (!alive.current) return
      if ([400, 403, 404, 409, 410, 429].includes(cause.status)) attempt.current = null
      if ([404, 410].includes(cause.status)) { onUnavailable(cause); return }
      setError(cause.message)
    } finally { if (alive.current) { sending.current = false; setBusy(false) } }
  }
  const verify = async event => {
    event.preventDefault()
    if (sending.current || !challenge || expired) return
    sending.current = true; setBusy(true); setError('')
    try {
      const result = await signRequest({ action: 'verify_otp', token, challenge_id: challenge.challenge_id, code })
      if (!alive.current) return
      if (!result.verification_token || !result.record) throw new Error('Não foi possível confirmar seu acesso. Tente novamente.')
      onVerified(result)
    } catch (cause) { if (alive.current) { if ([404, 410].includes(cause.status)) onUnavailable(cause); else setError(cause.message) } }
    finally { if (alive.current) { sending.current = false; setBusy(false) } }
  }
  return (
    <section className="admin-panel signing-verification" aria-labelledby={titleId}>
      <div className="signing-verification__mark" aria-hidden="true"><Icon name="shield" size={20} /></div>
      <p className="admin-eyebrow">Acesso ao documento</p>
      <h1 id={titleId}>Confirme seu e-mail<span>.</span></h1>
      <p className="office-muted">Para abrir o contrato e assinar, confirme a caixa de e-mail definida pela DUUK: <strong>{hint || 'o e-mail do participante'}</strong>.</p>
      <ol className="signing-verification__steps" aria-label="Etapas da confirmação">
        <li className={challenge ? 'is-done' : 'is-current'} aria-current={challenge ? undefined : 'step'}><span aria-hidden="true">{challenge ? <Icon name="check" size={12} /> : 1}</span>Receber código</li>
        <li className={challenge ? 'is-current' : undefined} aria-current={challenge ? 'step' : undefined}><span aria-hidden="true">2</span>Confirmar código</li>
      </ol>
      {!challenge ? (
        <form onSubmit={send} noValidate>
          <fieldset disabled={busy} className="office-form signing-verification__form">
            <OfficeField label="Nome completo" {...field('name')}>
              <input {...control('name')} minLength={2} maxLength={160} autoComplete="name" value={name} onChange={event => onNameChange(event.target.value)} />
            </OfficeField>
            <OfficeField label="E-mail do participante" hint="Use o endereço definido no contrato. Para corrigir o destinatário, fale com a DUUK." {...field('email')}>
              <input {...control('email', true)} type="email" inputMode="email" maxLength={254} autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} />
            </OfficeField>
            {error && <ErrorState>{error}</ErrorState>}
            <button type="submit" className="admin-button" disabled={busy} aria-busy={busy}><Icon name="mail" size={16} />{busy ? 'Enviando código…' : 'Receber código por e-mail'}</button>
          </fieldset>
        </form>
      ) : (
        <form onSubmit={verify}>
          <fieldset disabled={busy} className="office-form signing-verification__form">
            {notice && <p className="ds-alert ds-alert--info" role="status"><Icon name="mail" /><span>{notice}</span></p>}
            <div className="admin-field">
              <label className="admin-label" htmlFor={codeId}>Código de seis dígitos</label>
              <input id={codeId} className="signing-verification__code" required type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} aria-describedby="signing-code-help" autoFocus />
              <small id="signing-code-help">O código vale por dez minutos. Não compartilhe com outras pessoas.</small>
            </div>
            {expired && <p className="ds-alert ds-alert--warning" role="status"><Icon name="clock" /><span>Este código expirou. Solicite outro para continuar.</span></p>}
            {error && <ErrorState>{error}</ErrorState>}
            <button type="submit" className="admin-button" disabled={busy || code.length !== 6 || expired} aria-busy={busy}>{busy ? 'Confirmando…' : 'Confirmar e abrir contrato'}<ArrowRight size={16} strokeWidth={1.6} aria-hidden="true" /></button>
            <button type="button" className="admin-text-button" disabled={busy || remaining > 0} onClick={event => send(event, true)}>{remaining > 0 ? `Reenviar em ${remaining}s` : 'Enviar um novo código'}</button>
          </fieldset>
        </form>
      )}
      <p className="office-muted office-small signing-verification__foot">A confirmação verifica seu acesso a essa caixa de e-mail. A assinatura continua sendo eletrônica, por aceite e desenho.</p>
    </section>
  )
}
