import { useState } from 'react'
import { Modal } from '../admin/components'
import { useUnsavedChanges } from '../admin/unsavedChanges'
import { useAuth } from '../content/AuthContext'
import { partyLabels } from './model'

export default function SignatureInviteModal({ party, contract, onClose, onConfirm }) {
  const auth = useAuth()
  const [email, setEmail] = useState(party === 'client' ? contract.client_email || '' : auth.user?.email || auth.profile?.email || '')
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  useUnsavedChanges(true)
  const submit = async event => {
    event.preventDefault()
    if (busy) return
    setBusy(true); setError('')
    try { await onConfirm(email.trim().toLowerCase()) }
    catch (cause) { setError(cause.message); setBusy(false) }
  }
  return <Modal title={`Link de assinatura · ${partyLabels[party]}`} subtitle="Confirmação por código de e-mail." onClose={() => { if (!busy) onClose() }}>
    <form onSubmit={submit}>
      <fieldset disabled={busy} className="office-form">
        <p className="office-muted">Defina o e-mail de {party === 'client' ? contract.client_name : contract.duuk_name}. Ao abrir o link, essa pessoa receberá um código de seis dígitos para acessar o documento e assinar.</p>
        <label className="admin-field"><span>E-mail de quem vai assinar</span><input type="email" inputMode="email" autoComplete="off" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} /><small>Confira o endereço com o participante. O código será enviado somente para esta caixa.</small></label>
        <p className="office-muted office-small">O PDF e os campos ficam bloqueados. O link vale por sete dias e substitui o anterior deste participante. Você continua compartilhando o link manualmente.</p>
        {error && <p className="admin-error" role="alert">{error}</p>}
      </fieldset>
      <div className="admin-modal__foot"><button type="button" className="admin-button admin-button--secondary" disabled={busy} onClick={onClose}>Cancelar</button><button className="admin-button" disabled={busy}>{busy ? 'Preparando…' : 'Gerar link protegido'}</button></div>
    </form>
  </Modal>
}
