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

function StatCard({ label, icon, value, note }) {return <div><div className="office-stat-heading"><span>{label}</span><Icon name={icon} size={20}/></div><strong className={String(value).length>15?'office-value-long':undefined}>{value}</strong><small className="office-stat-note">{note}</small></div>}
const shortcuts=[['crm.dashboard','users','Comercial','Uma conversa pode ser o próximo filme.','/admin/comercial'],['agenda','calendar','Agenda','Da próxima gravação à última entrega.','/admin/agenda'],['contracts','document','Contratos','Prepare documentos e acompanhe assinaturas.','/admin/contratos'],['finance','wallet','Financeiro','Organize os custos de cada produção.','/admin/financeiro'],['insights','chart','Insights','Veja como as pessoas encontram a DUUK.','/admin/insights'],['site','film','Portfólio','Dê espaço às suas próximas histórias.','/admin/portfolio'],['site','home','Abertura','Escolha a primeira cena do site.','/admin/inicio']]
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
 const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'America/Sao_Paulo',hour:'2-digit',hour12:false}).format(new Date())),greeting=hour<12?'Bom dia':hour<18?'Boa tarde':'Boa noite'
 return <><div className="admin-page-title office-dashboard-title"><div><p className="admin-eyebrow">SEU ESTÚDIO. SUAS HISTÓRIAS.</p><h1>{greeting},<br/>{auth.profile.name.split(' ')[0]}<span>.</span></h1><p>Vamos colocar as próximas ideias em cena?</p></div><RefreshButton onRefresh={reload}/></div>{error&&<p className="admin-error" role="alert">{error}</p>}
 <div className="admin-stats office-dashboard-stats">
 {auth.hasPermission('finance')&&<StatCard label="Despesas deste mês" icon="wallet" value={data?brl(totals.total):'…'} note="Vencimentos do mês atual"/>}
 {auth.hasPermission('contracts')&&<StatCard label="Contratos aguardando assinatura" icon="document" value={data?pending.length:'…'} note="Aguardando aceite"/>}
 {auth.hasPermission('insights')&&<StatCard label="Páginas vistas" icon="chart" value={data?metrics.view.toLocaleString('pt-BR'):'…'} note="Últimos 30 dias"/>}
 {auth.hasPermission('crm.dashboard')&&<><StatCard label="Clientes e leads" icon="users" value={data?data.clients.length:'…'} note="Base comercial da equipe"/><StatCard label="Contatos hoje" icon="activity" value={data?data.activities.filter(a=>localDay(a.occurred_at)===today()).length:'…'} note="Atividade comercial do dia"/></>}
 {auth.hasPermission('site')&&<StatCard label="Filmes no portfólio" icon="film" value={content.ready?content.draft.projects.filter(p=>p.status==='published').length:'…'} note="Projetos visíveis no site"/>}
 </div><div className="office-shortcuts">{shortcuts.filter(([key])=>auth.hasPermission(key)).map(([,icon,title,subtitle,path])=><Link className="admin-panel office-shortcut" to={path} key={path}><span className="office-shortcut-icon"><Icon name={icon} size={22}/></span><div className="office-shortcut-copy"><h2>{title}</h2><p>{subtitle}</p></div><Icon name="arrow"/></Link>)}</div><div className="office-grid">
 {auth.hasPermission('agenda')&&<section className="admin-panel office-panel office-upcoming"><div className="office-section-title"><h2>Próximas cenas do mês</h2><Link className="admin-text-button" to="/admin/agenda">Ver agenda<Icon name="arrow" size={14}/></Link></div>{upcoming.length?upcoming.map(e=><Link className="office-mini-row" to="/admin/agenda" key={e.id}><div><strong>{e.title}</strong><small>{eventCategories[e.category]} · {dateLabel(e.start_date)} · {eventTime(e)}</small></div><Icon name="arrow" size={16}/></Link>):<p className="office-muted">A agenda está aberta para suas próximas produções.</p>}</section>}
 {auth.hasPermission('contracts')&&<section className="admin-panel office-panel"><div className="office-section-title"><h2>Contratos em andamento</h2><Link className="admin-text-button" to="/admin/contratos">Ver todos<Icon name="arrow" size={14}/></Link></div>{pending.length?pending.slice(0,5).map(c=><Link className="office-mini-row" to={`/admin/contratos/${c.id}`} key={c.id}><div><strong>{c.title}</strong><small>{c.client_name}</small></div><span className="office-badge is-pending">{contractStatuses[c.status]}</span></Link>):<p className="office-muted">Nenhum contrato aguardando assinatura.</p>}</section>}
 {auth.hasPermission('finance')&&<section className="admin-panel office-panel"><div className="office-section-title"><h2>Despesas a pagar no mês</h2><Link className="admin-text-button" to="/admin/financeiro">Ver despesas<Icon name="arrow" size={14}/></Link></div>{data?.expenses.some(e=>e.status==='pending')?data.expenses.filter(e=>e.status==='pending').slice(0,5).map(e=><div className="office-mini-row" key={e.id}><div><strong>{e.title}</strong><small>Vence em {dateLabel(e.due_date)}</small></div><strong>{brl(e.amount_cents)}</strong></div>):<p className="office-muted">Nenhuma despesa pendente neste mês.</p>}</section>}
 </div></>
}
