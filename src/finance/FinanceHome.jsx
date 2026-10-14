import { Link } from 'react-router-dom'
import { Icon } from '../admin/components'
import { dateLabel } from '../office/model'
import { monthLabel } from '../office/calendarModel'
import { fmtTime } from '../crm/model'
import { categorySpend, change, dailyBalance, inMonth, methodSummary, monthlyFlow, monthSummary } from './bankModel.mjs'
import { BalanceArea, CategoryDonut, FlowBars } from './charts'
import { isOverdue, statusLabel } from './financeModel.mjs'
import { Money } from './privacy'

const investmentTypes = { FIXED_INCOME: 'Renda fixa', MUTUAL_FUND: 'Fundos', EQUITY: 'Ações', ETF: 'ETF', SECURITY: 'Previdência', COE: 'COE', OTHER: 'Outros' }

export function Kpi({ label, cents, icon, kind, note, delta, invert, onClick }) {
 const good = delta == null ? null : invert ? delta <= 0 : delta >= 0
 const body = <><div className="finance-kpi__head"><span className={`finance-kpi__icon${kind ? ` is-${kind}` : ''}`}><Icon name={icon} size={17} /></span><span>{label}</span></div><strong><Money cents={cents} /></strong><small>{delta != null && <b className={good ? 'is-positive' : 'is-negative'}>{delta > 0 ? '▲' : delta < 0 ? '▼' : '•'} {Math.abs(delta)}%</b>}{note}</small></>
 return onClick ? <button type="button" className="finance-kpi" onClick={onClick}>{body}<Icon name="arrow" size={15} className="finance-kpi__go" /></button> : <div className="finance-kpi">{body}</div>
}

function Panel({ eyebrow, title, action, className = '', children }) {
 return <section className={`admin-panel finance-card ${className}`}><div className="finance-section-title"><div><p className="admin-eyebrow">{eyebrow}</p><h2>{title}</h2></div>{action}</div>{children}</section>
}

export function MovementRow({ row }) {
 const income = row.amount_cents >= 0
 return <div className={`finance-move${row.status !== 'POSTED' ? ' is-pending' : ''}`}><span className={`finance-move__icon ${income ? 'is-positive' : 'is-negative'}`}><Icon name={income ? 'incoming' : 'outgoing'} size={16} /></span><span className="finance-move__copy"><strong>{row.title}</strong><small>{[row.category, row.method, row.status !== 'POSTED' && 'Pendente'].filter(Boolean).join(' · ') || 'Sem categoria'}</small></span><Money cents={row.amount_cents} signed tone /></div>
}

function Cards({ cards }) {
 return <Panel eyebrow="CARTÕES DE CRÉDITO" title="Faturas e limites" className="finance-cards-panel">{cards.map(card => {
  const used = card.limit_cents ? Math.max(0, card.limit_cents - (card.available_cents ?? card.limit_cents)) : null, ratio = card.limit_cents ? Math.min(100, used / card.limit_cents * 100) : 0
  return <article key={card.id} className="finance-credit"><div className="finance-credit__head"><span><Icon name="card" size={16} />{card.label}{card.brand ? ` · ${card.brand}` : ''}</span><small>{card.last_four ? `final ${card.last_four}` : ''}</small></div><div className="finance-credit__value"><small>Fatura atual</small><strong><Money cents={card.balance_cents} /></strong></div>{card.limit_cents != null && <><span className={`finance-meter${ratio > 85 ? ' is-negative' : ''}`} aria-hidden="true"><i style={{ width: `${ratio}%` }} /></span><div className="finance-credit__meta"><span>Usado <Money cents={used} /></span><span>Disponível <Money cents={card.available_cents} /></span></div></>}<div className="finance-credit__meta">{card.due_date && <span>Vence em {dateLabel(card.due_date)}</span>}{card.close_date && <span>Fecha em {dateLabel(card.close_date)}</span>}{card.minimum_cents != null && <span>Mínimo <Money cents={card.minimum_cents} /></span>}</div></article>
 })}</Panel>
}

