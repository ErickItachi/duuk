import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../admin/components'
import { ErrorState } from '../admin/forms'
import { useQuery } from '../office/useQuery'
import { loadSnapshots, socialRequest } from './api'
import { daysUntil, formatCompact, formatDateTime, formatNumber, postDate, postSummary } from './model'
import { AccountAvatar, AccountState, FormatTag, NotConnected, StatusBadge, Thumb } from './parts'
import { previewPath, useSignedUrls } from './previews'
import { useSocial } from './context'
import TrendChart from './TrendChart'

export default function SocialHome() {
  const { status, accounts, active, posts, postsQuery } = useSocial()
  const [accountId, setAccountId] = useState(null)
  const account = active.find(item => item.id === accountId) || active[0] || null
  const problems = accounts.filter(item => ['expired', 'revoked', 'error'].includes(item.status))
  if (!status.configured || !accounts.length) return <NotConnected status={status} />
  const scoped = account ? posts.filter(post => post.account_id === account.id) : posts
  return <div className="social-home">
    {problems.map(item => <div key={item.id} className="ds-alert ds-alert--warning" role="alert"><Icon name="warning" /><span>@{item.username}: {item.last_error || 'reconecte a conta para voltar a publicar.'}</span><Link className="admin-button admin-button--secondary admin-button--sm" to="/admin/social/conexao">Resolver</Link></div>)}
    {active.length > 1 && <div className="ds-segmented" role="group" aria-label="Conta">{active.map(item => <button key={item.id} type="button" aria-pressed={item.id === account?.id} onClick={() => setAccountId(item.id)}>@{item.username}</button>)}</div>}
    {account ? <AccountSummary account={account} /> : <NotConnected status={status} title="Nenhuma conta ativa">As contas conectadas precisam ser reconectadas antes de publicar e consultar métricas.</NotConnected>}
    <PostStats posts={scoped} loading={postsQuery.loading && !postsQuery.data} />
    {postsQuery.error && <ErrorState onRetry={postsQuery.reload}>{postsQuery.error}</ErrorState>}
    <div className="social-home__grid">
      <Upcoming posts={scoped} />
      <Attention posts={scoped} />
    </div>
    {account && <Growth account={account} />}
    {account && <RecentOnInstagram account={account} />}
  </div>
}

function AccountSummary({ account }) {
  const expires = account.token_expires_at ? daysUntil(account.token_expires_at) : null
  return <section className="ds-card social-account" aria-label="Conta do Instagram">
    <div className="social-account__who">
      <AccountAvatar account={account} size={56} />
      <div><h2>@{account.username}</h2><p>{account.name || 'Conta profissional'}{account.account_type ? ` · ${account.account_type === 'BUSINESS' ? 'Comercial' : account.account_type === 'MEDIA_CREATOR' ? 'Criador de conteúdo' : account.account_type}` : ''}</p></div>
      <AccountState account={account} />
    </div>
    <dl className="social-account__numbers">
      <div><dt>Seguidores</dt><dd>{formatCompact(account.followers_count)}</dd></div>
      <div><dt>Seguindo</dt><dd>{formatCompact(account.follows_count)}</dd></div>
      <div><dt>Publicações</dt><dd>{formatCompact(account.media_count)}</dd></div>
    </dl>
    <p className="social-account__meta">Dados do perfil atualizados em {formatDateTime(account.last_checked_at)}{expires !== null && expires <= 20 ? ` · a autorização vence em ${Math.max(0, expires)} dia(s) e é renovada automaticamente` : ''}.</p>
  </section>
}

function PostStats({ posts, loading }) {
  const [since] = useState(() => Date.now() - 30 * 86400000)
  const count = status => posts.filter(post => post.status === status).length
  const published = posts.filter(post => post.status === 'published' && new Date(post.published_at || post.updated_at).getTime() >= since).length
  const tiles = [
    ['Agendadas', count('scheduled'), 'calendarClock', 'Enviadas pelo servidor no horário'],
    ['Rascunhos', count('draft'), 'edit', 'Ainda não programadas'],
    ['Precisam de atenção', count('failed'), 'alertCircle', 'Falharam ao publicar'],
    ['Publicadas pelo DUUK', published, 'checkCircle', 'Nos últimos 30 dias'],
  ]
  return <div className="admin-stats social-stats" aria-busy={loading}>
    {tiles.map(([label, value, icon, note]) => <div key={label}><span><Icon name={icon} size={14} />{label}</span><strong>{loading ? '—' : formatNumber(value)}</strong><small>{note}</small></div>)}
  </div>
}

function PostLine({ post, urls }) {
  const first = post.media?.[0]
  return <li><Link className="social-line" to={`/admin/social/calendario?post=${post.id}`}>
    <Thumb item={first} url={urls[previewPath(first)]} />
    <span className="social-line__main"><strong>{postSummary(post)}</strong><small><FormatTag format={post.format} />{post.status !== 'failed' && <> · {postDate(post) ? formatDateTime(postDate(post)) : 'sem data definida'}</>}</small>{post.status === 'failed' && <small className="social-line__error">{post.last_error || 'Falhou ao publicar'}</small>}</span>
    <StatusBadge status={post.status} />
  </Link></li>
}

