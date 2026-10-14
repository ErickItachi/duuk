// Read-only views for the Visão geral command center. Every figure comes from records the
// modules already load; nothing here writes data or fills gaps with invented values.
import { contractStatuses, metricSummary } from '../model.js'
import { addDays } from '../calendarModel.js'
import { channels, localDay, stages } from '../../crm/model.js'
import { financeTotals, isOverdue } from '../../finance/financeModel.mjs'

const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const monthNames = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const weekdays = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const noon = day => Date.parse(`${day}T12:00:00Z`)
const time = value => Date.parse(value) || 0
const clock = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false })
const compact = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1, minimumFractionDigits: 0 })

export const plural = (count, one, many) => `${Number(count).toLocaleString('pt-BR')} ${count === 1 ? one : many}`
export const dayNumber = day => String(Number(day.slice(8, 10)))
export const monthShort = day => months[Number(day.slice(5, 7)) - 1]
export const monthName = month => monthNames[Number(month.slice(5, 7)) - 1]
export const shortDate = day => `${dayNumber(day)} ${monthShort(day)}`
export const weekday = day => weekdays[new Date(noon(day)).getUTCDay()]
export const timeOf = value => clock.format(new Date(value))
export const nowTime = (now = new Date()) => clock.format(now)
export const compactMoney = cents => compact.format(Number(cents) / 100)

// "Hoje", "Amanhã", "Ontem", a weekday within the coming week, otherwise "15 out".
export function dayLabel(day, current) {
  if (day === current) return 'Hoje'
  if (day === addDays(current, 1)) return 'Amanhã'
  if (day === addDays(current, -1)) return 'Ontem'
  const ahead = (noon(day) - noon(current)) / 864e5
  return ahead > 1 && ahead < 7 ? `${weekday(day)}, ${shortDate(day)}` : shortDate(day)
}
export const whenLabel = (value, current) => `${dayLabel(localDay(value), current)}, ${timeOf(value)}`
// "hoje às 06:00", "ontem às 22:10" or "em 12 out às 08:00", for the time a source was updated.
export function sinceLabel(value, current) {
  const day = localDay(value), at = `às ${timeOf(value)}`
  if (day === current) return `hoje ${at}`
  if (day === addDays(current, -1)) return `ontem ${at}`
  return `em ${shortDate(day)} ${at}`
}

// ---------- Agenda ----------
const byTime = (a, b) => Number(b.all_day) - Number(a.all_day) || (a.start_time || '').localeCompare(b.start_time || '') || String(a.title).localeCompare(String(b.title), 'pt-BR')
function eventState(event, day, now) {
  if (event.all_day || event.start_date !== day || event.end_date !== day || !event.start_time || !event.end_time) return ''
  const start = event.start_time.slice(0, 5), end = event.end_time.slice(0, 5)
  if (end <= now) return 'past'
  return start <= now ? 'now' : ''
}
export function mergeEvents(...lists) {
  return [...new Map(lists.flat().map(event => [event.id, event])).values()]
}
export function agendaView(records, day, now = nowTime()) {
  const active = records.filter(event => !['done', 'cancelled'].includes(event.status) && event.end_date >= day)
  return {
    today: active.filter(event => event.start_date <= day).sort(byTime).map(event => ({ ...event, state: eventState(event, day, now) })),
    upcoming: active.filter(event => event.start_date > day).sort((a, b) => a.start_date.localeCompare(b.start_date) || byTime(a, b)),
  }
}

// ---------- Commercial ----------
export function followupView(followups, clients, day) {
  const byId = new Map(clients.map(client => [client.id, client]))
  const pending = followups.filter(item => !item.completed_at)
    .map(item => ({ ...item, day: localDay(item.due_at), client: byId.get(item.client_id) || null }))
    .sort((a, b) => time(a.due_at) - time(b.due_at))
  return {
    overdue: pending.filter(item => item.day < day),
    today: pending.filter(item => item.day === day),
    next: pending.find(item => item.day > day) || null,
  }
}

