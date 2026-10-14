import { useId } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDown, ArrowUp, Minus } from 'lucide-react'
import { Icon } from '../admin/components'
import { dateLabel } from '../office/model'
import { monthLabel } from '../office/calendarModel'
import { fmtTime } from '../crm/model'
import { categorySpend, change, dailyBalance, inMonth, methodSummary, monthlyFlow, monthSummary } from './bankModel.mjs'
import { BalanceArea, CategoryBars, FlowBars } from './charts'
import { isOverdue, statusLabel } from './financeModel.mjs'
import { Money } from './privacy'

const investmentTypes = { FIXED_INCOME: 'Renda fixa', MUTUAL_FUND: 'Fundos', EQUITY: 'Ações', ETF: 'ETF', SECURITY: 'Previdência', COE: 'COE', OTHER: 'Outros' }
const movements = count => `${count} movimentaç${count === 1 ? 'ão' : 'ões'}`

// Month-over-month change: arrow and sign carry the direction; color only says whether it is good news.
function Delta({ value, invert }) {
 const good = invert ? value <= 0 : value >= 0, Arrow = value > 0 ? ArrowUp : value < 0 ? ArrowDown : Minus
 return <span className={`finance-delta ${good ? 'is-good' : 'is-bad'}`}><Arrow size={13} strokeWidth={2} aria-hidden="true" /><span className="finance-sr-only">{value > 0 ? 'Alta de' : value < 0 ? 'Queda de' : 'Sem variação,'}</span>{Math.abs(value)}%</span>
}

export function Kpi({ label, cents, icon, kind, note, delta, invert, onClick, loading = false }) {
 const body = <>
  <span className="finance-kpi__label"><Icon name={icon} size={16} />{label}</span>
  <strong className="finance-kpi__value">{loading ? <span className="ds-skeleton finance-kpi__skeleton" aria-hidden="true" /> : <Money cents={cents} />}{loading && <span className="finance-sr-only">Carregando</span>}</strong>
  <small className="finance-kpi__note">{delta != null && <Delta value={delta} invert={invert} />}{note}</small>
 </>
 return onClick
  ? <button type="button" className="finance-kpi finance-kpi--link" data-kind={kind} onClick={onClick}>{body}<Icon name="arrow" size={16} className="finance-kpi__go" /></button>
  : <div className="finance-kpi" data-kind={kind}>{body}</div>
}

export function Panel({ title, subtitle, action, className = '', children }) {
 const id = useId()
 return <section className={`ds-card finance-card ${className}`.trim()} aria-labelledby={id}>
  <div className="ds-card__head finance-card__head"><div><h2 id={id}>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</div>
  {children}
 </section>
}

export function SkeletonRows({ count = 4, label = 'Carregando…' }) {
 return <div className="finance-skeleton-rows" role="status">
  <span className="finance-sr-only">{label}</span>
  {Array.from({ length: count }, (_, index) => <div key={index} className="finance-skeleton-row" aria-hidden="true"><span className="ds-skeleton" /><span><span className="ds-skeleton ds-skeleton--text" /><span className="ds-skeleton ds-skeleton--text" /></span><span className="ds-skeleton ds-skeleton--text" /></div>)}
 </div>
}

function ChartSkeleton({ title }) {
 return <Panel title={title} subtitle="Consultando o Meu Pluggy…"><div className="ds-skeleton finance-chart-skeleton" aria-hidden="true" /></Panel>
}

export function MovementRow({ row }) {
 const income = row.amount_cents >= 0, pending = row.status !== 'POSTED', label = [row.category, row.method].filter(Boolean).join(' · ') || (pending ? '' : 'Sem categoria')
 return <div className={`finance-move${pending ? ' is-pending' : ''}`}>
  <span className={`finance-move__icon ${income ? 'is-in' : 'is-out'}`}><Icon name={income ? 'incoming' : 'outgoing'} size={16} /></span>
  <span className="finance-move__copy"><strong title={row.title}>{row.title}</strong><small className="finance-move__meta">{label && <span>{label}</span>}{pending && <span className="ds-badge ds-badge--warning finance-move__badge"><Icon name="clock" size={12} />Pendente</span>}</small></span>
  <Money cents={row.amount_cents} signed tone />
 </div>
}

function BillRow({ record, onEdit }) {
 const overdue = isOverdue(record), income = record.type === 'income'
 return <button type="button" className="finance-move finance-move--button" onClick={() => onEdit(record)}>
  <span className={`finance-move__icon${overdue ? ' is-overdue' : ''}`}><Icon name={overdue ? 'alertCircle' : 'clock'} size={16} /></span>
  <span className="finance-move__copy"><strong title={record.title}>{record.title}</strong><small><span className={overdue ? 'finance-text-danger' : ''}>{overdue ? 'Em atraso' : statusLabel(record)}</span> · vence {dateLabel(record.due_date)}</small></span>
  <Money cents={income ? Number(record.amount_cents) : -Number(record.amount_cents)} signed tone />
 </button>
}

