import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ConfirmModal, Icon, Modal, RefreshButton } from '../admin/components'
import { EmptyState, ErrorState, PageTitle, Pagination, SearchField } from '../admin/forms'
import { matchesQuery, usePagination } from '../admin/ds/list'
import { useUnsavedChanges } from '../admin/unsavedChanges'
import { deleteExpense, listExpenses, saveExpense } from './api'
import { brl, cents, csv, dateLabel, downloadFile, expenseCategories, expenseTotals, today } from './model'
import { useQuery } from './useQuery'
import { DateField, MonthNavigation } from './Calendar'
import { monthLabel } from './calendarModel.js'
import { ListSkeleton, OfficeField } from './OfficeParts'
import { useValidation } from './officeHelpers'

const statusFilters = [['all', 'Todas'], ['pending', 'A pagar'], ['paid', 'Pagas']]

// Same rules the save applies (cents() and the table constraints), shown next to each field.
function expenseErrors(form) {
  const errors = {}
  if (!form.title.trim()) errors.title = 'Informe o nome da despesa.'
  if (!String(form.amount ?? '').trim()) errors.amount = 'Informe o valor da despesa.'
  else { try { cents(form.amount) } catch (cause) { errors.amount = cause.message } }
  return errors
}

export function ExpenseEditor({ record, initialDueDate = today(), onClose, onSaved }) {
  const [form, setForm] = useState(() => record ? { ...record, amount: (Number(record.amount_cents) / 100).toFixed(2) } : { title: '', description: '', amount: '', category: 'production', due_date: initialDueDate, status: 'pending', paid_date: today() })
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  useUnsavedChanges(true)
  const { control, field, check } = useValidation(expenseErrors, form)
  const update = (key, value) => setForm(old => ({ ...old, [key]: value }))
  const save = async event => {
    event.preventDefault()
    if (busy || !check()) return
    setError(''); setBusy(true)
    try {
      await saveExpense({ title: form.title.trim(), description: form.description.trim(), amount_cents: cents(form.amount), category: form.category, due_date: form.due_date, status: form.status, paid_date: form.status === 'paid' ? (form.paid_date || today()) : null }, record)
      await onSaved(); onClose()
    } catch (cause) { setError(cause.message) } finally { setBusy(false) }
  }
  return (
    <Modal title={record ? 'Editar despesa' : 'Nova despesa'} subtitle="Valores em reais. O vencimento define o mês do relatório." onClose={() => { if (!busy) onClose() }}>
      <form onSubmit={save} noValidate>
        <fieldset disabled={busy} className="office-form">
          <div className="admin-form-grid">
            <OfficeField label="Nome da despesa" className="ds-span-2" {...field('title')}>
              <input {...control('title')} maxLength={160} autoComplete="off" value={form.title} onChange={e => update('title', e.target.value)} />
            </OfficeField>
            <OfficeField label={<>Valor<span className="ds-visually-hidden"> em reais</span></>} {...field('amount')}>
              <div className="admin-input-prefix">
                <span aria-hidden="true">R$</span>
                <input {...control('amount')} inputMode="decimal" placeholder="0,00" autoComplete="off" value={form.amount} onChange={e => update('amount', e.target.value)} />
              </div>
            </OfficeField>
            <DateField label="Vencimento" value={form.due_date} onChange={value => update('due_date', value)} />
            <OfficeField label="Categoria" {...field('category')}>
              <select {...control('category')} value={form.category} onChange={e => update('category', e.target.value)}>{Object.entries(expenseCategories).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select>
            </OfficeField>
            <OfficeField label="Situação" {...field('status')}>
              <select {...control('status')} value={form.status} onChange={e => update('status', e.target.value)}><option value="pending">A pagar</option><option value="paid">Pago</option></select>
            </OfficeField>
            {form.status === 'paid' && <DateField label="Data do pagamento" value={form.paid_date || today()} onChange={value => update('paid_date', value)} />}
            <OfficeField label="Observações" optional className="ds-span-2" {...field('description')}>
              <textarea {...control('description')} rows={3} maxLength={2000} value={form.description} onChange={e => update('description', e.target.value)} />
            </OfficeField>
          </div>
          {error && <ErrorState>{error}</ErrorState>}
        </fieldset>
        <div className="admin-modal__foot">
          <button type="button" className="admin-button admin-button--secondary" disabled={busy} onClick={onClose}>Cancelar</button>
          <button type="submit" className="admin-button" disabled={busy} aria-busy={busy}>{busy ? 'Salvando…' : 'Salvar despesa'}</button>
        </div>
      </form>
    </Modal>
  )
}

function Money({ loading, failed, value }) {
  if (loading) return <strong><span className="ds-skeleton office-kpi-skeleton" aria-hidden="true" /><span className="ds-visually-hidden">Carregando</span></strong>
  return <strong>{failed ? '—' : brl(value)}</strong>
}

export default function ExpensesPage({ notify }) {
  const [params] = useSearchParams(), requestedMonth = params.get('mes'), validMonth = /^(19|20)\d{2}-(0[1-9]|1[0-2])$/.test(requestedMonth || '')
  const [month, setMonth] = useState(validMonth ? requestedMonth : today().slice(0, 7)), [editing, setEditing] = useState(null), [removing, setRemoving] = useState(null), [filter, setFilter] = useState('all'), [search, setSearch] = useState('')
  useEffect(() => { if (validMonth) { const timer = setTimeout(() => setMonth(requestedMonth), 0); return () => clearTimeout(timer) } }, [requestedMonth, validMonth])
  const [exporting, setExporting] = useState(false), [exportError, setExportError] = useState('')
  const query = useCallback(async () => ({ month, records: await listExpenses(month) }), [month])
  const { data, error, loading, reload: load } = useQuery(query)
  const records = data?.month === month ? data.records : []
  const totals = expenseTotals(records), visible = records.filter(r => filter === 'all' || r.status === filter)
  const listed = visible.filter(r => matchesQuery(search, r.title, r.description, expenseCategories[r.category]))
  const pager = usePagination(listed, { pageSize: 25, resetKey: `${month}|${filter}|${search}` })
  const exportExcel = async () => { setExporting(true); setExportError(''); try { const { expensesWorkbook } = await import('./xlsx'); downloadFile(new Blob([expensesWorkbook(visible, month, filter)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `duuk-despesas-${month}-${filter}.xlsx`) } catch { setExportError('Não foi possível gerar a planilha. Tente novamente.') } finally { setExporting(false) } }
  const loadingMonth = loading && data?.month !== month, failed = Boolean(error) && data?.month !== month, searching = Boolean(search.trim())
  const noun = count => `${count} ${count === 1 ? 'registro' : 'registros'}`
  const count = searching ? `${listed.length} de ${noun(visible.length)} · a busca não altera a exportação` : `${noun(visible.length)} · exportação conforme o filtro`
  let empty = null
  if (!listed.length) {
    if (!records.length) empty = <EmptyState icon="wallet" title="Um mês organizado começa aqui" action={<button type="button" className="admin-button admin-button--secondary" onClick={() => setEditing('new')}><Icon name="plus" />Nova despesa</button>}>Registre a primeira despesa deste mês.</EmptyState>
    else if (searching) empty = <EmptyState icon="search" title="Nenhuma despesa encontrada" action={<button type="button" className="admin-button admin-button--secondary" onClick={() => setSearch('')}>Limpar busca</button>}>Tente buscar pelo nome, categoria ou observação.</EmptyState>
    else empty = <EmptyState icon="filter" title="Nenhuma despesa nesta situação" action={<button type="button" className="admin-button admin-button--secondary" onClick={() => setFilter('all')}>Ver todas</button>}>Escolha outra situação para ver as despesas do mês.</EmptyState>
  }
  return (
    <>
      <PageTitle eyebrow="ADMINISTRATIVO / FINANCEIRO" title="Despesas" description="Os custos da DUUK, organizados por mês.">
        <RefreshButton onRefresh={load} />
        <button type="button" className="admin-button" onClick={() => setEditing('new')}><Icon name="plus" />Nova despesa</button>
      </PageTitle>
      <div className="office-toolbar">
        <div className="office-toolbar__period">
          <MonthNavigation month={month} onChange={setMonth} />
          <span className="office-toolbar__label">Mês de vencimento</span>
        </div>
        <div className="office-toolbar__exports">
          <div className="office-export-actions">
            <button type="button" className="admin-button admin-button--secondary admin-button--sm" disabled={!visible.length || loading || Boolean(error)} onClick={() => downloadFile(new Blob([csv(visible)], { type: 'text/csv;charset=utf-8' }), `duuk-despesas-${month}-${filter}.csv`)}><Icon name="download" />Exportar CSV</button>
            <button type="button" className="admin-button admin-button--secondary admin-button--sm" disabled={!visible.length || loading || exporting || Boolean(error)} aria-busy={exporting} onClick={exportExcel}><Icon name="download" />{exporting ? 'Gerando…' : 'Exportar Excel'}</button>
          </div>
          {exportError && <ErrorState>{exportError}</ErrorState>}
        </div>
      </div>
      <div className="admin-stats office-money-stats office-stats-3">
        <div><span>Total do mês</span><Money loading={loadingMonth} failed={failed} value={totals.total} /></div>
        <div><span>Pago</span><Money loading={loadingMonth} failed={failed} value={totals.paid} /></div>
        <div><span>A pagar</span><Money loading={loadingMonth} failed={failed} value={totals.pending} /></div>
      </div>
      <section className="admin-panel office-list" aria-label={`Despesas de ${monthLabel(month)}`}>
        <div className="office-list-toolbar">
          <div className="admin-filter-tabs" role="group" aria-label="Situação das despesas">
            {statusFilters.map(([key, label]) => <button type="button" key={key} aria-pressed={key === filter} className={key === filter ? 'is-active' : ''} onClick={() => setFilter(key)}>{label}</button>)}
          </div>
          <div className="office-list-toolbar__end">
            {!loadingMonth && !failed && <span className="office-list-count" aria-live="polite">{count}</span>}
            <SearchField value={search} onChange={setSearch} label="Buscar despesas" placeholder="Buscar despesas…" />
          </div>
        </div>
        {error && <ErrorState onRetry={load}>{error}</ErrorState>}
        <div className="office-list-body">
          {loadingMonth ? <ListSkeleton label="Carregando despesas…" rows={5} /> : failed ? null : pager.items.length ? (
            <div className="office-table-wrap">
              <table className="ds-table office-expense-table">
                <caption className="ds-visually-hidden">Despesas de {monthLabel(month)}</caption>
                <thead>
                  <tr>
                    <th scope="col">Despesa</th>
                    <th scope="col">Categoria</th>
                    <th scope="col">Vencimento</th>
                    <th scope="col" className="is-number">Valor</th>
                    <th scope="col">Situação</th>
                    <th scope="col"><span className="ds-visually-hidden">Ações</span></th>
                  </tr>
                </thead>
                <tbody>
                  {pager.items.map(record => (
                    <tr key={record.id}>
                      <td className="is-title">
                        <button type="button" className="office-record-title" onClick={() => setEditing(record)}>
                          <strong>{record.title}</strong>
                          <small className="office-expense-sub">{[expenseCategories[record.category], `vence ${dateLabel(record.due_date)}`].filter(Boolean).join(' · ')}</small>
                          {record.description && <small className="office-expense-description">{record.description}</small>}
                        </button>
                      </td>
                      <td className="is-category">{expenseCategories[record.category] || '—'}</td>
                      <td className="is-due"><time dateTime={record.due_date}>{dateLabel(record.due_date)}</time></td>
                      <td className="is-number is-amount">{brl(record.amount_cents)}</td>
                      <td className="is-status"><span className={`ds-badge ${record.status === 'paid' ? 'ds-badge--success' : 'ds-badge--warning'}`}><i />{record.status === 'paid' ? 'Pago' : 'A pagar'}</span></td>
                      <td className="is-actions">
                        <div className="office-row-actions">
                          <button type="button" className="admin-icon-button" aria-label={`Editar ${record.title}`} onClick={() => setEditing(record)}><Icon name="edit" /></button>
                          <button type="button" className="admin-icon-button admin-icon-button--danger" aria-label={`Excluir ${record.title}`} onClick={() => setRemoving(record)}><Icon name="trash" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : empty}
        </div>
        <Pagination pager={pager} noun="despesas" label="Páginas de despesas" />
      </section>
      {editing && <ExpenseEditor record={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={async () => { await load(); notify('Despesa salva.') }} />}
      {removing && <ConfirmModal title="Excluir despesa?" message={`“${removing.title}” será excluída do controle financeiro.`} action="Excluir despesa" onClose={() => setRemoving(null)} onConfirm={async () => { await deleteExpense(removing); await load(); notify('Despesa excluída.') }} />}
    </>
  )
}
