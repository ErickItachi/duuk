import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../admin/components'
import { eventCategories, eventPayload, eventTime } from '../office/calendarModel'
import { cents, dateLabel, expenseCategories } from '../office/model'
import { fmtTime, localInput, timestamp } from '../crm/model'
import { aiRequest } from './api'

const definitions = {
  'agenda.create': { title: 'Agendar compromisso', saved: 'Compromisso salvo na agenda', button: 'Confirmar e agendar', icon: 'calendar', permission: 'agenda' },
  'expense.create': { title: 'Registrar despesa', saved: 'Despesa salva no financeiro', button: 'Confirmar e registrar', icon: 'wallet', permission: 'finance' },
  'followup.create': { title: 'Agendar follow-up', saved: 'Follow-up salvo no comercial', button: 'Confirmar e agendar', icon: 'clock', permission: 'crm.followups' },
  'agenda.list': { title: 'Sua agenda', icon: 'calendar', permission: 'agenda' },
}
const validDay = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '')
const inputDateTime = value => {
  if (!value) return ''
  try { return localInput(value) } catch { return '' }
}
function initialForm(action, memberId) {
  const payload = action.payload || {}
  if (action.kind === 'agenda.create') return { title: '', description: '', location: '', client_name: '', start_date: '', end_date: '', all_day: false, category: 'other', status: 'planned', responsible_id: memberId, ...payload, start_time: payload.start_time?.slice(0, 5) || '', end_time: payload.end_time?.slice(0, 5) || '' }
  if (action.kind === 'expense.create') return { title: '', description: '', category: 'other', due_date: '', status: 'pending', paid_date: '', ...payload, amount: payload.amount_cents ? (Number(payload.amount_cents) / 100).toFixed(2).replace('.', ',') : '' }
  if (action.kind === 'followup.create') return { client_hint: '', notes: '', owner_id: memberId, ...payload, client_id: payload.client_id || '', due_at: inputDateTime(payload.due_at) }
  return payload
}
function actionPayload(kind, form, clients) {
  if (kind === 'agenda.create') return eventPayload({ ...form, end_date: form.end_date || form.start_date })
  if (kind === 'expense.create') {
    if (!form.title.trim()) throw new Error('Dê um nome à despesa.')
    if (!form.due_date) throw new Error('Informe a data de vencimento.')
    if (form.status === 'paid' && !form.paid_date) throw new Error('Informe a data do pagamento.')
    return { title: form.title.trim(), description: form.description.trim(), amount_cents: cents(form.amount), category: form.category, due_date: form.due_date, status: form.status, paid_date: form.status === 'paid' ? form.paid_date : null }
  }
  if (kind === 'followup.create') {
    const client = clients.find(item => item.id === form.client_id)
    if (!client) throw new Error('Escolha o cliente para este follow-up.')
    if (!form.owner_id) throw new Error('Escolha quem será responsável pelo follow-up.')
    if (!form.due_at) throw new Error('Informe a data e o horário do follow-up.')
    return { client_id: client.id, client_version: client.version, client_hint: client.name, owner_id: form.owner_id, due_at: timestamp(form.due_at), notes: form.notes.trim() }
  }
  throw new Error('Esta ação ainda não está disponível.')
}
function destination(action) {
  if (action.kind.startsWith('agenda.')) {
    const day = action.result?.event?.start_date || action.payload?.start_date || action.result?.date_start
    return { to: validDay(day) ? `/admin/agenda?dia=${day}` : '/admin/agenda', label: 'Abrir agenda' }
  }
  if (action.kind === 'expense.create') {
    const day = action.payload?.due_date
    return { to: validDay(day) ? `/admin/financeiro?mes=${day.slice(0, 7)}` : '/admin/financeiro', label: 'Abrir financeiro' }
  }
  return { to: '/admin/comercial/follow-ups', label: 'Abrir follow-ups' }
}
function Summary({ action, form, options }) {
  if (action.kind === 'agenda.create') return <><strong>{form.title || 'Informe o título'}</strong><span>{form.start_date ? dateLabel(form.start_date) : 'Escolha a data'}{form.end_date && form.end_date !== form.start_date && ` até ${dateLabel(form.end_date)}`} · {form.all_day ? 'Dia inteiro' : form.start_time ? eventTime(form) : 'Escolha o horário'}</span>{form.location && <span>{form.location}</span>}{(options.people.find(person => person.id === form.responsible_id)?.name || form.responsible_hint) && <span>Responsável: {options.people.find(person => person.id === form.responsible_id)?.name || form.responsible_hint}</span>}</>
  if (action.kind === 'expense.create') return <><strong>{form.title || 'Informe o título'}</strong><span>{form.amount ? `R$ ${form.amount}` : 'Informe o valor'} · {form.due_date ? `vence ${dateLabel(form.due_date)}` : 'Escolha o vencimento'}</span></>
  return <><strong>{options.clients.find(item => item.id === form.client_id)?.name || form.client_hint || (action.status === 'completed' ? 'Cliente registrado' : 'Escolha o cliente')}</strong><span>{form.due_at ? fmtTime(timestamp(form.due_at)) : 'Escolha a data e o horário'}</span>{form.notes && <span>{form.notes}</span>}</>
}
function Field({ label, children, ...props }) {
  return <label className="admin-field"><span>{label}</span>{children || <input {...props} />}</label>
}
function PersonField({ value, onChange, people, memberId, hint }) {
  const choices = people.some(person => person.id === memberId) ? people : [{ id: memberId, name: 'Você' }, ...people]
  return <Field label="Responsável"><select required value={value || ''} onChange={event => onChange(event.target.value)}><option value="">Escolher responsável</option>{choices.filter(person => person.id).map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select>{hint && !value && <small>Escolha o cadastro de {hint}.</small>}</Field>
}
function ActionFields({ action, form, update, options, memberId, clientSearch, setClientSearch }) {
  if (action.kind === 'agenda.create') return <>
    <Field label="Título" required maxLength={160} value={form.title} onChange={event => update('title', event.target.value)} />
    <div className="duuk-ai-action__row"><Field label="Data inicial" type="date" required min="1900-01-01" max="2100-12-31" value={form.start_date} onChange={event => { const value = event.target.value; update('start_date', value); if (!form.end_date || form.end_date < value) update('end_date', value) }} /><Field label="Data final" type="date" required min={form.start_date || '1900-01-01'} max="2100-12-31" value={form.end_date || form.start_date} onChange={event => update('end_date', event.target.value)} /></div>
    <label className="admin-checkbox"><input type="checkbox" checked={form.all_day} onChange={event => update('all_day', event.target.checked)} /><span>Dia inteiro</span></label>
    {!form.all_day && <div className="duuk-ai-action__row"><Field label="Horário inicial" type="time" required value={form.start_time} onChange={event => update('start_time', event.target.value)} /><Field label="Horário final (opcional)" type="time" value={form.end_time} onChange={event => update('end_time', event.target.value)} /></div>}
    <div className="duuk-ai-action__row"><Field label="Tipo"><select value={form.category} onChange={event => update('category', event.target.value)}>{Object.entries(eventCategories).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field><PersonField value={form.responsible_id} onChange={value => update('responsible_id', value)} people={options.people} memberId={memberId} hint={form.responsible_hint} /></div>
    <Field label="Local (opcional)" maxLength={200} value={form.location} onChange={event => update('location', event.target.value)} />
    <Field label="Observações (opcional)"><textarea rows={2} maxLength={2000} value={form.description} onChange={event => update('description', event.target.value)} /></Field>
  </>
  if (action.kind === 'expense.create') return <>
    <Field label="Título" required maxLength={160} value={form.title} onChange={event => update('title', event.target.value)} />
    <div className="duuk-ai-action__row"><Field label="Valor (R$)" required inputMode="decimal" placeholder="0,00" value={form.amount} onChange={event => update('amount', event.target.value)} /><Field label="Vencimento" type="date" required min="1900-01-01" max="2100-12-31" value={form.due_date} onChange={event => update('due_date', event.target.value)} /></div>
    <div className="duuk-ai-action__row"><Field label="Categoria"><select value={form.category} onChange={event => update('category', event.target.value)}>{Object.entries(expenseCategories).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field><Field label="Situação"><select value={form.status} onChange={event => update('status', event.target.value)}><option value="pending">A pagar</option><option value="paid">Pago</option></select></Field></div>
    {form.status === 'paid' && <Field label="Data do pagamento" type="date" required value={form.paid_date || ''} onChange={event => update('paid_date', event.target.value)} />}
    <Field label="Observações (opcional)"><textarea rows={2} maxLength={2000} value={form.description} onChange={event => update('description', event.target.value)} /></Field>
  </>
  return <>
    <Field label="Buscar cliente" type="search" maxLength={100} value={clientSearch} placeholder="Nome do cliente" onChange={event => setClientSearch(event.target.value)} />
    <Field label="Cliente"><select required value={form.client_id || ''} onChange={event => update('client_id', event.target.value)}><option value="">Escolher cliente</option>{options.clients.filter(client => client.id === form.client_id || client.name.toLocaleLowerCase('pt-BR').includes(clientSearch.trim().toLocaleLowerCase('pt-BR'))).map(client => <option key={client.id} value={client.id}>{client.name}</option>)}</select>{form.client_hint && !form.client_id && <small>Selecione o cadastro de {form.client_hint}.</small>}</Field>
    <div className="duuk-ai-action__row"><Field label="Data e horário" type="datetime-local" required value={form.due_at} onChange={event => update('due_at', event.target.value)} /><PersonField value={form.owner_id} onChange={value => update('owner_id', value)} people={options.people} memberId={memberId} hint={form.owner_hint} /></div>
    <Field label="Observações (opcional)"><textarea rows={2} maxLength={2000} value={form.notes} onChange={event => update('notes', event.target.value)} /></Field>
  </>
}
function AgendaResult({ action }) {
  const items = Array.isArray(action.result?.items) ? action.result.items : []
  return <div className="duuk-ai-agenda-result">{items.length ? items.map(item => <div key={item.id}><strong>{item.title}</strong><span>{dateLabel(item.start_date)} · {eventTime(item)}{item.location && ` · ${item.location}`}</span>{item.responsible_name && <span>Responsável: {item.responsible_name}</span>}</div>) : <p>Nenhum compromisso encontrado neste período.</p>}{action.result?.truncated && <small>Há mais compromissos. Abra a agenda para ver todos.</small>}</div>
}
function ActionCard({ action, options, optionsError, optionsLoading, memberId, hasPermission, onUpdated, onDirtyChange, onBusyChange, onRefreshOptions, onSearchClients, generating }) {
  const [form, setForm] = useState(() => initialForm(action, memberId)), [initial] = useState(() => JSON.stringify(initialForm(action, memberId))), [expanded, setExpanded] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [now, setNow] = useState(Date.now), [attemptLocked, setAttemptLocked] = useState(false), [clientSearch, setClientSearch] = useState('')
  const alive = useRef(true), running = useRef(false), attempt = useRef(null), record = action
  const definition = definitions[action.kind], pending = record.status === 'pending', allowed = hasPermission?.(definition.permission) === true
  const expired = record.expires_at && Date.parse(record.expires_at) <= now
  const dirty = pending && (busy || attemptLocked || JSON.stringify(form) !== initial)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => { onDirtyChange(action.id, dirty); return () => onDirtyChange(action.id, false) }, [action.id, dirty, onDirtyChange])
  useEffect(() => { onBusyChange(action.id, busy); return () => onBusyChange(action.id, false) }, [action.id, busy, onBusyChange])
  useEffect(() => {
    if (action.kind !== 'followup.create' || !expanded) return
    const timer = setTimeout(() => onSearchClients(clientSearch), 250)
    return () => clearTimeout(timer)
  }, [action.kind, clientSearch, expanded, onSearchClients])
  useEffect(() => {
    if (action.kind !== 'followup.create' || optionsLoading || !form.client_id || !form.client_hint || options.clients.some(client => client.id === form.client_id)) return
    const timer = setTimeout(() => onSearchClients(form.client_hint), 250)
    return () => clearTimeout(timer)
  }, [action.kind, form.client_id, form.client_hint, options.clients, optionsLoading, onSearchClients])
  useEffect(() => {
    if (!pending || !record.expires_at) return
    const delay = Date.parse(record.expires_at) - Date.now()
    if (!Number.isFinite(delay)) return
    const timer = setTimeout(() => setNow(Date.now()), Math.min(Math.max(0, delay) + 50, 2147483647))
    return () => clearTimeout(timer)
  }, [pending, record.expires_at])
  const update = (key, value) => { setForm(old => ({ ...old, [key]: value })); setError('') }
  const apply = updated => {
    if (!updated || updated.id !== action.id || !['pending', 'completed', 'cancelled'].includes(updated.status)) throw new Error('Não foi possível confirmar o resultado. Tente novamente.')
    onUpdated(updated)
    if (updated.status !== 'pending') { attempt.current = null; setAttemptLocked(false); setForm(initialForm(updated, memberId)); setExpanded(false); setError('') }
  }
  const execute = async event => {
    event.preventDefault()
    if (running.current || !pending || expired || !allowed || generating) return
    setError('')
    try {
      if (!attempt.current) { attempt.current = { action: 'action_execute', id: action.id, confirmed: true, client_request_id: crypto.randomUUID(), changes: actionPayload(action.kind, form, options.clients) }; setAttemptLocked(true) }
    } catch (cause) { setExpanded(true); setError(cause.message); return }
    running.current = true; setBusy(true)
    try { const result = await aiRequest(attempt.current); if (alive.current) apply(result.action) }
    catch (cause) {
      if (!alive.current) return
      setError(cause.message)
      if ([400, 403, 404, 409, 422].includes(cause.status)) {
        attempt.current = null; setAttemptLocked(false); setExpanded(true)
        if (cause.status === 409) onRefreshOptions()
      }
      // A lost response or a change in another tab can follow a committed
      // transaction. Read the persisted status; never regenerate or auto-save.
      try { const result = await aiRequest({ action: 'conversation', id: action.conversation_id }); const updated = result.actions?.find(item => item.id === action.id); if (alive.current && updated?.status !== 'pending' && updated) apply(updated) } catch {}
    } finally { if (alive.current) { running.current = false; setBusy(false) } }
  }
  const cancel = async () => {
    if (running.current) return
    running.current = true; setBusy(true); setError('')
    try { const result = await aiRequest({ action: 'action_cancel', id: action.id }); if (alive.current) apply(result.action) } catch (cause) { if (alive.current) setError(cause.message) } finally { if (alive.current) { running.current = false; setBusy(false) } }
  }
  const link = destination(record), locked = busy || attemptLocked, displayForm = pending ? form : initialForm(record, memberId)
  return <section className={`duuk-ai-action${pending ? '' : ' is-finished'}`} aria-label={definition.title} aria-busy={busy}>
    <div className="duuk-ai-action__heading"><Icon name={definition.icon} size={17} /><strong>{definition.title}</strong><span>{record.status === 'completed' ? action.kind === 'agenda.list' ? 'Consultada' : 'Salvo' : record.status === 'cancelled' ? 'Descartado' : expired ? 'Expirado' : 'Para confirmar'}</span></div>
    {action.kind === 'agenda.list' ? <AgendaResult action={record} /> : <div className="duuk-ai-action__summary"><Summary action={record} form={displayForm} options={options} /></div>}
    {record.status === 'completed' && <div className="duuk-ai-action__completed" role="status">{definition.saved && <p><Icon name="check" size={15} />{definition.saved}.</p>}{allowed && <Link to={link.to}>{link.label}<Icon name="right" size={14} /></Link>}</div>}
    {pending && <form onSubmit={execute}>
      {expanded && !expired && <fieldset className="duuk-ai-action__fields" disabled={locked || !allowed}><ActionFields action={record} form={form} update={update} options={options} memberId={memberId} clientSearch={clientSearch} setClientSearch={setClientSearch} /></fieldset>}
      {expired ? <p className="duuk-ai-action__note">Esta ação expirou. Faça um novo pedido para confirmar os dados atuais.</p> : <p className="duuk-ai-action__note">{action.kind !== 'expense.create' && 'Horário de Brasília. '}{attemptLocked && error ? 'Confira o resultado ou tente confirmar novamente com os mesmos dados.' : 'Revise os dados e confirme para salvar.'}</p>}
      {!allowed && <p className="duuk-ai-action__note">Você não tem permissão para executar esta ação.</p>}
      {optionsError && <p className="duuk-ai-action__note">{optionsError} <button type="button" className="admin-text-button" onClick={onRefreshOptions} disabled={optionsLoading}>Recarregar opções</button></p>}
      {error && <p className="admin-error" role="alert">{error}</p>}
      <div className="duuk-ai-action__buttons">{!expired && <><button className="admin-button" disabled={busy || !allowed || optionsLoading || generating}>{busy ? 'Salvando…' : attemptLocked && error ? 'Tentar confirmar novamente' : definition.button}</button><button type="button" className="admin-text-button" disabled={locked || !allowed} onClick={() => setExpanded(!expanded)}><Icon name={expanded ? 'up' : 'edit'} size={14} />{expanded ? 'Recolher' : 'Revisar'}</button></>}<button type="button" className="admin-text-button" disabled={busy || generating} onClick={cancel}>Descartar</button></div>
    </form>}
  </section>
}
export default function ActionCards({ actions, ...props }) {
  const supported = actions.filter(action => action?.id && definitions[action.kind])
  if (!supported.length) return null
  return <div className="duuk-ai-action-cards">{supported.map(action => <ActionCard key={`${props.memberId}:${action.conversation_id}:${action.id}`} action={action} {...props} />)}</div>
}