function Cards({ cards }) {
 return <Panel title="Faturas e limites" subtitle="Cartões de crédito" className="finance-cards-panel">{cards.map(card => {
  const used = card.limit_cents ? Math.max(0, card.limit_cents - (card.available_cents ?? card.limit_cents)) : null, ratio = card.limit_cents ? Math.min(100, used / card.limit_cents * 100) : 0
  return <article key={card.id} className="finance-credit">
   <div className="finance-credit__head"><span><Icon name="card" size={16} />{card.label}{card.brand ? ` · ${card.brand}` : ''}</span>{card.last_four && <small>final {card.last_four}</small>}</div>
   <div className="finance-credit__value"><span>Fatura atual</span><strong><Money cents={card.balance_cents} /></strong></div>
   {card.limit_cents != null && <div className="finance-credit__limit">
    <span className={`finance-meter${ratio > 85 ? ' is-high' : ''}`} aria-hidden="true"><i style={{ width: `${ratio}%` }} /></span>
    <small>{ratio > 85 && <Icon name="warning" size={13} />}{Math.round(ratio)}% do limite usado</small>
   </div>}
   <dl className="finance-credit__meta">
    {card.limit_cents != null && <><div><dt>Usado</dt><dd><Money cents={used} /></dd></div><div><dt>Disponível</dt><dd><Money cents={card.available_cents} /></dd></div></>}
    {card.due_date && <div><dt>Vencimento</dt><dd>{dateLabel(card.due_date)}</dd></div>}
    {card.close_date && <div><dt>Fechamento</dt><dd>{dateLabel(card.close_date)}</dd></div>}
    {card.minimum_cents != null && <div><dt>Mínimo</dt><dd><Money cents={card.minimum_cents} /></dd></div>}
   </dl>
  </article>
 })}</Panel>
}

function Investments({ items }) {
 const total = items.reduce((sum, item) => sum + item.balance_cents, 0), top = [...items].sort((a, b) => b.balance_cents - a.balance_cents).slice(0, 5)
 return <Panel title="Patrimônio investido" subtitle="Investimentos" className="finance-invest-panel">
  <strong className="finance-big"><Money cents={total} /></strong>
  <p className="finance-muted">{items.length} aplicaç{items.length === 1 ? 'ão' : 'ões'} na conexão do Meu Pluggy.</p>
  <ul className="finance-invest-list">{top.map(item => <li key={item.id}><span><strong>{item.label}</strong><small>{investmentTypes[item.type] || 'Investimento'}</small></span><Money cents={item.balance_cents} /></li>)}</ul>
 </Panel>
}

