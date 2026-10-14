import { useCallback, useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../admin/components'
import { EmptyState, ErrorState, SearchField } from '../admin/forms'
import { downloadFile } from '../office/model'
import { monthLabel } from '../office/calendarModel'
import { useQuery } from '../office/useQuery'
import { filterStatement, groupByDay, groupLabel, inMonth, monthSummary, options } from './bankModel.mjs'
import { MovementRow, Panel, SkeletonRows } from './FinanceHome'
import { Money } from './privacy'
import { pluggyRequest } from './pluggy-api'
import { statementCsv } from './pluggyModel.mjs'

const dayTitle = date => { const text = new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }); return text[0].toLocaleUpperCase('pt-BR') + text.slice(1) }
const STEP = 40

// Compact filter: the label and the chosen value read as one control; the native select keeps keyboard and phone pickers.
export function FilterSelect({ label, value, options: choices, onChange }) {
 const current = choices.find(([key]) => key === value)?.[1] ?? choices[0]?.[1] ?? ''
 return <label className={`finance-select${value !== choices[0]?.[0] ? ' is-set' : ''}`}>
  <span className="finance-select__label">{label}</span>
  <span className="finance-select__value" aria-hidden="true">{current}</span>
  <Icon name="down" size={14} />
  <select value={value} onChange={event => onChange(event.target.value)}>{choices.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select>
 </label>
}

// Long months reveal whole days in steps, so each day's total always matches its rows.
function useDaySteps(days, resetKey) {
 const [state, setState] = useState({ key: resetKey, limit: STEP })
 const limit = state.key === resetKey ? state.limit : STEP, shown = []
 let count = 0
 for (const day of days) { if (shown.length && count >= limit) break; shown.push(day); count += day.rows.length }
 return { days: shown, count, more: () => setState({ key: resetKey, limit: limit + STEP }) }
}

export default function FinanceStatement({ bank, month }) {
 const { configured, data, status, overview } = bank, covered = data?.months?.includes(month)
 // Months outside the overview window are read on demand.
 const older = useQuery(useCallback(() => configured && data && !covered ? pluggyRequest({ action: 'statement', month, connection_version: status.data?.version }) : Promise.resolve(null), [configured, data, covered, month, status.data?.version]))
 const [type, setType] = useState('all'), [category, setCategory] = useState('all'), [method, setMethod] = useState('all'), [search, setSearch] = useState(''), listId = useId()
 const source = covered ? { rows: inMonth(data.transactions, month), loading: false, error: overview.error } : { rows: older.data?.month === month ? older.data.transactions : [], loading: older.loading || overview.loading, error: older.error || overview.error }
 const summary = monthSummary(source.rows, month), visible = filterStatement(source.rows, { type, category, method, search }), days = groupByDay(visible)
 const filtered = type !== 'all' || category !== 'all' || method !== 'all' || search
 const steps = useDaySteps(days, `${month}|${type}|${category}|${method}|${search}`)
 const loading = source.loading && !source.rows.length
 const clear = () => { setType('all'); setCategory('all'); setMethod('all'); setSearch('') }
 if (!configured) return <section className="admin-panel finance-empty-panel"><EmptyState icon="bank" title={status.loading ? 'Conferindo conexão…' : 'Nenhuma conta conectada'} action={!status.loading && <Link className="admin-button admin-button--secondary" to="/admin/configuracoes/integracoes"><Icon name="link" />Integrações</Link>}>Um super administrador conecta a conta em Configurações → Integrações → Meu Pluggy.</EmptyState></section>
 const figure = node => loading ? <span className="ds-skeleton finance-strip__skeleton" aria-hidden="true" /> : node
 return <div className="finance-statement">
  <div className="finance-strip" role="group" aria-label={`Resumo de ${monthLabel(month)}`} aria-busy={loading}>
   <div><small>Entradas</small>{figure(<Money cents={summary.income} signed tone />)}</div>
   <div><small>Saídas</small>{figure(<Money cents={-summary.expense} signed tone />)}</div>
   <div className="finance-strip__net"><small>Resultado</small>{figure(<Money cents={summary.net} signed tone />)}</div>
   <div><small>Pendentes</small>{figure(<strong>{summary.pending}</strong>)}</div>
  </div>
  {older.error && !covered && <ErrorState onRetry={older.reload}>{older.error}</ErrorState>}
  {(covered ? data.complete === false : older.data?.complete === false) && <p className="ds-alert ds-alert--warning" role="status"><Icon name="warning" /><span>Este mês ultrapassa o limite de consulta. A lista e a exportação incluem apenas os registros consultados.</span></p>}
  <Panel
   title={`Extrato de ${monthLabel(month)}`}
   subtitle={data ? `${data.account.label}${data.account.last_four ? ` · final ${data.account.last_four}` : ''}` : 'Conta conectada'}
   className="finance-statement-panel"
   action={<button type="button" className="admin-button admin-button--secondary admin-button--sm" disabled={!visible.length} onClick={() => downloadFile(new Blob([statementCsv(visible)], { type: 'text/csv;charset=utf-8' }), `duuk-extrato-${month}.csv`)}><Icon name="download" />CSV</button>}
  >
   <div className="finance-filters" role="search" aria-label="Filtrar movimentações">
    <SearchField value={search} onChange={setSearch} label="Buscar movimentação" placeholder="Buscar movimentação" className="finance-filters__search" />
    <div className="ds-segmented finance-filters__type" role="group" aria-label="Tipo de movimentação">{[['all', 'Todas'], ['income', 'Entradas'], ['expense', 'Saídas']].map(([key, label]) => <button type="button" key={key} aria-pressed={type === key} onClick={() => setType(key)}>{label}</button>)}</div>
    <div className="finance-filters__selects">
     <FilterSelect label="Categoria" value={category} onChange={setCategory} options={[['all', 'Todas'], ...options(source.rows, groupLabel).map(label => [label, label])]} />
     <FilterSelect label="Pagamento" value={method} onChange={setMethod} options={[['all', 'Todas'], ...options(source.rows, row => row.method || 'Outros').map(label => [label, label])]} />
    </div>
    {filtered && <button type="button" className="admin-text-button finance-filters__clear" onClick={clear}><Icon name="close" size={14} />Limpar filtros</button>}
   </div>
   {loading ? <SkeletonRows count={6} label="Consultando a conta…" /> : days.length ? <>
    <div className="finance-days" id={listId}>{steps.days.map(day => <section key={day.date} className="finance-day" aria-label={dayTitle(day.date)}>
     <div className="finance-day__head"><h3>{dayTitle(day.date)}</h3><span><span className="finance-sr-only">Resultado do dia: </span><Money cents={day.net} signed tone /></span></div>
     <div className="finance-moves">{day.rows.map(row => <MovementRow key={row.id} row={row} />)}</div>
    </section>)}</div>
    <div className="finance-more">
     <p role="status">{steps.count < visible.length ? `Mostrando ${steps.count} de ${visible.length} movimentações` : `${visible.length} movimentaç${visible.length === 1 ? 'ão' : 'ões'}`}</p>
     {steps.count < visible.length && <button type="button" className="admin-button admin-button--secondary" aria-controls={listId} onClick={steps.more}>Mostrar mais</button>}
    </div>
   </> : <EmptyState
    icon={source.error && !source.rows.length ? 'alertCircle' : filtered ? 'search' : 'list'}
    title={source.error && !source.rows.length ? 'Não foi possível consultar' : filtered ? 'Nenhuma movimentação com estes filtros' : 'Nenhuma movimentação neste mês'}
    action={filtered && !source.error && <button type="button" className="admin-button admin-button--secondary" onClick={clear}>Limpar filtros</button>}
   >{source.error && !source.rows.length ? 'Use “Tentar novamente” no aviso acima ou escolha outro mês.' : 'Escolha outro mês ou ajuste os filtros.'}</EmptyState>}
   <p className="finance-panel-note">Dados do Meu Pluggy, atualizados pela origem a cada 24 horas. Pendentes aparecem na lista, mas não entram nos totais. Consultar o extrato não cria receitas nem despesas.</p>
  </Panel>
 </div>
}
