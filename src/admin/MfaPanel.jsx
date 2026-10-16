import { useState } from 'react'
import { supabase } from '../content/supabase'
import { authenticatorImage, validMfaCode } from '../content/mfa.mjs'
import { Icon } from './components'
import './security.css'

export default function MfaPanel({ requirement, onVerified, onCancel }) {
  const [enrollment, setEnrollment] = useState(null)
  const [factorId, setFactorId] = useState(requirement.factors?.[0]?.id || '')
  const [code, setCode] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const enrolling = requirement.step === 'enroll'
  const begin = async () => {
    if (busy) return
    setBusy(true); setError('')
    try {
      // An abandoned QR code cannot be recovered. Remove only unverified
      // factors belonging to this account before issuing its replacement.
      const listed = await supabase.auth.mfa.listFactors()
      if (listed.error) throw listed.error
      for (const factor of listed.data.all || []) {
        if (factor.factor_type === 'totp' && factor.status === 'unverified') {
          const removed = await supabase.auth.mfa.unenroll({ factorId: factor.id })
          if (removed.error) throw removed.error
        }
      }
      const { data, error: cause } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `DUUK ${crypto.randomUUID().slice(0, 8)}`, issuer: 'DUUK' })
      if (cause || !authenticatorImage(data?.totp?.qr_code)) throw cause || new Error('QR indisponível')
      setEnrollment(data); setFactorId(data.id)
    } catch { setError('Não foi possível preparar o autenticador. Confira a conexão e tente novamente.') }
    finally { setBusy(false) }
  }
  const verify = async event => {
    event.preventDefault()
    if (busy || !validMfaCode(code) || !factorId) return
    setBusy(true); setError('')
    try {
      const result = await supabase.auth.mfa.challengeAndVerify({ factorId, code })
      if (result.error) throw result.error
      setCode(''); setEnrollment(null)
      await onVerified()
    } catch { setCode(''); setError('Código inválido ou expirado. Confira o horário automático do celular e use o código atual. Aguarde antes de tentar novamente.') }
    finally { setBusy(false) }
  }
  return <section className="admin-mfa" aria-label="Autenticação de dois fatores" aria-busy={busy}>
    <div className="admin-mfa__heading"><Icon name="shield" /><h2>{enrolling ? 'Configure os dois fatores' : 'Confirme seu acesso'}</h2></div>
    <p>{enrolling ? 'Todos da equipe precisam de um aplicativo autenticador gratuito, como Google Authenticator, Microsoft Authenticator ou 2FAS. O painel só libera os dados depois da confirmação.' : 'Abra seu aplicativo autenticador e informe o código atual da conta DUUK.'}</p>
    {enrolling && !enrollment && <button type="button" className="admin-button admin-button--block" disabled={busy} onClick={begin}>{busy ? 'Preparando…' : 'Configurar autenticador'}</button>}
    {enrollment && <div className="admin-mfa__setup">
      <p>1. No autenticador, adicione uma conta e escaneie este QR code.</p>
      <img className="admin-mfa__qr" src={authenticatorImage(enrollment.totp.qr_code)} alt="QR code privado para configurar o autenticador DUUK" width="224" height="224" />
      <details><summary>Configurar com chave manual</summary><p>Digite esta chave no autenticador. Não a compartilhe.</p><code className="admin-mfa__secret">{enrollment.totp.secret}</code></details>
      <p>2. Guarde uma cópia segura da chave no seu gerenciador de senhas para recuperar o acesso se perder o aparelho.</p>
    </div>}
    {(!enrolling || enrollment) && <form onSubmit={verify}>
      {requirement.factors?.length > 1 && <label className="admin-field"><span>Autenticador</span><select value={factorId} onChange={event => setFactorId(event.target.value)} disabled={busy}>{requirement.factors.map(factor => <option key={factor.id} value={factor.id}>{factor.friendly_name || 'Autenticador DUUK'}</option>)}</select></label>}
      <label className="admin-field"><span>Código de seis dígitos</span><input className="admin-mfa__code" type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} disabled={busy} required /></label>
      <button className="admin-button admin-button--block" disabled={busy || !validMfaCode(code)}>{busy ? 'Verificando…' : enrolling ? 'Ativar e continuar' : 'Confirmar código'}</button>
    </form>}
    {error && <p className="admin-error" role="alert">{error}</p>}
    {onCancel && <button type="button" className="admin-text-button" disabled={busy} onClick={onCancel}>{enrolling ? 'Voltar' : 'Entrar com outra conta'}</button>}
  </section>
}
