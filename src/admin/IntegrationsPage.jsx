import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../content/AuthContext'
import { useQuery } from '../office/useQuery'
import { platformRequest } from './api'
import { ConfirmModal, Icon, RefreshButton } from './components'
import { PageTitle, QueryState } from './forms'
import { fmtTime } from '../crm/model'
import DriveIntegration from './DriveIntegration'
import AppLogo from './AppLogo'

const request=body=>platformRequest('duuk-calendar',body)
export default function IntegrationsPage({notify}) {
 const auth=useAuth(),[params,setParams]=useSearchParams(),[busy,setBusy]=useState(''),[disconnect,setDisconnect]=useState(false),[callbackError,setCallbackError]=useState('')
 const returned=params.has('state')?{state:params.get('state'),code:params.get('code'),denied:params.has('error')}:null,forDrive=Boolean(returned?.state?.startsWith('drv.'))
 const callback=useRef(returned&&!forDrive?returned:null),started=useRef(false),[driveCallback]=useState(()=>returned&&forDrive?returned:null)
 const query=useQuery(useCallback(()=>request({action:'status'}),[])),reload=query.reload
 useEffect(()=>{
  if(!callback.current||started.current)return
  started.current=true;setParams({}, {replace:true});setBusy('callback')
  request({action:'callback',...callback.current}).then(async()=>{await reload();notify('Google Calendar conectado. Seus próximos compromissos já estão na fila de sincronização.')}).catch(cause=>setCallbackError(cause.message)).finally(()=>setBusy(''))
 },[setParams,reload,notify])
 useEffect(()=>{const timer=setInterval(()=>{if(document.visibilityState==='visible'&&navigator.onLine)reload()},30000);return()=>clearInterval(timer)},[reload])
 const connection=query.data?.connection,connected=connection&&connection.status!=='disconnected',allowed=auth.hasPermission('agenda')
 const act=async action=>{setBusy(action);try{const result=await request({action});if(action==='start'){const url=new URL(result.url);if(url.origin!=='https://accounts.google.com')throw new Error('O Google não confirmou o endereço de conexão.');window.location.assign(url.href);return}await reload();notify(action==='disconnect'?'Conta desconectada. Sua agenda DUUK foi preservada.':'Sincronização reagendada.')}catch(cause){notify(cause.message,true)}finally{setBusy('')}}
 return <>
  <PageTitle title="Integrações" description="Suas ferramentas, conectadas ao dia a dia da DUUK."><RefreshButton onRefresh={reload}/></PageTitle>
  {callbackError&&<p className="admin-error" role="alert">{callbackError}</p>}
  <section className="admin-panel calendar-integration">
   <div className="calendar-integration__heading"><span className="calendar-integration__icon"><AppLogo app="calendar"/></span><div><p className="admin-eyebrow">AGENDA / INTEGRAÇÕES</p><h2>Google Calendar</h2><p>Leve os compromissos da equipe para um calendário DUUK na sua conta.</p></div></div>
   <QueryState query={query}>{query.data&&<>
    <div className={`calendar-integration__status${connected&&connection.status==='connected'?' is-connected':''}`}><i/><span>{busy==='callback'?'Concluindo conexão…':!query.data.configured?'Aguardando configuração':connected?(connection.status==='error'?'Conexão precisa de atenção':connection.pending?'Sincronização em andamento':'Conta conectada'):'Nenhuma conta conectada'}</span></div>
    {connected&&<dl className="calendar-integration__details"><div><dt>Conta Google</dt><dd>{connection.account_email}</dd></div><div><dt>Última sincronização</dt><dd>{connection.last_synced_at?fmtTime(connection.last_synced_at):'Aguardando o primeiro envio'}</dd></div><div><dt>Compromissos pendentes</dt><dd>{connection.pending}</dd></div></dl>}
    {connection?.last_error&&connected&&<p className="admin-error" role="alert">{connection.last_error}</p>}
    <p className="calendar-integration__privacy"><Icon name="shield" size={17}/><span>Somente DUUK → Google. Seus compromissos pessoais ficam na sua conta e não são importados. Faça as alterações de trabalho na Agenda DUUK.</span></p>
    {!query.data.configured&&<p className="platform-muted">A administração precisa concluir a configuração do aplicativo no Google Cloud. A conexão ficará disponível aqui assim que estiver pronta.</p>}
    {!allowed&&<p className="platform-muted">Sua conta precisa de acesso à Agenda para conectar ou sincronizar um calendário.</p>}
    <div className="calendar-integration__actions">
     {(!connected||connection.status==='error')&&<button className="admin-button" disabled={!!busy||!query.data.configured||!allowed} onClick={()=>act('start')}><Icon name="link"/>{busy==='start'?'Abrindo Google…':connected?'Reconectar Google Calendar':'Conectar Google Calendar'}</button>}
     {connected&&allowed&&<button className="admin-button admin-button--secondary" disabled={!!busy||!query.data.configured} onClick={()=>act('retry')}><Icon name="refresh"/>{busy==='retry'?'Reagendando…':'Tentar sincronizar'}</button>}
     {connected&&<button className="admin-text-button" disabled={!!busy} onClick={()=>setDisconnect(true)}>Desconectar conta</button>}
     {allowed&&<Link className="admin-text-button" to="/admin/agenda">Abrir agenda<Icon name="arrow" size={16}/></Link>}
    </div>
   </>}</QueryState>
  </section>
  {auth.profile?.is_super_admin&&<DriveIntegration callback={driveCallback} notify={notify}/>}
  {disconnect&&<ConfirmModal title="Desconectar Google Calendar?" message="Os eventos continuam na Agenda DUUK. As cópias já enviadas ao Google permanecem lá, sem receber novas atualizações até você reconectar a mesma conta." action="Desconectar conta" onClose={()=>setDisconnect(false)} onConfirm={()=>act('disconnect')}/>}
 </>
}
