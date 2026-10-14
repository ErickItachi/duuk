import { useState } from 'react'
import { Icon, Modal } from '../admin/components'
import { ErrorState } from '../admin/forms'
import { useUnsavedChanges } from '../admin/unsavedChanges'
import { useAuth } from '../content/AuthContext'
import { partyLabels } from './model'
import { OfficeField } from './OfficeParts'
import { emailPattern, useValidation } from './officeHelpers'

function inviteErrors(email) {
  if (!email.trim()) return { email: 'Informe o e-mail de quem vai assinar.' }
  if (!emailPattern.test(email.trim())) return { email: 'Confira o e-mail informado.' }
  return {}
}

export default function SignatureInviteModal({ party, contract, onClose, onConfirm }) {
  const auth = useAuth()
  const [email, setEmail] = useState(party === 'client' ? contract.client_email || '' : auth.user?.email || auth.profile?.email || '')
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  useUnsavedChanges(true)
  const { control, field, check } = useValidation(inviteErrors, email)
  const submit = async event => {
    event.preventDefault()
    if (busy || !check()) return
    setBusy(true); setError('')
    try { await onConfirm(email.trim().toLowerCase()) }
    catch (cause) { setError(cause.message); setBusy(false) }
  }
  return (
    <Modal title={`Link de assinatura · ${partyLabels[party]}`} subtitle="Confirmação por código de e-mail." onClose={() => { if (!busy) onClose() }}>
      <form onSubmit={submit} noValidate>
        <fieldset disabled={busy} className="office-form">
          <p className="office-muted">Defina o e-mail de {party === 'client' ? contract.client_name : contract.duuk_name}. Ao abrir o link, essa pessoa receberá um código de seis dígitos para acessar o documento e assinar.</p>
          <OfficeField label="E-mail de quem vai assinar" hint="Confira o endereço com o participante. O código será enviado somente para esta caixa." {...field('email')}>
            <input {...control('email', true)} type="email" inputMode="email" autoComplete="off" maxLength={254} value={email} onChange={event => setEmail(event.target.value)} />
          </OfficeField>
          <p className="office-invite-note"><Icon name="lock" /><span>O PDF e os campos ficam bloqueados. O link vale por sete dias e substitui o anterior deste participante. Você continua compartilhando o link manualmente.</span></p>
          {error && <ErrorState>{error}</ErrorState>}
        </fieldset>
        <div className="admin-modal__foot">
          <button type="button" className="admin-button admin-button--secondary" disabled={busy} onClick={onClose}>Cancelar</button>
          <button type="submit" className="admin-button" disabled={busy} aria-busy={busy}><Icon name="link" />{busy ? 'Preparando…' : 'Gerar link protegido'}</button>
        </div>
      </form>
    </Modal>
  )
}