function Investments({ items }) {
 const total = items.reduce((sum, item) => sum + item.balance_cents, 0), top = [...items].sort((a, b) => b.balance_cents - a.balance_cents).slice(0, 5)
 return <Panel eyebrow="INVESTIMENTOS" title="Patrimônio investido" className="finance-invest-panel"><strong className="finance-big"><Money cents={total} /></strong><p className="office-muted">{items.length} aplicaç{items.length === 1 ? 'ão' : 'ões'} na conexão do Meu Pluggy.</p><ul className="finance-invest-list">{top.map(item => <li key={item.id}><span><strong>{item.label}</strong><small>{investmentTypes[item.type] || 'Investimento'}</small></span><Money cents={item.balance_cents} /></li>)}</ul></Panel>
}

export default function FinanceHome({ bank, month, onMonthChange, records, recordsReady, totals, onOpen, onEdit }) {
 const { configured, data, status, overview } = bank, rows = data?.transactions || [], covered = data?.months?.includes(month)
 const flow = data ? monthlyFlow(rows, data.months) : [], current = covered ? monthSummary(rows, month) : null, previous = covered && data.months.indexOf(month) > 0 ? monthSummary(rows, data.months[data.months.indexOf(month) - 1]) : null
 const balance = covered ? dailyBalance(rows, data.account.balance_cents, month, data.today) : [], categories = covered ? categorySpend(rows, month) : [], methods = covered ? methodSummary(rows, month) : []
 const recent = covered ? inMonth(rows, month).slice(0, 7) : []
 const bills = records.filter(record => record.status !== 'paid').sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 6)
 const loadingBank = configured && !data && overview.loading
 return <div className="finance-home">
  <section className="finance-hero" aria-label="Saldo da conta conectada">
   <div className="finance-hero__main"><p className="admin-eyebrow">SALDO DISPONÍVEL</p>{configured ? <><strong className="finance-hero__value">{data ? <Money cents={data.account.balance_cents} /> : '…'}</strong><p>{data ? <>{data.account.label}{data.account.last_four && ` · final ${data.account.last_four}`}{data.provider_updated_at && <> · atualizado em {fmtTime(data.provider_updated_at)}</>}</> : loadingBank ? 'Consultando o Meu Pluggy…' : 'Não foi possível consultar a conta.'}</p></> : <><strong className="finance-hero__value finance-hero__value--empty">Conecte sua conta</strong><p>{status.loading ? 'Conferindo a conexão…' : 'Um super administrador conecta a conta em Configurações → Integrações → Meu Pluggy.'}</p>{!status.loading && <Link className="admin-button admin-button--secondary" to="/admin/configuracoes/integracoes"><Icon name="link" />Integrações</Link>}</>}</div>
   {current && <div className="finance-hero__side"><p className="admin-eyebrow">RESULTADO DE {monthLabel(month).toLocaleUpperCase('pt-BR')}</p><strong><Money cents={current.net} signed tone /></strong><p>{current.count} movimentaç{current.count === 1 ? 'ão' : 'ões'}{current.pending ? ` · ${current.pending} pendente${current.pending > 1 ? 's' : ''}` : ''}</p></div>}
  </section>
  {data?.warning && <p className="admin-error" role="status">{data.warning}</p>}
  {data?.complete === false && <p className="admin-error" role="status">O período tem mais movimentações do que o limite de consulta. Gráficos e totais usam apenas os registros consultados.</p>}
  {configured && data && !covered && <p className="finance-note"><Icon name="info" size={15} />Os gráficos cobrem os últimos 6 meses. Para {monthLabel(month)}, veja o Extrato.</p>}

  <div className="finance-kpis">
   <Kpi label="Entradas" icon="incoming" kind="positive" cents={current?.income ?? null} delta={previous ? change(current.income, previous.income) : null} note={previous ? ' vs. mês anterior' : 'Confirmadas na conta'} />
   <Kpi label="Saídas" icon="outgoing" kind="negative" cents={current?.expense ?? null} delta={previous ? change(current.expense, previous.expense) : null} invert note={previous ? ' vs. mês anterior' : 'Confirmadas na conta'} />
   <Kpi label="A receber" icon="clock" kind="positive" cents={recordsReady ? totals.pendingIncome : null} note={totals.overdueIncome > 0 ? 'Há recebimentos em atraso' : 'Contas cadastradas no mês'} onClick={() => onOpen('accounts', 'income')} />
   <Kpi label="A pagar" icon="clock" kind="negative" cents={recordsReady ? totals.pendingExpense : null} note={totals.overdueExpense > 0 ? 'Há pagamentos em atraso' : 'Contas cadastradas no mês'} onClick={() => onOpen('accounts', 'expense')} />
  </div>

  {data && <div className="finance-grid">
   <Panel eyebrow="ÚLTIMOS 6 MESES" title="Entradas x saídas" className="finance-flow-panel">{<FlowBars data={flow} selected={month} onSelect={onMonthChange} />}</Panel>
   {covered && <Panel eyebrow={monthLabel(month).toLocaleUpperCase('pt-BR')} title="Evolução do saldo" className="finance-balance-panel"><BalanceArea series={balance} /><p className="finance-panel-note">Saldo ao fim de cada dia, calculado a partir do saldo informado e das movimentações confirmadas.</p></Panel>}
   {covered && <Panel eyebrow="PARA ONDE FOI O DINHEIRO" title="Saídas por categoria" className="finance-category-card"><CategoryDonut items={categories} /></Panel>}
   {covered && <Panel eyebrow="COMO O DINHEIRO MOVIMENTOU" title="Formas de pagamento" className="finance-method-card">{methods.length ? <ul className="finance-methods">{methods.map(item => <li key={item.label}><span>{item.label}<small>{item.count} movimentaç{item.count === 1 ? 'ão' : 'ões'}</small></span><span className="finance-methods__values">{item.income > 0 && <Money cents={item.income} signed tone />}{item.expense > 0 && <Money cents={-item.expense} signed tone />}</span></li>)}</ul> : <p className="finance-chart-empty">Nenhuma movimentação confirmada neste mês.</p>}</Panel>}
  </div>}

  {data && (data.cards?.length > 0 || data.investments?.length > 0) && <div className="finance-grid finance-grid--extras">{data.cards?.length > 0 && <Cards cards={data.cards} />}{data.investments?.length > 0 && <Investments items={data.investments} />}</div>}

  <div className="finance-grid finance-grid--lists">
   {configured && <Panel eyebrow="CONTA CONECTADA" title="Últimas movimentações" action={<button type="button" className="admin-text-button" onClick={() => onOpen('statement')}>Ver extrato<Icon name="arrow" size={15} /></button>}>{recent.length ? <div className="finance-moves">{recent.map(row => <MovementRow key={row.id} row={row} />)}</div> : <p className="finance-chart-empty">{loadingBank ? 'Carregando movimentações…' : 'Nenhuma movimentação neste mês.'}</p>}</Panel>}
   <Panel eyebrow="CADASTRADAS PELA EQUIPE" title="Próximas contas" action={<button type="button" className="admin-text-button" onClick={() => onOpen('accounts')}>Ver contas<Icon name="arrow" size={15} /></button>}>{bills.length ? <div className="finance-moves">{bills.map(record => <button type="button" key={record.key} className="finance-move finance-move--bill" onClick={() => onEdit(record)}><span className={`finance-move__icon ${record.type === 'income' ? 'is-positive' : 'is-negative'}`}><Icon name="clock" size={16} /></span><span className="finance-move__copy"><strong>{record.title}</strong><small className={isOverdue(record) ? 'is-negative' : ''}>{isOverdue(record) ? 'Em atraso' : statusLabel(record)} · vence {dateLabel(record.due_date)}</small></span><Money cents={record.type === 'income' ? Number(record.amount_cents) : -Number(record.amount_cents)} signed tone /></button>)}</div> : <p className="finance-chart-empty">{recordsReady ? 'Nenhuma conta em aberto neste mês.' : 'Carregando contas…'}</p>}</Panel>
  </div>
 </div>
}
