import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon, RefreshButton } from '../admin/components'
import { ErrorState } from '../admin/forms'
import { useQuery } from '../office/useQuery'
import { loadSnapshots, socialRequest } from './api'
import { dayKey, formatCompact, formatDateTime, formatDay, formatDuration, formatNumber } from './model'
import { Metric, NotConnected } from './parts'
import { useSocial } from './context'
import TrendChart from './TrendChart'

const ranges = [7, 14, 28]
// Account totals, in the order a person reads them: who saw, who acted, what they did.
const accountTiles = [
  ['reach', 'Alcance', 'eye', 'Contas únicas que viram o conteúdo'],
  ['views', 'Visualizações', 'play', 'Vezes que o conteúdo foi exibido'],
  ['accounts_engaged', 'Contas com interação', 'users', 'Curtiram, comentaram, salvaram ou compartilharam'],
  ['total_interactions', 'Interações', 'activity', 'Soma de curtidas, comentários, salvamentos, compartilhamentos e respostas'],
  ['likes', 'Curtidas', 'heart'],
  ['comments', 'Comentários', 'comment'],
  ['shares', 'Compartilhamentos', 'share'],
  ['saves', 'Salvamentos', 'bookmark'],
  ['replies', 'Respostas a Stories', 'reply'],
  ['profile_links_taps', 'Toques em links do perfil', 'link'],
]
const columns = [
  ['reach', 'Alcance'], ['views', 'Visualizações'], ['total_interactions', 'Interações'],
  ['likes', 'Curtidas'], ['comments', 'Comentários'], ['shares', 'Compart.'], ['saved', 'Salvos'],
]
const sorts = { recent: 'Mais recentes', reach: 'Maior alcance', views: 'Mais visualizações', total_interactions: 'Mais interações' }
const kindLabel = item => item.media_product_type === 'REELS' ? 'Reel' : item.media_type === 'CAROUSEL_ALBUM' ? 'Carrossel' : item.media_type === 'VIDEO' ? 'Vídeo' : 'Foto'

export default function SocialInsights() {
  const { status, active, accounts } = useSocial()
  const [accountId, setAccountId] = useState(null)
  const [days, setDays] = useState(28)
  const account = active.find(item => item.id === accountId) || active[0] || null
  if (!status.configured || !accounts.length) return <NotConnected status={status} />
  if (!account) return <NotConnected status={status} title="Nenhuma conta ativa">Reconecte a conta do Instagram para consultar as métricas.</NotConnected>
  const allowed = (account.permissions || []).includes('instagram_business_manage_insights')
  return <div className="social-insights">
    <div className="ds-toolbar social-insights__toolbar">
      {active.length > 1 && <div className="ds-segmented" role="group" aria-label="Conta">{active.map(item => <button key={item.id} type="button" aria-pressed={item.id === account.id} onClick={() => setAccountId(item.id)}>@{item.username}</button>)}</div>}
      <div className="ds-segmented" role="group" aria-label="Período">{ranges.map(range => <button key={range} type="button" aria-pressed={range === days} onClick={() => setDays(range)}>{range} dias</button>)}</div>
    </div>
    {allowed ? <Report key={`${account.id}:${days}`} account={account} days={days} />
      : <div className="ds-alert ds-alert--warning" role="alert"><Icon name="key" /><span>A conta @{account.username} não concedeu a permissão de métricas ao conectar. Reconecte e aceite todas as permissões para ver os insights.</span><Link className="admin-button admin-button--secondary admin-button--sm" to="/admin/social/conexao">Conexão</Link></div>}
    <Followers account={account} days={days} />
  </div>
}