const closed = ['won', 'lost']
const estimate = client => Math.max(0, Number(client.estimated_cents) || 0)
// The server keeps next_follow_up equal to the client's earliest pending follow-up.
export function pipelineView(clients, followups = null) {
  const open = clients.filter(client => !closed.includes(client.stage))
  const rows = stages.filter(([key]) => !closed.includes(key)).map(([key, label]) => {
    const items = open.filter(client => client.stage === key)
    return { key, label, count: items.length, value: items.reduce((sum, client) => sum + estimate(client), 0) }
  })
  const notes = new Map((followups || []).filter(item => !item.completed_at).map(item => [`${item.client_id}|${time(item.due_at)}`, item.notes]))
  const scheduled = open.filter(client => client.next_follow_up)
    .map(client => ({ client, due_at: client.next_follow_up, note: notes.get(`${client.id}|${time(client.next_follow_up)}`) || '' }))
    .sort((a, b) => time(a.due_at) - time(b.due_at))
  return {
    open: open.length,
    value: rows.reduce((sum, row) => sum + row.value, 0),
    unvalued: open.filter(client => !estimate(client)).length,
    stages: rows,
    max: Math.max(1, ...rows.map(row => row.count)),
    next: scheduled.slice(0, 3),
    unscheduled: open.length - scheduled.length,
    won: clients.filter(client => client.stage === 'won').length,
    lost: clients.filter(client => client.stage === 'lost').length,
  }
}

export const channelLabel = key => channels.find(([value]) => value === key)?.[1] || 'Contato'
export function activityView(activities, clients, limit = 5) {
  const byId = new Map(clients.map(client => [client.id, client]))
  return [...activities].sort((a, b) => time(b.occurred_at) - time(a.occurred_at)).slice(0, limit).map(item => ({ ...item, client: byId.get(item.client_id) || null }))
}

// ---------- Contracts ----------
const contractQueue = ['pending', 'partial', 'draft']
export function contractView(contracts) {
  const live = contracts.filter(contract => !contract.deleted_at)
  const count = status => live.filter(contract => contract.status === status).length
  return {
    groups: contractQueue.map(status => ({ status, label: contractStatuses[status], items: live.filter(contract => contract.status === status).sort((a, b) => time(a.updated_at) - time(b.updated_at)) })).filter(group => group.items.length),
    awaiting: count('pending') + count('partial'),
    signed: count('signed'),
  }
}

// ---------- Finance (due dates of the month; never an accumulated balance) ----------
export function financeView(records, month, day) {
  const open = records.filter(record => record.status === 'pending' && record.due_date?.startsWith(month))
    .sort((a, b) => a.due_date.localeCompare(b.due_date) || String(a.title).localeCompare(String(b.title), 'pt-BR'))
  return {
    totals: financeTotals(records, month, day),
    bills: open.slice(0, 4),
    incomeOpen: open.filter(record => record.type === 'income').length,
    expenseOpen: open.filter(record => record.type === 'expense').length,
    overdue: open.filter(record => isOverdue(record, day)).length,
    dueToday: open.filter(record => record.due_date === day).length,
  }
}

// ---------- Site ----------
export function metricsView(records, day, days = 30) {
  const views = new Map()
  for (const record of records) if (record.event === 'view') views.set(record.day, (views.get(record.day) || 0) + Number(record.count))
  const series = Array.from({ length: days }, (_, index) => { const date = addDays(day, index - days + 1); return { day: date, value: views.get(date) || 0 } })
  const peak = series.reduce((best, point) => point.value > best.value ? point : best, series[0])
  return { totals: metricSummary(records), series, peak, max: peak.value }
}

