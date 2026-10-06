import test from 'node:test'
import assert from 'node:assert/strict'
import { cents, csv, expenseTotals, metricSummary, monthRange } from '../src/office/model.js'
test('valores de despesas mantêm centavos exatos e rejeitam entradas inválidas',()=>{
 assert.equal(cents('0,29'),29);assert.equal(cents('1.234,56'),123456);assert.equal(cents('1234.56'),123456)
 for(const invalid of ['0','-1','1.234','Infinity','10,999','1e3'])assert.throws(()=>cents(invalid))
})
test('relatórios separam despesas pagas e pendentes e incluem dezembro corretamente',()=>{
 assert.deepEqual(expenseTotals([{amount_cents:29,status:'paid'},{amount_cents:100,status:'pending'},{amount_cents:1001,status:'paid'}]),{total:1130,paid:1030,pending:100})
 assert.deepEqual(monthRange('2026-12'),{start:'2026-12-01',end:'2027-01-01'})
 assert.deepEqual(metricSummary([{event:'view',count:10},{event:'play',count:2},{event:'view',count:3}]),{view:13,play:2,contact:0})
})
test('exportação financeira preserva linhas, aspas e bloqueia fórmulas em células',()=>{
 const output=csv([{title:'=SUM(A1:A2)',category:'other',amount_cents:1999,due_date:'2026-10-06',status:'pending',description:'Fornecedor "A"; teste\nlinha'}])
 assert(output.startsWith('\ufeff'));assert(output.includes('"\'=SUM(A1:A2)"'));assert(output.includes('"19,99"'));assert(output.includes('Fornecedor ""A""; teste\nlinha'))
})
