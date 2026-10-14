import { supabase } from '../content/supabase'
import { monthRange } from '../office/model'
const check = result => {
 if (result.error?.code?.startsWith('PT')) throw new Error(result.error.message)
 if (result.error) throw new Error('Não foi possível acessar o extrato. Confira a conexão e tente novamente.')
 return result.data
}
async function rows(query) {
 const result=[]
 for(let offset=0;;offset+=500){const batch=check(await query().range(offset,offset+499));result.push(...batch);if(batch.length<500)return result}
}
export async function listBankMonth(month) {
 const {start,end}=monthRange(month)
 const [transactions,imports]=await Promise.all([
  rows(()=>supabase.from('duuk_bank_transactions').select('*,import:duuk_bank_imports(account_label,account_last_four,bank_id),income:duuk_income(id,title,amount_cents,status,paid_date,version),expense:duuk_expenses(id,title,amount_cents,status,paid_date,version)').gte('posted_date',start).lt('posted_date',end).order('posted_date').order('id')),
  supabase.from('duuk_bank_imports').select('id,account_key,account_label,account_last_four,bank_id,balance_cents,balance_date,from_date,to_date,inserted_count,duplicate_count,created_at').order('created_at',{ascending:false}).limit(200).then(check),
 ])
 return {month,transactions,imports}
}
export async function importBankStatement(statement,accountLabel,requestId) {
 const {bank_id,account_id,currency,transactions,balance,file_name,file_hash}=statement
 return check(await supabase.rpc('duuk_import_bank_statement',{payload:{bank_id,account_id,currency,transactions,balance,file_name,file_hash,account_label:accountLabel.trim(),request_id:requestId}}))
}
export async function bankCandidates(row) {
 const table=Number(row.amount_cents)>0?'duuk_income':'duuk_expenses'
 return rows(()=>supabase.from(table).select('id,title,amount_cents,due_date,status,paid_date,version').eq('amount_cents',Math.abs(Number(row.amount_cents))).or(`status.eq.pending,and(status.eq.paid,paid_date.eq.${row.posted_date})`).order('due_date').order('id'))
}
export async function reconcileBank(row,operation,payload,requestId) {
 return check(await supabase.rpc('duuk_reconcile_bank_transaction',{transaction_id:row.id,expected_version:row.version,operation,payload:{...payload,request_id:requestId}}))
}
export async function removeBankImport(record) {
 return check(await supabase.rpc('duuk_remove_bank_import',{import_id:record.id,expected_created_at:record.created_at}))
}
