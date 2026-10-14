import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../../admin/components'
import { useMediaQuery } from '../../admin/shell/hooks'
import { Avatar, EmptyState, ErrorState } from '../../admin/forms'
import { eventCategories, eventStatuses, eventTime } from '../calendarModel'
import { brl } from '../model'
import { localDay, stageLabel } from '../../crm/model'
import { FinancePrivacy, Money, PrivacyToggle } from '../../finance/privacy'
import { captionLine, channelLabel, compactMoney, dayLabel, dayNumber, monthName, monthShort, plural, shortDate, sinceLabel, socialFormats, timeOf, whenLabel } from './model'

const lower = text => text.charAt(0).toLowerCase() + text.slice(1)

// Counts up to the real figure when it first appears or changes. Readers get the final value
// right away; with reduced motion the number simply shows.
function CountUp({ value, format = number => number.toLocaleString('pt-BR') }) {
  const [shown, setShown] = useState(0)
  const from = useRef(0)
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)')
  useEffect(() => {
    if (reduced) return
    const start = performance.now(), origin = from.current, duration = 900
    let frame = requestAnimationFrame(function step(now) {
      const progress = Math.min(1, (now - start) / duration), eased = 1 - Math.pow(1 - progress, 3)
      setShown(Math.round(origin + (value - origin) * eased))
      if (progress < 1) frame = requestAnimationFrame(step)
      else from.current = value
    })
    return () => cancelAnimationFrame(frame)
  }, [value, reduced])
  return <><span className="ds-visually-hidden">{format(value)}</span><span aria-hidden="true">{format(reduced ? value : shown)}</span></>
}

// Card frame: title, an optional tool (privacy eye) and the "Ver tudo" link to the module.
export function DashboardCard({ id, title, icon, to, area, tools, state, children }) {
  const refreshing = state?.loading && state?.ready
  return <section className={`ds-card dashboard-card${refreshing ? ' is-refreshing' : ''}`} aria-labelledby={`dashboard-${id}`} aria-busy={state?.loading || undefined}>
    <header className="ds-card__head dashboard-card__head">
      <h2 id={`dashboard-${id}`}><Icon name={icon} />{title}</h2>
      {(tools || to) && <div className="dashboard-card__tools">
        {tools}
        {to && <Link className="dashboard-card__link" to={to}>Ver tudo<span className="ds-visually-hidden"> em {area || title}</span><Icon name="right" /></Link>}
      </div>}
    </header>
    <div className="dashboard-card__body">{children}</div>
  </section>
}

function Skeleton({ label, rows = 3, round = false }) {
  return <div className="dashboard-skeleton" role="status">
    <span className="ds-visually-hidden">{label}</span>
    {Array.from({ length: rows }, (_, index) => <div className="dashboard-skeleton__row" key={index} aria-hidden="true">
      <span className={`ds-skeleton dashboard-skeleton__lead${round ? ' is-round' : ''}`} />
      <span className="dashboard-skeleton__lines"><span className="ds-skeleton ds-skeleton--text" /><span className="ds-skeleton ds-skeleton--text" /></span>
    </div>)}
  </div>
}

// Skeleton while the first load runs, a visible error with retry, and the last data kept on refresh failures.
function Loaded({ state, what, rows, round, detail = false, children }) {
  const reason = detail && state.message ? ` ${state.message}` : ''
  if (!state.ready) return state.error
    ? <ErrorState onRetry={state.retry}>Não foi possível carregar {what}.{reason || ' Confira a conexão e tente novamente.'}</ErrorState>
    : <Skeleton label={`Carregando ${what}…`} rows={rows} round={round} />
  return <>
    {state.error && <ErrorState onRetry={state.retry}>Não foi possível atualizar {what}.{reason} Os dados abaixo são da última consulta.</ErrorState>}
    {children()}
  </>
}

function Group({ label, count, children }) {
  return <div className="dashboard-group">
    <h3 className="dashboard-label">{label}{count != null && <span className="dashboard-label__count">{count}</span>}</h3>
    {children}
  </div>
}

