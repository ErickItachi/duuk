// Presentation helpers for the Social Media module. Labels and states only describe what the
// database and the official Instagram API report; nothing here invents a metric.
export { captionLimits, captionStats, cropBox, cropRatios, socialFormats, uploadLimitBytes, validatePost } from '../../supabase/functions/_shared/social-rules.mjs'

export const formatLabels = { image: 'Foto', carousel: 'Carrossel', reel: 'Reel', story: 'Story' }
export const formatIcons = { image: 'media', carousel: 'layers', reel: 'clapperboard', story: 'phone2' }
export const statusLabels = { draft: 'Rascunho', scheduled: 'Agendada', publishing: 'Em envio', published: 'Publicada', failed: 'Falhou' }
export const statusTones = { draft: 'neutral', scheduled: 'info', publishing: 'warning', published: 'success', failed: 'danger' }
export const statusIcons = { draft: 'edit', scheduled: 'calendarClock', publishing: 'cloudUpload', published: 'checkCircle', failed: 'alertCircle' }
export const accountStates = {
  active: { label: 'Conectada', tone: 'success', icon: 'checkCircle' },
  expired: { label: 'Autorização expirada', tone: 'danger', icon: 'alertCircle' },
  revoked: { label: 'Acesso removido no Instagram', tone: 'danger', icon: 'xCircle' },
  error: { label: 'Precisa de atenção', tone: 'warning', icon: 'warning' },
  disconnected: { label: 'Desconectada', tone: 'neutral', icon: 'unplug' },
}
export const requiredScopes = Object.freeze([
  { id: 'instagram_business_basic', label: 'Perfil e publicações' },
  { id: 'instagram_business_content_publish', label: 'Publicar conteúdo' },
  { id: 'instagram_business_manage_insights', label: 'Métricas (insights)' },
])

