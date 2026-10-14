import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../admin/components'
import { downloadFile } from '../office/model'
import { monthLabel } from '../office/calendarModel'
import { useQuery } from '../office/useQuery'
import { filterStatement, groupByDay, groupLabel, inMonth, monthSummary, options } from './bankModel.mjs'
import { MovementRow } from './FinanceHome'
import { Money } from './privacy'
import { pluggyRequest } from './pluggy-api'
import { statementCsv } from './pluggyModel.mjs'

const dayTitle = date => { const text = new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }); return text[0].toLocaleUpperCase('pt-BR') + text.slice(1) }

export default function FinanceStatement({ bank, month }) {
 const { configured, data, status, overview } = bank, covered = data?.months?.includes(month)
 // Months outside the overview window are read on demand.
 const older = useQuery(useCallback(() => configured && data && !covered ? pluggyRequest({ action: 'statement', month, connection_version: status.data?.version }) : Promise.resolve(null), [configured, data, covered, month, status.data?.version]))
 const [type, setType] = useState('all'), [category, setCategory] = useState('all'), [method, setMethod] = useState('all'), [search, setSearch] = useState('')
 const source = covered ? { rows: inMonth(data.transactions, month), loading: false, error: overview.error } : { rows: older.data?.month === month ? older.data.transactions : [], loading: older.loading || overview.loading, error: older.error || overview.error }
 const summary = monthSummary(source.rows, month), visible = filterStatement(source.rows, { type, category, method, search }), days = groupByDay(visible)
 const filtered = type !== 'all' || category !== 'all' || method !== 'all' || search
 if (!configured) return <section className="admin-panel finance-card"><div className="admin-empty"><Icon name="bank" size={32} /><h3>{status.loading ? 'Conferindo conexão…' : 'Nenhuma conta conectada'}</h3><p>Um super administrador conecta a conta em Configurações → Integrações → Meu Pluggy.</p>{!status.loading && <Link className="admin-button admin-button--secondary" to="/admin/configuracoes/integracoes"><Icon name="link" />Integrações</Link>}</div></section>
 return <div className="finance-statement">
  <div className="finance-strip">
   <div><small>Entradas</small><Money cents={summary.income} signed tone /></div>
   <div><small>Saídas</small><Money cents={-summary.expense} signed tone /></div>
   <div><small>Resultado</small><Money cents={summary.net} signed tone /></div>
   <div><small>Pendentes</small><strong>{summary.pending}</strong></div>
  </div>
  {older.error && !covered && <p className="admin-error" role="alert">{older.error}<button type="button" className="admin-text-button" onClick={older.reload}>Tentar novamente</button></p>}
  {(covered ? data.complete === false : older.data?.complete === false) && <p className="admin-error" role="status">Este mês ultrapassa o limite de consulta. A lista e a exportação incluem apenas os registros consultados.</p>}
  <section className="admin-panel finance-card finance-statement-panel" aria-labelledby="finance-statement-title">
   <div className="finance-section-title"><div><p className="admin-eyebrow">{data ? `${data.account.label}${data.account.last_four ? ` · FINAL ${data.account.last_four}` : ''}`.toLocaleUpperCase('pt-BR') : 'CONTA CONECTADA'}</p><h2 id="finance-statement-title">Extrato de {monthLabel(month)}</h2></div><button type="button" className="admin-button admin-button--secondary" disabled={!visible.length} onClick={() => downloadFile(new Blob([statementCsv(visible)], { type: 'text/csv;charset=utf-8' }), `duuk-extrato-${month}.csv`)}><Icon name="download" />CSV</button></div>
   <div className="finance-filter-bar"><div className="admin-filter-tabs">{[['all', 'Todas'], ['income', 'Entradas'], ['expense', 'Saídas']].map(([key, label]) => <button type="button" key={key} className={type === key ? 'is-active' : ''} aria-pressed={type === key} onClick={() => setType(key)}>{label}</button>)}</div><label className="admin-search"><Icon name="search" size={17} /><input aria-label="Buscar movimentação" placeholder="Buscar movimentação" value={search} onChange={event => setSearch(event.target.value)} /></label></div>
   <div className="finance-filter-fields finance-filter-fields--two"><label className="admin-field"><span>Categoria</span><select value={category} onChange={event => setCategory(event.target.value)}><option value="all">Todas as categorias</option>{options(source.rows, groupLabel).map(label => <option key={label} value={label}>{label}</option>)}</select></label><label className="admin-field"><span>Forma de pagamento</span><select value={method} onChange={event => setMethod(event.target.value)}><option value="all">Todas as formas</option>{options(source.rows, row => row.method || 'Outros').map(label => <option key={label} value={label}>{label}</option>)}</select></label></div>
   {source.loading && !source.rows.length ? <p className="finance-chart-empty" role="status">Consultando a conta…</p> : days.length ? <div className="finance-days">{days.map(day => <div key={day.date} className="finance-day"><div className="finance-day__head"><span>{dayTitle(day.date)}</span><Money cents={day.net} signed tone /></div><div className="finance-moves">{day.rows.map(row => <MovementRow key={row.id} row={row} />)}</div></div>)}</div> : <div className="admin-empty"><Icon name="list" size={30} /><h3>{source.error && !source.rows.length ? 'Não foi possível consultar' : filtered ? 'Nenhuma movimentação com estes filtros' : 'Nenhuma movimentação neste mês'}</h3><p>Escolha outro mês ou ajuste os filtros.</p></div>}
   <p className="finance-panel-note">Dados do Meu Pluggy, atualizados pela origem a cada 24 horas. Pendentes aparecem na lista, mas não entram nos totais. Consultar o extrato não cria receitas nem despesas.</p>
  </section>
 </div>
}