function Upcoming({ posts }) {
  const next = useMemo(() => posts.filter(post => ['scheduled', 'publishing'].includes(post.status)).sort((a, b) => new Date(a.scheduled_at || 0) - new Date(b.scheduled_at || 0)).slice(0, 5), [posts])
  const urls = useSignedUrls(next.map(post => previewPath(post.media?.[0])))
  return <section className="ds-card social-list-card">
    <div className="ds-card__head"><h2>Próximas publicações</h2><Link className="admin-text-button" to="/admin/social/calendario">Calendário</Link></div>
    {next.length ? <ul className="social-lines">{next.map(post => <PostLine key={post.id} post={post} urls={urls} />)}</ul>
      : <div className="social-empty-inline"><p>Nada agendado.</p><Link className="admin-button admin-button--secondary admin-button--sm" to="/admin/social/publicar"><Icon name="compose" />Criar publicação</Link></div>}
  </section>
}

function Attention({ posts }) {
  const failed = useMemo(() => posts.filter(post => post.status === 'failed').slice(0, 5), [posts])
  const drafts = useMemo(() => posts.filter(post => post.status === 'draft').slice(0, Math.max(0, 5 - failed.length)), [posts, failed.length])
  const list = [...failed, ...drafts]
  const urls = useSignedUrls(list.map(post => previewPath(post.media?.[0])))
  return <section className="ds-card social-list-card">
    <div className="ds-card__head"><h2>Para revisar</h2><Link className="admin-text-button" to="/admin/social/calendario?status=failed">Ver todas</Link></div>
    {list.length ? <ul className="social-lines">{list.map(post => <PostLine key={post.id} post={post} urls={urls} />)}</ul> : <div className="social-empty-inline"><p>Nenhuma falha ou rascunho pendente.</p></div>}
  </section>
}

function Growth({ account }) {
  const query = useQuery(useCallback(() => loadSnapshots(account.id), [account.id]))
  const points = useMemo(() => {
    const rows = (query.data || []).slice(-60)
    if (!rows.length) return []
    const byDay = new Map(rows.map(row => [row.day, row.followers_count]))
    const output = []
    for (let time = new Date(`${rows[0].day}T12:00:00Z`).getTime(), end = new Date(`${rows[rows.length - 1].day}T12:00:00Z`).getTime(); time <= end; time += 86400000) {
      const day = new Date(time).toISOString().slice(0, 10)
      output.push({ day, value: byDay.has(day) ? byDay.get(day) : null })
    }
    return output
  }, [query.data])
  const known = points.filter(point => Number.isFinite(point.value))
  const change = known.length > 1 ? known[known.length - 1].value - known[0].value : null
  return <section className="ds-card social-growth">
    <div className="ds-card__head"><div><h2>Seguidores</h2><p>Registro diário feito pelo DUUK a partir do Instagram.</p></div>{change !== null && <span className={`social-change${change > 0 ? ' is-up' : change < 0 ? ' is-down' : ''}`}><Icon name={change >= 0 ? 'outgoing' : 'incoming'} size={14} />{change > 0 ? '+' : change < 0 ? '−' : ''}{formatNumber(Math.abs(change))} no período</span>}</div>
    {query.error ? <ErrorState onRetry={query.reload}>{query.error}</ErrorState>
      : known.length > 1 ? <TrendChart points={points} label="Seguidores por dia" />
        : <p className="social-muted">{query.loading ? 'Carregando…' : 'A evolução aparece a partir do segundo dia de registro. O DUUK consulta o perfil uma vez por dia.'}</p>}
  </section>
}

function RecentOnInstagram({ account }) {
  const query = useQuery(useCallback(() => socialRequest({ action: 'overview', account_id: account.id }), [account.id]))
  const data = query.data
  const quota = data?.limit
  return <section className="ds-card social-recent">
    <div className="ds-card__head"><div><h2>No Instagram agora</h2><p>As últimas publicações da conta, como o Instagram informa.</p></div>
      {quota?.total ? <span className="social-quota" title="Limite da API do Instagram"><Icon name="timer" size={14} />{formatNumber(quota.used)} de {formatNumber(quota.total)} envios em {quota.window_hours} h</span> : null}
    </div>
    {query.error && !data ? <ErrorState onRetry={query.reload}>{query.error}</ErrorState>
      : !data ? <div className="social-recent__grid" aria-busy="true">{Array.from({ length: 6 }, (_, index) => <span key={index} className="ds-skeleton social-recent__skeleton" />)}</div>
        : data.recent.length ? <ul className="social-recent__grid">{data.recent.slice(0, 12).map(item => <li key={item.id}>
          <a href={item.permalink || undefined} target="_blank" rel="noreferrer noopener" aria-label={`Abrir no Instagram: ${item.caption ? item.caption.slice(0, 80) : 'publicação sem legenda'}`}>
            {item.thumbnail_url || item.media_url ? <img src={item.media_type === 'VIDEO' ? item.thumbnail_url || '' : item.media_url || item.thumbnail_url} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <Icon name="instagram" size={22} />}
            <span className="social-recent__meta">{Number.isFinite(item.like_count) && <span><Icon name="heart" size={12} />{formatCompact(item.like_count)}</span>}{Number.isFinite(item.comments_count) && <span><Icon name="comment" size={12} />{formatCompact(item.comments_count)}</span>}</span>
          </a>
        </li>)}</ul> : <p className="social-muted">A conta ainda não tem publicações no feed.</p>}
    {data?.fetched_at && <p className="social-muted social-recent__stamp">Consultado em {formatDateTime(data.fetched_at)}.</p>}
  </section>
}
