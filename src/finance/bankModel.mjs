// Pure helpers for the connected account. Totals use only POSTED movements;
// PENDING ones are shown but never counted.
export const posted = rows => rows.filter(row => row.status === 'POSTED')
export const inMonth = (rows, month) => rows.filter(row => row.posted_date.startsWith(month + '-'))

export function monthSummary(rows, month) {
 const list = inMonth(rows, month), done = posted(list)
 const income = done.reduce((sum, row) => sum + Math.max(0, row.amount_cents), 0), expense = done.reduce((sum, row) => sum - Math.min(0, row.amount_cents), 0)
 return { income, expense, net: income - expense, count: list.length, pending: list.length - done.length, pendingAmount: list.filter(row => row.status !== 'POSTED').reduce((sum, row) => sum + row.amount_cents, 0) }
}

export function monthlyFlow(rows, months) {
 return months.map(month => ({ month, ...monthSummary(rows, month) }))
}

// Percent change between two non-negative amounts; null when there is no base to compare.
export function change(current, previous) {
 if (!previous) return null
 return Math.round((current - previous) / previous * 100)
}

const daysIn = month => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate()

// End-of-day balance, rebuilt backwards from the reported balance. Only valid when
// every posted movement since the start of the month is known (the overview window).
export function dailyBalance(rows, balance, month, today) {
 if (month > today.slice(0, 7)) return []
 const last = month === today.slice(0, 7) ? Number(today.slice(8)) : daysIn(month), done = posted(rows)
 const after = date => done.filter(row => row.posted_date > date).reduce((sum, row) => sum + row.amount_cents, 0)
 return Array.from({ length: last }, (_, index) => {
  const date = `${month}-${String(index + 1).padStart(2, '0')}`
  return { day: index + 1, date, balance: balance - after(date) }
 })
}

export const groupLabel = row => row.category_group || row.category || 'Sem categoria'

export function categorySpend(rows, month, limit = 5) {
 const totals = new Map()
 for (const row of posted(inMonth(rows, month))) if (row.amount_cents < 0) totals.set(groupLabel(row), (totals.get(groupLabel(row)) || 0) - row.amount_cents)
 const sorted = [...totals].map(([label, amount]) => ({ label, amount })).sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label, 'pt-BR'))
 if (sorted.length <= limit + 1) return sorted
 const rest = sorted.slice(limit).reduce((sum, item) => sum + item.amount, 0)
 return [...sorted.slice(0, limit), { label: 'Outros', amount: rest, other: true }]
}

export function methodSummary(rows, month) {
 const totals = new Map()
 for (const row of posted(inMonth(rows, month))) {
  const key = row.method || 'Outros', item = totals.get(key) || { label: key, income: 0, expense: 0, count: 0 }
  if (row.amount_cents >= 0) item.income += row.amount_cents; else item.expense -= row.amount_cents
  item.count++; totals.set(key, item)
 }
 return [...totals.values()].sort((a, b) => (b.income + b.expense) - (a.income + a.expense))
}

export function filterStatement(rows, { type = 'all', category = 'all', method = 'all', search = '' } = {}) {
 const term = search.trim().toLocaleLowerCase('pt-BR')
 return rows.filter(row => (type === 'all' || (type === 'income' ? row.amount_cents >= 0 : row.amount_cents < 0))
  && (category === 'all' || groupLabel(row) === category)
  && (method === 'all' || (row.method || 'Outros') === method)
  && (!term || `${row.title} ${row.category || ''} ${row.method || ''}`.toLocaleLowerCase('pt-BR').includes(term)))
}

export function groupByDay(rows) {
 const days = new Map()
 for (const row of rows) {
  const day = days.get(row.posted_date) || { date: row.posted_date, rows: [], net: 0 }
  day.rows.push(row); if (row.status === 'POSTED') day.net += row.amount_cents
  days.set(row.posted_date, day)
 }
 return [...days.values()].sort((a, b) => b.date.localeCompare(a.date))
}

export const options = (rows, pick) => [...new Set(rows.map(pick))].sort((a, b) => a.localeCompare(b, 'pt-BR'))

export function lastMonths(today, count = 6) {
 const [year, month] = today.split('-').map(Number)
 return Array.from({ length: count }, (_, index) => new Date(Date.UTC(year, month - count + index, 1)).toISOString().slice(0, 7))
}

// Merges per-month statements when the server has no overview yet.
export function mergeStatements(statements, months, today) {
 const latest = statements.at(-1), rows = new Map()
 for (const statement of statements) for (const row of statement.transactions) rows.set(row.id, row)
 return { ...latest, months, today, transactions: [...rows.values()].sort((a, b) => b.posted_date.localeCompare(a.posted_date)), complete: statements.every(item => item.complete !== false) }
}