// ---------- What needs attention today ----------
export function digestItems({ agenda, followups, contracts, finance }, day) {
  const items = []
  if (agenda?.today.length) items.push({ key: 'agenda', icon: 'calendar', text: plural(agenda.today.length, 'compromisso hoje', 'compromissos hoje'), to: `/admin/agenda?dia=${day}` })
  if (followups?.overdue.length) items.push({ key: 'followups-overdue', icon: 'alertCircle', tone: 'danger', text: plural(followups.overdue.length, 'follow-up atrasado', 'follow-ups atrasados'), to: '/admin/comercial/follow-ups?filtro=overdue' })
  if (followups?.today.length) items.push({ key: 'followups-today', icon: 'clock', text: plural(followups.today.length, 'follow-up para hoje', 'follow-ups para hoje'), to: '/admin/comercial/follow-ups?filtro=today' })
  if (contracts?.awaiting) items.push({ key: 'contracts', icon: 'document', text: plural(contracts.awaiting, 'contrato aguardando assinatura', 'contratos aguardando assinatura'), to: '/admin/contratos' })
  if (finance?.overdue) items.push({ key: 'finance-overdue', icon: 'alertCircle', tone: 'danger', text: plural(finance.overdue, 'conta em atraso', 'contas em atraso'), to: '/admin/financeiro?aba=contas' })
  if (finance?.dueToday) items.push({ key: 'finance-today', icon: 'wallet', text: plural(finance.dueToday, 'conta vence hoje', 'contas vencem hoje'), to: '/admin/financeiro?aba=contas' })
  return items
}

// Create intents the modules already understand; each one keeps the permission of its route.
export const quickActions = [
  { id: 'event', label: 'Novo compromisso', icon: 'calendarClock', to: '/admin/agenda?novo=compromisso', permission: 'agenda' },
  { id: 'lead', label: 'Novo lead', icon: 'userPlus', to: '/admin/comercial/clientes?novo=lead', permission: 'crm.clients' },
  { id: 'contract', label: 'Novo contrato', icon: 'document', to: '/admin/contratos?novo=contrato', permission: 'contracts' },
  { id: 'income', label: 'Nova receita', icon: 'incoming', to: '/admin/financeiro?aba=contas&novo=receita', permission: 'finance' },
  { id: 'expense', label: 'Nova despesa', icon: 'outgoing', to: '/admin/financeiro?aba=contas&novo=despesa', permission: 'finance' },
  { id: 'project', label: 'Novo projeto', icon: 'film', to: '/admin/portfolio?novo=projeto', permission: 'site' },
  { id: 'mail', label: 'Escrever e-mail', icon: 'compose', to: '/admin/comercial/emails?compor=1', permission: 'mail' },
  { id: 'ai', label: 'DUUK AI', icon: 'spark', to: '/admin/ai', permission: 'ai' },
]

// ---------- Layout ----------
// Cards in reading priority: what needs attention today first. Columns keep the DOM order equal
// to the visual order, so keyboard and screen reader users meet the cards as they are seen.
export const cardOrder = ['agenda', 'followups', 'contracts', 'finance', 'actions', 'pipeline', 'activity', 'site']
const primaryCards = ['agenda', 'followups', 'pipeline', 'activity']
const asideCards = ['actions', 'contracts', 'finance', 'site']
// Typical card heights, in hundreds of pixels, so two columns end close to each other.
const weights = { agenda: 4, followups: 3, contracts: 4, finance: 6, actions: 3, pipeline: 7, activity: 4, site: 4 }
const weight = keys => keys.reduce((sum, key) => sum + weights[key], 0)
export function dashboardColumns(keys, mode) {
  const present = cardOrder.filter(key => keys.includes(key))
  if (mode === 'single' || present.length < 2) return { kind: 'single', columns: [present] }
  if (mode === 'wide') {
    const main = present.filter(key => primaryCards.includes(key)), side = asideCards.filter(key => present.includes(key))
    if (main.length && side.length) {
      // A side column much longer than the main one hands its last cards over, kept in priority order.
      while (side.length > 1 && weight(side) - weight(main) > 4) main.push(side.pop())
      return { kind: 'split', columns: [cardOrder.filter(key => main.includes(key)), side] }
    }
  }
  // Two even columns: each card, in priority order, goes to the shorter column.
  const columns = [[], []]
  for (const key of present) columns[weight(columns[1]) < weight(columns[0]) ? 1 : 0].push(key)
  return { kind: 'even', columns }
}
