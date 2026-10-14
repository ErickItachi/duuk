import { useCallback, useState } from 'react'
import { Icon, RefreshButton } from '../admin/components'
import { EmptyState, ErrorState, PageTitle } from '../admin/forms'
import { listMetrics } from './api'
import { dateLabel, metricSummary } from './model'
import { useQuery } from './useQuery'
import { dayParts, niceTicks, periodDays, shortDate } from './officeHelpers'

const group = (records, key) => Object.entries(records.reduce((out, r) => ({ ...out, [r[key]]: (out[r[key]] || 0) + Number(r.count) }), {})).sort((a, b) => b[1] - a[1])
const periods = [[7, '7 dias'], [30, '30 dias'], [90, '90 dias']]
const number = value => value.toLocaleString('pt-BR')
const views = value => `${number(value)} ${value === 1 ? 'visualização' : 'visualizações'}`

function BarList({ rows, labels = {}, label }) {
  const max = Math.max(...rows.map(r => r[1]), 1)
  if (!rows.length) return <p className="office-muted">Os dados aparecerão após as primeiras visitas.</p>
  return (
    <ul className="office-bars" aria-label={label}>
      {rows.map(([key, value]) => (
        <li key={key}>
          <i style={{ width: `${value / max * 100}%` }} aria-hidden="true" />
          <span>{labels[key] || key}</span>
          <strong>{number(value)}</strong>
        </li>
      ))}
    </ul>
  )
}

// Daily views as bars on a zero baseline, with round ticks and a tooltip for the bar under the pointer.
function DailyChart({ series }) {
  const [active, setActive] = useState(null)
  const count = series.length, max = Math.max(...series.map(d => d.value), 0), ticks = niceTicks(max), top = ticks[ticks.length - 1]
  const step = Math.max(1, Math.ceil(count / 6)), labels = series.map((_, index) => index === 0 || index === count - 1 || (index % step === 0 && count - 1 - index >= step * .6))
  const peak = series.reduce((best, item) => item.value > best.value ? item : best, series[0]), total = series.reduce((sum, item) => sum + item.value, 0)
  const pick = event => { const rect = event.currentTarget.getBoundingClientRect(); setActive(Math.min(count - 1, Math.max(0, Math.floor((event.clientX - rect.left) / rect.width * count)))) }
  const point = active === null ? null : series[active], center = active === null ? 0 : (active + .5) / count * 100
  const label = day => { const parts = dayParts(day); return `${Number(parts.day)} ${parts.month}` }
  return (
    <figure className="office-chart">
      <figcaption className="ds-visually-hidden">{`Visitas por dia: ${views(total)} no período. Maior movimento em ${dateLabel(peak.day)}, com ${views(peak.value)}. Os valores de cada dia estão na tabela abaixo.`}</figcaption>
      <div className="office-chart__body" aria-hidden="true">
        <div className="office-chart__y">
          <span className="office-chart__sizer">{number(top)}</span>
          {ticks.map(tick => <span key={tick} style={{ bottom: `${tick / top * 100}%` }}>{number(tick)}</span>)}
        </div>
        <div className="office-chart__plot" onPointerMove={pick} onPointerDown={pick} onPointerLeave={event => { if (event.pointerType === 'mouse') setActive(null) }}>
          {ticks.map(tick => <i key={tick} className={`office-chart__grid${tick === 0 ? ' is-base' : ''}`} style={{ bottom: `${tick / top * 100}%` }} />)}
          <div className={`office-chart__bars${count > 45 ? ' is-dense' : ''}`}>
            {series.map((item, index) => <span key={item.day} className={index === active ? 'is-active' : undefined}><b style={{ height: `${item.value / top * 100}%` }} /></span>)}
          </div>
          {point && (
            <div className={`office-chart__tip${center < 18 ? ' is-start' : center > 82 ? ' is-end' : ''}`} style={center < 18 ? { left: 0 } : center > 82 ? { left: '100%' } : { left: `${center}%` }}>
              <span>{shortDate(point.day)}</span>
              <strong>{views(point.value)}</strong>
            </div>
          )}
        </div>
        <div className="office-chart__x">
          {series.map((item, index) => labels[index] && (
            <span key={item.day} className={index === 0 && count > 1 ? 'is-first' : index === count - 1 && count > 1 ? 'is-last' : (index / step) % 2 ? 'is-minor' : undefined} style={index === 0 && count > 1 ? { left: 0 } : index === count - 1 && count > 1 ? { left: '100%' } : { left: `${(index + .5) / count * 100}%` }}>{label(item.day)}</span>
          ))}
        </div>
      </div>
    </figure>
  )
}

function Kpi({ label, loading, value }) {
  return (
    <div>
      <span>{label}</span>
      {loading ? <strong><span className="ds-skeleton office-kpi-skeleton" aria-hidden="true" /><span className="ds-visually-hidden">Carregando</span></strong> : <strong>{value}</strong>}
    </div>
  )
}

