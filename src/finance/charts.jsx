import { useCallback, useState } from 'react'
import { monthLabel } from '../office/calendarModel'
import { Money } from './privacy'
import { money, signedMoney, useFinancePrivacy } from './privacy-state'

const shortMonths = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const shortMonth = month => shortMonths[Number(month.slice(5)) - 1]
const compact = cents => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 }).format(cents / 100)
const dayName = date => new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
// Axis labels sit in a gutter sized to the longest one (11px Inter is about 6.4px per glyph).
const gutterFor = (labels, hidden) => hidden ? 0 : Math.ceil(Math.max(...labels.map(label => label.length)) * 6.4) + 14
const TIP = 196

// Rounded "nice" ceiling so gridlines land on readable values.
function niceMax(value) {
 if (value <= 0) return 10000
 const power = 10 ** Math.floor(Math.log10(value)), step = [1, 2, 2.5, 5, 10].find(item => item * power >= value)
 return step * power
}

// Charts draw in real pixels so their text keeps its size on phones; the width follows the container.
function useElementWidth() {
 const [width, setWidth] = useState(0)
 const ref = useCallback(node => {
  if (!node) return
  if (typeof ResizeObserver === 'undefined') { setWidth(Math.floor(node.clientWidth)); return }
  const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)))
  observer.observe(node)
  return () => observer.disconnect()
 }, [])
 return [ref, width]
}

// Beside the hovered mark when there is room, otherwise kept inside the chart.
function tipLeft(from, to, width) {
 if (to + 8 + TIP <= width) return to + 8
 if (from - 8 - TIP >= 0) return from - 8 - TIP
 return Math.max(0, Math.min(width - TIP, (from + to) / 2 - TIP / 2))
}

function Tooltip({ left, children }) {
 return <div className="finance-tooltip" style={{ left }} aria-hidden="true">{children}</div>
}

// Column with a 4px rounded data end, square at the baseline; tiny values stay visible.
function columnPath(x, base, height, width) {
 if (!(height > 0) || width <= 0) return ''
 const size = Math.max(height, 2), top = base - size, radius = Math.min(4, size, width / 2)
 return `M${x},${base}V${top + radius}Q${x},${top} ${x + radius},${top}H${x + width - radius}Q${x + width},${top} ${x + width},${top + radius}V${base}Z`
}

