import { cents, expenseCategories, today } from '../office/model.js'

export const incomeCategories = ['Projetos', 'Contratos', 'Mensalidades', 'Serviços', 'Outras receitas']
export const entryTypes = { income: 'Receita', expense: 'Despesa' }
export const validMonth = value => /^(19|20)\d{2}-(0[1-9]|1[0-2])$/.test(value || '')
export function initialDateForMonth(month, current = today()) {
 if (!validMonth(month)) return current
 const [year, number] = month.split('-').map(Number), last = new Date(Date.UTC(year, number, 0)).getUTCDate(), day = Math.min(Number(current.slice(8,10)) || 1,last)
 return `${month}-${String(day).padStart(2,'0')}`
}
export const inMonth = (day, month) => Boolean(day && day.slice(0, 7) === month)
export const categoryLabel = record => record.type === 'expense' ? expenseCategories[record.category] || record.category : record.category
export const statusLabel = record => record.status === 'paid' ? record.type === 'income' ? 'Recebido' : 'Pago' : record.type === 'income' ? 'A receber' : 'A pagar'
export const isOverdue = (record, day = today()) => record.status === 'pending' && record.due_date < day

export function normalizeEntries(income = [], expenses = []) {
 return [...income.map(record => ({ ...record, type: 'income', source: 'income', key: `income:${record.id}` })), ...expenses.map(record => ({ ...record, type: 'expense', source: 'expense', key: `expense:${record.id}` }))]
}
export function entriesForMonth(records, month, basis = 'due') {
 return records.filter(record => basis === 'payment' ? record.status === 'paid' && inMonth(record.paid_date, month) : inMonth(record.due_date, month))
}
export function financeTotals(records, month, day = today()) {
 const due = entriesForMonth(records, month), settled = entriesForMonth(records, month, 'payment')
 const sum = (rows, type, status) => rows.filter(record => record.type === type && (!status || record.status === status)).reduce((total, record) => total + Number(record.amount_cents), 0)
 const income = sum(due, 'income'), expense = sum(due, 'expense'), received = sum(settled, 'income'), paid = sum(settled, 'expense')
 const pendingIncome = sum(due, 'income', 'pending'), pendingExpense = sum(due, 'expense', 'pending')
 const completed = due.filter(record => record.status === 'paid').length
 return { income, expense, received, paid, pendingIncome, pendingExpense, actual: received - paid, projected: income - expense, completed, count: due.length, progress: due.length ? Math.round(completed / due.length * 100) : null, overdueIncome: sum(due.filter(record => isOverdue(record, day)), 'income'), overdueExpense: sum(due.filter(record => isOverdue(record, day)), 'expense') }
}
export function cashSeries(records, month) {
 if (!validMonth(month)) return []
 const [year, number] = month.split('-').map(Number), days = new Date(Date.UTC(year, number, 0)).getUTCDate()
 const movements = new Map()
 for (const record of entriesForMonth(records, month, 'payment')) {
  const day = record.paid_date, amount = Number(record.amount_cents) * (record.type === 'income' ? 1 : -1)
  movements.set(day, (movements.get(day) || 0) + amount)
 }
 let accumulated = 0
 return Array.from({ length: days }, (_, index) => {
  const date = `${month}-${String(index + 1).padStart(2, '0')}`, movement = movements.get(date) || 0
  accumulated += movement
  return { date, day: index + 1, movement, accumulated }
 })
}
export function categorySummary(records, month) {
 const categories = new Map()
 for (const record of entriesForMonth(records, month).filter(record => record.type === 'expense')) {
  const label = categoryLabel(record)
  categories.set(label, (categories.get(label) || 0) + Number(record.amount_cents))
 }
 return [...categories].map(([label, amount]) => ({ label, amount })).sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label, 'pt-BR'))
}
const searchable = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR')
export function filterEntries(records, { month, basis = 'due', type = 'all', status = 'all', search = '', category = 'all', day = today() }) {
 const term = searchable(search).trim()
 return entriesForMonth(records, month, basis).filter(record =>
  (type === 'all' || record.type === type) &&
  (status === 'all' || (status === 'overdue' ? isOverdue(record, day) : record.status === status)) &&
  (category === 'all' || categoryLabel(record) === category) &&
  (!term || searchable([record.title, record.description, record.counterparty_name, categoryLabel(record)].join(' ')).includes(term))
 ).sort((a, b) => (basis === 'payment' ? a.paid_date : a.due_date).localeCompare(basis === 'payment' ? b.paid_date : b.due_date) || a.title.localeCompare(b.title, 'pt-BR') || a.key.localeCompare(b.key))
}
const validDay = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= '1900-01-01' && value <= '2099-12-31' && !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0,10) === value
export function incomePayload(form) {
 const title = form.title.trim(), category = form.category.trim()
 if (!title) throw new Error('Dê um nome à receita.')
 if (!category) throw new Error('Informe a categoria da receita.')
 if (!validDay(form.due_date)) throw new Error('Informe a data de vencimento.')
 if (form.status === 'paid' && !validDay(form.paid_date)) throw new Error('Informe a data do recebimento.')
 if (!['pending','paid'].includes(form.status)) throw new Error('Escolha uma situação válida para a receita.')
 if (form.status === 'paid' && form.paid_date > today()) throw new Error('A data do recebimento não pode estar no futuro.')
 return { title, description: form.description.trim(), category, amount_cents: cents(form.amount), due_date: form.due_date, status: form.status, paid_date: form.status === 'paid' ? form.paid_date : null, counterparty_name: (form.counterparty_name || '').trim() }
}
export function financeCsv(records) {
 const cell = value => {
  let text = String(value ?? '')
  if (/^[\s]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
 }
 return '\ufeff' + [['Tipo', 'Lançamento', 'Categoria', 'Valor (R$)', 'Vencimento', 'Situação', 'Pagamento/recebimento', 'Cliente', 'Observações'], ...records.map(record => [entryTypes[record.type], record.title, categoryLabel(record), (Number(record.amount_cents) / 100).toFixed(2).replace('.', ','), record.due_date, statusLabel(record), record.paid_date || '', record.counterparty_name || '', record.description])].map(row => row.map(cell).join(';')).join('\r\n')
}

export function goalProgress(received, goal) {
 const target = Number(goal)
 return target > 0 ? Math.round(Number(received) / target * 100) : null
}