function Aside({ late, children }) {
  return <span className={`dashboard-row__aside${late ? ' is-danger' : ''}`}>{late && <><Icon name="alertCircle" /><span className="ds-visually-hidden">Atrasado: </span></>}{children}</span>
}

const ClientName = ({ client }) => client
  ? <>{client.name}{client.company && client.company !== client.name && <span className="dashboard-row__soft"> · {client.company}</span>}</>
  : 'Cliente não encontrado'

// ---------- Agenda ----------
function EventRow({ event, day, names, upcoming = false }) {
  const ongoing = !upcoming && event.start_date < day
  const meta = [
    upcoming && eventTime(event),
    eventCategories[event.category],
    event.client_name,
    names?.get(event.responsible_id),
    event.end_date > (upcoming ? event.start_date : day) && `até ${shortDate(event.end_date)}`,
    event.status === 'planned' && eventStatuses.planned,
  ].filter(Boolean).join(' · ')
  return <Link className={`dashboard-row${event.state === 'past' ? ' is-past' : ''}`} to={`/admin/agenda?dia=${upcoming ? event.start_date : day}`}>
    {upcoming
      ? <span className="dashboard-date" aria-hidden="true"><strong>{dayNumber(event.start_date)}</strong><small>{monthShort(event.start_date)}</small></span>
      : <span className="dashboard-time">{ongoing ? <>Desde<small>{shortDate(event.start_date)}</small></> : event.all_day || !event.start_time ? <>Dia<small>inteiro</small></> : <><span>{event.start_time.slice(0, 5)}</span>{event.end_time && <small><span className="ds-visually-hidden">até </span>{event.end_time.slice(0, 5)}</small>}</>}</span>}
    <span className="dashboard-row__main">
      <span className="dashboard-row__title">{upcoming && <span className="ds-visually-hidden">{dayLabel(event.start_date, day)}: </span>}{event.title}</span>
      {meta && <span className="dashboard-row__meta">{meta}</span>}
    </span>
    {event.state === 'now' && <span className="ds-badge ds-badge--accent"><i aria-hidden="true" />Agora</span>}
    {event.state === 'past' && <span className="dashboard-row__aside">Encerrado</span>}
  </Link>
}

export function AgendaCard({ state, view, day, names }) {
  return <DashboardCard id="agenda" title="Agenda" icon="calendar" to="/admin/agenda" state={state}>
    <Loaded state={state} what="a agenda" rows={3}>{() => {
      if (!view.today.length && !view.upcoming.length) return <EmptyState icon="calendar" title="Agenda livre" action={<Link className="admin-button admin-button--secondary admin-button--sm" to="/admin/agenda?novo=compromisso"><Icon name="plus" />Novo compromisso</Link>}>Nenhum compromisso hoje nem nas próximas semanas.</EmptyState>
      const todays = view.today.slice(0, 4), more = view.today.length - todays.length
      return <>
        <Group label="Hoje">
          {todays.length
            ? <ul className="dashboard-list" role="list">{todays.map(event => <li key={event.id}><EventRow event={event} day={day} names={names} /></li>)}</ul>
            : <p className="dashboard-note"><Icon name="checkCircle" />Nenhum compromisso hoje.</p>}
          {more > 0 && <Link className="dashboard-more" to={`/admin/agenda?dia=${day}`}>Mais {plural(more, 'compromisso', 'compromissos')} hoje<Icon name="right" /></Link>}
        </Group>
        {view.upcoming.length > 0 && <Group label="Próximos dias">
          <ul className="dashboard-list" role="list">{view.upcoming.slice(0, 3).map(event => <li key={event.id}><EventRow event={event} day={day} names={names} upcoming /></li>)}</ul>
        </Group>}
      </>
    }}</Loaded>
  </DashboardCard>
}

