import { useCallback, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ConfirmModal, Icon, Modal } from '../admin/components'
import { EmptyState, ErrorState, LoadingPanel, Pagination, SearchField } from '../admin/forms'
import { matchesQuery, usePagination } from '../admin/ds/list'
import { useQuery } from '../office/useQuery'
import { deletePost, loadEvents, publishNow, unschedulePost } from './api'
import { dayKey, formatDateTime, formatLabels, formatTime, monthGrid, monthLabel, postDate, postSummary, shiftMonth, statusLabels } from './model'
import { FormatTag, NotConnected, StatusBadge, Thumb } from './parts'
import { previewPath, useSignedUrls } from './previews'
import { useSocial } from './context'

const statusFilters = ['all', 'scheduled', 'draft', 'publishing', 'published', 'failed']
const weekdays = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

export default function SocialCalendar() {
  const { status, accounts, posts, postsQuery } = useSocial()
  const [params, setParams] = useSearchParams()
  const [view, setView] = useState(() => { try { return localStorage.getItem('duuk-social-calendar-view') || (window.matchMedia?.('(max-width: 599px)').matches ? 'list' : 'month') } catch { return 'month' } })
  const [month, setMonth] = useState(() => dayKey(Date.now()).slice(0, 7))
  const [query, setQuery] = useState('')
  const filter = statusFilters.includes(params.get('status')) ? params.get('status') : 'all'
  const selected = posts.find(post => post.id === params.get('post')) || null
  const setFilter = value => setParams(previous => { const next = new URLSearchParams(previous); if (value === 'all') next.delete('status'); else next.set('status', value); return next }, { replace: true })
  const open = post => setParams(previous => { const next = new URLSearchParams(previous); next.set('post', post.id); return next })
  const close = () => setParams(previous => { const next = new URLSearchParams(previous); next.delete('post'); return next }, { replace: true })
  const choose = value => { setView(value); try { localStorage.setItem('duuk-social-calendar-view', value) } catch { /* preference lasts for this visit */ } }
  const visible = useMemo(() => posts.filter(post => (filter === 'all' || post.status === filter) && matchesQuery(query, post.caption, formatLabels[post.format], statusLabels[post.status])), [posts, filter, query])
  const counts = useMemo(() => Object.fromEntries(statusFilters.map(key => [key, key === 'all' ? posts.length : posts.filter(post => post.status === key).length])), [posts])
  if (!status.configured && !accounts.length) return <NotConnected status={status} />
  if (postsQuery.loading && !postsQuery.data) return <LoadingPanel label="Carregando o calendário…" />
  return <div className="social-calendar">
    {postsQuery.error && <ErrorState onRetry={postsQuery.reload}>{postsQuery.error}</ErrorState>}
    <div className="ds-toolbar social-toolbar">
      <div className="ds-toolbar__filters">
        <SearchField value={query} onChange={setQuery} label="Buscar publicações" placeholder="Texto da legenda" />
        <label className="ds-select-label"><span className="ds-visually-hidden">Situação</span><select className="ds-input ds-select" value={filter} onChange={event => setFilter(event.target.value)}>{statusFilters.map(key => <option key={key} value={key}>{key === 'all' ? 'Todas as situações' : statusLabels[key]} ({counts[key]})</option>)}</select></label>
      </div>
      <div className="social-toolbar__end">
        <div className="ds-segmented" role="group" aria-label="Visualização"><button type="button" aria-pressed={view === 'month'} onClick={() => choose('month')}><Icon name="calendar" />Mês</button><button type="button" aria-pressed={view === 'list'} onClick={() => choose('list')}><Icon name="list" />Lista</button></div>
        <Link className="admin-button" to="/admin/social/publicar"><Icon name="plus" />Nova publicação</Link>
      </div>
    </div>
    {view === 'month' ? <MonthView month={month} setMonth={setMonth} posts={visible} onOpen={open} /> : <ListView posts={visible} onOpen={open} total={posts.length} />}
    {selected && <PostDetails post={selected} onClose={close} />}
  </div>
}

