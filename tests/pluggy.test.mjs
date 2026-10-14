import test from 'node:test'
import assert from 'node:assert/strict'
import { bankAccount,categoryIndex,createPluggyClient,creditCardView,historyRange,investmentView,moneyCents,monthRange,nextCursor,paymentMethod,PluggyError,readOverview,readStatement,transactionView,validateProxy } from '../supabase/functions/_shared/duuk-pluggy.mjs'
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
 assert.deepEqual(transactionView({...tx,paymentData:{cpf:'PRIVATE'},merchant:{name:'PRIVATE'}},'2026-10',account),{id:'one',posted_date:'2026-10-01',title:'QA only',amount_cents:1234,status:'POSTED',category:null,category_group:null,method:null})
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

test('Categories are translated and only a whitelisted payment method leaves the server',()=>{
 const categories=categoryIndex([{id:'05000000',description:'Transfers',descriptionTranslated:'Transferências'},{id:'05070000',description:'Transfer - PIX',descriptionTranslated:'Transferência - PIX',parentId:'05000000'}])
 const row=transactionView({...tx,categoryId:'05070000',category:'Transfer - PIX',paymentData:{paymentMethod:'PIX',payer:{documentNumber:{value:'PRIVATE'},name:'PRIVATE'}}},'2026-10',account,categories)
 assert.deepEqual([row.category,row.category_group,row.method],['Transferência - PIX','Transferências','Pix'])
 assert(!JSON.stringify(row).includes('PRIVATE'))
 assert.equal(transactionView({...tx,category:'Groceries'},'2026-10',account).category,'Groceries')
 assert.equal(paymentMethod({operationType:'TARIFA_SERVICOS_AVULSOS'}),'Tarifa');assert.equal(paymentMethod({operationType:'UNKNOWN_SECRET'}),null);assert.equal(paymentMethod({creditCardMetadata:{}}),'Cartão')
})
test('History covers six Brazilian months including the current day',()=>{
 assert.deepEqual(historyRange('2026-10-14'),{start:'2026-05-01',from:'2026-04-30',to:'2026-10-16',months:['2026-05','2026-06','2026-07','2026-08','2026-09','2026-10']})
 assert.equal(historyRange('2026-01-31').months[0],'2025-08');assert.throws(()=>historyRange('2026-10'));assert.throws(()=>historyRange('2026-10-14',13))
})
test('Overview reads history and optional cards and investments without private fields',async()=>{
 const get=async path=>path.startsWith('/items/')?{connector:{id:200},status:'UPDATED',lastUpdatedAt:'2026-10-14T10:00:00Z'}:path.startsWith('/accounts/')?{id:account,type:'BANK',currencyCode:'BRL',number:'1234',balance:50}:path.startsWith('/categories')?{results:[]}:path.includes('type=CREDIT')?{results:[{id:'card',type:'CREDIT',currencyCode:'BRL',name:'Card',number:'5555 4444 3333 2222',balance:120.5,owner:'PRIVATE',creditData:{brand:'VISA',creditLimit:1000,availableCreditLimit:879.5,balanceDueDate:'2026-10-20T03:00:00Z'}}]}:path.startsWith('/investments')?{results:[{id:'inv',name:'CDB',type:'FIXED_INCOME',balance:300,taxNumber:'PRIVATE'}]}:path.startsWith('/accounts?')?{results:[{id:account}]}:{results:[tx,{...tx,id:'old',date:'2026-04-29T12:00:00Z'}],next:null}
 const result=await readOverview(get,{itemId:item,accountId:account,today:'2026-10-14',extras:true})
 assert.deepEqual(result.transactions.map(r=>r.id),['one']);assert.equal(result.months.length,6)
 assert.deepEqual(result.cards[0],{id:'card',label:'Card',last_four:'2222',brand:'VISA',balance_cents:12050,limit_cents:100000,available_cents:87950,minimum_cents:null,close_date:null,due_date:'2026-10-20'})
 assert.deepEqual(result.investments,[{id:'inv',label:'CDB',type:'FIXED_INCOME',balance_cents:30000}])
 assert(!JSON.stringify(result).includes('PRIVATE'))
 const plain=await readOverview(get,{itemId:item,accountId:account,today:'2026-10-14'});assert.equal(plain.cards,undefined)
 const failing=await readOverview(async path=>path.includes('type=CREDIT')||path.startsWith('/investments')?Promise.reject(new Error('x')):get(path),{itemId:item,accountId:account,today:'2026-10-14',extras:true})
 assert.equal(failing.cards,null);assert.equal(failing.investments,null)
 assert.equal(creditCardView({id:'c',balance:'bad'}).balance_cents,null);assert.equal(investmentView({id:'i'}).label,'Investimento')
})
