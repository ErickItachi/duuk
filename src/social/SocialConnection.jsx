import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ConfirmModal, Icon } from '../admin/components'
import { FieldError } from '../admin/forms'
import { useUnsavedChanges } from '../admin/unsavedChanges'
import { supabase } from '../content/supabase'
import { socialRequest } from './api'
import { capabilities, capabilityStates, daysUntil, formatDateTime, requiredScopes } from './model'
import { AccountAvatar, AccountState } from './parts'
import { useSocial } from './context'

const productionOrigin = 'https://www.duukfilms.com'
const setupSteps = [
  'No Meta for Developers, abra o app da DUUK e adicione o produto Instagram, opção “API com login do Instagram”.',
  'Cole as três URLs acima nos campos correspondentes do login de empresa do Instagram.',
  'Em Funções do app, adicione a conta do Instagram da DUUK como Testador do Instagram. A conta precisa ser profissional (comercial ou criador).',
  'No aplicativo do Instagram, aceite o convite em Configurações > Apps e sites > Convites de testador.',
  'Copie o ID e a chave secreta do app do Instagram para o formulário “App do Instagram” e salve.',
  'Clique em Conectar conta da DUUK, entre no Instagram e aceite as três permissões.',
]
// The code Instagram sends back is single use; React may mount twice in development, so it is taken once.
const consumed = new Set()

