import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useCreateIntent } from '../admin/shell/hooks'
import { ConfirmModal, Icon, Modal, RefreshButton } from '../admin/components'
import { EmptyState, ErrorState, FieldError, PageTitle, Pagination, SearchField } from '../admin/forms'
import { usePagination } from '../admin/ds/list'
import { useUnsavedChanges } from '../admin/unsavedChanges'
import { DateField, MonthNavigation } from '../office/Calendar'
import { ExpenseEditor } from '../office/ExpensesPage'
import { deleteExpense } from '../office/api'
import { cents, dateLabel, downloadFile, today } from '../office/model'
import { monthLabel } from '../office/calendarModel'
import { useQuery } from '../office/useQuery'
import { deleteIncome, listFinanceMonth, saveFinanceGoals, saveIncome } from './finance-api'
import { categoryLabel, entriesForMonth, filterEntries, financeCsv, financeTotals, goalProgress, incomeCategories, incomePayload, initialDateForMonth, isOverdue, statusLabel, validMonth } from './financeModel.mjs'
import { useBankData } from './bank-data'
import FinanceHome, { Kpi, SkeletonRows } from './FinanceHome'
import FinanceStatement, { FilterSelect } from './FinanceStatement'
import { FinancePrivacy, Money, PrivacyToggle } from './privacy'
import './finance.css'
import './finance-home.css'