export default function FinanceHome({ bank, month, onMonthChange, records, recordsReady, recordsLoading = false, totals, onOpen, onEdit }) {
 const { configured, data, status, overview } = bank, rows = data?.transactions || [], covered = data?.months?.includes(month)
 const flow = data ? monthlyFlow(rows, data.months) : [], current = covered ? monthSummary(rows, month) : null, previous = covered && data.months.indexOf(month) > 0 ? monthSummary(rows, data.months[data.months.indexOf(month) - 1]) : null
 const balance = covered ? dailyBalance(rows, data.account.balance_cents, month, data.today) : [], categories = covered ? categorySpend(rows, month) : [], methods = covered ? methodSummary(rows, month) : []
 const recent = covered ? inMonth(rows, month).slice(0, 7) : []
 const bills = records.filter(record => record.status !== 'paid').sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 6)
 const checking = !configured && status.loading && !status.data, loadingBank = configured && !data && overview.loading
 const period = monthLabel(month)
 return <div className="finance-home">
  <section className="finance-hero" aria-label="Saldo da conta conectada">
   <div className="finance-hero__main">
    <p className="finance-hero__label"><Icon name="bank" size={16} />Saldo disponível</p>
    {configured || checking ? <>
     <strong className="finance-hero__value">{data ? <Money cents={data.account.balance_cents} /> : loadingBank || checking ? <span className="ds-skeleton finance-hero__skeleton" aria-hidden="true" /> : '—'}</strong>
     <p className="finance-hero__meta">{data ? <>{data.account.label}{data.account.last_four && ` · final ${data.account.last_four}`}{data.provider_updated_at && <> · atualizado em {fmtTime(data.provider_updated_at)}</>}</> : checking ? 'Conferindo a conexão…' : loadingBank ? 'Consultando o Meu Pluggy…' : 'Não foi possível consultar a conta.'}</p>
    </> : <>
     <strong className="finance-hero__value finance-hero__value--empty">Conecte sua conta</strong>
     <p className="finance-hero__meta">Um super administrador conecta a conta em Configurações → Integrações → Meu Pluggy.</p>
     <Link className="admin-button admin-button--secondary finance-hero__action" to="/admin/configuracoes/integracoes"><Icon name="link" />Integrações</Link>
    </>}
   </div>
   {current && <div className="finance-hero__side">
    <p className="finance-hero__label">Resultado de {period.toLocaleLowerCase('pt-BR')}</p>
    <strong><Money cents={current.net} signed tone /></strong>
    <p className="finance-hero__meta">{movements(current.count)}{current.pending ? ` · ${current.pending} pendente${current.pending > 1 ? 's' : ''}` : ''}</p>
   </div>}
  </section>

  {(data?.warning || data?.complete === false || (configured && data && !covered)) && <div className="finance-notices">
   {data?.warning && <p className="ds-alert ds-alert--warning" role="status"><Icon name="warning" /><span>{data.warning}</span></p>}
   {data?.complete === false && <p className="ds-alert ds-alert--warning" role="status"><Icon name="warning" /><span>O período tem mais movimentações do que o limite de consulta. Gráficos e totais usam apenas os registros consultados.</span></p>}
   {configured && data && !covered && <p className="ds-alert ds-alert--info"><Icon name="info" /><span>Os gráficos cobrem os últimos 6 meses. Para {period}, veja o Extrato.</span></p>}
  </div>}

  <div className="finance-kpis">
   <Kpi label="Entradas" icon="incoming" kind="positive" loading={loadingBank || checking} cents={current?.income ?? null} delta={previous ? change(current.income, previous.income) : null} note={previous ? ' vs. mês anterior' : 'Confirmadas na conta'} />
   <Kpi label="Saídas" icon="outgoing" kind="negative" loading={loadingBank || checking} cents={current?.expense ?? null} delta={previous ? change(current.expense, previous.expense) : null} invert note={previous ? ' vs. mês anterior' : 'Confirmadas na conta'} />
   <Kpi label="A receber" icon="clock" kind="positive" loading={recordsLoading} cents={recordsReady ? totals.pendingIncome : null} note={totals.overdueIncome > 0 ? 'Há recebimentos em atraso' : 'Contas cadastradas no mês'} onClick={() => onOpen('accounts', 'income')} />
   <Kpi label="A pagar" icon="clock" kind="negative" loading={recordsLoading} cents={recordsReady ? totals.pendingExpense : null} note={totals.overdueExpense > 0 ? 'Há pagamentos em atraso' : 'Contas cadastradas no mês'} onClick={() => onOpen('accounts', 'expense')} />
  </div>

  {loadingBank && <div className="finance-grid"><ChartSkeleton title="Entradas x saídas" /><ChartSkeleton title="Evolução do saldo" /></div>}
  {data && <div className="finance-grid">
   <Panel title="Entradas x saídas" subtitle="Últimos 6 meses" className="finance-flow-panel"><FlowBars data={flow} selected={month} onSelect={onMonthChange} /><p className="finance-panel-note">Somente movimentações confirmadas. Toque ou clique em um mês para abri-lo.</p></Panel>
   {covered && <Panel title="Evolução do saldo" subtitle={period} className="finance-balance-panel"><BalanceArea series={balance} /><p className="finance-panel-note">Saldo ao fim de cada dia, calculado a partir do saldo informado e das movimentações confirmadas.</p></Panel>}
   {covered && <Panel title="Saídas por categoria" subtitle="Para onde foi o dinheiro" className="finance-category-card"><CategoryBars items={categories} /></Panel>}
   {covered && <Panel title="Formas de pagamento" subtitle="Como o dinheiro movimentou" className="finance-method-card">{methods.length ? <ul className="finance-methods">{methods.map(item => <li key={item.label}><span><strong>{item.label}</strong><small>{movements(item.count)}</small></span><span className="finance-methods__values">{item.income > 0 && <Money cents={item.income} signed tone />}{item.expense > 0 && <Money cents={-item.expense} signed tone />}</span></li>)}</ul> : <p className="finance-chart-empty">Nenhuma movimentação confirmada neste mês.</p>}</Panel>}
  </div>}

  {data && (data.cards?.length > 0 || data.investments?.length > 0) && <div className="finance-grid finance-grid--extras">{data.cards?.length > 0 && <Cards cards={data.cards} />}{data.investments?.length > 0 && <Investments items={data.investments} />}</div>}

  <div className="finance-grid finance-grid--lists">
   {configured && <Panel title="Últimas movimentações" subtitle="Conta conectada" action={<button type="button" className="admin-text-button" onClick={() => onOpen('statement')}>Ver extrato<Icon name="arrow" size={15} /></button>}>{recent.length ? <div className="finance-moves">{recent.map(row => <MovementRow key={row.id} row={row} />)}</div> : loadingBank ? <SkeletonRows count={5} label="Carregando movimentações…" /> : <p className="finance-chart-empty">Nenhuma movimentação neste mês.</p>}</Panel>}
   <Panel title="Próximas contas" subtitle="Cadastradas pela equipe" action={<button type="button" className="admin-text-button" onClick={() => onOpen('accounts')}>Ver contas<Icon name="arrow" size={15} /></button>}>{bills.length ? <div className="finance-moves">{bills.map(record => <BillRow key={record.key} record={record} onEdit={onEdit} />)}</div> : recordsLoading ? <SkeletonRows count={4} label="Carregando contas…" /> : <p className="finance-chart-empty">{recordsReady ? 'Nenhuma conta em aberto neste mês.' : 'Não foi possível carregar as contas.'}</p>}</Panel>
  </div>
 </div>
}
