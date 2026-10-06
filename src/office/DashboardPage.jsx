import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../admin/components'
import { listContracts, listEvents, listExpenses, listMetrics } from './api'
import { eventCategories, eventTime } from './calendarModel.js'
import { brl, contractStatuses, dateLabel, expenseTotals, metricSummary, today } from './model'
import { useQuery } from './useQuery'

function StatCard({ label, icon, value, note }) {
  return <div>
    <div className="office-stat-heading"><span>{label}</span><Icon name={icon} size={20} /></div>
    <strong className={String(value).length > 15 ? 'office-value-long' : undefined}>{value}</strong>
    <small className="office-stat-note">{note}</small>
  </div>
}

const shortcuts = [
  ['calendar', 'Agenda', 'Da próxima gravação à última entrega.', '/admin/agenda'],
  ['document', 'Contratos', 'Prepare documentos e acompanhe assinaturas.', '/admin/contratos'],
  ['wallet', 'Despesas', 'Organize os custos de cada produção.', '/admin/despesas'],
  ['chart', 'Insights', 'Veja como as pessoas encontram a DUUK.', '/admin/insights'],
  ['film', 'Portfólio', 'Dê espaço às suas próximas histórias.', '/admin/portfolio'],
  ['home', 'Abertura', 'Escolha a primeira cena do site.', '/admin/inicio'],
]

export default function DashboardPage() {
  const query = useCallback(async () => {
    const [contracts, expenses, metrics, events] = await Promise.all([listContracts(), listExpenses(today().slice(0, 7)), listMetrics(30), listEvents(today().slice(0,7))])
    return { contracts, expenses, metrics, events }
  }, [])
  const { data, error, reload: load } = useQuery(query)
  const totals = expenseTotals(data?.expenses || [])
  const metrics = metricSummary(data?.metrics || [])
  const pending = (data?.contracts || []).filter(c => ['pending', 'partial'].includes(c.status))
  const upcoming = (data?.events || []).filter(e => e.end_date >= today() && !['done','cancelled'].includes(e.status)).sort((a,b) => a.start_date.localeCompare(b.start_date) || (a.start_time||'').localeCompare(b.start_time||'')).slice(0,4)
  return <>
    <div className="admin-page-title office-dashboard-title">
      <div><p className="admin-eyebrow">SEU ESTÚDIO. SUAS HISTÓRIAS.</p><h1>Vamos colocar<br />em cena<span>?</span></h1><p>A criação começa aqui. O resto, a gente organiza.</p></div>
      <button className="admin-button admin-button--secondary" onClick={load}><Icon name="refresh" size={16} />Atualizar</button>
    </div>
    {error && <p className="admin-error" role="alert">{error}</p>}
    <div className="admin-stats office-dashboard-stats">
      <StatCard label="Despesas deste mês" icon="wallet" value={data ? brl(totals.total) : '…'} note="Vencimentos do mês atual" />
      <StatCard label="Contratos aguardando assinatura" icon="document" value={data ? pending.length : '…'} note="Aguardando aceite" />
      <StatCard label="Páginas vistas" icon="chart" value={data ? metrics.view.toLocaleString('pt-BR') : '…'} note="Últimos 30 dias" />
    </div>
    <div className="office-shortcuts">
      {shortcuts.map(([icon, title, subtitle, path]) => <Link className="admin-panel office-shortcut" to={path} key={path}>
        <span className="office-shortcut-icon"><Icon name={icon} size={22} /></span>
        <div className="office-shortcut-copy"><h2>{title}</h2><p>{subtitle}</p></div>
        <Icon name="arrow" size={18} />
      </Link>)}
    </div>
    <div className="office-grid">
      <section className="admin-panel office-panel office-upcoming">
        <div className="office-section-title"><h2>Próximas cenas do mês</h2><Link className="admin-text-button" to="/admin/agenda">Ver agenda ↗</Link></div>
        {upcoming.length?upcoming.map(e=><Link className="office-mini-row" to="/admin/agenda" key={e.id}><div><strong>{e.title}</strong><small>{eventCategories[e.category]} · {dateLabel(e.start_date)} · {eventTime(e)}</small></div><Icon name="arrow" size={16} /></Link>):<p className="office-muted">A agenda está aberta para suas próximas produções.</p>}
      </section>
      <section className="admin-panel office-panel">
        <div className="office-section-title"><h2>Contratos em andamento</h2><Link className="admin-text-button" to="/admin/contratos">Ver todos ↗</Link></div>
        {pending.length ? pending.slice(0, 5).map(c => <Link className="office-mini-row" to={`/admin/contratos/${c.id}`} key={c.id}><div><strong>{c.title}</strong><small>{c.client_name}</small></div><span className="office-badge is-pending">{contractStatuses[c.status]}</span></Link>) : <p className="office-muted">Nenhum contrato aguardando assinatura.</p>}
      </section>
      <section className="admin-panel office-panel">
        <div className="office-section-title"><h2>Despesas a pagar no mês</h2><Link className="admin-text-button" to="/admin/despesas">Ver despesas ↗</Link></div>
        {data?.expenses.some(e => e.status === 'pending') ? data.expenses.filter(e => e.status === 'pending').slice(0, 5).map(e => <div className="office-mini-row" key={e.id}><div><strong>{e.title}</strong><small>Vence em {dateLabel(e.due_date)}</small></div><strong>{brl(e.amount_cents)}</strong></div>) : <p className="office-muted">Nenhuma despesa pendente neste mês.</p>}
      </section>
    </div>
  </>
}