// ---------- Follow-ups ----------
function FollowupList({ items, late, day, names }) {
  return <ul className="dashboard-list" role="list">{items.map(item => <li key={item.id}>
    <Link className="dashboard-row" to={`/admin/comercial/follow-ups?filtro=${late ? 'overdue' : 'today'}`}>
      <Avatar profile={{ name: item.client?.name || '?' }} size={32} />
      <span className="dashboard-row__main">
        <span className="dashboard-row__title"><ClientName client={item.client} /></span>
        <span className="dashboard-row__meta">{[item.notes, names?.get(item.owner_id)].filter(Boolean).join(' · ') || 'Follow-up agendado'}</span>
      </span>
      <Aside late={late}>{late ? dayLabel(item.day, day) : timeOf(item.due_at)}</Aside>
    </Link>
  </li>)}</ul>
}

export function FollowupsCard({ state, view, day, names }) {
  return <DashboardCard id="followups" title="Follow-ups" icon="clock" to="/admin/comercial/follow-ups" state={state}>
    <Loaded state={state} what="os follow-ups" rows={3} round>{() => {
      if (!view.overdue.length && !view.today.length) return <EmptyState icon="checkCircle" title="Nenhum follow-up para hoje">{view.next ? <>Próximo: {lower(whenLabel(view.next.due_at, day))}{view.next.client && <>, com {view.next.client.name}</>}.</> : 'Nenhum contato agendado no momento.'}</EmptyState>
      const overdue = view.overdue.slice(0, 3), todays = view.today.slice(0, Math.max(2, 5 - overdue.length))
      const hidden = view.overdue.length + view.today.length - overdue.length - todays.length
      return <>
        {overdue.length > 0 && <Group label="Atrasados" count={view.overdue.length}><FollowupList items={overdue} late day={day} names={names} /></Group>}
        {todays.length > 0 && <Group label="Hoje" count={view.today.length}><FollowupList items={todays} day={day} names={names} /></Group>}
        {hidden > 0 && <Link className="dashboard-more" to="/admin/comercial/follow-ups">Mais {plural(hidden, 'follow-up', 'follow-ups')}<Icon name="right" /></Link>}
      </>
    }}</Loaded>
  </DashboardCard>
}

// ---------- Pipeline ----------
export function PipelineCard({ state, view, day, clientLink, canCreateLead }) {
  return <DashboardCard id="pipeline" title="Pipeline" icon="pipeline" to="/admin/comercial/pipeline" state={state}>
    <Loaded state={state} what="o pipeline" rows={4}>{() => {
      if (!view.open) return <EmptyState icon="pipeline" title="Nenhuma negociação em andamento" action={canCreateLead && <Link className="admin-button admin-button--secondary admin-button--sm" to="/admin/comercial/clientes?novo=lead"><Icon name="plus" />Novo lead</Link>}>{view.won + view.lost ? `Fechadas: ${view.won} · Perdidas: ${view.lost}.` : 'Cadastre um lead para acompanhar o funil comercial.'}</EmptyState>
      return <>
        <div className="dashboard-figures">
          <p className="dashboard-figure"><strong><CountUp value={view.open} /></strong><span>{view.open === 1 ? 'negociação em andamento' : 'negociações em andamento'}</span></p>
          {view.value > 0 && <p className="dashboard-figure"><strong><CountUp value={view.value} format={brl} /></strong><span>em valor estimado{view.unvalued > 0 && ` · ${view.unvalued} sem valor`}</span></p>}
        </div>
        <Group label="Por etapa">
          <ul className="dashboard-stages" role="list">{view.stages.map((stage, index) => <li key={stage.key} className={stage.count ? undefined : 'is-empty'} style={{ '--i': index }}>
            <span className="dashboard-stages__label">{stage.label}</span>
            <span className="dashboard-stages__bar" aria-hidden="true">{stage.count > 0 && <i style={{ width: `${stage.count / view.max * 100}%` }} />}</span>
            <span className="dashboard-stages__count">{stage.count}<span className="ds-visually-hidden"> {stage.count === 1 ? 'negociação' : 'negociações'}{stage.value > 0 && `, ${brl(stage.value)} estimados`}</span></span>
            <span className="dashboard-stages__value" aria-hidden="true">{stage.value > 0 && compactMoney(stage.value)}</span>
          </li>)}</ul>
        </Group>
        {view.next.length > 0 && <Group label="Próximas ações">
          <ul className="dashboard-list" role="list">{view.next.map(({ client, due_at, note }) => <li key={client.id}>
            <Link className="dashboard-row" to={clientLink ? clientLink(client.id) : '/admin/comercial/pipeline'}>
              <Avatar profile={{ name: client.name }} size={32} />
              <span className="dashboard-row__main">
                <span className="dashboard-row__title"><ClientName client={client} /></span>
                <span className="dashboard-row__meta">{[stageLabel(client.stage), Number(client.estimated_cents) > 0 && compactMoney(client.estimated_cents), note].filter(Boolean).join(' · ')}</span>
              </span>
              <Aside late={localDay(due_at) < day}>{whenLabel(due_at, day)}</Aside>
            </Link>
          </li>)}</ul>
        </Group>}
        <p className="dashboard-foot"><span>Fechadas: {view.won}</span><span>Perdidas: {view.lost}</span>{view.unscheduled > 0 && <span>Sem próximo contato: {view.unscheduled}</span>}</p>
      </>
    }}</Loaded>
  </DashboardCard>
}

