import test from 'node:test'
import assert from 'node:assert/strict'
import { categorySpend, change, dailyBalance, filterStatement, groupByDay, lastMonths, mergeStatements, monthlyFlow, monthSummary } from '../src/finance/bankModel.mjs'
const row=(id,date,amount,extra={})=>({id,posted_date:date,title:id,amount_cents:amount,status:'POSTED',category:null,category_group:null,method:null,...extra})
const rows=[row('a','2026-10-02',100000,{category_group:'Receitas',method:'Pix'}),row('b','2026-10-03',-30000,{category_group:'Moradia',method:'Boleto'}),row('c','2026-10-03',-5000,{status:'PENDING'}),row('d','2026-09-30',-2000,{category_group:'Moradia'})]
test('Only posted movements count toward totals',()=>{
 assert.deepEqual(monthSummary(rows,'2026-10'),{income:100000,expense:30000,net:70000,count:3,pending:1,pendingAmount:-5000})
 assert.deepEqual(monthlyFlow(rows,['2026-09','2026-10']).map(item=>item.net),[-2000,70000])
 assert.equal(change(150,100),50);assert.equal(change(5,0),null)
})
test('Daily balance is rebuilt backwards from the reported balance',()=>{
 const series=dailyBalance(rows,170000,'2026-10','2026-10-04')
 assert.deepEqual(series.map(item=>item.balance),[100000,200000,170000,170000])
 assert.equal(dailyBalance(rows,0,'2026-09','2026-10-04').length,30)
 assert.deepEqual(dailyBalance(rows,0,'2026-11','2026-10-04'),[])
})
test('Categories fold into Outros after five and ignore inflows',()=>{
 const many=Array.from({length:8},(_,i)=>row('x'+i,'2026-10-05',-(i+1)*100,{category_group:'C'+i}))
 const result=categorySpend(many,'2026-10');assert.equal(result.length,6);assert.equal(result.at(-1).label,'Outros');assert.equal(result.at(-1).amount,600)
 assert.deepEqual(categorySpend(rows,'2026-10'),[{label:'Moradia',amount:30000}])
})
test('Statement filters, groups by day and merges monthly fallbacks',()=>{
 assert.deepEqual(filterStatement(rows,{type:'expense',method:'Boleto'}).map(r=>r.id),['b'])
 assert.deepEqual(filterStatement(rows,{search:'pix'}).map(r=>r.id),['a'])
 const days=groupByDay(rows.filter(r=>r.posted_date.startsWith('2026-10')));assert.equal(days[0].date,'2026-10-03');assert.equal(days[0].net,-30000)
 assert.deepEqual(lastMonths('2026-02-10',3),['2025-12','2026-01','2026-02'])
 const merged=mergeStatements([{transactions:[rows[3]],complete:true,account:{}},{transactions:[rows[0],rows[0]],complete:false,account:{balance_cents:1}}],['2026-09','2026-10'],'2026-10-04')
 assert.equal(merged.transactions.length,2);assert.equal(merged.complete,false);assert.equal(merged.account.balance_cents,1)
})
