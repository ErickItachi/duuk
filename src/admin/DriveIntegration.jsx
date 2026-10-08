import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { fmtTime } from '../crm/model'
import { driveRequest } from '../office/api'
import { useQuery } from '../office/useQuery'
import { ConfirmModal, Icon } from './components'
import { QueryState } from './forms'

const size = bytes => {
  if (!Number.isFinite(bytes)) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes, unit = 0
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++ }
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: unit > 1 ? 1 : 0 })} ${units[unit]}`
}

export default function DriveIntegration({ callback, notify }) {
  const [, setParams] = useSearchParams(), [busy, setBusy] = useState(''), [disconnect, setDisconnect] = useState(false), [callbackError, setCallbackError] = useState(''), started = useRef(false)
  const query = useQuery(useCallback(() => driveRequest({ action: 'status' }), [])), reload = query.reload
  useEffect(() => {
    if (!callback || started.current) return
    started.current = true
    setParams({}, { replace: true }); setBusy('callback')
    driveRequest({ action: 'callback', ...callback }).then(async () => { await reload(); notify('Google Drive conectado. Os documentos pendentes serão enviados automaticamente.') }).catch(cause => setCallbackError(cause.message)).finally(() => setBusy(''))
  }, [callback, setParams, reload, notify])
  useEffect(() => { const timer = setInterval(() => { if (document.visibilityState === 'visible' && navigator.onLine) reload() }, 30000); return () => clearInterval(timer) }, [reload])
  const connection = query.data?.connection, counts = query.data?.counts || {}, connected = connection && connection.status !== 'disconnected', account = query.data?.expected_account || 'duukfilms@gmail.com'
  const limit = Number(connection?.storage_limit), usage = Number(connection?.storage_usage), percent = limit > 0 && Number.isFinite(usage) ? Math.min(100, Math.round(usage / limit * 100)) : null
  const act = async action => {
    setBusy(action)
    try {
      const result = await driveRequest({ action })
      if (action === 'start') { const url = new URL(result.url); if (url.origin !== 'https://accounts.google.com') throw new Error('O Google não confirmou o endereço de conexão.'); window.location.assign(url.href); return }
      await reload()
      notify(action === 'disconnect' ? 'Google Drive desconectado. Os arquivos já salvos continuam no Drive.' : 'Pendências enviadas para nova tentativa.')
    } catch (cause) { notify(cause.message, true) } finally { setBusy('') }
  }
  const status = busy === 'callback' ? 'Concluindo conexão…' : !query.data?.configured ? 'Aguardando configuração' : !connected ? 'Nenhuma conta conectada' : connection.status === 'error' ? 'Reconexão necessária' : counts.error ? 'Conectado · documentos com erro' : counts.pending ? `Conectado · ${counts.pending} aguardando envio` : 'Conectado'
  return <section className="admin-panel calendar-integration drive-integration" aria-labelledby="drive-integration-title">
    <div className="calendar-integration__heading"><span className="calendar-integration__icon"><Icon name="drive" size={26} /></span><div><p className="admin-eyebrow">DOCUMENTOS / INTEGRAÇÕES</p><h2 id="drive-integration-title">Google Drive</h2><p>Contratos e propostas da DUUK guardados e organizados automaticamente em uma conta central.</p></div></div>
    {callbackError && <p className="admin-error" role="alert">{callbackError}</p>}
    <QueryState query={query}>{query.data && <>
      <div className={`calendar-integration__status${connected && connection.status === 'connected' ? ' is-connected' : ''}`}><i /><span>{status}</span></div>
      {connected && <dl className="calendar-integration__details">
        <div><dt>Conta Google</dt><dd>{connection.account_email}</dd></div>
        <div><dt>Última sincronização</dt><dd>{connection.last_synced_at ? fmtTime(connection.last_synced_at) : 'Aguardando o primeiro envio'}</dd></div>
        <div><dt>Espaço utilizado</dt><dd>{Number.isFinite(usage) ? <>{size(usage)}{limit > 0 ? ` de ${size(limit)} (${percent}%)` : ' · sem limite informado'}{percent !== null && <span className={`drive-meter${percent >= 90 ? ' is-high' : ''}`} role="img" aria-label={`${percent}% do espaço utilizado`}><i style={{ width: `${percent}%` }} /></span>}</> : 'Informação ainda indisponível'}</dd></div>
        <div><dt>Documentos</dt><dd>{counts.synced || 0} salvos · {counts.pending || 0} pendentes · {counts.error || 0} com erro</dd></div>
      </dl>}
      {connection?.last_error && connected && <p className="admin-error" role="alert">{connection.last_error}</p>}
      <p className="calendar-integration__privacy"><Icon name="shield" size={17} /><span>Os arquivos ficam em pastas privadas da conta {account}. O DUUK Admin só acessa o que ele mesmo criou, nunca cria links públicos e guarda as credenciais criptografadas no servidor.</span></p>
      {!query.data.configured && <p className="platform-muted">A administração precisa concluir a configuração do aplicativo no Google Cloud e ativar a Google Drive API. A conexão ficará disponível aqui assim que estiver pronta.</p>}
      <div className="calendar-integration__actions">
        <button className={`admin-button${connected && connection.status === 'connected' ? ' admin-button--secondary' : ''}`} disabled={!!busy || !query.data.configured} onClick={() => act('start')}><Icon name="link" />{busy === 'start' ? 'Abrindo Google…' : connected ? 'Reconectar conta' : 'Conectar Google Drive'}</button>
        {connected && connection.status === 'connected' && (counts.pending > 0 || counts.error > 0) && <button className="admin-button admin-button--secondary" disabled={!!busy} onClick={() => act('retry')}><Icon name="refresh" />{busy === 'retry' ? 'Enviando…' : 'Sincronizar pendências'}</button>}
        {connected && <button className="admin-text-button" disabled={!!busy} onClick={() => setDisconnect(true)}>Desconectar conta</button>}
      </div>
    </>}</QueryState>
    {disconnect && <ConfirmModal title="Desconectar Google Drive?" message="Os arquivos já salvos continuam no Drive e os registros do DUUK Admin são preservados. Novos documentos ficam pendentes até uma nova conexão." action="Desconectar conta" onClose={() => setDisconnect(false)} onConfirm={() => act('disconnect')} />}
  </section>
}