// ---------- Recent activity ----------
const channelIcons = { call: 'phone', whatsapp: 'message', email: 'mail', instagram: 'instagram', meeting: 'users' }
const activityTime = (value, day) => localDay(value) === day ? timeOf(value) : dayLabel(localDay(value), day)

export function ActivityCard({ state, items, day, names, userId, to, area, clientLink }) {
  return <DashboardCard id="activity" title="Atividade recente" icon="activity" to={to} area={area} state={state}>
    <Loaded state={state} what="as atividades" rows={4} round>{() => items.length
      ? <ul className="dashboard-list" role="list">{items.map(item => {
        const actor = item.user_id === userId ? 'Você' : names?.get(item.user_id)
        const body = <>
          <span className="dashboard-icon" aria-hidden="true"><Icon name={channelIcons[item.channel] || 'activity'} /></span>
          <span className="dashboard-row__main">
            <span className="dashboard-row__title">{actor && <span className="dashboard-row__soft">{actor} · </span>}{item.channel === 'other' ? 'Contato' : channelLabel(item.channel)} com {item.client?.name || 'cliente removido'}</span>
            {item.notes && <span className="dashboard-row__text">{item.notes}</span>}
            {item.next_step && <span className="dashboard-row__meta">Próximo passo: {item.next_step}</span>}
          </span>
          <time className="dashboard-row__aside" dateTime={item.occurred_at}>{activityTime(item.occurred_at, day)}</time>
        </>
        return <li key={item.id}>{clientLink && item.client ? <Link className="dashboard-row is-top" to={clientLink(item.client.id)}>{body}</Link> : <div className="dashboard-row is-top">{body}</div>}</li>
      })}</ul>
      : <EmptyState icon="activity" title="Nenhum contato registrado">Ligações, mensagens e reuniões registradas pela equipe aparecem aqui.</EmptyState>}</Loaded>
  </DashboardCard>
}

// ---------- Contracts ----------
export function ContractsCard({ state, view }) {
  return <DashboardCard id="contracts" title="Contratos" icon="document" to="/admin/contratos" state={state}>
    <Loaded state={state} what="os contratos" rows={3}>{() => view.groups.length ? <>
      {view.groups.map(group => <Group key={group.status} label={group.label} count={group.items.length}>
        <ul className="dashboard-list" role="list">{group.items.slice(0, 3).map(contract => <li key={contract.id}>
          <Link className="dashboard-row is-compact" to={`/admin/contratos/${contract.id}`}>
            <span className="dashboard-row__main">
              <span className="dashboard-row__title">{contract.title}</span>
              <span className="dashboard-row__meta">{[contract.client_name, contract.updated_at && `atualizado em ${shortDate(localDay(contract.updated_at))}`].filter(Boolean).join(' · ')}</span>
            </span>
          </Link>
        </li>)}</ul>
        {group.items.length > 3 && <Link className="dashboard-more" to="/admin/contratos">Mais {group.items.length - 3}<Icon name="right" /></Link>}
      </Group>)}
      {view.signed > 0 && <p className="dashboard-foot"><span><Icon name="checkCircle" />{plural(view.signed, 'contrato concluído', 'contratos concluídos')}</span></p>}
    </> : <EmptyState icon="document" title="Nada aguardando assinatura" action={<Link className="admin-button admin-button--secondary admin-button--sm" to="/admin/contratos?novo=contrato"><Icon name="plus" />Novo contrato</Link>}>{view.signed ? `${plural(view.signed, 'contrato concluído', 'contratos concluídos')}. ` : ''}Envie um PDF pronto para coletar as assinaturas.</EmptyState>}</Loaded>
  </DashboardCard>
}