const zone = 'America/Sao_Paulo'
const partsOf = (value, options) => Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: zone, hourCycle: 'h23', ...options }).formatToParts(new Date(value)).map(part => [part.type, part.value]))
export function dayKey(value) { const p = partsOf(value, { year: 'numeric', month: '2-digit', day: '2-digit' }); return `${p.year}-${p.month}-${p.day}` }
export function brasiliaParts(value) { const p = partsOf(value, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` } }
// Brazil has had no daylight saving time since 2019, so Brasília is always UTC−3.
export function fromBrasilia(date, time) { return /^\d{4}-\d{2}-\d{2}$/.test(date || '') && /^\d{2}:\d{2}$/.test(time || '') ? new Date(`${date}T${time}:00-03:00`).toISOString() : null }
export const formatDateTime = value => value ? new Intl.DateTimeFormat('pt-BR', { timeZone: zone, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)).replace(',', ' às') : '—'
export const formatDay = (value, options = { day: 'numeric', month: 'short' }) => new Intl.DateTimeFormat('pt-BR', { timeZone: zone, ...options }).format(new Date(value))
export const formatTime = value => new Intl.DateTimeFormat('pt-BR', { timeZone: zone, hour: '2-digit', minute: '2-digit' }).format(new Date(value))
export const formatNumber = value => Number.isFinite(value) ? new Intl.NumberFormat('pt-BR').format(value) : '—'
export const formatCompact = value => Number.isFinite(value) ? new Intl.NumberFormat('pt-BR', { notation: value >= 10000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value) : '—'
export const formatBytes = bytes => bytes >= 1048576 ? `${(bytes / 1048576).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
export const formatDuration = ms => { const total = Math.round((ms || 0) / 1000); return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}` }

// When a post appears on the calendar: published posts on their real date, the rest on the planned one.
export const postDate = post => post.status === 'published' ? post.published_at || post.updated_at : post.scheduled_at
export const daysUntil = (value, now = Date.now()) => Math.ceil((new Date(value).getTime() - now) / 86400000)

// What the integration can do right now, separating what works for the app's testers from what
// depends on Meta (Advanced Access, App Review, Business Verification).
export function capabilities({ configured, accessLevel = 'standard', appMode = 'development', accounts = [] }) {
  const active = accounts.filter(account => account.status === 'active' && account.owner_kind !== 'client')
  const granted = scope => active.some(account => (account.permissions || []).includes(scope))
  const business = active.some(account => String(account.account_type).toUpperCase() === 'BUSINESS')
  const tester = appMode === 'development' || accessLevel === 'standard'
  const row = (id, label, state, note) => ({ id, label, state, note })
  if (!configured) return [
    row('connect', 'Conectar a conta da DUUK', 'setup', 'Cadastre o app do Instagram (ID e chave secreta) para começar.'),
    row('publish', 'Publicar foto, carrossel e Reel', 'setup', 'Disponível depois de conectar uma conta.'),
    row('story', 'Publicar Story', 'setup', 'Disponível depois de conectar uma conta comercial.'),
    row('schedule', 'Agendar no servidor', 'setup', 'Disponível depois de conectar uma conta.'),
    row('insights', 'Métricas da conta e das publicações', 'setup', 'Disponível depois de conectar uma conta.'),
    row('clients', 'Contas de clientes', 'review', 'Depende do Acesso Avançado, com análise do app e verificação da empresa pela Meta.'),
  ]
  const needsAccount = 'Conecte a conta para liberar.'
  return [
    row('connect', 'Conectar a conta da DUUK', active.length ? 'ready' : tester ? 'testers' : 'ready', active.length ? `@${active.map(account => account.username).join(', @')} conectada.` : tester ? 'Funciona para contas com papel no app (adicione a conta da DUUK como Testador do Instagram).' : 'Pronto para conectar.'),
    row('publish', 'Publicar foto, carrossel e Reel', !active.length ? 'setup' : granted('instagram_business_content_publish') ? 'ready' : 'missing', !active.length ? needsAccount : granted('instagram_business_content_publish') ? 'Envio pela API oficial, até 100 publicações a cada 24 horas.' : 'A permissão de publicar não foi concedida. Reconecte e aceite todas as permissões.'),
    row('story', 'Publicar Story', !active.length ? 'setup' : !granted('instagram_business_content_publish') ? 'missing' : business ? 'ready' : 'limited', !active.length ? needsAccount : business ? 'Disponível para contas comerciais. Stories pela API não aceitam legenda, figurinhas ou links.' : 'A API publica Stories somente em contas comerciais (Business). Contas de criador podem ser recusadas.'),
    row('schedule', 'Agendar no servidor', !active.length ? 'setup' : granted('instagram_business_content_publish') ? 'ready' : 'missing', !active.length ? needsAccount : 'O envio acontece no servidor da DUUK no horário marcado, mesmo com o painel fechado.'),
    row('insights', 'Métricas da conta e das publicações', !active.length ? 'setup' : granted('instagram_business_manage_insights') ? 'ready' : 'missing', !active.length ? needsAccount : granted('instagram_business_manage_insights') ? 'Dados do Instagram, com até 48 horas de atraso em algumas métricas.' : 'A permissão de métricas não foi concedida. Reconecte e aceite todas as permissões.'),
    row('clients', 'Contas de clientes', accessLevel === 'advanced' ? 'ready' : 'review', accessLevel === 'advanced' ? 'Acesso Avançado informado como aprovado.' : 'Depende do Acesso Avançado, com análise do app e verificação da empresa pela Meta.'),
  ]
}
export const capabilityStates = {
  ready: { label: 'Funciona agora', tone: 'success', icon: 'checkCircle' },
  testers: { label: 'Para testadores', tone: 'info', icon: 'users' },
  limited: { label: 'Com limitação', tone: 'warning', icon: 'warning' },
  missing: { label: 'Falta permissão', tone: 'warning', icon: 'key' },
  review: { label: 'Depende da Meta', tone: 'neutral', icon: 'shieldAlert' },
  setup: { label: 'Aguardando configuração', tone: 'neutral', icon: 'clock' },
}

// Posts from the database joined with their media rows (the client reads them separately).
export function joinPosts(posts = [], links = [], media = []) {
  const byId = new Map(media.map(item => [item.id, item]))
  const grouped = new Map()
  for (const link of links) {
    const list = grouped.get(link.post_id) || []
    const item = byId.get(link.media_id)
    list.push({ position: link.position, media_id: link.media_id, alt_text: link.alt_text || '', ...(item ? { kind: item.kind, mime_type: item.mime_type, storage_path: item.storage_path, poster_path: item.poster_path, width: item.width, height: item.height, duration_ms: item.duration_ms, size_bytes: item.size_bytes, title: item.title } : {}) })
    grouped.set(link.post_id, list)
  }
  return posts.map(post => ({ ...post, media: (grouped.get(post.id) || []).sort((a, b) => a.position - b.position) }))
}

export function postSummary(post) {
  const text = String(post.caption || '').replace(/\s+/g, ' ').trim()
  return text ? (text.length > 90 ? `${text.slice(0, 89)}…` : text) : `${formatLabels[post.format] || 'Publicação'} sem legenda`
}

// Month grid (Monday first) for the editorial calendar.
export function monthGrid(month) {
  const [year, index] = month.split('-').map(Number)
  const first = new Date(Date.UTC(year, index - 1, 1)), offset = (first.getUTCDay() + 6) % 7
  return Array.from({ length: 42 }, (_, cell) => {
    const date = new Date(Date.UTC(year, index - 1, 1 + cell - offset))
    return { key: date.toISOString().slice(0, 10), day: date.getUTCDate(), inMonth: date.getUTCMonth() === index - 1 }
  })
}
export const shiftMonth = (month, delta) => { const [year, index] = month.split('-').map(Number); const date = new Date(Date.UTC(year, index - 1 + delta, 1)); return date.toISOString().slice(0, 7) }
export const monthLabel = month => new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T12:00:00Z`))
