import { useId, useState } from 'react'
import { monthLabel } from '../office/calendarModel'
import { Money } from './privacy'
import { useFinancePrivacy } from './privacy-state'

const shortMonths = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const shortMonth = month => shortMonths[Number(month.slice(5)) - 1]
const compact = cents => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 }).format(cents / 100).replace(/ /g, ' ')
// Rounded "nice" ceiling so gridlines land on readable values.
function niceMax(value) {
 if (value <= 0) return 10000
 const power = 10 ** Math.floor(Math.log10(value)), step = [1, 2, 2.5, 5, 10].find(item => item * power >= value)
 return step * power
}
const categoryColors = ['var(--finance-cat-1)', 'var(--finance-cat-2)', 'var(--finance-cat-3)', 'var(--finance-cat-4)', 'var(--finance-cat-5)', 'var(--finance-cat-6)']

function Tooltip({ x, children }) {
 return <div className="finance-tooltip" style={{ left: `${x}%` }} role="status">{children}</div>
}

// Inflows vs outflows per month. Bars are grouped, never stacked, so each reads from zero.
export function FlowBars({ data, selected, onSelect }) {
 const { hidden } = useFinancePrivacy(), [hover, setHover] = useState(null)
 const top = niceMax(Math.max(...data.map(item => Math.max(item.income, item.expense)), 0)), width = 600, height = 220, left = 62, bottom = 28, plot = height - bottom - 10
 const slot = (width - left - 8) / data.length, bar = Math.min(26, slot / 3.4), y = value => 10 + plot - value / top * plot
 const active = hover ?? data.findIndex(item => item.month === selected)
 return <div className="finance-chart" onMouseLeave={() => setHover(null)}>
  <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Entradas e saídas dos últimos ${data.length} meses.`}>
   {[0, .5, 1].map(level => <g key={level}><line className="finance-chart-grid" x1={left} x2={width - 8} y1={y(top * level)} y2={y(top * level)} />{!hidden && <text className="finance-chart-axis" x="0" y={y(top * level) + 4}>{compact(top * level)}</text>}</g>)}
   {data.map((item, index) => {
    const center = left + slot * index + slot / 2, isSelected = item.month === selected
    return <g key={item.month} className={`finance-bar-group${isSelected ? ' is-selected' : ''}`}>
     {isSelected && <rect className="finance-bar-highlight" x={center - slot / 2 + 4} y="4" width={slot - 8} height={height - 8} rx="10" />}
     <path className="finance-bar finance-bar--income" d={barPath(center - bar - 1, y(item.income), bar, 10 + plot - y(item.income))} />
     <path className="finance-bar finance-bar--expense" d={barPath(center + 1, y(item.expense), bar, 10 + plot - y(item.expense))} />
     <text className="finance-chart-axis" x={center} y={height - 8} textAnchor="middle">{shortMonth(item.month)}</text>
     <rect className="finance-hit" x={center - slot / 2} y="0" width={slot} height={height} onMouseEnter={() => setHover(index)} onClick={() => onSelect?.(item.month)} />
    </g>
   })}
  </svg>
  {active >= 0 && hover !== null && <Tooltip x={(left + slot * active + slot / 2) / width * 100}><strong>{monthLabel(data[active].month)}</strong><span><i className="finance-key finance-key--income" />Entradas <Money cents={data[active].income} /></span><span><i className="finance-key finance-key--expense" />Saídas <Money cents={data[active].expense} /></span><span>Resultado <Money cents={data[active].net} signed tone /></span></Tooltip>}
  <div className="finance-chart-legend"><span><i className="finance-key finance-key--income" />Entradas</span><span><i className="finance-key finance-key--expense" />Saídas</span></div>
 </div>
}
function barPath(x, top, width, height) {
 if (height <= 0) return ''
 const radius = Math.min(4, height, width / 2)
 return `M${x},${top + height}V${top + radius}Q${x},${top} ${x + radius},${top}H${x + width - radius}Q${x + width},${top} ${x + width},${top + radius}V${top + height}Z`
}

// End-of-day balance across the month, with a crosshair tooltip.
export function BalanceArea({ series }) {
 const { hidden } = useFinancePrivacy(), [hover, setHover] = useState(null), gradient = useId()
 if (series.length < 2) return <p className="finance-chart-empty">O gráfico aparece a partir do segundo dia do mês.</p>
 // Balance lines follow the data range (like a bank app); zero is drawn only when crossed.
 const values = series.map(item => item.balance), min = Math.min(...values), max = Math.max(...values), span = Math.max(max - min, 10000)
 const low = min - span * .12, high = max + span * .12, width = 600, height = 200, top = 12, plot = 160, left = 62
 const x = index => left + index / (series.length - 1) * (width - left - 8), y = value => top + (high - value) / (high - low) * plot
 const line = series.map((item, index) => `${index ? 'L' : 'M'}${x(index)},${y(item.balance)}`).join(''), area = `${line}L${x(series.length - 1)},${top + plot}L${x(0)},${top + plot}Z`
 const move = event => { const box = event.currentTarget.getBoundingClientRect(), position = (event.clientX - box.left) / box.width * width; setHover(Math.max(0, Math.min(series.length - 1, Math.round((position - left) / (width - left - 8) * (series.length - 1))))) }
 const ends = series.at(-1).balance >= series[0].balance
 return <div className={`finance-chart finance-balance-chart ${ends ? 'is-up' : 'is-down'}`} onMouseLeave={() => setHover(null)}>
  <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Saldo ao fim de cada dia. Último dia: ${hidden ? 'valor oculto' : compact(series.at(-1).balance)}.`} onMouseMove={move}>
   <defs><linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="currentColor" stopOpacity=".22" /><stop offset="1" stopColor="currentColor" stopOpacity="0" /></linearGradient></defs>
   {[0, .5, 1].map(level => <g key={level}><line className="finance-chart-grid" x1={left} x2={width - 8} y1={top + level * plot} y2={top + level * plot} />{!hidden && <text className="finance-chart-axis" x="0" y={top + level * plot + 4}>{compact(high - level * (high - low))}</text>}</g>)}
   {low < 0 && high > 0 && <line className="finance-chart-zero" x1={left} x2={width - 8} y1={y(0)} y2={y(0)} />}
   <path d={area} fill={`url(#${gradient})`} />
   <path d={line} className="finance-balance-line" />
   {hover !== null && <><line className="finance-crosshair" x1={x(hover)} x2={x(hover)} y1={top} y2={top + plot} /><circle className="finance-balance-dot" cx={x(hover)} cy={y(series[hover].balance)} r="5" /></>}
   {[0, Math.floor((series.length - 1) / 2), series.length - 1].map(index => <text key={index} className="finance-chart-axis" x={x(index)} y={height - 8} textAnchor={index === 0 ? 'start' : index === series.length - 1 ? 'end' : 'middle'}>{String(series[index].day).padStart(2, '0')}</text>)}
  </svg>
  {hover !== null && <Tooltip x={x(hover) / width * 100}><strong>Dia {String(series[hover].day).padStart(2, '0')}</strong><span>Saldo <Money cents={series[hover].balance} /></span></Tooltip>}
 </div>
}

