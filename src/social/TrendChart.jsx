import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { formatDay, formatNumber } from './model'

// Single-series line for daily snapshots (followers, posts). One axis, recessive grid, a crosshair
// tooltip on hover/focus and a table for screen readers. Gaps in collection stay gaps.
export default function TrendChart({ points, label, unit = '', height = 180 }) {
  const id = useId(), box = useRef(null)
  const [active, setActive] = useState(null)
  // The drawing follows the real width so labels keep their proportions on every screen.
  const [width, setWidth] = useState(640)
  const drawable = points.filter(point => Number.isFinite(point.value)).length > 1
  useEffect(() => {
    const element = box.current
    if (!element || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(([entry]) => { const next = Math.round(entry.contentRect.width); if (next > 0) setWidth(next) })
    observer.observe(element)
    return () => observer.disconnect()
  }, [drawable])
  const pad = { top: 12, right: 12, bottom: 26, left: 48 }
  const model = useMemo(() => {
    const values = points.map(point => point.value).filter(Number.isFinite)
    if (values.length < 2) return null
    let min = Math.min(...values), max = Math.max(...values)
    if (min === max) { min -= 1; max += 1 }
    const span = max - min, low = Math.max(0, min - span * 0.15), high = max + span * 0.15
    const times = points.map(point => new Date(`${point.day}T12:00:00-03:00`).getTime())
    const first = times[0], last = times[times.length - 1] === first ? first + 86400000 : times[times.length - 1]
    const x = time => pad.left + (time - first) / (last - first) * (width - pad.left - pad.right)
    const y = value => pad.top + (1 - (value - low) / (high - low)) * (height - pad.top - pad.bottom)
    const coords = points.map((point, index) => ({ ...point, x: x(times[index]), y: Number.isFinite(point.value) ? y(point.value) : null }))
    const segments = []
    let current = []
    for (const point of coords) { if (point.y === null) { if (current.length) segments.push(current); current = [] } else current.push(point) }
    if (current.length) segments.push(current)
    const ticks = [0, 0.5, 1].map(step => low + (high - low) * step).map(value => ({ value, y: y(value) }))
    return { coords, segments, ticks }
  }, [points, height, width, pad.left, pad.right, pad.top, pad.bottom])
  if (!model) return <div ref={box} />
  const pick = clientX => {
    const rect = box.current.getBoundingClientRect(), local = (clientX - rect.left) / rect.width * width
    let best = 0
    model.coords.forEach((point, index) => { if (Math.abs(point.x - local) < Math.abs(model.coords[best].x - local)) best = index })
    setActive(best)
  }
  const point = active === null ? null : model.coords[active]
  const onKey = event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const last = model.coords.length - 1
    setActive(current => event.key === 'Home' ? 0 : event.key === 'End' ? last : Math.min(last, Math.max(0, (current ?? last) + (event.key === 'ArrowRight' ? 1 : -1))))
  }
  return <figure className="social-trend">
    <div ref={box} className="social-trend__plot" tabIndex={0} role="img" aria-label={`${label}: use as setas para percorrer os dias`} aria-describedby={`${id}-table`}
      onPointerMove={event => pick(event.clientX)} onPointerLeave={() => setActive(null)} onFocus={() => setActive(model.coords.length - 1)} onBlur={() => setActive(null)} onKeyDown={onKey}>
      <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} aria-hidden="true">
        {model.ticks.map(tick => <g key={tick.y}><line className="social-trend__grid" x1={pad.left} x2={width - pad.right} y1={tick.y} y2={tick.y} /><text className="social-trend__tick" x={pad.left - 8} y={tick.y + 4} textAnchor="end">{formatNumber(Math.round(tick.value))}</text></g>)}
        {model.segments.map((segment, index) => segment.length > 1
          ? <polyline key={index} className="social-trend__line" points={segment.map(p => `${p.x},${p.y}`).join(' ')} />
          : <circle key={index} className="social-trend__dot" cx={segment[0].x} cy={segment[0].y} r="3" />)}
        {point && point.y !== null && <g><line className="social-trend__cross" x1={point.x} x2={point.x} y1={pad.top} y2={height - pad.bottom} /><circle className="social-trend__marker" cx={point.x} cy={point.y} r="4.5" /></g>}
        <text className="social-trend__tick" x={pad.left} y={height - 6}>{formatDay(`${model.coords[0].day}T12:00:00-03:00`)}</text>
        <text className="social-trend__tick" x={width - pad.right} y={height - 6} textAnchor="end">{formatDay(`${model.coords[model.coords.length - 1].day}T12:00:00-03:00`)}</text>
      </svg>
      {point && <div className="social-trend__tip" style={{ left: `${Math.min(82, Math.max(8, point.x / width * 100))}%` }} role="status">
        <span>{formatDay(`${point.day}T12:00:00-03:00`, { day: 'numeric', month: 'long' })}</span>
        <strong>{Number.isFinite(point.value) ? `${formatNumber(point.value)}${unit}` : 'Sem coleta'}</strong>
      </div>}
    </div>
    <table id={`${id}-table`} className="ds-visually-hidden">
      <caption>{label}</caption>
      <thead><tr><th scope="col">Dia</th><th scope="col">Valor</th></tr></thead>
      <tbody>{points.map(row => <tr key={row.day}><td>{row.day}</td><td>{Number.isFinite(row.value) ? formatNumber(row.value) : 'sem coleta'}</td></tr>)}</tbody>
    </table>
  </figure>
}
