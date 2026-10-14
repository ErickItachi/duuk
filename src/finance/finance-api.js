import { supabase } from '../content/supabase'
import { monthRange } from '../office/model'
import { normalizeEntries, validMonth } from './financeModel.mjs'

const check = result => {
 if (result.error?.code === 'PT400') throw new Error(result.error.message)
 if (result.error?.code === '23514') throw new Error('Confira o valor, as datas e os campos deste lançamento.')
 if (result.error?.code === '42501') throw new Error('Você não tem permissão para acessar o financeiro.')
 if (result.error) throw new Error('Não foi possível carregar ou salvar o financeiro. Confira a conexão e tente novamente.')
 return result.data
}
async function allRows(factory) {
 const rows = []
 for (let offset = 0; ; offset += 500) {
  const batch = check(await factory().range(offset, offset + 499))
  rows.push(...batch)
  if (batch.length < 500) return rows
 }
}
function monthQuery(table, month) {
 const { start, end } = monthRange(month)
 return supabase.from(table).select('*').or(`and(due_date.gte.${start},due_date.lt.${end}),and(status.eq.paid,paid_date.gte.${start},paid_date.lt.${end})`).order('due_date').order('id')
}
export async function listFinanceMonth(month) {
 if (!validMonth(month)) throw new Error('Escolha um mês válido.')
 const [income, expenses, goal] = await Promise.all([
  allRows(() => monthQuery('duuk_income', month)),
  allRows(() => monthQuery('duuk_expenses', month)),
  supabase.from('duuk_finance_goals').select('*').eq('month', `${month}-01`).maybeSingle().then(check),
 ])
 return { month, records: normalizeEntries(income, expenses), goal }
}
export async function saveIncome(form, record) {
 const request = record ? supabase.from('duuk_income').update(form).eq('id', record.id).eq('version', record.version) : supabase.from('duuk_income').insert(form)
 const result = await request.select().maybeSingle()
 check(result)
 if (!result.data) throw new Error('A receita foi alterada em outra aba. Atualize o financeiro antes de editar.')
 return result.data
}
export async function deleteIncome(record) {
 const result = await supabase.from('duuk_income').delete().eq('id', record.id).eq('version', record.version).select('id')
 check(result)
 if (!result.data.length) throw new Error('A receita mudou. Atualize o financeiro antes de excluir.')
}
export async function saveFinanceGoals(form, record, month) {
 if (!validMonth(month)) throw new Error('Escolha um mês válido.')
 const targetMonth = `${month}-01`
 if (record && record.month !== targetMonth) throw new Error('O mês mudou. Reabra as metas antes de salvar.')
 const request = record ? supabase.from('duuk_finance_goals').update(form).eq('month', targetMonth).eq('version', record.version) : supabase.from('duuk_finance_goals').insert({ ...form, month: targetMonth })
 const result = await request.select().maybeSingle()
 if (result.error?.code === '23505') throw new Error('As metas deste mês foram criadas em outra aba. Atualize o financeiro antes de editar.')
 check(result)
 if (!result.data) throw new Error('As metas foram alteradas em outra aba. Atualize o financeiro antes de editar.')
 return result.data
}