// ---------- Finance (respects the privacy eye shared with the Financeiro page) ----------
function Balance({ state, canConnect, day }) {
  if (!state.ready) return state.error
    ? <ErrorState onRetry={state.retry}>Não foi possível consultar o saldo da conta conectada.{state.message && ` ${state.message}`}</ErrorState>
    : <div className="dashboard-balance is-loading" role="status"><span className="ds-visually-hidden">Consultando o saldo…</span><span className="ds-skeleton ds-skeleton--text" aria-hidden="true" /><span className="ds-skeleton ds-skeleton--title" aria-hidden="true" /></div>
  const bank = state.data
  if (!bank.configured) return canConnect && bank.canConfigure
    ? <p className="dashboard-note dashboard-balance-note"><Icon name="bank" /><span>Conecte a conta bancária para ver o saldo aqui. <Link to="/admin/configuracoes/integracoes">Abrir integrações</Link></span></p>
    : null
  return <div className="dashboard-balance-wrap">
    {state.error && <ErrorState onRetry={state.retry}>Não foi possível atualizar o saldo.{state.message && ` ${state.message}`} O valor abaixo é da última consulta.</ErrorState>}
    <Link className="dashboard-balance" to="/admin/financeiro?aba=extrato">
      <span className="dashboard-label">Saldo disponível</span>
      <strong className="dashboard-balance__value"><Money cents={bank.account?.balance_cents ?? null} /></strong>
      <span className="dashboard-balance__meta">{[bank.account?.label, bank.account?.last_four && `final ${bank.account.last_four}`, bank.updatedAt ? `atualizado ${sinceLabel(bank.updatedAt, day)}` : 'Meu Pluggy'].filter(Boolean).join(' · ')}</span>
    </Link>
    {bank.warning && <p className="ds-alert ds-alert--warning dashboard-alert" role="status"><Icon name="warning" /><span>{bank.warning}</span></p>}
  </div>
}

function Tile({ label, icon, cents, overdue, open }) {
  return <Link className="dashboard-tile" to="/admin/financeiro?aba=contas">
    <span className="dashboard-tile__label"><Icon name={icon} />{label}</span>
    <strong className="dashboard-tile__value"><Money cents={cents} /></strong>
    <small className={overdue ? 'is-danger' : undefined}>{overdue ? <><Icon name="alertCircle" /><Money cents={overdue} /> em atraso</> : open}</small>
  </Link>
}

function BillRow({ record, day }) {
  const income = record.type === 'income', late = record.due_date < day, amount = Number(record.amount_cents)
  return <Link className="dashboard-row" to="/admin/financeiro?aba=contas">
    <span className="dashboard-icon" aria-hidden="true"><Icon name={income ? 'incoming' : 'outgoing'} /></span>
    <span className="dashboard-row__main">
      <span className="dashboard-row__title"><span className="ds-visually-hidden">{income ? 'Receita' : 'Despesa'}: </span>{record.title}</span>
      <span className={`dashboard-row__meta${late ? ' is-danger' : ''}`}>{late ? `Em atraso · venceu ${lower(dayLabel(record.due_date, day))}` : `Vence ${lower(dayLabel(record.due_date, day))}`}</span>
    </span>
    <span className={`dashboard-row__amount${income ? ' is-positive' : ''}`}><Money cents={income ? amount : -amount} signed /></span>
  </Link>
}