function Report({ account, days }) {
  const query = useQuery(useCallback(() => socialRequest({ action: 'insights', account_id: account.id, days }), [account.id, days]))
  const [sort, setSort] = useState('recent')
  const data = query.data
  const refresh = async () => {
    try { const fresh = await socialRequest({ action: 'insights', account_id: account.id, days, force: true }); query.updateData(() => fresh); return fresh }
    catch (cause) { return { failed: true, error: cause.message } }
  }
  const media = useMemo(() => {
    const list = [...(data?.media || [])]
    if (sort === 'recent') return list.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))
    // Unavailable values go last instead of counting as zero.
    return list.sort((a, b) => (Number.isFinite(b.metrics?.[sort]) ? b.metrics[sort] : -1) - (Number.isFinite(a.metrics?.[sort]) ? a.metrics[sort] : -1))
  }, [data, sort])
  if (query.error && !data) return <ErrorState onRetry={query.reload}>{query.error}</ErrorState>
  const period = data ? `${formatDay(data.since, { day: 'numeric', month: 'short' })} a ${formatDay(data.until, { day: 'numeric', month: 'short' })}` : ''
  return <>
    <section className="ds-card social-insights__totals" aria-busy={query.loading}>
      <div className="ds-card__head">
        <div><h2>Conta @{account.username}</h2><p>{data ? `Últimos ${data.days} dias · ${period}` : `Últimos ${days} dias`}</p></div>
        <RefreshButton onRefresh={refresh} label="Atualizar métricas" inlineFeedback />
      </div>
      {!data ? <div className="social-insights__grid">{accountTiles.slice(0, 4).map(([key]) => <span key={key} className="ds-skeleton social-insights__skeleton" />)}</div>
        : <div className="social-insights__grid">{accountTiles.map(([key, label, icon, note]) => <Metric key={key} label={label} icon={icon} note={note} value={Number.isFinite(data.account?.[key]) ? formatNumber(data.account[key]) : null} />)}</div>}
      <p className="social-muted">Números do Instagram. Algumas métricas chegam com até 48 horas de atraso; “Indisponível” significa que a Meta não informa esse dado para a conta ou o período.{data?.fetched_at ? ` Consultado em ${formatDateTime(data.fetched_at)}.` : ''}</p>
    </section>

    <section className="ds-card social-insights__posts">
      <div className="ds-card__head">
        <div><h2>Publicações recentes</h2><p>As 12 últimas do feed, com os números de cada uma desde a publicação.</p></div>
        <label className="admin-field social-insights__sort"><span>Ordenar</span>
          <select value={sort} onChange={event => setSort(event.target.value)}>{Object.entries(sorts).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
        </label>
      </div>
      {!data ? <div className="admin-query-skeleton" aria-busy="true"><span /><span /><span /></div>
        : !media.length ? <p className="social-muted">A conta ainda não tem publicações no feed.</p>
          : <div className="ds-table-wrap"><table className="ds-table social-insights__table">
            <caption className="ds-visually-hidden">Métricas das publicações recentes</caption>
            <thead><tr><th scope="col">Publicação</th>{columns.map(([key, label]) => <th key={key} scope="col" className="is-number">{label}</th>)}</tr></thead>
            <tbody>{media.map(item => <tr key={item.id}>
              <th scope="row">
                <span className="social-insights__post">
                  <span className="social-thumb social-thumb--sm">{item.thumbnail_url || item.media_url ? <img src={item.media_type === 'VIDEO' ? item.thumbnail_url || '' : item.media_url || item.thumbnail_url} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <Icon name="instagram" size={18} />}</span>
                  <span className="social-insights__caption">
                    <strong>{item.caption ? item.caption.replace(/\s+/g, ' ').slice(0, 70) + (item.caption.length > 70 ? '…' : '') : 'Sem legenda'}</strong>
                    <small>{kindLabel(item)} · {item.timestamp ? formatDateTime(item.timestamp) : 'data não informada'}{Number.isFinite(item.metrics?.ig_reels_avg_watch_time) ? ` · ${formatDuration(item.metrics.ig_reels_avg_watch_time)} assistidos em média` : ''}</small>
                    {item.permalink && <a className="admin-text-button" href={item.permalink} target="_blank" rel="noreferrer noopener">Abrir no Instagram<Icon name="external" size={13} /></a>}
                  </span>
                </span>
              </th>
              {columns.map(([key, label]) => <td key={key} className="is-number" data-label={label}>{item.metrics ? Number.isFinite(item.metrics[key]) ? formatCompact(item.metrics[key]) : <span className="social-muted" title="A Meta não informa esta métrica para este formato">—</span> : <span className="social-muted" title="Não foi possível consultar esta publicação">—</span>}</td>)}
            </tr>)}</tbody>
          </table></div>}
    </section>
  </>
}

function Followers({ account, days }) {
  const query = useQuery(useCallback(() => loadSnapshots(account.id), [account.id]))
  const [today] = useState(() => dayKey(Date.now()))
  const points = useMemo(() => {
    const rows = query.data || []
    if (!rows.length) return []
    const byDay = new Map(rows.map(row => [row.day, row.followers_count]))
    const output = []
    for (let offset = days - 1; offset >= 0; offset--) {
      const day = new Date(new Date(`${today}T12:00:00Z`).getTime() - offset * 86400000).toISOString().slice(0, 10)
      output.push({ day, value: byDay.has(day) ? byDay.get(day) : null })
    }
    return output
  }, [query.data, days, today])
  const known = points.filter(point => Number.isFinite(point.value))
  const change = known.length > 1 ? known[known.length - 1].value - known[0].value : null
  return <section className="ds-card social-growth">
    <div className="ds-card__head"><div><h2>Seguidores</h2><p>Registro diário feito pelo DUUK a partir do perfil. Dias sem registro ficam em branco.</p></div>
      {change !== null && <span className={`social-change${change > 0 ? ' is-up' : change < 0 ? ' is-down' : ''}`}><Icon name={change >= 0 ? 'outgoing' : 'incoming'} size={14} />{change > 0 ? '+' : change < 0 ? '−' : ''}{formatNumber(Math.abs(change))} em {days} dias</span>}
    </div>
    {query.error ? <ErrorState onRetry={query.reload}>{query.error}</ErrorState>
      : known.length > 1 ? <TrendChart points={points} label={`Seguidores nos últimos ${days} dias`} />
        : <p className="social-muted">{query.loading ? 'Carregando…' : 'A evolução aparece a partir do segundo dia de registro no período. O DUUK consulta o perfil uma vez por dia.'}</p>}
  </section>
}