// Inflows vs outflows per month. Bars are grouped, never stacked, so each reads from zero.
export function FlowBars({ data, selected, onSelect }) {
 const { hidden } = useFinancePrivacy(), [ref, width] = useElementWidth()
 const [hover, setHover] = useState(null), [focused, setFocused] = useState(null)
 const height = 220, axis = 32, top = 12, plot = height - axis - top
 const max = niceMax(Math.max(0, ...data.map(item => Math.max(item.income, item.expense))))
 const ticks = [max, max / 2, 0], gutter = gutterFor(ticks.map(compact), hidden)
 const slot = data.length ? Math.max(0, width - gutter) / data.length : 0, bar = Math.max(3, Math.min(24, Math.floor((slot - 18) / 2)))
 const y = value => top + plot - value / max * plot, base = y(0)
 const active = hover ?? focused, item = active === null ? null : data[active]
 const text = cents => hidden ? 'valor oculto' : money(cents)
 return <div className="finance-flow">
  <div ref={ref} className="finance-chart" style={{ height }}>
   {width > 0 && <>
    <svg className="finance-chart__svg" width={width} height={height} aria-hidden="true">
     {ticks.map(tick => <g key={tick}>
      <line className={tick ? 'finance-chart__grid' : 'finance-chart__base'} x1={gutter} x2={width} y1={y(tick)} y2={y(tick)} />
      {!hidden && <text className="finance-chart__tick" x={gutter - 12} y={y(tick)} dy="0.35em" textAnchor="end">{compact(tick)}</text>}
     </g>)}
     {data.map((month, index) => {
      const left = gutter + slot * index, center = left + slot / 2
      return <g key={month.month} className={`finance-flow__month${active !== null && active !== index ? ' is-muted' : ''}`}>
       {month.month === selected && <rect className="finance-chart__band" x={left + 3} y="0" width={Math.max(0, slot - 6)} height={height} rx="8" />}
       <path className="finance-bar finance-bar--income" d={columnPath(center - bar - 1, base, base - y(month.income), bar)} />
       <path className="finance-bar finance-bar--expense" d={columnPath(center + 1, base, base - y(month.expense), bar)} />
      </g>
     })}
    </svg>
    <div className="finance-flow__hits" style={{ left: gutter }}>
     {data.map((month, index) => <button
      key={month.month}
      type="button"
      className={`finance-flow__hit${month.month === selected ? ' is-selected' : ''}`}
      aria-pressed={month.month === selected}
      aria-label={`${monthLabel(month.month)}: entradas ${text(month.income)}, saídas ${text(month.expense)}, resultado ${hidden ? 'valor oculto' : signedMoney(month.net)}`}
      onPointerEnter={() => setHover(index)}
      onPointerLeave={() => setHover(null)}
      onFocus={event => { if (event.currentTarget.matches(':focus-visible')) setFocused(index) }}
      onBlur={() => setFocused(null)}
      onClick={() => onSelect?.(month.month)}
     ><span>{shortMonth(month.month)}</span></button>)}
    </div>
    {item && <Tooltip left={tipLeft(gutter + slot * active, gutter + slot * (active + 1), width)}>
     <strong>{monthLabel(item.month)}</strong>
     <span><i className="finance-key finance-key--line finance-key--income" />Entradas<Money cents={item.income} /></span>
     <span><i className="finance-key finance-key--line finance-key--expense" />Saídas<Money cents={item.expense} /></span>
     <span className="finance-tooltip__total">Resultado<Money cents={item.net} signed tone /></span>
    </Tooltip>}
   </>}
  </div>
  <div className="finance-legend"><span><i className="finance-key finance-key--income" />Entradas</span><span><i className="finance-key finance-key--expense" />Saídas</span></div>
 </div>
}