function FinanceSummary({ state, bank, view, month, day, canConnect }) {
  return <DashboardCard id="finance" title="Financeiro" icon="wallet" to="/admin/financeiro" tools={<PrivacyToggle />} state={state}>
    <Balance state={bank} canConnect={canConnect} day={day} />
    <Loaded state={state} what="as contas do mês" rows={3}>{() => <>
      <Group label={`Vencimentos de ${monthName(month)}`}>
        <div className="dashboard-tiles">
          <Tile label="A receber" icon="incoming" cents={view.totals.pendingIncome} overdue={view.totals.overdueIncome} open={plural(view.incomeOpen, 'recebimento em aberto', 'recebimentos em aberto')} />
          <Tile label="A pagar" icon="outgoing" cents={view.totals.pendingExpense} overdue={view.totals.overdueExpense} open={plural(view.expenseOpen, 'conta em aberto', 'contas em aberto')} />
        </div>
      </Group>
      {view.bills.length
        ? <Group label="Próximas contas"><ul className="dashboard-list" role="list">{view.bills.map(record => <li key={record.key}><BillRow record={record} day={day} /></li>)}</ul></Group>
        : <p className="dashboard-note"><Icon name="checkCircle" />Nenhuma conta em aberto em {monthName(month)}.</p>}
    </>}</Loaded>
  </DashboardCard>
}

export function FinanceCard(props) {
  return <FinancePrivacy><FinanceSummary {...props} /></FinancePrivacy>
}

// ---------- Site ----------
// One neutral bar per day; today, still in progress, carries the accent and is named on the axis.
function Spark({ series, peak, day }) {
  const max = Math.max(peak.value, 1), current = series.at(-1)
  return <figure className="dashboard-spark">
    <div className="dashboard-spark__bars" role="img" aria-label={`Visualizações por dia nos últimos ${series.length} dias. Maior movimento em ${shortDate(peak.day)}, com ${peak.value.toLocaleString('pt-BR')}. Hoje, até agora: ${current.value.toLocaleString('pt-BR')}.`}>
      {series.map((point, index) => <span key={point.day} className={point.day === day ? 'is-today' : undefined} style={{ '--i': index, height: point.value ? `max(2px, ${point.value / max * 100}%)` : 0 }} title={`${shortDate(point.day)}${point.day === day ? ' (hoje)' : ''}: ${plural(point.value, 'visualização', 'visualizações')}`} />)}
    </div>
    <figcaption className="dashboard-spark__axis" aria-hidden="true"><span>{shortDate(series[0].day)}</span><span>Hoje</span></figcaption>
  </figure>
}

function Portfolio({ content }) {
  if (!content.ready) return content.error
    ? <ErrorState onRetry={() => content.refresh().catch(() => {})}>Não foi possível carregar o portfólio.</ErrorState>
    : <Skeleton label="Carregando o portfólio…" rows={1} />
  const projects = content.draft.projects, published = projects.filter(project => project.status === 'published').length, drafts = projects.filter(project => project.status === 'draft').length
  return <div className="dashboard-portfolio">
    <p><Icon name="film" /><span><strong>{plural(published, 'filme publicado', 'filmes publicados')}</strong>{drafts > 0 && ` · ${plural(drafts, 'rascunho', 'rascunhos')}`}</span></p>
    <nav className="dashboard-portfolio__links" aria-label="Conteúdo do site">
      <Link to="/admin/portfolio">Portfólio<Icon name="right" /></Link>
      <Link to="/admin/inicio">Página inicial<Icon name="right" /></Link>
    </nav>
  </div>
}

