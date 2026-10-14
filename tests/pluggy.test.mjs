import test from 'node:test'
import assert from 'node:assert/strict'
import { bankAccount,createPluggyClient,moneyCents,monthRange,nextCursor,PluggyError,readStatement,transactionView,validateProxy } from '../supabase/functions/_shared/duuk-pluggy.mjs'
import { statementCsv } from '../src/finance/pluggyModel.mjs'
const account='aaaaaaaa-aaaa-4aaa-baaa-aaaaaaaaaaaa',item='bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'
const tx={id:'one',accountId:account,currencyCode:'BRL',date:'2026-10-01T03:00:00Z',amount:12.34,type:'CREDIT',status:'POSTED',description:'QA only'}
test('Only the real free Meu Pluggy proxy is accepted',()=>{
 assert.equal(validateProxy({connector:{id:200}}).connector.id,200)
 for(const input of [{connector:{id:600}},{connector:{id:200,isSandbox:true}},{}])assert.throws(()=>validateProxy(input),PluggyError)
})
test('Bank account projection excludes documents, owner and full number',()=>{
 const out=bankAccount({id:account,type:'BANK',currencyCode:'BRL',name:'QA account',number:'987654321-0',balance:123.45,taxNumber:'SENSITIVE',owner:'PRIVATE',bankData:{private:true}})
 assert.deepEqual(out,{id:account,label:'QA account',last_four:'21-0',balance_cents:12345})
 assert.throws(()=>bankAccount({type:'CREDIT',currencyCode:'BRL'}));assert.throws(()=>bankAccount({type:'BANK',currencyCode:'USD'}))
})
test('Provider values use integer cents and reject invalid precision',()=>{
 for(const [value,cents] of [[.29,29],[-42.1,-4210],[0,0],[9999999.99,999999999]])assert.equal(moneyCents(value),cents)
 for(const value of [NaN,Infinity,'12.34',.001,1000000001])assert.throws(()=>moneyCents(value))
})
test('Brazilian dates select correct month at UTC boundaries',()=>{
 assert.equal(transactionView(tx,'2026-10',account).posted_date,'2026-10-01')
 assert.equal(transactionView({...tx,date:'2026-10-01T02:59:59Z'},'2026-10',account),null)
 assert.equal(transactionView({...tx,date:'2026-11-01T02:59:59Z'},'2026-10',account).posted_date,'2026-10-31')
 assert.deepEqual(monthRange('2026-10'),{from:'2026-09-30',to:'2026-11-01'})
 assert.throws(()=>monthRange('2026-13'))
})
test('Transaction projection rejects crossed account, currency and sign',()=>{
 for(const patch of [{accountId:item},{currencyCode:'USD'},{type:'DEBIT'},{status:'OTHER'},{date:'invalid'}])assert.throws(()=>transactionView({...tx,...patch},'2026-10',account))
 assert.deepEqual(transactionView({...tx,paymentData:{cpf:'PRIVATE'},merchant:{name:'PRIVATE'}},'2026-10',account),{id:'one',posted_date:'2026-10-01',title:'QA only',amount_cents:1234,status:'POSTED'})
})
test('Pagination never changes origin, account or resource',()=>{
 assert.equal(nextCursor('?accountId='+account+'&after=abc%3D',account),'abc=')
 for(const url of ['https://example.invalid/v2/transactions?accountId='+account+'&after=x','/accounts?accountId='+account+'&after=x','?accountId='+item+'&after=x','?accountId='+account])assert.throws(()=>nextCursor(url,account))
})
test('API authentication stays on server and blocks redirects',async()=>{
 const calls=[],get=await createPluggyClient({clientId:'fixture-id',clientSecret:'fixture-secret'},{fetcher:async(url,options)=>{calls.push({url,options});return{ok:true,json:async()=>url.endsWith('/auth')?{apiKey:'fixture-api-key'}:{results:[]}}}})
 await get('/accounts?itemId='+item);assert.equal(calls[0].options.redirect,'error');assert.equal(calls[0].options.method,'POST');assert.equal(calls[1].options.headers['X-API-KEY'],'fixture-api-key');assert(!calls[1].url.includes('fixture-secret'))
})
test('Provider failures are sanitized and never return credential payloads',async()=>{
 await assert.rejects(createPluggyClient({},{fetcher:async()=>({ok:false,status:401,json:async()=>({message:'SECRET'})})}),e=>e.status===403&&!e.message.includes('SECRET'))
})
test('Statement handles cursor pages, duplicates and exposes freshness',async()=>{
 let page=0
 const get=async path=>path.startsWith('/items/')?{connector:{id:200},status:'UPDATED',lastUpdatedAt:'2026-10-14T10:00:00Z'}:path.startsWith('/accounts/')?{id:account,type:'BANK',currencyCode:'BRL',number:'1234',balance:0}:path.startsWith('/accounts?')?{results:[{id:account}]}:++page===1?{results:[tx],next:'?accountId='+account+'&after=abc'}:{results:[tx,{...tx,id:'two',amount:-2,type:'DEBIT',status:'PENDING'}],next:null}
 const result=await readStatement(get,{itemId:item,accountId:account,month:'2026-10'})
 assert.equal(result.transactions.length,2);assert.equal(result.complete,true);assert.equal(result.provider_updated_at,'2026-10-14T10:00:00.000Z');assert.equal(result.warning,null);assert.equal(page,2)
})
test('Statement rejects an account that no longer belongs to the connection',async()=>{
 await assert.rejects(readStatement(async path=>path.startsWith('/items/')?{connector:{id:200}}:path.startsWith('/accounts/')?{id:account,type:'BANK',currencyCode:'BRL',balance:0}:{results:[]},{itemId:item,accountId:account,month:'2026-10'}),e=>e.status===409)
})
test('CSV preserves descriptions and prevents spreadsheet formulas',()=>{
 const csv=statementCsv([{posted_date:'2026-10-01',title:'=HYPERLINK("https://example.invalid")',amount_cents:-120,status:'POSTED'}])
 assert(csv.startsWith('\ufeff'));assert(csv.includes('"\'=HYPERLINK'));assert(csv.includes('"\'-1,20"'));assert(csv.includes('Confirmada'))
})
