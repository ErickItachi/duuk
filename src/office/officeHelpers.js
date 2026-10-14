import { useId, useState } from 'react'
import { addDays } from './calendarModel.js'
import { today } from './model.js'

// Presentation helpers for Agenda, Contratos, Despesas, Insights and the signing page.
// Days are civil dates (YYYY-MM-DD) in Brasília; formatting them at UTC noon keeps the same day everywhere.
const civil = day => new Date(`${day}T12:00:00Z`)
const capitalize = text => text.charAt(0).toUpperCase() + text.slice(1)
const clean = text => text.replace('.', '')

export function longDate(day, { year = false } = {}) {
  if (!day) return ''
  const options = { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }
  if (year) options.year = 'numeric'
  return capitalize(new Intl.DateTimeFormat('pt-BR', options).format(civil(day)))
}

export function dayParts(day) {
  const date = civil(day)
  return {
    day: day.slice(8, 10),
    month: clean(new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'UTC' }).format(date)),
    weekday: clean(new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' }).format(date)),
  }
}

// "Ter, 14 out" for chart tooltips and compact labels.
export function shortDate(day) {
  const parts = dayParts(day)
  return `${capitalize(parts.weekday)}, ${Number(parts.day)} ${parts.month}`
}

// Every civil day of an Insights period, from the same first day the metrics query uses up to today.
export function periodDays(days) {
  const first = new Date()
  first.setDate(first.getDate() - days + 1)
  const start = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(first), end = today()
  const list = []
  for (let day = start; day <= end && list.length < 400; day = addDays(day, 1)) list.push(day)
  return list
}

// Round axis steps (1, 2, 5 × 10ⁿ) for whole-number counts, always starting at zero.
export function niceTicks(max, count = 4) {
  if (!(max > 0)) return [0, 1]
  const raw = max / count, power = 10 ** Math.floor(Math.log10(raw)), unit = raw / power
  const step = Math.max(1, Math.ceil((unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10) * power))
  const top = Math.ceil(max / step) * step
  return Array.from({ length: top / step + 1 }, (_, index) => index * step)
}

export const isPdf = file => file?.type === 'application/pdf' || /\.pdf$/i.test(file?.name || '')

export const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function formatBytes(size) {
  if (!Number.isFinite(size)) return ''
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`
  return `${(size / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`
}

// Field-level validation. Errors appear after the first submit attempt and then follow the
// user's edits live. `validate` returns { field: message } in the order the fields appear.
export function useValidation(validate, values) {
  const base = useId()
  const [active, setActive] = useState(false)
  const errors = active ? validate(values) : {}
  const id = name => `${base}${name}`
  const control = (name, hint = false) => {
    const described = [hint && `${id(name)}-hint`, errors[name] && `${id(name)}-error`].filter(Boolean).join(' ')
    return { id: id(name), 'aria-invalid': errors[name] ? true : undefined, 'aria-describedby': described || undefined }
  }
  const field = name => ({ htmlFor: id(name), error: errors[name], errorId: `${id(name)}-error`, hintId: `${id(name)}-hint` })
  const check = () => {
    const found = validate(values)
    const first = Object.keys(found)[0]
    if (!first) return true
    setActive(true)
    requestAnimationFrame(() => document.getElementById(id(first))?.focus())
    return false
  }
  return { errors, control, field, check }
}
