import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Icon, RefreshButton } from '../admin/components'
import { EmptyState } from '../admin/forms'
import { useMediaQuery } from '../admin/shell/hooks'
import { useAuth } from '../content/AuthContext'
import { useContent } from '../content/useContent'
import { today } from './model'
import StudioGreeting from './StudioGreeting'
import StudioPulse from './dashboard/StudioPulse'
import { combine, useDashboardData, useMinute } from './dashboard/data'
import { activityView, agendaView, contractView, dashboardColumns, digestItems, financeView, followupView, metricsView, nowTime, pipelineView, quickActions, socialView } from './dashboard/model'
import { ActivityCard, AgendaCard, ContractsCard, FinanceCard, FollowupsCard, PipelineCard, QuickActionsCard, SiteCard, SocialCard } from './dashboard/cards'
import { AsaasCard, SpotifyCard } from './dashboard/IntegrationCards'
import './dashboard-experience.css'

const firstName = name => String(name || '').trim().split(/\s+/)[0]

// What needs attention today, built from the widgets the member can open.
function Digest({ items, loading, settled }) {
  if (items.length) return <ul className="dashboard-digest" role="list" aria-label="Pendências de hoje">{items.map((item, index) => <li key={item.key} style={{ '--i': index }}>
    <Link className={item.tone === 'danger' ? 'is-danger' : undefined} to={item.to}><Icon name={item.icon} />{item.text}</Link>
  </li>)}</ul>
  if (loading) return <div className="dashboard-digest" aria-hidden="true"><span className="ds-skeleton" /><span className="ds-skeleton" /></div>
  if (settled) return <p className="dashboard-digest__calm"><Icon name="checkCircle" />Nada pendente para hoje.</p>
  return null
}

