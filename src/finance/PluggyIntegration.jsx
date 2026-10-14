import { useCallback, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../content/AuthContext'
import { useQuery } from '../office/useQuery'
import { useUnsavedChanges } from '../admin/unsavedChanges'
import { ConfirmModal, Icon, Modal, RefreshButton } from '../admin/components'
import { ErrorState, FieldError, QueryState } from '../admin/forms'
import AppLogo from '../admin/AppLogo'
import { pluggyRequest } from './pluggy-api'
import './bank.css'

// Only what the form itself can know: the server still validates the credentials and the connection.
function setupErrors(form, status, accounts, account, accepted) {
 const errors = {}
 if (!status.configured && !form.client_id) errors.client_id = 'Informe o Client ID da aplicação.'
 if (!status.configured && !form.client_secret) errors.client_secret = 'Informe o Client Secret da aplicação.'
 if (!form.item_id) errors.item_id = 'Informe o Item ID da conexão.'
 if (accounts.length && !account) errors.account = 'Escolha a conta que o Financeiro vai consultar.'
 if (accounts.length && !accepted) errors.accepted = 'Confirme que a conta é sua ou da DUUK.'
 return errors
}
const described = (id, error, hint) => [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined

function SetupField({ id, label, error, hint, children }) {
 return <div className="admin-field">
  <label className="admin-label" htmlFor={id}>{label}</label>
  {children}
  {hint && <small id={`${id}-hint`}>{hint}</small>}
  <FieldError id={`${id}-error`}>{error}</FieldError>
 </div>
}

function PluggySetup({ status, onClose, onSaved }) {
 const [form, setForm] = useState({ client_id: '', client_secret: '', item_id: '' }), [accounts, setAccounts] = useState([]), [account, setAccount] = useState(''), [accepted, setAccepted] = useState(false), [busy, setBusy] = useState(''), [error, setError] = useState(''), [discard, setDiscard] = useState(false), [checked, setChecked] = useState(false)
 const working = useRef(false), fields = useRef(null), base = useId(), id = key => `${base}-${key}`
 const dirty = Object.values(form).some(Boolean) || accepted || !!account
 const errors = checked ? setupErrors(form, status, accounts, account, accepted) : {}
 useUnsavedChanges(dirty)
 const close = () => { if (!busy) { if (dirty) setDiscard(true); else onClose() } }
 const update = (key, value) => { setForm(old => ({ ...old, [key]: value })); setAccounts([]); setAccount(''); setError('') }
 const run = async action => {
  if (working.current) return
  working.current = true; setBusy(action); setError('')
  try { const result = await pluggyRequest({ action, ...form, account_id: account, own_data_confirmed: accepted, expected_version: status.version }); if (action === 'probe') { setChecked(false); setAccounts(result.accounts); setAccount(result.accounts.length === 1 ? result.accounts[0].id : ''); if (!result.accounts.length) setError('Nenhuma conta bancária em reais disponível nesta conexão.') } else { setForm({ client_id: '', client_secret: '', item_id: '' }); await onSaved(); onClose() } } catch (cause) { setError(cause.message) } finally { working.current = false; setBusy('') }
 }
 const submit = event => {
  event.preventDefault()
  const found = setupErrors(form, status, accounts, account, accepted), first = ['client_id', 'client_secret', 'item_id', 'account', 'accepted'].find(key => found[key])
  if (first) { setChecked(true); requestAnimationFrame(() => fields.current?.querySelector(`[data-field="${first}"]`)?.focus()); return }
  run(accounts.length ? 'configure' : 'probe')
 }
 const control = (key, hint) => ({ id: id(key), 'data-field': key, 'aria-invalid': errors[key] ? true : undefined, 'aria-describedby': described(id(key), errors[key], hint) })
 const keepHint = status.configured ? 'Deixe vazio para manter as credenciais protegidas atuais.' : ''
 return <><Modal title={status.configured ? 'Trocar conexão Meu Pluggy' : 'Conectar Meu Pluggy'} subtitle="Somente consulta de saldo e extrato, usando os seus próprios dados." onClose={close}>
  <form onSubmit={submit} noValidate className="pluggy-form">
   <div className="admin-modal__body">
    <fieldset ref={fields} className="pluggy-form__fields" disabled={!!busy}>
     <legend className="pluggy-sr-only">Conexão Meu Pluggy</legend>
     <ol className="pluggy-steps">
      <li><span aria-hidden="true">1</span><p>Conecte o banco no <a href="https://meu.pluggy.ai/connections" target="_blank" rel="noopener noreferrer">Meu Pluggy</a>.</p></li>
      <li><span aria-hidden="true">2</span><p>No <a href="https://dashboard.pluggy.ai/" target="_blank" rel="noopener noreferrer">Dashboard Pluggy</a>, conecte o conector <strong>MeuPluggy (200)</strong> na Demo da aplicação.</p></li>
      <li><span aria-hidden="true">3</span><p>Use as credenciais da aplicação e o Item ID do conector. <a href="https://meu.pluggy.ai/api-guide" target="_blank" rel="noopener noreferrer">Ver guia oficial</a></p></li>
     </ol>
     <SetupField id={id('client_id')} label="Client ID" error={errors.client_id} hint={keepHint}><input {...control('client_id', keepHint)} autoComplete="off" maxLength={200} required={!status.configured} value={form.client_id} onChange={event => update('client_id', event.target.value.trim())} /></SetupField>
     <SetupField id={id('client_secret')} label="Client Secret" error={errors.client_secret} hint="Fica criptografado no servidor e nunca será exibido novamente."><input {...control('client_secret', true)} type="password" autoComplete="new-password" maxLength={300} required={!status.configured} value={form.client_secret} onChange={event => update('client_secret', event.target.value.trim())} /></SetupField>
     <SetupField id={id('item_id')} label="Item ID do Meu Pluggy" error={errors.item_id}><input {...control('item_id')} required maxLength={36} autoComplete="off" placeholder="ID da conexão na Demo" value={form.item_id} onChange={event => update('item_id', event.target.value.trim())} /></SetupField>
     {accounts.length > 0 && <>
      <SetupField id={id('account')} label="Conta para o Financeiro" error={errors.account}><select {...control('account')} required value={account} onChange={event => setAccount(event.target.value)}><option value="">Selecione uma conta</option>{accounts.map(item => <option key={item.id} value={item.id}>{item.label} · final {item.last_four || 'não informado'}</option>)}</select></SetupField>
      <div className="pluggy-consent">
       <label className="admin-checkbox"><input type="checkbox" {...control('accepted')} checked={accepted} onChange={event => setAccepted(event.target.checked)} required /><span>Esta conta é minha ou da DUUK. Autorizo a consulta pelo Financeiro da equipe, usando somente o conector gratuito Meu Pluggy.</span></label>
       <FieldError id={`${id('accepted')}-error`}>{errors.accepted}</FieldError>
      </div>
     </>}
     {error && <ErrorState>{error}</ErrorState>}
    </fieldset>
   </div>
   <div className="admin-modal__foot">
    <button type="button" className="admin-button admin-button--secondary" disabled={!!busy} onClick={close}>Cancelar</button>
    <button type="submit" className="admin-button" disabled={!!busy} aria-busy={!!busy}>{busy ? 'Conferindo…' : accounts.length ? 'Conectar conta' : 'Buscar contas'}</button>
   </div>
  </form>
 </Modal>{discard && <ConfirmModal title="Descartar configuração?" message="A conexão ainda não foi salva." action="Descartar" onClose={() => setDiscard(false)} onConfirm={onClose} />}</>
}

export default function PluggyIntegration({ notify = () => {} }) {
 const auth = useAuth(), query = useQuery(useCallback(() => pluggyRequest({ action: 'status' }), [])), [setup, setSetup] = useState(false), [disconnect, setDisconnect] = useState(false), data = query.data, canConfigure = auth.profile?.is_super_admin && data?.can_configure
 return <section className="admin-panel calendar-integration pluggy-integration">
  <div className="calendar-integration__heading"><span className="calendar-integration__icon pluggy-integration__logo"><AppLogo app="pluggy" /></span><div><p className="admin-eyebrow">FINANCEIRO / INTEGRAÇÕES</p><h2>Meu Pluggy</h2><p>Os dados da sua conta bancária, dentro da DUUK.</p></div></div>
  <QueryState query={query}>{data && <>
   <div className={`calendar-integration__status${data.configured ? ' is-connected' : ''}`}><i /><span>{data.configured ? 'Conexão configurada' : 'Nenhuma conta conectada'}</span></div>
   {data.configured && <dl className="calendar-integration__details"><div><dt>Conta selecionada</dt><dd>{data.account_label || 'Conta bancária'} · final {data.account_last_four || 'não informado'}</dd></div><div><dt>Atualização</dt><dd>A cada 24 horas pelo Meu Pluggy</dd></div></dl>}
   <p className="calendar-integration__privacy"><Icon name="shield" size={17} /><span>Somente leitura de saldo e movimentações. Credenciais no servidor; dados acessíveis apenas a membros com permissão financeira. O extrato não cria lançamentos automaticamente.</span></p>
   <p className="platform-muted">Usa o conector gratuito MeuPluggy (200) para dados próprios. O saldo acompanha a última atualização do provedor, sem consulta instantânea ao banco.</p>
   <div className="calendar-integration__actions">
    {canConfigure && <button type="button" className="admin-button" onClick={() => setSetup(true)}><Icon name="link" />{data.configured ? 'Trocar conexão' : 'Conectar Meu Pluggy'}</button>}
    <RefreshButton onRefresh={query.reload} label="Atualizar Meu Pluggy" />
    <Link className="admin-text-button" to="/admin/financeiro">Abrir financeiro<Icon name="arrow" size={16} /></Link>
    {canConfigure && data.configured && <button type="button" className="admin-text-button admin-text-button--danger pluggy-integration__disconnect" onClick={() => setDisconnect(true)}>Desconectar</button>}
   </div>
  </>}</QueryState>
  {setup && <PluggySetup status={data} onClose={() => setSetup(false)} onSaved={async () => { await query.reload(); notify('Meu Pluggy conectado. Abra Financeiro → Extrato para consultar.') }} />}
  {disconnect && <ConfirmModal title="Desconectar Meu Pluggy?" message="As credenciais e o acesso serão removidos da DUUK. Seus lançamentos e extratos OFX serão preservados. O consentimento com o banco continua sendo administrado no Meu Pluggy." action="Desconectar" onClose={() => setDisconnect(false)} onConfirm={async () => { await pluggyRequest({ action: 'disconnect', expected_version: data.version }); await query.reload(); notify('Conexão removida da DUUK. Registros financeiros preservados.') }} />}
 </section>
}
