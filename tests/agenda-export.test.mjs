import test from 'node:test'
import assert from 'node:assert/strict'
import { strFromU8, unzipSync } from 'fflate'
import { addDays, calendarDays, eventPayload, eventsOnDay, shiftMonth } from '../src/office/calendarModel.js'
import { expensesWorkbook } from '../src/office/xlsx.js'

test('calendário mantém dias e períodos ao atravessar ano e ano bissexto',()=>{
 assert.equal(addDays('2024-02-28',1),'2024-02-29')
 assert.equal(addDays('2024-02-29',1),'2024-03-01')
 assert.equal(addDays('2026-12-31',1),'2027-01-01')
 assert.equal(shiftMonth('2026-12',1),'2027-01')
 assert.equal(shiftMonth('2027-01',-1),'2026-12')
 const days=calendarDays('2024-02')
 assert.equal(days[0],'2024-01-28');assert.equal(days.at(-1),'2024-03-09');assert.equal(days.length,42)
 const events=[{id:'span',title:'Gravação',start_date:'2026-09-30',end_date:'2026-10-02',all_day:true},{id:'meeting',title:'Reunião',start_date:'2026-10-01',end_date:'2026-10-01',all_day:false,start_time:'09:00'}]
 assert.deepEqual(eventsOnDay(events,'2026-10-01').map(e=>e.id),['span','meeting'])
 assert.equal(eventsOnDay(events,'2026-10-03').length,0)
})
test('agenda valida períodos, horários e remove horários de compromissos de dia inteiro',()=>{
 const form={title:' Gravação ',description:'',location:'',client_name:'',start_date:'2026-10-06',end_date:'2026-10-06',all_day:true,start_time:'09:00',end_time:'08:00',category:'filming',status:'planned',responsible_id:'person-1'}
 assert.equal(eventPayload(form).start_time,null);assert.equal(eventPayload(form).title,'Gravação')
 assert.equal(eventPayload(form).responsible_id,'person-1')
 assert.throws(()=>eventPayload({...form,responsible_id:''}))
 assert.throws(()=>eventPayload({...form,end_date:'2026-10-05'}))
 assert.throws(()=>eventPayload({...form,all_day:false}))
 assert.throws(()=>eventPayload({...form,all_day:false,start_time:''}))
 assert.throws(()=>eventPayload({...form,end_date:'2028-10-06'}))
 assert.equal(eventPayload({...form,all_day:false,end_date:'2026-10-07'}).end_time,'08:00')
})
test('Excel contém valores e datas numéricos, resumo, textos seguros e as duas planilhas',()=>{
 const records=[{title:'=HYPERLINK("https://example.com") & <produção>',description:'São Paulo\nFornecedor "A"\u0000',category:'equipment',amount_cents:123456,status:'paid',due_date:'2026-10-06',paid_date:'2026-10-07'},{title:'Locação',description:'',category:'production',amount_cents:29,status:'pending',due_date:'2026-10-08',paid_date:null}]
 const files=unzipSync(expensesWorkbook(records,'2026-10'))
 const detail=strFromU8(files['xl/worksheets/sheet1.xml']),summary=strFromU8(files['xl/worksheets/sheet2.xml'])
 assert(detail.includes('<v>1234.56</v>'));assert(detail.includes('<v>0.29</v>'))
 assert(detail.includes('t="inlineStr"><is><t xml:space="preserve">=HYPERLINK'))
 assert(detail.includes('&amp; &lt;produção&gt;'));assert(!detail.includes('\u0000'));assert(!detail.includes('<f>'))
 assert(detail.includes('<c r="D2" s="3"><v>46301</v></c>'))
 assert(summary.includes('<v>1234.85</v>'));assert(summary.includes('Outubro 2026'))
 assert(strFromU8(files['xl/workbook.xml']).includes('name="Resumo"'))
 assert(strFromU8(files['xl/styles.xml']).includes('dd/mm/yyyy'))
})