function MonthView({ month, setMonth, posts, onOpen }) {
  const [today] = useState(() => dayKey(Date.now()))
  const byDay = useMemo(() => {
    const map = new Map()
    for (const post of posts) { const when = postDate(post); if (!when) continue; const key = dayKey(when); map.set(key, [...(map.get(key) || []), post]) }
    for (const list of map.values()) list.sort((a, b) => new Date(postDate(a)) - new Date(postDate(b)))
    return map
  }, [posts])
  const undated = posts.filter(post => !postDate(post))
  const cells = monthGrid(month)
  return <section className="ds-card social-month">
    <div className="social-month__head">
      <h2>{monthLabel(month)}</h2>
      <div className="social-month__nav">
        <button type="button" className="admin-icon-button" aria-label="Mês anterior" onClick={() => setMonth(shiftMonth(month, -1))}><Icon name="left" /></button>
        <button type="button" className="admin-button admin-button--secondary admin-button--sm" onClick={() => setMonth(today.slice(0, 7))}>Hoje</button>
        <button type="button" className="admin-icon-button" aria-label="Próximo mês" onClick={() => setMonth(shiftMonth(month, 1))}><Icon name="right" /></button>
      </div>
    </div>
    <div className="social-month__grid" role="grid" aria-label={`Publicações de ${monthLabel(month)}`}>
      {weekdays.map(day => <span key={day} className="social-month__weekday" role="columnheader">{day}</span>)}
      {cells.map(cell => {
        const list = byDay.get(cell.key) || []
        return <div key={cell.key} role="gridcell" className={`social-month__cell${cell.inMonth ? '' : ' is-outside'}${cell.key === today ? ' is-today' : ''}`} aria-label={`${cell.day}${list.length ? `, ${list.length} publicação(ões)` : ''}`}>
          <span className="social-month__day">{cell.day}</span>
          {list.slice(0, 3).map(post => <button key={post.id} type="button" className={`social-chip is-${post.status}`} onClick={() => onOpen(post)} title={postSummary(post)}>
            <i aria-hidden="true" /><span>{formatTime(postDate(post))}<span className="social-chip__format"> · {formatLabels[post.format]}</span></span><span className="ds-visually-hidden">, {statusLabels[post.status]}</span>
          </button>)}
          {list.length > 3 && <button type="button" className="social-chip is-more" onClick={() => onOpen(list[3])}>+{list.length - 3}</button>}
        </div>
      })}
    </div>
    <p className="social-legend" aria-hidden="true">{['scheduled', 'publishing', 'published', 'failed'].map(key => <span key={key} className={`is-${key}`}><i />{statusLabels[key]}</span>)}</p>
    {undated.length > 0 && <p className="social-muted">{undated.length} rascunho(s) sem data aparecem na lista.</p>}
  </section>
}

function ListView({ posts, onOpen, total }) {
  const sorted = useMemo(() => [...posts].sort((a, b) => new Date(postDate(b) || b.updated_at) - new Date(postDate(a) || a.updated_at)), [posts])
  const pager = usePagination(sorted, { pageSize: 25, resetKey: posts.length })
  const urls = useSignedUrls(pager.items.map(post => previewPath(post.media?.[0])))
  if (!sorted.length) return <div className="admin-panel"><EmptyState icon="calendar" title={total ? 'Nada encontrado' : 'Nenhuma publicação ainda'} action={<Link className="admin-button" to="/admin/social/publicar"><Icon name="plus" />Nova publicação</Link>}>{total ? 'Ajuste a busca ou a situação.' : 'Crie um rascunho ou agende a primeira publicação.'}</EmptyState></div>
  return <section className="admin-panel">
    <ul className="social-post-list">{pager.items.map(post => <li key={post.id}><button type="button" className="social-line" onClick={() => onOpen(post)}>
      <Thumb item={post.media?.[0]} url={urls[previewPath(post.media?.[0])]} />
      <span className="social-line__main"><strong>{postSummary(post)}</strong><small><FormatTag format={post.format} /> · {post.status === 'published' ? `Publicada em ${formatDateTime(post.published_at)}` : post.scheduled_at ? `${post.status === 'draft' ? 'Planejada' : 'Agendada'} para ${formatDateTime(post.scheduled_at)}` : `Atualizada em ${formatDateTime(post.updated_at)}`}</small></span>
      <StatusBadge status={post.status} />
    </button></li>)}</ul>
    <Pagination pager={pager} noun="publicações" />
  </section>
}