// Field checks mirror what incomePayload and the database already require; the server stays the authority.
const described = (id, error, hint) => [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined
const focusField = (root, key, id) => requestAnimationFrame(() => (root?.querySelector(`[data-field="${key}"]`) || (id && document.getElementById(id)))?.focus())
function amountError(value, empty) {
 if (!String(value).trim()) return empty
 try { cents(value); return '' } catch (cause) { return cause.message }
}
function incomeErrors(form) {
 const errors = {
  title: form.title.trim() ? '' : 'Dê um nome à receita.',
  amount: amountError(form.amount, 'Informe o valor da receita.'),
  due_date: form.due_date ? '' : 'Informe a data de vencimento.',
  category: form.category.trim() ? '' : 'Informe a categoria da receita.',
  paid_date: form.status !== 'paid' ? '' : !form.paid_date ? 'Informe a data do recebimento.' : form.paid_date > today() ? 'A data do recebimento não pode estar no futuro.' : '',
 }
 return Object.fromEntries(Object.entries(errors).filter(([, message]) => message))
}
// Empty or zero means "no goal": the month keeps an undefined goal, never an invented one.
const goalAmount = value => !value.trim() || /^0(?:[.,]0{1,2})?$/.test(value.trim()) ? 0 : cents(value)
function goalErrors(form) {
 const errors = {}
 for (const key of ['revenue', 'budget']) { try { goalAmount(form[key]) } catch (cause) { errors[key] = cause.message } }
 return errors
}

function FormField({ id, label, error, hint, children }) {
 return <div className="admin-field">
  <label className="admin-label" htmlFor={id}>{label}</label>
  {children}
  {hint && <small id={`${id}-hint`}>{hint}</small>}
  <FieldError id={`${id}-error`}>{error}</FieldError>
 </div>
}

function IncomeEditor({ record, month, onClose, onSaved }) {
 const [initial] = useState(() => ({ title: record?.title || '', description: record?.description || '', amount: record ? (Number(record.amount_cents) / 100).toFixed(2) : '', category: record?.category || 'Projetos', counterparty_name: record?.counterparty_name || '', due_date: record?.due_date || initialDateForMonth(month), status: record?.status || 'pending', paid_date: record?.paid_date || today() }))
 const [form, setForm] = useState(initial), [busy, setBusy] = useState(false), [error, setError] = useState(''), [discarding, setDiscarding] = useState(false), [checked, setChecked] = useState(false)
 const running = useRef(false), fields = useRef(null), base = useId(), dirty = JSON.stringify(form) !== JSON.stringify(initial)
 const errors = checked ? incomeErrors(form) : {}, id = key => `${base}-${key}`
 useUnsavedChanges(dirty)
 const update = (key, value) => setForm(old => ({ ...old, [key]: value }))
 const close = () => { if (!busy) { if (dirty) setDiscarding(true); else onClose() } }
 const save = async event => {
  event.preventDefault()
  if (running.current) return
  const found = incomeErrors(form), first = ['title', 'amount', 'due_date', 'category', 'paid_date'].find(key => found[key])
  if (first) { setChecked(true); focusField(fields.current, first, id(first)); return }
  running.current = true; setError(''); setBusy(true)
  try { await saveIncome(incomePayload(form), record); await onSaved(); onClose() }
  catch (cause) { setError(cause.message) }
  finally { running.current = false; setBusy(false) }
 }
 const input = (key, extra = {}) => ({ id: id(key), 'data-field': key, 'aria-invalid': errors[key] ? true : undefined, 'aria-describedby': described(id(key), errors[key], extra.hint), value: form[key], onChange: event => update(key, event.target.value) })
 return <><Modal title={record ? 'Editar receita' : 'Nova receita'} subtitle="Registre o que a DUUK tem a receber e confirme quando entrar." onClose={close}>
  <form onSubmit={save} noValidate className="finance-form">
   <div className="admin-modal__body">
    <fieldset ref={fields} disabled={busy} className="finance-form__fields">
     <legend className="finance-sr-only">Dados da receita</legend>
     <FormField id={id('title')} label="Nome da receita" error={errors.title}><input {...input('title')} required maxLength={160} autoFocus /></FormField>
     <div className="admin-field-row">
      <FormField id={id('amount')} label="Valor (R$)" error={errors.amount}><input {...input('amount')} required inputMode="decimal" placeholder="0,00" /></FormField>
      <DateField label="Vencimento" id={id('due_date')} error={errors.due_date} errorId={`${id('due_date')}-error`} value={form.due_date} onChange={value => update('due_date', value)} />
     </div>
     <div className="admin-field-row">
      <FormField id={id('category')} label="Categoria" error={errors.category}><input {...input('category')} required maxLength={80} list={id('categories')} /><datalist id={id('categories')}>{incomeCategories.map(category => <option key={category} value={category} />)}</datalist></FormField>
      <FormField id={id('counterparty_name')} label="Cliente ou origem"><input {...input('counterparty_name')} maxLength={160} placeholder="Opcional" /></FormField>
     </div>
     <FormField id={id('status')} label="Situação"><select {...input('status')}><option value="pending">A receber</option><option value="paid">Recebido</option></select></FormField>
     {form.status === 'paid' && <DateField label="Data do recebimento" id={id('paid_date')} error={errors.paid_date} errorId={`${id('paid_date')}-error`} max={today()} value={form.paid_date} onChange={value => update('paid_date', value)} />}
     <FormField id={id('description')} label="Observações"><textarea {...input('description')} rows={3} maxLength={2000} /></FormField>
     {error && <ErrorState>{error}</ErrorState>}
    </fieldset>
   </div>
   <div className="admin-modal__foot">
    <button type="button" className="admin-button admin-button--secondary" disabled={busy} onClick={close}>Cancelar</button>
    <button type="submit" className="admin-button" disabled={busy} aria-busy={busy}>{busy ? 'Salvando…' : 'Salvar receita'}</button>
   </div>
  </form>
 </Modal>{discarding && <ConfirmModal title="Descartar alterações?" message="A receita ainda não foi salva. Você pode voltar e continuar preenchendo." action="Descartar" onClose={() => setDiscarding(false)} onConfirm={onClose} />}</>
}

function GoalEditor({ record, month, onClose, onSaved }) {
 const [initial] = useState(() => ({ revenue: Number(record?.revenue_goal_cents || 0) ? (Number(record.revenue_goal_cents) / 100).toFixed(2) : '', budget: Number(record?.expense_budget_cents || 0) ? (Number(record.expense_budget_cents) / 100).toFixed(2) : '' }))
 const [form, setForm] = useState(initial), [busy, setBusy] = useState(false), [error, setError] = useState(''), [discarding, setDiscarding] = useState(false), [removing, setRemoving] = useState(false), [checked, setChecked] = useState(false)
 const running = useRef(false), fields = useRef(null), base = useId(), dirty = JSON.stringify(form) !== JSON.stringify(initial)
 const errors = checked ? goalErrors(form) : {}, hasGoals = (Number(record?.revenue_goal_cents) || Number(record?.expense_budget_cents)) > 0
 useUnsavedChanges(dirty)
 const close = () => { if (!busy) { if (dirty) setDiscarding(true); else onClose() } }
 const persist = async values => { if (running.current) return; running.current = true; setBusy(true); setError(''); try { await saveFinanceGoals(values, record, month); await onSaved(); onClose() } catch (cause) { setError(cause.message) } finally { running.current = false; setBusy(false) } }
 const submit = event => {
  event.preventDefault()
  const found = goalErrors(form), first = ['revenue', 'budget'].find(key => found[key])
  if (first) { setChecked(true); focusField(fields.current, first); return }
  try { persist({ revenue_goal_cents: goalAmount(form.revenue), expense_budget_cents: goalAmount(form.budget) }) } catch (cause) { setError(cause.message) }
 }
 const field = (key, label) => <FormField id={`${base}-${key}`} label={label} error={errors[key]}><input id={`${base}-${key}`} data-field={key} inputMode="decimal" placeholder="Opcional" autoFocus={key === 'revenue'} aria-invalid={errors[key] ? true : undefined} aria-describedby={described(`${base}-${key}`, errors[key])} value={form[key]} onChange={event => setForm(old => ({ ...old, [key]: event.target.value }))} /></FormField>
 return <><Modal title={`Metas de ${monthLabel(month)}`} subtitle="Acompanhe recebimentos e despesas pagos neste mês. Cada período mantém suas próprias metas." onClose={close}>
  <form onSubmit={submit} noValidate className="finance-form">
   <div className="admin-modal__body">
    <fieldset ref={fields} disabled={busy} className="finance-form__fields">
     <legend className="finance-sr-only">Metas do mês</legend>
     {field('revenue', 'Meta de recebimentos (R$)')}
     {field('budget', 'Orçamento de despesas (R$)')}
     <p className="finance-form__hint"><Icon name="info" size={15} />Deixe um valor vazio ou em zero para não definir uma meta. Alterar as metas não muda os lançamentos.</p>
     {error && <ErrorState>{error}</ErrorState>}
    </fieldset>
   </div>
   <div className="admin-modal__foot">
    {hasGoals && <button type="button" className="admin-text-button admin-text-button--danger finance-form__remove" disabled={busy} onClick={() => setRemoving(true)}>Remover metas</button>}
    <button type="button" className="admin-button admin-button--secondary" disabled={busy} onClick={close}>Cancelar</button>
    <button type="submit" className="admin-button" disabled={busy} aria-busy={busy}>{busy ? 'Salvando…' : 'Salvar metas'}</button>
   </div>
  </form>
 </Modal>
 {removing && <ConfirmModal title="Remover as metas do mês?" message={`${monthLabel(month)} ficará sem meta de recebimentos e sem orçamento de despesas. Os lançamentos não mudam.`} action="Remover metas" onClose={() => setRemoving(false)} onConfirm={() => persist({ revenue_goal_cents: 0, expense_budget_cents: 0 })} />}
 {discarding && <ConfirmModal title="Descartar alterações?" message="As metas ainda não foram salvas. Você pode voltar e continuar preenchendo." action="Descartar" onClose={() => setDiscarding(false)} onConfirm={onClose} />}</>
}

function GoalPanel({ received, paid, goal: record, ready, onEdit }) {
 const goal = Number(record?.revenue_goal_cents || 0), budget = Number(record?.expense_budget_cents || 0), progress = goalProgress(received, goal), circle = Math.min(progress || 0, 100), circumference = 2 * Math.PI * 46, over = budget > 0 && paid > budget
 const percentage = progress !== null && progress > 999 ? `${new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(progress)}%` : `${progress}%`
 return <section className="ds-card finance-goals" aria-labelledby="finance-goals-title">
  <div className="ds-card__head finance-card__head"><div><h2 id="finance-goals-title">Metas do mês</h2><p>Pela data efetiva, neste mês</p></div><button type="button" className="admin-icon-button" aria-label="Editar metas mensais" title="Editar metas" disabled={!ready} onClick={onEdit}><Icon name="edit" size={17} /></button></div>
  <div className="finance-goal">
   <div className="finance-progress" role="img" aria-label={progress === null ? 'Meta mensal ainda não definida.' : `${progress}% da meta de recebimentos atingida.`}>
    <svg viewBox="0 0 112 112" aria-hidden="true"><circle className="finance-progress__track" cx="56" cy="56" r="46" />{progress !== null && <circle className="finance-progress__value" cx="56" cy="56" r="46" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - circle / 100)} />}</svg>
    <strong aria-hidden="true">{ready ? progress === null ? '—' : percentage : '…'}</strong>
   </div>
   <div className="finance-goal__copy">
    <span>Recebido no mês</span>
    <strong>{ready ? <Money cents={received} /> : <span className="ds-skeleton finance-goal__skeleton" aria-hidden="true" />}</strong>
    {goal ? <p>de <Money cents={goal} /></p> : <p>Defina uma meta para acompanhar os recebimentos.</p>}
    {!goal && <button type="button" className="admin-text-button" disabled={!ready} onClick={onEdit}>Definir metas<Icon name="arrow" size={14} /></button>}
   </div>
  </div>
  <div className={`finance-budget${over ? ' is-over' : ''}`}>
   <div className="finance-budget__head"><span>Orçamento de despesas</span><strong>{budget ? <Money cents={budget} /> : 'Não definido'}</strong></div>
   {budget > 0 && <>
    <span className="finance-meter" aria-hidden="true"><i style={{ width: `${Math.min(paid / budget * 100, 100)}%` }} /></span>
    <small>{over ? <><Icon name="warning" size={13} /><Money cents={paid - budget} /> acima do orçamento</> : <><Money cents={paid} /> utilizados · <Money cents={budget - paid} /> disponíveis</>}</small>
   </>}
  </div>
  <p className="finance-panel-note">Pela data efetiva do recebimento ou pagamento, neste mês.</p>
 </section>
}