// Part-to-whole of the month's outflows; at most six slices (five + "Outros").
export function CategoryDonut({ items }) {
 const total = items.reduce((sum, item) => sum + item.amount, 0), radius = 52, circumference = 2 * Math.PI * radius, [hover, setHover] = useState(null)
 if (!total) return <p className="finance-chart-empty">Nenhuma saída confirmada neste mês.</p>
 const lengths = items.map(item => item.amount / total * circumference), starts = lengths.map((_, index) => lengths.slice(0, index).reduce((sum, value) => sum + value, 0))
 const focus = hover === null ? null : items[hover]
 return <div className="finance-donut">
  <div className="finance-donut__figure"><svg viewBox="0 0 132 132" role="img" aria-label="Saídas por categoria.">{items.map((item, index) => {
   const length = lengths[index], gap = items.length > 1 ? Math.min(2, length / 2) : 0
   return <circle key={item.label} cx="66" cy="66" r={radius} className={`finance-donut__slice${hover === index ? ' is-active' : ''}`} stroke={categoryColors[index]} strokeDasharray={`${Math.max(length - gap, .1)} ${circumference}`} strokeDashoffset={-starts[index]} onMouseEnter={() => setHover(index)} onMouseLeave={() => setHover(null)} />
  })}</svg><div className="finance-donut__center"><small>{focus ? focus.label : 'Total de saídas'}</small><strong><Money cents={focus ? focus.amount : total} /></strong></div></div>
  <ul className="finance-donut__legend">{items.map((item, index) => <li key={item.label} className={hover === index ? 'is-active' : ''} onMouseEnter={() => setHover(index)} onMouseLeave={() => setHover(null)}><i style={{ background: categoryColors[index] }} /><span>{item.label}</span><small>{Math.round(item.amount / total * 100)}%</small><Money cents={item.amount} /></li>)}</ul>
 </div>
}