export default function InsightsPage() {
  const [days, setDays] = useState(30)
  const query = useCallback(async () => ({ days, records: await listMetrics(days) }), [days])
  const { data, loading, error, reload: load } = useQuery(query)
  const records = data?.records || []
  const totals = metricSummary(records), viewRecords = records.filter(r => r.event === 'view'), timeline = group(viewRecords, 'day')
  const byDay = Object.fromEntries(timeline)
  const series = timeline.length ? [...new Set([...periodDays(data.days), ...Object.keys(byDay)])].sort().map(day => ({ day, value: byDay[day] || 0 })) : []
  const initial = loading && !data, refreshing = loading && Boolean(data), failed = Boolean(error) && !data
  const kpi = value => failed ? '—' : number(value)
  return (
    <>
      <PageTitle eyebrow="ADMINISTRATIVO / SITE" title="Insights" description="Como as pessoas encontram e exploram a DUUK.">
        <div className="ds-segmented office-period" role="group" aria-label="Período dos insights">
          {periods.map(([value, text]) => <button type="button" key={value} aria-pressed={days === value} onClick={() => setDays(value)}><span className="ds-visually-hidden">Últimos </span>{text}</button>)}
        </div>
        <RefreshButton onRefresh={load} />
      </PageTitle>
      <div className={`office-insights${refreshing ? ' is-refreshing' : ''}`} aria-busy={refreshing || undefined}>
        {error && <ErrorState onRetry={load}>{error}</ErrorState>}
        <div className="admin-stats office-stats-3">
          <Kpi label="Visualizações de páginas" loading={initial} value={kpi(totals.view)} />
          <Kpi label="Aberturas de filmes" loading={initial} value={kpi(totals.play)} />
          <Kpi label="Cliques de contato" loading={initial} value={kpi(totals.contact)} />
        </div>
        <section className="admin-panel office-panel" aria-labelledby="insights-daily">
          <div className="office-section-title">
            <div>
              <h2 id="insights-daily">Visitas por dia</h2>
              <p>Páginas abertas nos últimos {data?.days || days} dias.</p>
            </div>
          </div>
          {initial ? <span className="ds-skeleton office-chart-skeleton" role="status"><span className="ds-visually-hidden">Carregando visitas…</span></span> : failed ? null : series.length ? (
            <>
              <DailyChart series={series} />
              <details className="office-chart-table">
                <summary><Icon name="down" />Ver dados em tabela</summary>
                <div className="ds-table-wrap">
                  <table className="ds-table">
                    <caption className="ds-visually-hidden">Visualizações por dia</caption>
                    <thead><tr><th scope="col">Dia</th><th scope="col" className="is-number">Visualizações</th></tr></thead>
                    <tbody>{series.map(item => <tr key={item.day}><td><time dateTime={item.day}>{dateLabel(item.day)}</time></td><td className="is-number">{number(item.value)}</td></tr>)}</tbody>
                  </table>
                </div>
              </details>
            </>
          ) : <EmptyState icon="chart" title="Ainda não há visitas neste período">A coleta começa com esta atualização. Ainda não há histórico neste período.</EmptyState>}
        </section>
        <div className="office-grid">
          <section className="admin-panel office-panel">
            <h2>Páginas mais vistas</h2>
            {initial ? <InsightsSkeleton /> : <BarList label="Páginas mais vistas" rows={group(viewRecords, 'page').slice(0, 8)} labels={{ '/': 'Página inicial', '/portfolio': 'Portfólio', '/sobre': 'Sobre', '/contato': 'Contato' }} />}
          </section>
          <section className="admin-panel office-panel">
            <h2>Origem das visitas</h2>
            {initial ? <InsightsSkeleton /> : <BarList label="Origem das visitas" rows={group(viewRecords, 'source')} />}
          </section>
          <section className="admin-panel office-panel">
            <h2>Dispositivos</h2>
            {initial ? <InsightsSkeleton /> : <BarList label="Dispositivos" rows={group(viewRecords, 'device')} labels={{ mobile: 'Celular', desktop: 'Computador' }} />}
          </section>
          <section className="admin-panel office-panel">
            <h2>Sobre os números</h2>
            <p className="office-muted">Visualizações contam páginas abertas, não pessoas únicas. Aberturas de filmes contam cliques no player. Cliques de contato incluem e-mail, WhatsApp e o formulário.</p>
            <p className="office-muted">Dados agregados, sem cookies de análise ou identificação individual de visitantes. O painel, as assinaturas e acessos com a conta administrativa não entram na coleta. Bloqueadores podem reduzir a contagem.</p>
          </section>
        </div>
      </div>
    </>
  )
}

function InsightsSkeleton() {
  return (
    <div className="office-skeleton-stack" aria-hidden="true">
      <span className="ds-skeleton office-bar-skeleton" />
      <span className="ds-skeleton office-bar-skeleton" />
      <span className="ds-skeleton office-bar-skeleton" />
    </div>
  )
}
