import assert from 'node:assert/strict'
import test from 'node:test'
import { unzipSync, strFromU8 } from 'fflate'
import { normalizeEntries, entriesForMonth, financeTotals, cashSeries, filterEntries, categorySummary, incomePayload, initialDateForMonth, financeCsv, goalProgress } from '../src/finance/financeModel.mjs'
import { financeWorkbook } from '../src/finance/finance-workbook.mjs'

const month='2026-10',base={description:'',category:'Projetos',status:'pending',version:1,paid_date:null,counterparty_name:''}
const incomes=[{...base,id:'i1',title:'Percepção da marca',due_date:'2026-10-02',amount_cents:10000},{...base,id:'i2',title:'Receita com vencimento anterior',due_date:'2026-09-15',amount_cents:5000,status:'paid',paid_date:'2026-10-02'},{...base,id:'i3',title:'Receita paga antecipadamente',due_date:'2026-10-09',amount_cents:7000,status:'paid',paid_date:'2026-09-30'}]
const expenses=[{...base,id:'e1',title:'Equipamentos',category:'equipment',due_date:'2026-10-03',amount_cents:2000,status:'paid',paid_date:'2026-10-04'},{...base,id:'e2',title:'Despesa com vencimento anterior',category:'production',due_date:'2026-09-29',amount_cents:1000,status:'paid',paid_date:'2026-10-01'},{...base,id:'e3',title:'Produção',category:'production',due_date:'2026-10-20',amount_cents:3000}]
const all=normalizeEntries(incomes,expenses)
const valid={title:'  Filme  ',description:'  Observação  ',amount:'1.234,56',category:'  Projetos  ',counterparty_name:'  Cliente  ',due_date:'2026-10-20',status:'pending',paid_date:'2026-10-13'}

test('finance: source records stay intact and cross-table keys do not collide',()=>{
 assert.equal(new Set(all.map(record=>record.key)).size,6)
 assert.equal(new Set(normalizeEntries([{id:'same'}],[{id:'same'}]).map(record=>record.key)).size,2)
 assert.equal(incomes[0].type,undefined)
 assert.equal(expenses[0].source,undefined)
 assert.equal(all.find(record=>record.id==='e1').category,'equipment')
})
test('finance: due-month projection and effective cash use different records',()=>{
 assert.deepEqual(financeTotals(all,month,'2026-10-13'),{income:17000,expense:5000,received:5000,paid:3000,pendingIncome:10000,pendingExpense:3000,actual:2000,projected:12000,completed:2,count:4,progress:50,overdueIncome:10000,overdueExpense:0})
})
test('finance: payments with a previous-month due date appear in this month cash',()=>{
 assert.equal(entriesForMonth(all,month).length,4)
 assert.equal(entriesForMonth(all,month,'payment').length,3)
 assert(entriesForMonth(all,month,'payment').some(record=>record.id==='i2'))
 assert(!entriesForMonth(all,month,'payment').some(record=>record.id==='i3'))
})
test('finance: daily cumulative cash keeps signed movement and real payment dates',()=>{
 const series=cashSeries(all,month)
 assert.equal(series.length,31)
 assert.equal(series[0].movement,-1000)
 assert.equal(series[1].movement,5000)
 assert.equal(series[3].movement,-2000)
 assert.equal(series.at(-1).accumulated,2000)
})
test('finance: cash calendar includes leap days and rejects invalid months',()=>{
 assert.equal(cashSeries(all,'2028-02').length,29)
 assert.equal(cashSeries(all,'2027-02').length,28)
 assert.deepEqual(cashSeries(all,'invalid'),[])
})
test('finance: category breakdown includes pending due amounts, without previous-month dues',()=>{
 assert.deepEqual(categorySummary(all,month),[{label:'Produção',amount:3000},{label:'Equipamentos',amount:2000}])
})
test('finance: filters combine type, status, date basis and accent-insensitive search',()=>{
 assert.deepEqual(filterEntries(all,{month,search:'PERCEPCAO'}).map(record=>record.id),['i1'])
 assert.deepEqual(filterEntries(all,{month,status:'overdue',day:'2026-10-13'}).map(record=>record.id),['i1'])
 assert.equal(filterEntries(all,{month,type:'income',status:'paid'}).length,1)
 assert.equal(filterEntries(all,{month,basis:'payment'}).length,3)
})
test('finance: income payload uses minor units and only allowed database fields',()=>{
 assert.deepEqual(incomePayload(valid),{title:'Filme',description:'Observação',category:'Projetos',amount_cents:123456,due_date:'2026-10-20',status:'pending',paid_date:null,counterparty_name:'Cliente'})
})
test('finance: invalid income values, calendar dates, status and future receipts fail',()=>{
 for(const change of[{amount:'0'},{title:' '},{category:' '},{due_date:'2026-02-31'},{status:'unexpected'},{status:'paid',paid_date:'2099-01-01'},{status:'paid',paid_date:'2026-02-31'}])assert.throws(()=>incomePayload({...valid,...change}))
})
test('finance: targets keep overachievement and represent an undefined target separately',()=>{
 assert.equal(goalProgress(5000,10000),50)
 assert.equal(goalProgress(15000,10000),150)
 assert.equal(goalProgress(0,0),null)
})
test('finance: CSV prevents formulas in user text, including leading whitespace',()=>{
 const csv=financeCsv([{...all[0],title:'  =HYPERLINK("example")',description:'\t+2',counterparty_name:'@name'}])
 assert(csv.startsWith('\ufeff'))
 assert(csv.includes('"\'  =HYPERLINK('))
 assert(csv.includes('"\'\t+2"'))
 assert(csv.includes('"\'@name"'))
})
test('finance: workbook exports filtered rows, full-month summary, real cash, goals and literal text',()=>{
 const row={...all[0],title:'=HYPERLINK("example")',description:'control\u0000 & < >'}
 const workbook=financeWorkbook([row],all,month,{basis:'due',type:'income',status:'pending',category:'Projetos',search:'example'},{revenue_goal_cents:10000,expense_budget_cents:4000}),zip=unzipSync(workbook),content=strFromU8(zip['xl/worksheets/sheet1.xml']),summary=strFromU8(zip['xl/worksheets/sheet2.xml']),cash=strFromU8(zip['xl/worksheets/sheet3.xml'])
 assert.equal(Object.keys(zip).filter(name=>name.startsWith('xl/worksheets/')).length,4)
 assert(content.includes('t="inlineStr"'))
 assert(!content.includes('<f>'))
 assert(!content.includes('\u0000'))
 assert(content.includes('&amp; &lt; &gt;'))
 assert(summary.includes('Meta de recebimentos'))
 assert(summary.includes('Orçamento de despesas'))
 assert(summary.includes('<v>20</v>'))
 assert(cash.includes('<v>20</v>'))
 assert(strFromU8(zip['xl/workbook.xml']).includes('Categorias de despesas'))
})

test('finance: a new entry preserves the current day in the selected month',()=>{
 assert.equal(initialDateForMonth('2026-11','2026-10-13'),'2026-11-13')
 assert.equal(initialDateForMonth('2026-10','2026-10-13'),'2026-10-13')
 assert.equal(initialDateForMonth('2027-01','2026-12-31'),'2027-01-31')
})
test('finance: a new entry clamps the day to the last day, including leap February',()=>{
 assert.equal(initialDateForMonth('2026-02','2026-01-31'),'2026-02-28')
 assert.equal(initialDateForMonth('2028-02','2028-01-31'),'2028-02-29')
 assert.equal(initialDateForMonth('2026-04','2026-03-31'),'2026-04-30')
})