export function SiteCard({ insights, site, state, view, content, day }) {
  return <DashboardCard id="site" title="Site" icon="globe" to={insights ? '/admin/insights' : '/admin/portfolio'} area={insights ? 'Insights do site' : 'Portfólio'} state={insights ? state : undefined}>
    {insights && <Loaded state={state} what="os acessos do site" rows={2}>{() => view.totals.view || view.totals.play || view.totals.contact
      ? <div className="dashboard-site">
        <p className="dashboard-figure"><strong><CountUp value={view.totals.view} /></strong><span>visualizações de páginas · 30 dias</span></p>
        {view.max > 0 && <Spark series={view.series} peak={view.peak} day={day} />}
        <dl className="dashboard-mini">
          <div><dt>Aberturas de filmes</dt><dd>{view.totals.play.toLocaleString('pt-BR')}</dd></div>
          <div><dt>Cliques de contato</dt><dd>{view.totals.contact.toLocaleString('pt-BR')}</dd></div>
        </dl>
      </div>
      : <EmptyState icon="trend" title="Ainda sem visitas registradas">Os acessos dos últimos 30 dias aparecem aqui assim que o site receber visitas.</EmptyState>}</Loaded>}
    {site && <Portfolio content={content} />}
  </DashboardCard>
}

// ---------- Social Media ----------
function PostRow({ post, day, failed }) {
  const [format, icon] = socialFormats[post.format] || ['Publicação', 'instagram']
  const when = failed ? '' : `${post.status === 'publishing' ? 'Em envio · ' : ''}${whenLabel(post.scheduled_at, day)}`
  return <Link className="dashboard-row" to={`/admin/social/calendario?post=${post.id}`}>
    <span className="dashboard-icon" aria-hidden="true"><Icon name={icon} /></span>
    <span className="dashboard-row__main">
      <span className="dashboard-row__title">{captionLine(post.caption) || `${format} sem legenda`}</span>
      <span className="dashboard-row__meta">{[format, post.account && `@${post.account.username}`, when].filter(Boolean).join(' · ')}</span>
      {failed && <span className="dashboard-row__reason">{post.last_error || 'Não foi possível publicar.'}</span>}
    </span>
  </Link>
}

export function SocialCard({ state, view, day }) {
  return <DashboardCard id="social" title="Social Media" icon="instagram" to="/admin/social" state={state}>
    <Loaded state={state} what="as publicações" rows={2}>{() => !view.connected
      ? <EmptyState icon="instagram" title="Instagram não conectado" action={<Link className="admin-button admin-button--secondary admin-button--sm" to="/admin/social/conexao"><Icon name="plug" />Abrir conexão</Link>}>Conecte a conta da DUUK para publicar e agendar pelo painel.</EmptyState>
      : <>
        {view.attention.map(account => <p key={account.id} className="ds-alert ds-alert--warning dashboard-alert" role="status"><Icon name="warning" /><span>@{account.username} precisa ser reconectada. <Link to="/admin/social/conexao">Abrir conexão</Link></span></p>)}
        {view.failed.length > 0 && <Group label="Com falha" count={view.failed.length}>
          <ul className="dashboard-list" role="list">{view.failed.slice(0, 2).map(post => <li key={post.id}><PostRow post={post} day={day} failed /></li>)}</ul>
        </Group>}
        {view.upcoming.length
          ? <Group label="Próximas publicações" count={view.upcoming.length}>
            <ul className="dashboard-list" role="list">{view.upcoming.slice(0, 3).map(post => <li key={post.id}><PostRow post={post} day={day} /></li>)}</ul>
            {view.upcoming.length > 3 && <Link className="dashboard-more" to="/admin/social/calendario">Mais {view.upcoming.length - 3}<Icon name="right" /></Link>}
          </Group>
          : <EmptyState icon="calendarClock" title="Nada agendado" action={<Link className="admin-button admin-button--secondary admin-button--sm" to="/admin/social/publicar"><Icon name="plus" />Nova publicação</Link>}>Agende uma publicação e o servidor publica no horário, mesmo com o painel fechado.</EmptyState>}
      </>}</Loaded>
  </DashboardCard>
}

// ---------- Quick actions ----------
export function QuickActionsCard({ actions }) {
  return <DashboardCard id="actions" title="Ações rápidas" icon="zap">
    <ul className="dashboard-actions" role="list">{actions.map(action => <li key={action.id}>
      <Link className="dashboard-action" to={action.to}><Icon name={action.icon} /><span>{action.label}</span></Link>
    </li>)}</ul>
  </DashboardCard>
}