function StatusBadge({ record }) {
 const overdue = isOverdue(record), paid = record.status === 'paid'
 return <span className={`ds-badge ${paid ? 'ds-badge--success' : overdue ? 'ds-badge--danger' : 'ds-badge--neutral'}`}><Icon name={paid ? 'check' : overdue ? 'alertCircle' : 'clock'} size={12} />{overdue ? 'Em atraso' : statusLabel(record)}</span>
}

function LedgerTable({ records, basis, month, onEdit, onRemove }) {
 return <div className="ds-table-wrap finance-table-wrap"><table className="ds-table finance-table">
  <caption className="finance-sr-only">Lançamentos de {monthLabel(month)}, pela data de {basis === 'payment' ? 'pagamento ou recebimento' : 'vencimento'}.</caption>
  <thead><tr><th scope="col">Lançamento</th><th scope="col">Tipo</th><th scope="col">{basis === 'payment' ? 'Pagamento' : 'Vencimento'}</th><th scope="col">Situação</th><th scope="col" className="is-number">Valor</th><th scope="col"><span className="finance-sr-only">Ações</span></th></tr></thead>
  <tbody>{records.map(record => {
   const income = record.type === 'income', amount = Number(record.amount_cents)
   return <tr key={record.key}>
    <td className="finance-table__title"><button type="button" onClick={() => onEdit(record)}><strong>{record.title}</strong><small>{categoryLabel(record)}{record.counterparty_name && ` · ${record.counterparty_name}`}<span className="finance-table__kind"> · {income ? 'Receita' : 'Despesa'}</span></small></button></td>
    <td className="finance-table__type"><span className="finance-type"><Icon name={income ? 'incoming' : 'outgoing'} size={14} />{income ? 'Receita' : 'Despesa'}</span></td>
    <td className="finance-table__date"><span><span className="finance-table__when">{basis === 'payment' ? income ? 'Recebido em ' : 'Pago em ' : 'Vence '}</span>{dateLabel(basis === 'payment' ? record.paid_date : record.due_date)}</span>{basis === 'due' && record.paid_date && <small>{income ? 'Recebido' : 'Pago'} em {dateLabel(record.paid_date)}</small>}</td>
    <td className="finance-table__status"><StatusBadge record={record} /></td>
    <td className="finance-table__amount is-number"><Money cents={income ? amount : -amount} signed tone /></td>
    <td className="finance-table__actions"><div className="admin-row-actions"><button type="button" className="admin-icon-button" aria-label={`Editar ${record.title}`} title="Editar" onClick={() => onEdit(record)}><Icon name="edit" size={17} /></button><button type="button" className="admin-icon-button admin-icon-button--danger" aria-label={`Excluir ${record.title}`} title="Excluir" onClick={() => onRemove(record)}><Icon name="trash" size={17} /></button></div></td>
   </tr>
  })}</tbody>
 </table></div>
}

