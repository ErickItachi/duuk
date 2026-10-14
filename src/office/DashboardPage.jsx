import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Icon, RefreshButton } from '../admin/components'
import { useAuth } from '../content/AuthContext'
import { useContent } from '../content/useContent'
import { listContracts, listEvents, listExpenses, listMetrics } from './api'
import { listClients, listActivities } from '../crm/api'
import { localDay } from '../crm/model'
import { eventCategories, eventTime } from './calendarModel.js'
import { brl, contractStatuses, dateLabel, expenseTotals, metricSummary, today } from './model'
import { useQuery } from './useQuery'
import StudioGreeting from './StudioGreeting'
import './dashboard-experience.css'

function StatCard({ label, icon, value, note }) {
 return <div className="dashboard-stat"><div className="office-stat-heading"><span>{label}</span><span className="dashboard-stat__icon"><Icon name={icon} size={18}/></span></div><strong className={String(value).length>15?'office-value-long':undefined}>{value}</strong><small className="office-stat-note">{note}</small></div>
}
function SectionTitle({ icon, title, label, path }) {
 return <div className="office-section-title"><div className="dashboard-section-heading"><span className="dashboard-section-heading__icon"><Icon name={icon} size={19}/></span><h2>{title}</h2></div><Link className="admin-text-button" to={path}>{label}<Icon name="arrow" size={15}/></Link></div>
}
function EmptyState({ icon, children }) {
 return <div className="dashboard-empty"><Icon name={icon} size={22}/><p className="office-muted">{children}</p></div>
}
function EventDate({ day }) {
 const month = new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(`${day}T12:00:00Z`)).replace('.', '')
 return <span className="dashboard-event-date" aria-hidden="true"><strong>{day.slice(8,10)}</strong><small>{month}</small></span>
}
function ContractProgress({ records }) {
 const active = records?.filter(record => record.status !== 'cancelled')
 const total = active?.length || 0, signed = active?.filter(record => record.status === 'signed').length || 0
 const percentage = total ? Math.round(signed / total * 100) : null
 const label = !records ? 'Carregando os contratos' : total ? `${signed} de ${total} contratos ativos assinados` : 'Nenhum contrato cadastrado'
 return <div className="dashboard-contract-progress" role="img" aria-label={label}>
  <div className="dashboard-contract-progress__ring"><svg viewBox="0 0 108 108" aria-hidden="true"><circle cx="54" cy="54" r="46"/><circle cx="54" cy="54" r="46" pathLength="100" strokeDasharray={`${percentage || 0} 100`}/></svg><strong>{!records ? '…' : percentage === null ? '—' : <>{percentage}<small>%</small></>}</strong></div>
  <div><span>Contratos assinados</span><small>{!records ? 'Carregando…' : total ? `${signed} de ${total} ativos` : 'Sem contratos'}</small></div>
 </div>
}
const shortcuts=[['crm.dashboard','users','Comercial','Conversas, propostas e próximos passos.','/admin/comercial'],['agenda','calendar','Agenda','O ritmo das próximas produções.','/admin/agenda'],['contracts','document','Contratos','Documentos e assinaturas em um lugar.','/admin/contratos'],['finance','wallet','Financeiro','Cada custo, com clareza.','/admin/financeiro'],['insights','chart','Insights','Os movimentos do seu site.','/admin/insights'],['site','film','Portfólio','Histórias prontas para ganhar espaço.','/admin/portfolio'],['site','home','Abertura','A primeira cena da DUUK.','/admin/inicio']]
export default function DashboardPage() {
 const auth=useAuth(),content=useContent(),{hasPermission}=auth
 const query=useCallback(async()=>{
  const allowed=(key,work)=>hasPermission(key)?work():Promise.resolve([])
  const [contracts,expenses,metrics,events,clients,activities]=await Promise.all([allowed('contracts',listContracts),allowed('finance',()=>listExpenses(today().slice(0,7))),allowed('insights',()=>listMetrics(30)),allowed('agenda',()=>listEvents(today().slice(0,7))),allowed('crm.dashboard',listClients),allowed('crm.dashboard',listActivities)])
  return {contracts,expenses,metrics,events,clients,activities}
 },[hasPermission])
 const {data,error,reload}=useQuery(query)
 const totals=expenseTotals(data?.expenses||[]),metrics=metricSummary(data?.metrics||[]),pending=(data?.contracts||[]).filter(c=>['pending','partial'].includes(c.status))
 const upcoming=(data?.events||[]).filter(e=>e.end_date>=today()&&!['done','cancelled'].includes(e.status)).sort((a,b)=>a.start_date.localeCompare(b.start_date)||(a.start_time||'').localeCompare(b.start_time||'')).slice(0,4)
 const visibleShortcuts=shortcuts.filter(([key])=>hasPermission(key))
 const calendarLabel=new Intl.DateTimeFormat('pt-BR',{day:'numeric',month:'long',timeZone:'America/Sao_Paulo'}).format(new Date(`${today()}T12:00:00Z`))
 const noData=error?'Os dados não puderam ser carregados. Tente atualizar.':'Carregando seus dados…'
 return <div className="duuk-dashboard">
 <div className="dashboard-overview"><div className="admin-page-title office-dashboard-title"><span className="dashboard-frame" aria-hidden="true"/><div className="dashboard-hero-copy"><StudioGreeting name={auth.profile.name}/></div><div className="dashboard-hero-actions">{hasPermission('contracts')&&<ContractProgress records={data?.contracts}/>}<span className="dashboard-hero-date"><Icon name="calendar" size={15}/>{calendarLabel}</span><RefreshButton onRefresh={reload} inlineFeedback/></div></div>
 {error&&<p className="admin-error" role="alert">{error}</p>}
 <div className="admin-stats office-dashboard-stats">
 {auth.hasPermission('finance')&&<StatCard label="Despesas deste mês" icon="wallet" value={data?brl(totals.total):'…'} note="Vencimentos do mês atual"/>}
 {auth.hasPermission('contracts')&&<StatCard label="Contratos a assinar" icon="document" value={data?pending.length:'…'} note="Aguardando aceite"/>}
 {auth.hasPermission('insights')&&<StatCard label="Páginas vistas" icon="chart" value={data?metrics.view.toLocaleString('pt-BR'):'…'} note="Últimos 30 dias"/>}
 {auth.hasPermission('crm.dashboard')&&<><StatCard label="Clientes e leads" icon="users" value={data?data.clients.length:'…'} note="Base comercial da equipe"/><StatCard label="Contatos hoje" icon="activity" value={data?data.activities.filter(a=>localDay(a.occurred_at)===today()).length:'…'} note="Atividade comercial do dia"/></>}
 {auth.hasPermission('site')&&<StatCard label="Filmes no portfólio" icon="film" value={content.ready?content.draft.projects.filter(p=>p.status==='published').length:'…'} note="Projetos visíveis no site"/>}
 </div></div>
 {visibleShortcuts.length>0&&<section className="dashboard-workspace" aria-labelledby="dashboard-workspace-title"><div className="dashboard-block-heading"><div><p className="admin-eyebrow">SEU ESPAÇO DE TRABALHO</p><h2 id="dashboard-workspace-title">Da ideia à entrega<span>.</span></h2></div></div><div className="office-shortcuts">{visibleShortcuts.map(([,icon,title,subtitle,path])=><Link className="admin-panel office-shortcut" to={path} key={path}><span className="office-shortcut-icon"><Icon name={icon} size={21}/></span><div className="office-shortcut-copy"><h3>{title}</h3><p>{subtitle}</p></div><Icon name="arrow" size={17}/></Link>)}</div></section>}
 <div className="office-grid dashboard-activity">
 {auth.hasPermission('agenda')&&<section className="admin-panel office-panel office-upcoming"><SectionTitle icon="calendar" title="Próximas cenas do mês" label="Ver agenda" path="/admin/agenda"/>{upcoming.length?<div className="dashboard-events">{upcoming.map(e=><Link className="office-mini-row dashboard-event" to="/admin/agenda" key={e.id}><EventDate day={e.start_date}/><div className="dashboard-event-copy"><strong>{e.title}</strong><small>{eventCategories[e.category]} · {dateLabel(e.start_date)} · {eventTime(e)}</small></div><Icon name="arrow" size={16}/></Link>)}</div>:<EmptyState icon="calendar">{data?'A agenda está aberta para suas próximas produções.':noData}</EmptyState>}</section>}
 {auth.hasPermission('contracts')&&<section className="admin-panel office-panel dashboard-records"><SectionTitle icon="document" title="Contratos em andamento" label="Ver todos" path="/admin/contratos"/>{pending.length?pending.slice(0,5).map(c=><Link className="office-mini-row" to={`/admin/contratos/${c.id}`} key={c.id}><div><strong>{c.title}</strong><small>{c.client_name}</small></div><span className="office-badge is-pending">{contractStatuses[c.status]}</span></Link>):<EmptyState icon="document">{data?'Nenhum contrato aguardando assinatura.':noData}</EmptyState>}</section>}
 {auth.hasPermission('finance')&&<section className="admin-panel office-panel dashboard-records"><SectionTitle icon="wallet" title="Despesas a pagar no mês" label="Ver despesas" path="/admin/financeiro"/>{data?.expenses.some(e=>e.status==='pending')?data.expenses.filter(e=>e.status==='pending').slice(0,5).map(e=><div className="office-mini-row" key={e.id}><div><strong>{e.title}</strong><small>Vence em {dateLabel(e.due_date)}</small></div><strong className="dashboard-record-amount">{brl(e.amount_cents)}</strong></div>):<EmptyState icon="wallet">{data?'Nenhuma despesa pendente neste mês.':noData}</EmptyState>}</section>}
 </div></div>
}
