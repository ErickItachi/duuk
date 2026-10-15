import { useId } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../../admin/components'
import { addDays } from '../calendarModel'
import { CountUp } from './cards'
import { shortDate, weekday } from './model'
import './studio-pulse.css'

// These charts use only sources already loaded for this member's dashboard.
// Missing or failed sources stay unavailable; zero is reserved for a successful query.
function PulseCard({ title, icon, to, source, value, label, children }) {
  const ready = source.data != null
  return <Link className="studio-pulse__card" to={to} aria-busy={source.loading || undefined}>
    <div className="studio-pulse__heading"><span><Icon name={icon} />{title}</span><Icon name="arrow" size={16} /></div>
    {ready ? <>
      <div className="studio-pulse__content"><div className="studio-pulse__value"><strong><CountUp value={value} /></strong><span>{label}</span></div>{children}</div>
      {source.error && <small className="studio-pulse__error">Última consulta · não foi possível atualizar</small>}
    </> : source.error ? <p className="studio-pulse__unavailable"><Icon name="cloudAlert" />Não foi possível consultar. Abrir {title.toLowerCase()}.</p> : <div className="studio-pulse__loading" role="status"><span className="ds-visually-hidden">Carregando {title.toLowerCase()}…</span><span className="ds-skeleton" /><span className="ds-skeleton" /></div>}
  </Link>
}

function AgendaBars({ events, day }) {
  const series = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(day, index)
    return { day: date, value: events.filter(event => !['cancelled', 'done'].includes(event.status) && event.start_date <= date && event.end_date >= date).length }
  })
  const max = Math.max(1, ...series.map(point => point.value))
  return <div className="studio-pulse__bars" role="img" aria-label={`Agenda dos próximos sete dias. ${series.map(point => `${shortDate(point.day)}: ${point.value}`).join('; ')}.`}>
    {series.map((point, index) => <span className={index === 0 ? 'is-today' : ''} key={point.day} title={`${shortDate(point.day)} · ${point.value} compromisso(s)`}><i style={{ '--bar': `${point.value / max * 100}%`, '--i': index }} /><small>{weekday(point.day).slice(0, 1).toUpperCase()}</small></span>)}
  </div>
}

function PipelineRing({ view }) {
  const total = view.open + view.won + view.lost
  const won = total ? view.won / total * 100 : 0, open = total ? view.open / total * 100 : 0
  return <div className="studio-pulse__ring" role="img" aria-label={`${view.open} oportunidades abertas, ${view.won} ganhas e ${view.lost} perdidas.`}>
    <svg viewBox="0 0 100 100" aria-hidden="true"><circle className="studio-pulse__ring-track" cx="50" cy="50" r="39" />{total > 0 && <>
      <circle className="studio-pulse__ring-open" cx="50" cy="50" r="39" pathLength="100" strokeDasharray={`${open} ${100 - open}`} />
      <circle className="studio-pulse__ring-won" cx="50" cy="50" r="39" pathLength="100" strokeDasharray={`${won} ${100 - won}`} strokeDashoffset={-open} />
    </>}</svg><Icon name="pipeline" size={20} />
  </div>
}

function AudienceLine({ view }) {
  const id = useId().replaceAll(':', ''), max = Math.max(1, view.max)
  const points = view.series.map((point, index) => `${index / Math.max(1, view.series.length - 1) * 200},${64 - point.value / max * 54}`).join(' ')
  return <svg className="studio-pulse__line" viewBox="0 0 200 80" role="img" aria-label={`Visualizações por dia nos últimos 30 dias. Pico: ${view.peak.value} em ${shortDate(view.peak.day)}.`}>
    <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop stopColor="currentColor" stopOpacity=".24" /><stop offset="1" stopColor="currentColor" stopOpacity="0" /></linearGradient></defs>
    <path className="studio-pulse__line-grid" d="M0 16H200 M0 40H200 M0 64H200" />
    <polygon points={`0,80 ${points} 200,80`} fill={`url(#${id})`} />
    <polyline points={points} pathLength="1" />
  </svg>
}

export default function StudioPulse({ can, data, views, day }) {
  const cards = []
  if (can.agenda) {
    const events = data.events.data || [], end = addDays(day, 6)
    const count = events.filter(event => !['done', 'cancelled'].includes(event.status) && event.start_date <= end && event.end_date >= day).length
    cards.push(<PulseCard key="agenda" title="Agenda" icon="calendar" to="/admin/agenda" source={data.events} value={count} label="compromissos · próximos 7 dias"><AgendaBars events={events} day={day} /></PulseCard>)
  }
  if (can.pipeline) cards.push(<PulseCard key="pipeline" title="Comercial" icon="pipeline" to="/admin/comercial/pipeline" source={data.clients} value={views.pipeline?.open || 0} label="oportunidades em aberto">{views.pipeline && <PipelineRing view={views.pipeline} />}</PulseCard>)
  if (can.insights) cards.push(<PulseCard key="insights" title="Audiência" icon="activity" to="/admin/insights" source={data.metrics} value={views.metrics?.totals.view || 0} label="visualizações do site · 30 dias">{views.metrics && <AudienceLine view={views.metrics} />}</PulseCard>)
  if (cards.length < 3 && can.contracts) cards.push(<PulseCard key="contracts" title="Contratos" icon="document" to="/admin/contratos" source={data.contracts} value={views.contracts?.signed || 0} label="contratos assinados"><span className="studio-pulse__seal" aria-hidden="true"><Icon name="badgeCheck" size={40} /></span></PulseCard>)
  if (!cards.length) return null
  return <section className="studio-pulse" aria-label="O estúdio em números">{cards}</section>
}