export default function DashboardPage() {
  const auth = useAuth(), content = useContent(), { hasPermission } = auth
  const wide = useMediaQuery('(min-width: 1024px)'), medium = useMediaQuery('(min-width: 768px)')
  const can = useMemo(() => ({
    agenda: hasPermission('agenda'),
    followups: hasPermission('crm.followups'),
    pipeline: hasPermission('crm.pipeline'),
    activity: hasPermission('crm.dashboard'),
    clients: hasPermission('crm.clients'),
    activities: hasPermission('crm.activities'),
    contracts: hasPermission('contracts'),
    finance: hasPermission('finance'),
    billing: hasPermission('billing'),
    spotify: hasPermission('spotify'),
    insights: hasPermission('insights'),
    site: hasPermission('site'),
    social: hasPermission('social'),
  }), [hasPermission])
  const data = useDashboardData(can), clock = useMinute()
  const day = today(), month = day.slice(0, 7), now = nowTime(clock)
  const people = data.people.data
  const names = useMemo(() => new Map((people || []).map(person => [person.id, firstName(person.name)])), [people])

  const { events, clients, followups, activities, contracts, finance, metrics, social } = data
  const views = {
    agenda: events.data ? agendaView(events.data, day, now) : null,
    followups: followups.data && clients.data ? followupView(followups.data, clients.data, day) : null,
    pipeline: clients.data ? pipelineView(clients.data, followups.data) : null,
    activity: activities.data && clients.data ? activityView(activities.data, clients.data) : null,
    contracts: contracts.data ? contractView(contracts.data) : null,
    finance: finance.data ? financeView(finance.data.records, month, day) : null,
    metrics: metrics.data ? metricsView(metrics.data, day) : null,
    social: social.data ? socialView(social.data, day) : null,
  }
  const actions = quickActions.filter(action => hasPermission(action.permission))
  const clientLink = can.clients ? id => `/admin/comercial/clientes?cliente=${encodeURIComponent(id)}` : null

  // The digest only speaks for sources the member can open; it never claims "nothing pending" before they load.
  const digestSources = [can.agenda && [events], can.followups && [followups, clients], can.contracts && [contracts], can.finance && [finance], can.social && [social]].filter(Boolean).flat()
  const digest = digestItems({ agenda: views.agenda, followups: views.followups, contracts: views.contracts, finance: views.finance, social: views.social }, day)

  const cards = {
    agenda: can.agenda && <AgendaCard state={combine(events)} view={views.agenda} day={day} names={names} />,
    followups: can.followups && <FollowupsCard state={combine(followups, clients)} view={views.followups} day={day} names={names} />,
    contracts: can.contracts && <ContractsCard state={combine(contracts)} view={views.contracts} />,
    finance: can.finance && <FinanceCard state={combine(finance)} bank={combine(data.bank)} view={views.finance} month={month} day={day} canConnect={auth.profile?.is_super_admin === true} />,
    asaas: can.billing && <AsaasCard state={combine(data.asaas)}/>,
    spotify: can.spotify && <SpotifyCard/>,
    actions: actions.length > 0 && <QuickActionsCard actions={actions} />,
    pipeline: can.pipeline && <PipelineCard state={combine(clients)} view={views.pipeline} day={day} clientLink={clientLink} canCreateLead={can.clients} />,
    activity: can.activity && <ActivityCard state={combine(activities, clients)} items={views.activity} day={day} names={names} userId={auth.user?.id} to={can.activities ? '/admin/comercial/contatos' : '/admin/comercial'} area={can.activities ? 'Contatos e atividades' : 'Comercial'} clientLink={clientLink} />,
    social: can.social && <SocialCard state={combine(social)} view={views.social} day={day} />,
    site: (can.insights || can.site) && <SiteCard insights={can.insights} site={can.site} state={combine(metrics)} view={views.metrics} content={content} day={day} />,
  }
  const layout = dashboardColumns(Object.keys(cards).filter(key => cards[key]), wide ? 'wide' : medium ? 'even' : 'single')

  const refresh = async () => {
    const [failed, siteFailed] = await Promise.all([data.refresh(), can.site ? content.refresh().then(() => false, () => true) : false])
    const count = failed + (siteFailed ? 1 : 0)
    return count ? { failed: true, error: count === 1 ? 'Um dos resumos não foi atualizado. Veja o aviso no cartão.' : 'Alguns resumos não foram atualizados. Veja os avisos nos cartões.' } : { ok: true }
  }

  return <div className="duuk-dashboard">
    {/* Banner: always the dark film look, so the original white logo is shown as it is in both themes. */}
    <header className="dashboard-head dashboard-hero">
      <span className="dashboard-hero__art" aria-hidden="true"><img className="dashboard-hero__photo" src="/media/images/sobre-set-682.b3883b9ee0e6.webp" alt="" width="682" height="1024" fetchPriority="high" /><i className="is-coral" /><i className="is-orange" /><i className="dashboard-hero__strip" /></span>
      <span className="dashboard-hero__eyebrow">DUUK FILMS / NOSSO ESTÚDIO</span>
      <StudioGreeting name={auth.profile?.name || ''} />
      <div className="dashboard-hero__side">
        <img className="dashboard-hero__logo" src="/media/duuk-logo-white.png" alt="" width="718" height="886" />
        <RefreshButton onRefresh={refresh} compact={!medium} />
      </div>
      {digestSources.length > 0 && <Digest items={digest} loading={digestSources.some(source => source.data == null && !source.error)} settled={digestSources.every(source => source.data != null)} />}
    </header>
    <StudioPulse can={can} data={data} views={views} day={day} />
    {layout.columns[0].length
      ? <div className={`dashboard-grid dashboard-grid--${layout.kind}`}>
        {layout.columns.map((keys, index) => <div className="dashboard-column" key={index}>{keys.map((key, order) => <div className="dashboard-enter" key={key} style={{ '--i': order * 2 + index }}>{cards[key]}</div>)}</div>)}
      </div>
      : <div className="ds-card dashboard-card"><EmptyState icon="grid" title="Nenhum módulo liberado para você">Quando um administrador liberar o acesso a agenda, comercial, contratos, financeiro, Social Media ou site, os resumos aparecem aqui.</EmptyState></div>}
  </div>
}