// End-of-day balance across the month: crosshair on hover, arrow keys when focused.
export function BalanceArea({ series }) {
 const { hidden } = useFinancePrivacy(), [ref, width] = useElementWidth()
 const [hover, setHover] = useState(null), [keyboard, setKeyboard] = useState(null)
 if (series.length < 2) return <p className="finance-chart-empty">O gráfico aparece a partir do segundo dia do mês.</p>
 // Balance lines follow the data range (like a bank app); zero is drawn only when crossed.
 const values = series.map(item => item.balance), min = Math.min(...values), max = Math.max(...values), span = Math.max(max - min, 10000)
 const low = min - span * .12, high = max + span * .12, height = 212, axis = 30, top = 10, plot = height - axis - top, right = 8
 const ticks = [high, (high + low) / 2, low], gutter = gutterFor(ticks.map(compact), hidden), last = series.length - 1
 const inner = Math.max(1, width - gutter - right), x = index => gutter + index / last * inner, y = value => top + (high - value) / (high - low) * plot
 const line = series.map((item, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)},${y(item.balance).toFixed(1)}`).join(''), area = `${line}L${x(last)},${top + plot}L${x(0)},${top + plot}Z`
 const marks = inner > 420 ? 5 : 3, labels = [...new Set(Array.from({ length: marks }, (_, index) => Math.round(index * last / (marks - 1))))]
 const active = hover ?? keyboard, point = active === null ? null : series[active]
 const pick = event => { const box = event.currentTarget.getBoundingClientRect(); setHover(Math.max(0, Math.min(last, Math.round((event.clientX - box.left - gutter) / inner * last)))) }
 const keys = event => {
  const steps = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }
  let next
  if (event.key in steps) next = Math.max(0, Math.min(last, (keyboard ?? last) + steps[event.key]))
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = last
  else if (event.key === 'Escape') next = null
  else return
  event.preventDefault()
  setKeyboard(next)
 }
 return <div className="finance-balance">
  <div
   ref={ref}
   className="finance-chart finance-chart--scrub"
   style={{ height }}
   tabIndex={0}
   role="group"
   aria-label="Saldo ao fim de cada dia. Use as setas para percorrer os dias."
   onPointerMove={pick}
   onPointerLeave={() => setHover(null)}
   onKeyDown={keys}
   onFocus={event => { if (event.currentTarget.matches(':focus-visible')) setKeyboard(old => old ?? last) }}
   onBlur={() => setKeyboard(null)}
  >
   {width > 0 && <svg className="finance-chart__svg" width={width} height={height} aria-hidden="true">
    {ticks.map((tick, index) => <g key={index}>
     <line className="finance-chart__grid" x1={gutter} x2={width} y1={y(tick)} y2={y(tick)} />
     {!hidden && <text className="finance-chart__tick" x={gutter - 12} y={y(tick)} dy="0.35em" textAnchor="end">{compact(tick)}</text>}
    </g>)}
    {low < 0 && high > 0 && <line className="finance-chart__base" x1={gutter} x2={width} y1={y(0)} y2={y(0)} />}
    <path className="finance-area" d={area} />
    <path className="finance-line" d={line} />
    {point && <line className="finance-crosshair" x1={x(active)} x2={x(active)} y1={top} y2={top + plot} />}
    <circle className="finance-dot finance-dot--end" cx={x(last)} cy={y(series[last].balance)} r="4" />
    {point && <circle className="finance-dot" cx={x(active)} cy={y(point.balance)} r="4" />}
    {labels.map(index => <text key={index} className="finance-chart__tick" x={x(index)} y={height - 8} textAnchor={index === 0 ? 'start' : index === last ? 'end' : 'middle'}>{String(series[index].day).padStart(2, '0')}</text>)}
   </svg>}
   {point && width > 0 && <Tooltip left={tipLeft(x(active) - 6, x(active) + 6, width)}><strong>{dayName(point.date)}</strong><span><i className="finance-key finance-key--line finance-key--income" />Saldo<Money cents={point.balance} /></span></Tooltip>}
  </div>
  <p className="finance-sr-only" aria-live="polite">{keyboard !== null && series[keyboard] ? `${dayName(series[keyboard].date)}: saldo ${hidden ? 'valor oculto' : money(series[keyboard].balance)}` : ''}</p>
  <table className="finance-sr-only">
   <caption>Saldo ao fim de cada dia</caption>
   <thead><tr><th scope="col">Dia</th><th scope="col">Saldo</th></tr></thead>
   <tbody>{series.map(item => <tr key={item.date}><th scope="row">{dayName(item.date)}</th><td><Money cents={item.balance} /></td></tr>)}</tbody>
  </table>
 </div>
}

// Where the month's outflows went: ranked bars, each value and share written out.
export function CategoryBars({ items }) {
 const total = items.reduce((sum, item) => sum + item.amount, 0)
 if (!total) return <p className="finance-chart-empty">Nenhuma saída confirmada neste mês.</p>
 return <div className="finance-categories">
  <p className="finance-categories__total"><span>Total de saídas</span><strong><Money cents={total} /></strong></p>
  <ul className="finance-categories__list">{items.map(item => {
   const share = item.amount / total * 100
   return <li key={item.label} className={item.other ? 'is-other' : ''}>
    <span className="finance-categories__label">{item.label}</span>
    <Money cents={item.amount} />
    <small>{Math.round(share)}%</small>
    <span className="finance-meter finance-categories__bar" aria-hidden="true"><i style={{ width: `${Math.max(share, 1)}%` }} /></span>
   </li>
  })}</ul>
 </div>
}