export default function SocialConnection() {
  const { status, statusQuery, accounts, notify } = useSocial()
  const location = useLocation(), navigate = useNavigate()
  const reload = statusQuery.reload
  // Instagram returns here with ?code=&state= (or ?error=). Read once, then cleared from the address bar.
  const [callback] = useState(() => {
    const params = new URLSearchParams(location.search)
    return { code: (params.get('code') || '').replace(/#_$/, ''), state: params.get('state') || '', denied: params.get('error'), reason: params.get('error_reason') }
  })
  const [finishing, setFinishing] = useState(() => Boolean(callback.code && callback.state))
  const [callbackError, setCallbackError] = useState(() => callback.denied ? callback.reason === 'user_denied' ? 'A autorização foi cancelada no Instagram. Nada foi conectado.' : 'O Instagram não concluiu a autorização. Tente conectar de novo.' : '')

  useEffect(() => {
    if (!callback.code && !callback.denied) return
    navigate('/admin/social/conexao', { replace: true })
    if (!callback.code || !callback.state || consumed.has(callback.state)) return
    consumed.add(callback.state)
    socialRequest({ action: 'connect_finish', code: callback.code, state: callback.state })
      .then(result => { notify(`Instagram @${result.account?.username || ''} conectado.`); return reload() })
      .catch(cause => setCallbackError(cause.message))
      .finally(() => setFinishing(false))
  }, [callback, navigate, notify, reload])

  const rows = capabilities({ configured: status.configured, accessLevel: status.access_level, appMode: status.app_mode, accounts })
  return <div className="social-connection">
    {finishing && <div className="ds-alert ds-alert--info" role="status"><span className="ds-spinner" aria-hidden="true" /><span>Concluindo a conexão com o Instagram…</span></div>}
    {callbackError && <div className="ds-alert ds-alert--warning" role="alert"><Icon name="warning" /><span>{callbackError}</span><button type="button" className="admin-icon-button" aria-label="Fechar aviso" onClick={() => setCallbackError('')}><Icon name="close" /></button></div>}

    <section className="ds-card">
      <div className="ds-card__head"><div><h2>O que funciona agora</h2><p>{status.configured ? `App em ${status.app_mode === 'live' ? 'modo ativo (Live)' : 'modo de desenvolvimento'}, acesso ${status.access_level === 'advanced' ? 'avançado' : 'padrão'}.` : 'O app do Instagram ainda não foi cadastrado.'}</p></div></div>
      <ul className="social-capabilities">{rows.map(row => {
        const state = capabilityStates[row.state]
        return <li key={row.id}><div><strong>{row.label}</strong><small>{row.note}</small></div><span className={`ds-badge ds-badge--${state.tone}`}><Icon name={state.icon} size={13} />{state.label}</span></li>
      })}</ul>
      {status.configured && status.access_level !== 'advanced' && <p className="social-muted">No acesso padrão, a Meta só libera a API para contas com papel no app, como Testadores do Instagram. Contas de clientes exigem Acesso Avançado, que passa por análise do app e verificação da empresa. O pedido de análise só é enviado com a sua aprovação.</p>}
    </section>

    <Accounts status={status} accounts={accounts} reload={reload} notify={notify} />
    {status.can_configure && <AppSettings key={status.version} status={status} reload={reload} notify={notify} />}
    {status.can_configure && <MetaSetup status={status} notify={notify} />}
  </div>
}

function Accounts({ status, accounts, reload, notify }) {
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [disconnecting, setDisconnecting] = useState(null)
  const [clientId, setClientId] = useState('')
  const [clients, setClients] = useState(null)
  const advanced = status.access_level === 'advanced'
  const elsewhere = typeof window !== 'undefined' && window.location.origin !== productionOrigin
  useEffect(() => {
    if (!advanced || !status.can_configure) return undefined
    let alive = true
    supabase.from('duuk_clients').select('id,name,company').order('name').limit(1000).then(({ data, error: failure }) => { if (alive) setClients(failure ? [] : data || []) })
    return () => { alive = false }
  }, [advanced, status.can_configure])

  const connect = async (ownerKind = 'duuk') => {
    setBusy(`connect:${ownerKind}`); setError('')
    try {
      const { url } = await socialRequest({ action: 'connect_start', owner_kind: ownerKind, client_id: ownerKind === 'client' ? clientId : undefined })
      window.location.assign(url)
    } catch (cause) { setError(cause.message); setBusy('') }
  }
  const refresh = async account => {
    setBusy(`refresh:${account.id}`); setError('')
    try { await socialRequest({ action: 'refresh_account', account_id: account.id }); await reload(); notify(`Perfil de @${account.username} atualizado.`) }
    catch (cause) { setError(cause.message); await reload() }
    setBusy('')
  }
  const disconnect = async account => {
    const result = await socialRequest({ action: 'disconnect', account_id: account.id, expected_version: account.version })
    await reload()
    notify(result?.unscheduled_posts ? `@${account.username} desconectada. ${result.unscheduled_posts} publicação(ões) agendada(s) voltaram para rascunho.` : `@${account.username} desconectada.`)
  }

  return <section className="ds-card">
    <div className="ds-card__head"><div><h2>Contas do Instagram</h2><p>Contas profissionais (comerciais ou de criador) autorizadas pelo Login do Instagram.</p></div></div>
    {accounts.length ? <ul className="social-accounts">{accounts.map(account => {
      const expires = account.token_expires_at ? daysUntil(account.token_expires_at) : null
      const live = account.status === 'active'
      return <li key={account.id}>
        <div className="social-accounts__who">
          <AccountAvatar account={account} size={44} />
          <div><strong>@{account.username}</strong><small>{account.owner_kind === 'client' ? 'Conta de cliente' : 'Conta da DUUK'}{account.account_type ? ` · ${account.account_type === 'BUSINESS' ? 'Comercial' : account.account_type === 'MEDIA_CREATOR' ? 'Criador de conteúdo' : account.account_type}` : ''}</small></div>
          <AccountState account={account} />
        </div>
        {account.last_error && !live && <p className="social-accounts__error"><Icon name="alertCircle" size={14} />{account.last_error}</p>}
        <dl className="social-accounts__facts">
          <div><dt>Permissões</dt><dd><ul className="social-scopes">{requiredScopes.map(scope => {
            const granted = (account.permissions || []).includes(scope.id)
            return <li key={scope.id} className={granted ? 'is-granted' : ''}><Icon name={granted ? 'check' : 'close'} size={13} />{scope.label}<span className="ds-visually-hidden">{granted ? ': concedida' : ': não concedida'}</span></li>
          })}</ul></dd></div>
          <div><dt>Autorização</dt><dd>{live && expires !== null ? `Válida até ${formatDateTime(account.token_expires_at)}${expires <= 20 ? ` (${Math.max(0, expires)} dia(s))` : ''}. O servidor renova sozinho.` : live ? 'Válida' : 'Sem autorização ativa'}</dd></div>
          <div><dt>Perfil consultado</dt><dd>{formatDateTime(account.last_checked_at)}</dd></div>
        </dl>
        <div className="social-accounts__actions">
          {live && <button type="button" className="admin-button admin-button--secondary admin-button--sm" disabled={Boolean(busy)} aria-busy={busy === `refresh:${account.id}`} onClick={() => refresh(account)}><Icon name="refresh" />{busy === `refresh:${account.id}` ? 'Atualizando…' : 'Atualizar perfil'}</button>}
          {status.can_configure && !live && account.owner_kind !== 'client' && <button type="button" className="admin-button admin-button--sm" disabled={Boolean(busy) || !status.configured} onClick={() => connect('duuk')}><Icon name="plug" />Reconectar</button>}
          {status.can_configure && account.status !== 'disconnected' && <button type="button" className="admin-button admin-button--ghost admin-button--sm" disabled={Boolean(busy)} onClick={() => setDisconnecting(account)}><Icon name="unplug" />Desconectar</button>}
        </div>
      </li>
    })}</ul> : <p className="social-muted">Nenhuma conta conectada.</p>}

    {error && <p className="admin-error" role="alert">{error}</p>}
    {status.can_configure ? <div className="social-connect">
      <div className="social-connect__row">
        <button type="button" className="admin-button" disabled={!status.configured || Boolean(busy)} aria-busy={busy === 'connect:duuk'} onClick={() => connect('duuk')}><Icon name="instagram" />{busy === 'connect:duuk' ? 'Abrindo o Instagram…' : accounts.some(item => item.owner_kind === 'duuk') ? 'Conectar outra conta da DUUK' : 'Conectar conta da DUUK'}</button>
        {!status.configured && <small className="social-muted">Cadastre o app do Instagram abaixo para liberar.</small>}
      </div>
      <div className="social-connect__row">
        {advanced ? <>
          <label className="admin-field social-connect__client"><span>Cliente</span>
            <select value={clientId} onChange={event => setClientId(event.target.value)} disabled={!clients}><option value="">{clients ? 'Escolha o cliente' : 'Carregando clientes…'}</option>{(clients || []).map(client => <option key={client.id} value={client.id}>{client.company ? `${client.name} · ${client.company}` : client.name}</option>)}</select>
          </label>
          <button type="button" className="admin-button admin-button--secondary" disabled={!clientId || Boolean(busy)} onClick={() => connect('client')}><Icon name="userPlus" />Conectar conta de cliente</button>
        </> : <p className="social-muted social-note"><Icon name="shieldAlert" size={14} /><span>Contas de clientes ficam disponíveis quando a Meta aprovar o Acesso Avançado do app. A estrutura já separa contas da DUUK e de clientes.</span></p>}
      </div>
      <p className="social-muted">Você será levado ao Instagram para entrar e autorizar. A senha é digitada apenas no Instagram; o DUUK recebe uma autorização que fica guardada no cofre do servidor.{elsewhere ? ` Depois de autorizar, o Instagram volta para ${productionOrigin}/admin, onde a conexão é concluída.` : ''}</p>
    </div> : <p className="social-muted">Somente a super administração conecta ou desconecta contas.</p>}
    {disconnecting && <ConfirmModal title={`Desconectar @${disconnecting.username}?`} message="O DUUK apaga a autorização guardada e as métricas em cache. Publicações agendadas desta conta voltam para rascunho; nada é apagado no Instagram. Para remover também o acesso no Instagram, vá em Configurações > Apps e sites no aplicativo." action="Desconectar" tone="danger" onClose={() => setDisconnecting(null)} onConfirm={() => disconnect(disconnecting)} />}
  </section>
}

function AppSettings({ status, reload, notify }) {
  const initial = { app_id: status.app_id || '', app_secret: '', app_mode: status.app_mode || 'development', access_level: status.access_level || 'standard' }
  const [form, setForm] = useState(initial)
  const [showErrors, setShowErrors] = useState(false)
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [removing, setRemoving] = useState(false)
  const dirty = form.app_id !== initial.app_id || form.app_secret !== '' || form.app_mode !== initial.app_mode || form.access_level !== initial.access_level
  useUnsavedChanges(dirty)
  const errors = {
    app_id: /^\d{5,30}$/.test(form.app_id.trim()) ? '' : 'Informe o ID do app do Instagram (somente números).',
    app_secret: form.app_secret ? (/^[A-Za-z0-9]{16,128}$/.test(form.app_secret.trim()) ? '' : 'A chave secreta tem apenas letras e números.') : status.configured ? '' : 'Informe a chave secreta do app do Instagram.',
  }
  const set = patch => setForm(current => ({ ...current, ...patch }))
  const save = async event => {
    event.preventDefault()
    setShowErrors(true); setError('')
    if (errors.app_id || errors.app_secret) return
    setBusy(true)
    try {
      await socialRequest({ action: 'configure_app', app_id: form.app_id.trim(), app_secret: form.app_secret.trim() || undefined, app_mode: form.app_mode, access_level: form.access_level, expected_version: status.version })
      setForm(current => ({ ...current, app_secret: '' }))
      notify('Configuração do app salva. A chave secreta fica somente no cofre do servidor.')
      await reload()
    } catch (cause) { setError(cause.message) }
    setBusy(false)
  }
  const remove = async () => {
    await socialRequest({ action: 'remove_app', expected_version: status.version })
    notify('App do Instagram removido do DUUK PAINEL ADMINISTRATIVO.')
    await reload()
  }
  return <form className="ds-card social-app" onSubmit={save} noValidate>
    <div className="ds-card__head"><div><h2>App do Instagram</h2><p>Dados de “API com login do Instagram” no Meta for Developers. A chave secreta vai direto para o cofre do servidor e nunca volta para o navegador.</p></div></div>
    <div className="admin-form-grid">
      <label className="admin-field"><span>ID do app do Instagram</span>
        <input inputMode="numeric" autoComplete="off" value={form.app_id} aria-invalid={showErrors && Boolean(errors.app_id)} aria-describedby="social-app-id-help" onChange={event => set({ app_id: event.target.value.replace(/\D/g, '') })} />
        <small id="social-app-id-help" className="social-muted">Em Instagram &gt; Configuração da API com login do Instagram. É diferente do ID do app da Meta.</small>
        {showErrors && errors.app_id && <FieldError>{errors.app_id}</FieldError>}
      </label>
      <div className="admin-field"><label htmlFor="social-app-secret">Chave secreta do app do Instagram</label>
        <div className="admin-password">
          <input id="social-app-secret" type={visible ? 'text' : 'password'} autoComplete="new-password" spellCheck="false" value={form.app_secret} placeholder={status.configured ? 'Guardada no cofre. Preencha só para trocar.' : ''} aria-invalid={showErrors && Boolean(errors.app_secret)} onChange={event => set({ app_secret: event.target.value })} />
          <button type="button" className="admin-icon-button" aria-label={visible ? 'Ocultar chave' : 'Mostrar chave'} aria-pressed={visible} onClick={() => setVisible(!visible)}><Icon name={visible ? 'eyeOff' : 'eye'} /></button>
        </div>
        {showErrors && errors.app_secret && <FieldError>{errors.app_secret}</FieldError>}
      </div>
      <label className="admin-field"><span>Modo do app</span>
        <select value={form.app_mode} onChange={event => set({ app_mode: event.target.value })}><option value="development">Desenvolvimento</option><option value="live">Ativo (Live)</option></select>
      </label>
      <label className="admin-field"><span>Nível de acesso</span>
        <select value={form.access_level} onChange={event => set({ access_level: event.target.value })}><option value="standard">Padrão (contas com papel no app)</option><option value="advanced">Avançado (aprovado pela Meta)</option></select>
        <small className="social-muted">Marque Avançado somente depois que a Meta aprovar. Isso libera contas de clientes no DUUK, mas quem decide o acesso é a Meta.</small>
      </label>
    </div>
    {error && <p className="admin-error" role="alert">{error}</p>}
    <div className="social-app__actions">
      {status.configured && <button type="button" className="admin-button admin-button--ghost" disabled={busy} onClick={() => setRemoving(true)}><Icon name="trash" />Remover app</button>}
      <button type="submit" className="admin-button" disabled={busy || (!dirty && status.configured)} aria-busy={busy}><Icon name="check" />{busy ? 'Salvando…' : 'Salvar configuração'}</button>
    </div>
    {removing && <ConfirmModal title="Remover o app do Instagram?" message="A chave secreta sai do cofre e ninguém consegue conectar contas até cadastrar o app de novo. Desconecte as contas antes. Publicações, biblioteca e histórico continuam guardados." action="Remover app" tone="danger" onClose={() => setRemoving(false)} onConfirm={remove} />}
  </form>
}

function MetaSetup({ status, notify }) {
  const copy = useCallback(async (value, label) => {
    try { await navigator.clipboard.writeText(value); notify(`${label} copiada.`) } catch { notify('Não foi possível copiar. Selecione o texto e copie.', true) }
  }, [notify])
  const urls = [
    ['URL de redirecionamento do OAuth', status.redirect_uri, 'Em “Configurar o login de empresa do Instagram” > URIs de redirecionamento válidos.'],
    ['URL de cancelamento de autorização', status.deauthorize_url, 'O Instagram avisa o DUUK quando alguém remove o acesso do app.'],
    ['URL de solicitação de exclusão de dados', status.data_deletion_url, 'Apaga a autorização e os dados guardados da conta, com código de confirmação.'],
  ]
  return <section className="ds-card social-setup">
    <div className="ds-card__head"><div><h2>Configuração no Meta</h2><p>Use estes endereços no app do Meta for Developers. Eles não mudam.</p></div></div>
    <ul className="social-urls">{urls.map(([label, value, note]) => <li key={label}>
      <div><strong>{label}</strong><code>{value || '—'}</code><small>{note}</small></div>
      <button type="button" className="admin-button admin-button--secondary admin-button--sm" disabled={!value} onClick={() => copy(value, label)}><Icon name="copy" />Copiar</button>
    </li>)}</ul>
    <h3 className="social-setup__title">Passo a passo</h3>
    <ol className="social-steps">{setupSteps.map(step => <li key={step}>{step}</li>)}</ol>
    <p className="social-muted">Permissões pedidas: {requiredScopes.map(scope => scope.label.toLowerCase()).join(', ')}. Versão da API: {status.graph_version || '—'}. Enviar o app para análise ou alterar pessoas no Meta só acontece com a sua aprovação.</p>
  </section>
}