const tabs = [['inicio', 'home', 'Início'], ['extrato', 'bank', 'Extrato'], ['contas', 'list', 'Contas']]
const tabNote = { inicio: 'Saldo, gráficos e resumo do mês.', extrato: 'Movimentações da conta conectada, pela data bancária.', contas: 'Contas a pagar e a receber cadastradas pela equipe.' }
const typeFilters = [['all', 'Todos'], ['income', 'Receitas'], ['expense', 'Despesas']]
const statusFilters = [['all', 'Todas'], ['pending', 'Em aberto'], ['paid', 'Concluídos'], ['overdue', 'Em atraso']]
const basisFilters = [['due', 'Vencimento'], ['payment', 'Pagamento / recebimento']]

function FinanceWorkspace({ notify }) {
 const [params, setParams] = useSearchParams(), requestedMonth = params.get('mes'), requestedTab = params.get('aba'), [month, setMonth] = useState(validMonth(requestedMonth) ? requestedMonth : today().slice(0, 7))
 const view = tabs.some(([key]) => key === requestedTab) ? requestedTab : 'inicio'
 const [type, setType] = useState('all'), [status, setStatus] = useState('all'), [basis, setBasis] = useState('due'), [search, setSearch] = useState(''), [category, setCategory] = useState('all'), [editing, setEditing] = useState(null), [removing, setRemoving] = useState(null), [goalEditing, setGoalEditing] = useState(false), [exporting, setExporting] = useState(false), [exportError, setExportError] = useState('')
 const ledger = useRef(null), tabButtons = useRef({}), bank = useBankData()
 useCreateIntent('receita', () => setEditing({ type: 'income' }))
 useCreateIntent('despesa', () => setEditing({ type: 'expense' }))
 const setParam = (key, value) => setParams(previous => { const next = new URLSearchParams(previous); next.set(key, value); return next }, { replace: true })
 const changeMonth = value => { setMonth(value); setCategory('all'); setParam('mes', value) }
 const setView = key => setParam('aba', key)
 useEffect(() => { if (validMonth(requestedMonth)) { const timer = setTimeout(() => { setMonth(requestedMonth); setCategory('all') }, 0); return () => clearTimeout(timer) } }, [requestedMonth])
 const query = useCallback(() => listFinanceMonth(month), [month]), { data, error, loading, reload } = useQuery(query), ready = data?.month === month, records = ready ? data.records : [], goal = ready ? data.goal : null, totals = financeTotals(records, month), filters = { month, type, status, basis, search, category }, visible = filterEntries(records, filters)
 const categories = [...new Set(entriesForMonth(records, month, basis).filter(record => type === 'all' || record.type === type).map(categoryLabel))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
 const pager = usePagination(visible, { pageSize: 25, resetKey: `${month}|${type}|${status}|${basis}|${search}|${category}` })
 const open = (tab, entryType) => {
  setView(tab === 'accounts' ? 'contas' : tab === 'statement' ? 'extrato' : tab)
  if (tab === 'accounts') { setType(entryType || 'all'); setStatus(entryType ? 'pending' : 'all'); setBasis('due'); setCategory('all'); setSearch(''); requestAnimationFrame(() => ledger.current?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' })) }
 }
 const exportExcel = async () => { setExporting(true); setExportError(''); try { const { financeWorkbook } = await import('./finance-workbook.mjs'); downloadFile(new Blob([financeWorkbook(visible, records, month, filters, goal)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `duuk-financeiro-${month}-${type}-${status}.xlsx`) } catch { setExportError('Não foi possível gerar a planilha. Tente novamente.') } finally { setExporting(false) } }
 const exportCsv = () => downloadFile(new Blob([financeCsv(visible)], { type: 'text/csv;charset=utf-8' }), `duuk-financeiro-${month}-${type}-${status}.csv`)
 const exportedDisabled = !visible.length || loading || Boolean(error), afterSave = async message => { await reload(); notify(message) }
 const refresh = async () => { await Promise.all([reload(), bank.reload()]) }
 const bankError = bank.status.error || bank.overview.error, recordsLoading = loading && !ready
 const filtersActive = type !== 'all' || status !== 'all' || category !== 'all' || Boolean(search) || basis !== 'due'
 const clearFilters = () => { setType('all'); setStatus('all'); setCategory('all'); setSearch(''); setBasis('due') }
 const tabKeys = (event, index) => {
  const target = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: tabs.length - 1 }[event.key]
  if (target === undefined) return
  event.preventDefault()
  const [key] = tabs[(target + tabs.length) % tabs.length]
  setView(key)
  tabButtons.current[key]?.focus()
 }
 const notices = (bankError && view !== 'contas') || (error && view !== 'extrato')
 return <div className="finance-page">
  <PageTitle eyebrow="ADMINISTRATIVO / FINANCEIRO" title="Financeiro" description="Sua conta, suas contas e para onde vai o dinheiro.">
   <div className="finance-title-tools"><PrivacyToggle /><span title="Atualizar dados"><RefreshButton onRefresh={refresh} label="Atualizar dados" compact /></span></div>
   <button type="button" className="admin-button admin-button--secondary" onClick={() => setEditing({ type: 'expense' })}><Icon name="plus" />Nova despesa</button>
   <button type="button" className="admin-button" onClick={() => setEditing({ type: 'income' })}><Icon name="plus" />Nova receita</button>
  </PageTitle>
  <div className="finance-toolbar">
   <div className="ds-tabs finance-tabs" role="tablist" aria-label="Seções do financeiro">{tabs.map(([key, icon, label], index) => <button
    key={key}
    ref={node => { tabButtons.current[key] = node }}
    type="button"
    role="tab"
    id={`finance-tab-${key}`}
    aria-selected={view === key}
    aria-controls="finance-panel"
    tabIndex={view === key ? 0 : -1}
    onClick={() => setView(key)}
    onKeyDown={event => tabKeys(event, index)}
   ><Icon name={icon} size={16} />{label}</button>)}</div>
   <p className="finance-toolbar__note">{tabNote[view]}</p>
   <div className="finance-period"><MonthNavigation month={month} onChange={changeMonth} /></div>
  </div>
  {notices && <div className="finance-notices">
   {bankError && view !== 'contas' && <ErrorState onRetry={bank.reload}>{bankError}{bank.data && ' Os últimos dados consultados continuam visíveis.'}</ErrorState>}
   {error && view !== 'extrato' && <ErrorState onRetry={reload}>{error}{ready && ' Os últimos dados carregados continuam visíveis.'}</ErrorState>}
  </div>}
  <div id="finance-panel" role="tabpanel" aria-labelledby={`finance-tab-${view}`} className="finance-panel">
   {view === 'inicio' && <FinanceHome bank={bank} month={month} onMonthChange={changeMonth} records={records} recordsReady={ready} recordsLoading={recordsLoading} totals={totals} onOpen={open} onEdit={record => setEditing({ type: record.type, record })} />}
   {view === 'extrato' && <FinanceStatement bank={bank} month={month} />}
   {view === 'contas' && <div className="finance-accounts">
    <div className="finance-kpis">
     <Kpi label="A receber" icon="incoming" kind="positive" loading={recordsLoading} cents={ready ? totals.pendingIncome : null} note={totals.overdueIncome > 0 ? 'Há recebimentos em atraso' : 'Vencimentos deste mês'} onClick={() => open('accounts', 'income')} />
     <Kpi label="A pagar" icon="outgoing" kind="negative" loading={recordsLoading} cents={ready ? totals.pendingExpense : null} note={totals.overdueExpense > 0 ? 'Há pagamentos em atraso' : 'Vencimentos deste mês'} onClick={() => open('accounts', 'expense')} />
     <Kpi label="Recebido no mês" icon="check" kind="positive" loading={recordsLoading} cents={ready ? totals.received : null} note="Pela data do recebimento" />
     <Kpi label="Pago no mês" icon="check" kind="negative" loading={recordsLoading} cents={ready ? totals.paid : null} note="Pela data do pagamento" />
    </div>
    <div className="finance-accounts__grid">
     <section ref={ledger} className="admin-panel finance-ledger" aria-labelledby="finance-ledger-title">
      <div className="finance-ledger__head">
       <div><h2 id="finance-ledger-title">Contas a pagar e a receber</h2><p>Cadastradas pela equipe</p></div>
       <div className="finance-ledger__exports">
        <button type="button" className="admin-button admin-button--secondary admin-button--sm" disabled={exportedDisabled} onClick={exportCsv}><Icon name="download" />CSV</button>
        <button type="button" className="admin-button admin-button--secondary admin-button--sm" disabled={exportedDisabled || exporting} aria-busy={exporting} onClick={exportExcel}><Icon name="download" />{exporting ? 'Gerando…' : 'Exportar Excel'}</button>
       </div>
      </div>
      {exportError && <div className="finance-ledger__notice"><ErrorState onRetry={exportExcel}>{exportError}</ErrorState></div>}
      <div className="finance-filters" role="search" aria-label="Filtrar lançamentos">
       <SearchField value={search} onChange={setSearch} label="Buscar lançamentos" placeholder="Buscar lançamento" className="finance-filters__search" />
       <div className="ds-segmented finance-filters__type" role="group" aria-label="Tipo de lançamento">{typeFilters.map(([key, label]) => <button type="button" key={key} aria-pressed={type === key} onClick={() => { setType(key); setCategory('all') }}>{label}</button>)}</div>
       <div className="finance-filters__selects finance-filters__selects--three">
        <FilterSelect label="Data da lista" value={basis} options={basisFilters} onChange={value => { setBasis(value); setCategory('all'); setStatus('all') }} />
        <FilterSelect label="Situação" value={status} options={statusFilters} onChange={setStatus} />
        <FilterSelect label="Categoria" value={category} options={[['all', 'Todas'], ...categories.map(label => [label, label])]} onChange={setCategory} />
       </div>
       {filtersActive && <button type="button" className="admin-text-button finance-filters__clear" onClick={clearFilters}><Icon name="close" size={14} />Limpar filtros</button>}
      </div>
      <div className="finance-ledger__summary"><span role="status">{ready ? `${visible.length} lançamento${visible.length !== 1 ? 's' : ''}` : 'Carregando lançamentos…'}</span><small>A lista e a exportação respeitam os filtros. O resumo considera o mês completo.</small></div>
      {loading && !ready ? <SkeletonRows count={5} label="Carregando o financeiro…" /> : visible.length ? <>
       <LedgerTable records={pager.items} basis={basis} month={month} onEdit={record => setEditing({ type: record.type, record })} onRemove={setRemoving} />
       <Pagination pager={pager} noun="lançamentos" label="Páginas de lançamentos" />
      </> : <EmptyState
       icon={error && !ready ? 'alertCircle' : filtersActive ? 'search' : 'wallet'}
       title={error && !ready ? 'Não foi possível carregar' : filtersActive ? 'Nenhum lançamento com estes filtros' : 'Seu mês começa aqui'}
       action={error && !ready ? null : filtersActive ? <button type="button" className="admin-button admin-button--secondary" onClick={clearFilters}>Limpar filtros</button> : <div className="finance-empty-actions"><button type="button" className="admin-button admin-button--secondary" onClick={() => setEditing({ type: 'expense' })}><Icon name="plus" />Nova despesa</button><button type="button" className="admin-button" onClick={() => setEditing({ type: 'income' })}><Icon name="plus" />Nova receita</button></div>}
      >{error && !ready ? 'Atualize para tentar carregar seus lançamentos.' : filtersActive ? 'Ajuste ou limpe os filtros para ver outros lançamentos.' : 'Registre receitas e despesas ou escolha outro período.'}</EmptyState>}
     </section>
     <GoalPanel received={totals.received} paid={totals.paid} goal={goal} ready={ready} onEdit={() => setGoalEditing(true)} />
    </div>
   </div>}
  </div>
  {editing?.type === 'income' && <IncomeEditor record={editing.record} month={month} onClose={() => setEditing(null)} onSaved={() => afterSave('Receita salva.')} />}
  {editing?.type === 'expense' && <ExpenseEditor record={editing.record} initialDueDate={initialDateForMonth(month)} onClose={() => setEditing(null)} onSaved={() => afterSave('Despesa salva.')} />}
  {goalEditing && <GoalEditor record={goal} month={month} onClose={() => setGoalEditing(false)} onSaved={() => afterSave('Meta atualizada.')} />}
  {removing && <ConfirmModal title={`Excluir ${removing.type === 'income' ? 'receita' : 'despesa'}?`} message={`“${removing.title}” será excluída do controle financeiro.`} action="Excluir lançamento" onClose={() => setRemoving(null)} onConfirm={async () => { if (removing.type === 'income') await deleteIncome(removing); else await deleteExpense(removing); await afterSave('Lançamento excluído.') }} />}
 </div>
}

export default function FinancePage({ notify = () => {} }) {
 return <FinancePrivacy><FinanceWorkspace notify={notify} /></FinancePrivacy>
}
