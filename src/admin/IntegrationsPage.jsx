import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../content/AuthContext'
import { useQuery } from '../office/useQuery'
import { platformRequest } from './api'
import { ConfirmModal, Icon, RefreshButton } from './components'
import { ErrorState, PageTitle } from './forms'
import { fmtTime } from '../crm/model'
import DriveIntegration from './DriveIntegration'
import AppLogo from './AppLogo'
import PluggyIntegration from '../finance/PluggyIntegration'

const request=body=>platformRequest('duuk-calendar',body)

// Group of integration cards with a small section heading.
function IntegrationGroup({id,title,description,children}) {
 return <section className="settings-integrations__group" aria-labelledby={id}>
  <div className="ds-section-head settings-integrations__head"><div><h2 id={id}>{title}</h2><p>{description}</p></div></div>
  <div className="settings-integrations__list">{children}</div>
 </section>
}

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
 const ai=auth.hasPermission('ai'),finance=auth.hasPermission('finance'),central=auth.profile?.is_super_admin
 const status=query.data&&(busy==='callback'?'Concluindo conexão…':!query.data.configured?'Aguardando configuração':connected?(connection.status==='error'?'Conexão precisa de atenção':connection.pending?'Sincronização em andamento':'Conta conectada'):'Nenhuma conta conectada')
 const tone=connected&&connection.status==='connected'?' is-connected':connected&&connection.status==='error'?' is-error':''
 return <>
  <PageTitle title="Integrações" description="Suas ferramentas, conectadas ao dia a dia da DUUK."><RefreshButton onRefresh={reload}/></PageTitle>
  <div className="settings-integrations">
   <IntegrationGroup id="integrations-account" title="Na sua conta" description="Cada pessoa conecta e autoriza a própria conta.">
    <section className="admin-panel calendar-integration" aria-labelledby="calendar-integration-title" aria-busy={query.loading&&!query.data}>
     <div className="calendar-integration__heading"><span className="calendar-integration__icon"><AppLogo app="calendar"/></span><div><p className="admin-eyebrow">AGENDA / INTEGRAÇÕES</p><h2 id="calendar-integration-title">Google Calendar</h2><p>Leve os compromissos da equipe para um calendário DUUK na sua conta.</p></div></div>
     {callbackError&&<div className="settings-integration__alert"><ErrorState>{callbackError}</ErrorState></div>}
     {query.loading&&!query.data?<div className="settings-integration__loading" role="status"><span className="ds-skeleton" aria-hidden="true"/><span className="ds-skeleton" aria-hidden="true"/><span className="ds-visually-hidden">Carregando a conexão do Google Calendar…</span></div>
     :query.error&&!query.data?<div className="settings-integration__alert"><ErrorState onRetry={reload}>{query.error}</ErrorState></div>
     :query.data&&<>
      <div className={`calendar-integration__status${tone}`} role="status"><i aria-hidden="true"/><span>{status}</span></div>
      {connected&&<dl className="calendar-integration__details"><div><dt>Conta Google</dt><dd>{connection.account_email}</dd></div><div><dt>Última sincronização</dt><dd>{connection.last_synced_at?fmtTime(connection.last_synced_at):'Aguardando o primeiro envio'}</dd></div><div><dt>Compromissos pendentes</dt><dd>{connection.pending}</dd></div></dl>}
      {connection?.last_error&&connected&&<div className="settings-integration__alert"><ErrorState>{connection.last_error}</ErrorState></div>}
      <p className="calendar-integration__privacy"><Icon name="shield" size={17}/><span>Somente DUUK → Google. Seus compromissos pessoais ficam na sua conta e não são importados. Faça as alterações de trabalho na Agenda DUUK.</span></p>
      {!query.data.configured&&<div className="ds-alert ds-alert--info settings-integration__alert"><Icon name="info"/><span>A administração precisa concluir a configuração do aplicativo no Google Cloud. A conexão ficará disponível aqui assim que estiver pronta.</span></div>}
      {!allowed&&<p className="settings-note"><Icon name="lock" size={16}/><span>Sua conta precisa de acesso à Agenda para conectar ou sincronizar um calendário.</span></p>}
      <div className="calendar-integration__actions">
       {(!connected||connection.status==='error')&&<button type="button" className="admin-button" disabled={!!busy||!query.data.configured||!allowed} aria-busy={busy==='start'} onClick={()=>act('start')}><Icon name="link"/>{busy==='start'?'Abrindo Google…':connected?'Reconectar Google Calendar':'Conectar Google Calendar'}</button>}
       {connected&&allowed&&<button type="button" className="admin-button admin-button--secondary" disabled={!!busy||!query.data.configured} aria-busy={busy==='retry'} onClick={()=>act('retry')}><Icon name="refresh" className={busy==='retry'?'is-spinning':''}/>{busy==='retry'?'Reagendando…':'Tentar sincronizar'}</button>}
       {allowed&&<Link className="admin-text-button" to="/admin/agenda">Abrir agenda<Icon name="arrow" size={16}/></Link>}
       {connected&&<button type="button" className="admin-text-button settings-integration__end" disabled={!!busy} aria-busy={busy==='disconnect'} onClick={()=>setDisconnect(true)}>{busy==='disconnect'?'Desconectando…':'Desconectar conta'}</button>}
      </div>
     </>}
    </section>
   </IntegrationGroup>
   {(ai||finance||central)&&<IntegrationGroup id="integrations-central" title="Da DUUK" description="Contas centrais da empresa, configuradas por um super administrador.">
    {ai&&<section className="admin-panel calendar-integration" aria-labelledby="gemini-integration-title">
     <div className="calendar-integration__heading"><span className="calendar-integration__icon"><AppLogo app="gemini"/></span><div><p className="admin-eyebrow">CRIAÇÃO / INTEGRAÇÕES</p><h2 id="gemini-integration-title">DUUK AI · Google Gemini</h2><p>Roteiros, conceitos, apoio comercial e ajuda para utilizar o painel.</p></div></div>
     <p className="calendar-integration__privacy"><Icon name="shield" size={17}/><span>Um super administrador conecta um projeto Gemini sem faturamento. A chave permanece protegida no servidor.</span></p>
     <div className="calendar-integration__actions"><Link className="admin-button admin-button--secondary" to="/admin/ai"><Icon name="spark"/>Abrir DUUK AI</Link></div>
    </section>}
    {finance&&<PluggyIntegration notify={notify}/>}
    {central&&<DriveIntegration callback={driveCallback} notify={notify}/>}
   </IntegrationGroup>}
  </div>
  {disconnect&&<ConfirmModal title="Desconectar Google Calendar?" message="Os eventos continuam na Agenda DUUK. As cópias já enviadas ao Google permanecem lá, sem receber novas atualizações até você reconectar a mesma conta." action="Desconectar conta" onClose={()=>setDisconnect(false)} onConfirm={()=>act('disconnect')}/>}
 </>
}