function PostDetails({ post, onClose }) {
  const { accounts, postsQuery, notify } = useSocial()
  const navigate = useNavigate()
  const account = accounts.find(item => item.id === post.account_id)
  const events = useQuery(useCallback(() => loadEvents(post.id), [post.id, post.version])) // eslint-disable-line react-hooks/exhaustive-deps
  const urls = useSignedUrls((post.media || []).map(previewPath))
  const [confirm, setConfirm] = useState(null)
  const canEdit = ['draft', 'scheduled', 'failed'].includes(post.status)
  const run = async (action) => {
    if (action === 'unschedule') { await unschedulePost(post); notify('Agendamento cancelado. A publicação voltou para rascunho.') }
    if (action === 'delete') { await deletePost(post); notify('Publicação excluída.'); onClose() }
    if (action === 'publish') {
      const result = await publishNow(post)
      notify(result?.outcome === 'published' ? 'Publicado no Instagram.' : result?.outcome === 'waiting' ? 'O Instagram está processando a mídia. O DUUK conclui o envio sozinho.' : result?.post?.last_error || 'Não foi possível publicar agora.', !['published', 'waiting'].includes(result?.outcome))
    }
    await postsQuery.reload()
  }
  return <Modal wide title={postSummary(post)} subtitle={`${formatLabels[post.format]} · @${account?.username || 'conta removida'}`} onClose={onClose}>
    <div className="admin-modal__body social-details">
      <div className="social-details__status"><StatusBadge status={post.status} /><span>{post.status === 'published' ? `Publicada em ${formatDateTime(post.published_at)}` : post.status === 'scheduled' ? `Agendada para ${formatDateTime(post.scheduled_at)} (Brasília)` : post.status === 'publishing' ? (post.next_attempt_at ? `Próxima verificação às ${formatTime(post.next_attempt_at)}` : 'Enviando ao Instagram') : post.status === 'failed' ? 'O envio não foi concluído' : 'Rascunho, não será publicado sozinho'}</span></div>
      {post.status === 'failed' && post.last_error && <p className="admin-error" role="alert">{post.last_error}</p>}
      {post.status === 'publishing' && <p className="ds-alert ds-alert--info"><Icon name="info" /><span>O servidor da DUUK acompanha o processamento no Instagram e conclui sozinho. Não é preciso deixar esta tela aberta.</span></p>}
      <ul className="social-details__media">{(post.media || []).map(item => <li key={item.position}><Thumb item={item} url={urls[previewPath(item)]} label={item.alt_text} />{item.alt_text && <small>Alt: {item.alt_text}</small>}</li>)}</ul>
      {post.caption ? <p className="social-details__caption">{post.caption}</p> : <p className="social-muted">Sem legenda.</p>}
      {post.permalink && <a className="admin-button admin-button--secondary" href={post.permalink} target="_blank" rel="noreferrer noopener"><Icon name="external" />Abrir no Instagram</a>}
      <h3 className="social-details__subtitle">Histórico</h3>
      {events.error ? <ErrorState onRetry={events.reload}>{events.error}</ErrorState> : <ol className="social-timeline">{(events.data || []).map(event => <li key={event.id}><span>{formatDateTime(event.created_at)}</span><p>{event.message || event.kind}</p></li>)}{events.loading && !events.data && <li className="ds-skeleton ds-skeleton--text" />}</ol>}
    </div>
    <div className="admin-modal__foot social-details__actions">
      {['draft', 'scheduled', 'failed'].includes(post.status) && <button type="button" className="admin-button admin-button--ghost admin-button--danger" onClick={() => setConfirm('delete')}><Icon name="trash" />Excluir</button>}
      {post.status === 'scheduled' && <button type="button" className="admin-button admin-button--secondary" onClick={() => setConfirm('unschedule')}>Cancelar agendamento</button>}
      {canEdit && <button type="button" className="admin-button admin-button--secondary" onClick={() => navigate(`/admin/social/publicar?post=${post.id}`)}><Icon name="edit" />Editar</button>}
      {canEdit && account?.status === 'active' && <button type="button" className="admin-button" onClick={() => setConfirm('publish')}><Icon name="send" />{post.status === 'failed' ? 'Tentar publicar de novo' : 'Publicar agora'}</button>}
    </div>
    {confirm === 'delete' && <ConfirmModal title="Excluir publicação" message="A publicação ainda não enviada sai do calendário. Os arquivos continuam na biblioteca." action="Excluir publicação" onClose={() => setConfirm(null)} onConfirm={() => run('delete')} />}
    {confirm === 'unschedule' && <ConfirmModal title="Cancelar agendamento" message="A publicação volta para rascunho e não será enviada no horário marcado." action="Cancelar agendamento" onClose={() => setConfirm(null)} onConfirm={() => run('unschedule')} />}
    {confirm === 'publish' && <ConfirmModal tone="default" title="Publicar agora no Instagram?" message={`A publicação vai para @${account?.username} de verdade, visível para os seguidores. Para remover depois, será preciso apagar no próprio Instagram.`} action="Publicar agora" onClose={() => setConfirm(null)} onConfirm={() => run('publish')} />}
  </Modal>
}
