import { useRef, useState } from 'react'
import { Icon, Modal } from '../admin/components'
import { FieldError } from '../admin/forms'
import { dateLabel, today } from './model'
import { addDays, calendarDays, monthLabel, monthNames, shiftMonth } from './calendarModel.js'

const weekdays = [['Dom', 'D'], ['Seg', 'S'], ['Ter', 'T'], ['Qua', 'Q'], ['Qui', 'Q'], ['Sex', 'S'], ['Sáb', 'S']]

export function MonthNavigation({ month, onChange }) {
  const [choosing, setChoosing] = useState(false)
  const name = monthNames[Number(month.slice(5, 7)) - 1]
  return (
    <>
      <div className="office-month-nav">
        <button type="button" className="admin-icon-button" aria-label="Mês anterior" onClick={() => onChange(shiftMonth(month, -1))}>
          <Icon name="left" />
        </button>
        <button type="button" className="office-month-title" aria-label={`Escolher mês: ${monthLabel(month)}`} aria-haspopup="dialog" onClick={() => setChoosing(true)}>
          <span>{name} <span className="office-month-title__year">{month.slice(0, 4)}</span></span>
          <Icon name="down" size={16} />
        </button>
        <button type="button" className="admin-icon-button" aria-label="Próximo mês" onClick={() => onChange(shiftMonth(month, 1))}>
          <Icon name="right" />
        </button>
      </div>
      {choosing && (
        <MonthChooser
          month={month}
          onChange={value => { onChange(value); setChoosing(false) }}
          onClose={() => setChoosing(false)}
        />
      )}
    </>
  )
}

function MonthChooser({ month, onChange, onClose }) {
  const [year, setYear] = useState(Number(month.slice(0, 4)))
  const now = today().slice(0, 7)
  return (
    <Modal title="Escolher mês" onClose={onClose}>
      <div className="office-calendar-picker">
        <div className="office-calendar-year">
          <button type="button" className="admin-icon-button" aria-label="Ano anterior" disabled={year <= 1900} onClick={() => setYear(year - 1)}>
            <Icon name="left" />
          </button>
          <strong aria-live="polite">{year}</strong>
          <button type="button" className="admin-icon-button" aria-label="Próximo ano" disabled={year >= 2100} onClick={() => setYear(year + 1)}>
            <Icon name="right" />
          </button>
        </div>
        <div className="office-months" role="group" aria-label={`Meses de ${year}`}>
          {monthNames.map((name, index) => {
            const value = `${year}-${String(index + 1).padStart(2, '0')}`
            return (
              <button
                type="button"
                key={name}
                className={`${value === month ? 'is-selected' : ''}${value === now ? ' is-current' : ''}`.trim() || undefined}
                aria-pressed={value === month}
                aria-current={value === now ? 'date' : undefined}
                onClick={() => onChange(value)}
              >
                {name}
              </button>
            )
          })}
        </div>
        <button type="button" className="admin-text-button" onClick={() => onChange(today().slice(0, 7))}>
          <Icon name="calendar" />
          Ir para este mês
        </button>
      </div>
    </Modal>
  )
}

export function DayGrid({ month, selected, onSelect, min, max, events = [], compact = false }) {
  const grid = useRef(null), days = calendarDays(month), current = today()
  const move = (event, day) => {
    const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -new Date(`${day}T12:00:00Z`).getUTCDay(), End: 6 - new Date(`${day}T12:00:00Z`).getUTCDay() }
    if (!(event.key in offsets)) return
    event.preventDefault()
    const target = addDays(day, offsets[event.key])
    if ((min && target < min) || (max && target > max)) return
    const button = grid.current?.querySelector(`[data-day="${target}"]`)
    button?.focus()
  }
  const focusable = selected && days.includes(selected) ? selected : `${month}-01`
  return (
    <div className={`office-calendar-grid${compact ? ' is-compact' : ''}`} ref={grid}>
      <div className="office-weekdays" aria-hidden="true">
        {weekdays.map(([long, short], index) => (
          <span key={index}><span className="is-long">{long}</span><span className="is-short">{short}</span></span>
        ))}
      </div>
      <div className="office-days" role="group" aria-label={monthLabel(month)}>
        {days.map(day => {
          const matches = events.filter(e => e.start_date <= day && e.end_date >= day), outside = !day.startsWith(month), disabled = (min && day < min) || (max && day > max)
          const chips = matches.length > 3 ? matches.slice(0, 2) : matches
          return (
            <button
              type="button"
              key={day}
              data-day={day}
              disabled={disabled}
              onKeyDown={e => move(e, day)}
              tabIndex={day === focusable ? 0 : -1}
              className={`${outside ? 'is-outside ' : ''}${day === selected ? 'is-selected ' : ''}${day === current ? 'is-today' : ''}`.trim() || undefined}
              aria-label={`${dateLabel(day)}${matches.length ? `, ${matches.length} compromisso${matches.length > 1 ? 's' : ''}` : ''}`}
              aria-pressed={day === selected}
              aria-current={day === current ? 'date' : undefined}
              onClick={() => onSelect(day)}
            >
              <span className="office-day-number">{Number(day.slice(-2))}</span>
              {!compact && matches.length > 0 && (
                <span className="office-day-events" aria-hidden="true">
                  {chips.map(e => (
                    <span key={e.id} className={`office-day-event is-${e.category}${e.status === 'cancelled' ? ' is-cancelled' : ''}`}>
                      <span>{e.title}</span>
                    </span>
                  ))}
                  {matches.length > chips.length && <small>+{matches.length - chips.length} mais</small>}
                </span>
              )}
              {!compact && matches.length > 0 && (
                <span className="office-day-dots" aria-hidden="true">
                  {matches.slice(0, 3).map(e => <i key={e.id} />)}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// `error`, `errorId` and `id` are optional so forms can show field-level validation.
export function DateField({ label, value, onChange, min, max, disabled = false, id, error, errorId }) {
  const [open, setOpen] = useState(false), [month, setMonth] = useState((value || today()).slice(0, 7))
  return (
    <div className="admin-field">
      <span>{label}</span>
      <button
        type="button"
        id={id}
        disabled={disabled}
        className={`office-date-input${error ? ' is-invalid' : ''}`}
        aria-label={`${label}: ${dateLabel(value)}`}
        aria-describedby={error && errorId ? errorId : undefined}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => { setMonth((value || today()).slice(0, 7)); setOpen(true) }}
      >
        <Icon name="calendar" size={16} />
        <span>{value ? dateLabel(value) : 'Escolher data'}</span>
        <Icon name="down" size={14} />
      </button>
      <FieldError id={errorId}>{error}</FieldError>
      {open && (
        <Modal title={label} subtitle="Selecione um dia no calendário." onClose={() => setOpen(false)}>
          <div className="office-calendar-picker">
            <MonthNavigation month={month} onChange={setMonth} />
            <DayGrid compact month={month} selected={value} min={min} max={max} onSelect={day => { onChange(day); setOpen(false) }} />
            <button type="button" className="admin-text-button" disabled={(min && today() < min) || (max && today() > max)} onClick={() => { onChange(today()); setOpen(false) }}>
              <Icon name="calendar" />
              Selecionar hoje
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
