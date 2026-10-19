import test from 'node:test'
import assert from 'node:assert/strict'
import { billingQuery, queryActions } from '../supabase/functions/_shared/billing-queries.mjs'
import { boletoView, customerView, editInput, feesView, monthPeriod, pageOffset, paymentView, pixView, safeProviderUrl, simulationInput, simulationResult, transactionView } from '../supabase/functions/_shared/billing-resources.mjs'
import { statementCsv } from '../src/billing/model.mjs'
import { asaasRequest } from '../supabase/functions/_shared/billing.mjs'
const cfg={api_key:'fixture-only'},calls=[]
const deps={environment:'sandbox',rpc:async()=>({configured:true}),credentials:async()=>cfg,call:async(c,method,path,data,params)=>{assert.equal(c,cfg);calls.push({method,path,data,params});return {data:[],hasMore:false,totalCount:0,offset:0}}}
test('official simulator validates cents/installments and does not invent unavailable methods',()=>{
 const input=simulationInput({amount_cents:100000,installments:21})
 const result=simulationResult({value:1000,pix:{netValue:999,feeValue:1},creditCard:{netValue:876.42,feePercentage:12,operationFee:3.58,installment:{paymentValue:47.62,paymentNetValue:41.73}}},input)
 assert.equal(result.entries[2].fee_cents,12358);assert.equal(result.entries[2].installment_net_cents,4173);assert.equal(result.entries[1].available,false)
 for(const body of [{amount_cents:499},{amount_cents:500,installments:0},{amount_cents:500,installments:22},{amount_cents:500.5}])assert.throws(()=>simulationInput(body))
 assert.throws(()=>simulationResult({value:1001},input));assert.throws(()=>simulationResult({value:1000,pix:{netValue:null}},input))
})
test('provider DTOs omit card tokens, documents, addresses and secrets; unknown money stays unknown',()=>{
 const payment=paymentView({id:'pay_fixture',value:100,netValue:null,customer:'cus_fixture',creditCard:{creditCardToken:'secret'},cpfCnpj:'12345678909'},'sandbox')
 assert.equal(payment.net_cents,null);assert(!JSON.stringify(payment).includes('secret'));assert(!JSON.stringify(payment).includes('12345678909'))
 assert.deepEqual(customerView({id:'cus_fixture',name:'Fiction',cpfCnpj:'12345678909',address:'private',creditCardToken:'secret'}),{id:'cus_fixture',name:'Fiction',email:'',notification_disabled:false,deleted:false})
 const fees=feesView({api_key:'secret',payment:{pix:{fixedFeeValue:0,creditCardToken:'secret'}}});assert.equal(fees.fees.payment.pix.fixedFeeValue,0);assert(!JSON.stringify(fees).includes('secret'))
 const statement=transactionView({id:'txn_fixture',value:-1,description:'Cliente 123.456.789-09 e 12.345.678/0001-90'});assert.equal(statement.amount_cents,-100);assert(!/123\.456|12\.345/.test(statement.description))
})
test('dates, bounded pagination, invoice artifacts and PNG validation reject unsafe inputs',()=>{
 assert.deepEqual(monthPeriod('2028-02'),{start:'2028-02-01',end:'2028-02-29'});assert.throws(()=>monthPeriod('2026-13'));assert.throws(()=>pageOffset(50001));assert.throws(()=>pageOffset(-1))
 assert.equal(safeProviderUrl('https://sandbox.asaas.com/b/pdf/fixture','sandbox','boleto'),'https://sandbox.asaas.com/b/pdf/fixture')
 for(const url of ['https://attacker.invalid/b/pdf/x','javascript:alert(1)','https://sandbox.asaas.com/b/pdf/x?redirect=bad','https://sandbox.asaas.com@attacker.invalid/b/pdf/x'])assert.equal(safeProviderUrl(url,'sandbox','boleto'),null)
 assert.equal(pixView({payload:'fixture-pix',encodedImage:'PHN2Zz5zY3JpcHQ8L3N2Zz4='}).encoded_image,null);assert.throws(()=>boletoView({identificationField:'<script>'}))
 assert.equal(boletoView({identificationField:'1'.repeat(47)}).identification_field.length,47)
 assert.throws(()=>editInput({title:'A',due_date:'2000-01-01'}));assert.deepEqual(editInput({title:' Film ',due_date:'2099-12-31',amount_cents:1}),{description:'Film',dueDate:'2099-12-31'})
})
test('simulator calls only the documented non-issuing endpoint, with no payer or card details',async()=>{
 let sent
 const result=await billingQuery({action:'simulate',amount_cents:10000,installments:6,document:'private',creditCardToken:'private'},{...deps,call:async(c,method,path,input)=>{sent={method,path,input};return {value:100,pix:{netValue:99}}}})
 assert.equal(sent.path,'/payments/simulate');assert.equal(sent.method,'POST');assert.deepEqual(Object.keys(sent.input).sort(),['billingTypes','installmentCount','value']);assert.equal(result.entries[0].net_cents,9900)
})
test('account overview supports partial upstream failures without reporting a false zero',async()=>{
 const result=await billingQuery({action:'overview',month:'2026-10'},{...deps,call:async(c,m,path,data,params)=>{
  if(path==='/finance/balance')throw Error('fixture')
  if(path==='/payments/limits')return {creation:{daily:{limit:100,used:4,wasReached:false}}}
  assert.equal(params['dueDate[ge]'],'2026-10-01');assert.equal(params['dueDate[le]'],'2026-10-31');return {quantity:2,value:100,netValue:98}
 }})
 assert(!result.balance);assert(result.errors.balance);assert.equal(result.received.net_cents,9800);assert.equal(result.limits.daily_used,4)
 assert.deepEqual(await billingQuery({action:'overview'},{...deps,rpc:async()=>({configured:false}),credentials:()=>{throw Error('must not read secrets')}}),{configured:false})
})
test('read queries select bounded provider routes and filters; unknown resources cannot request transfers',async()=>{
 calls.length=0
 for(const resource of ['payments','customers','installments','subscriptions'])await billingQuery({action:'provider_list',resource,month:'2026-10',offset:20},deps)
 await billingQuery({action:'transactions',month:'2026-10'},deps)
 await billingQuery({action:'collection_payments',resource:'installments',id:'ins_fixture'},deps)
 assert(calls.every(c=>c.method==='GET'&&c.params.limit===20));assert.equal(calls[4].params.finishDate,'2026-10-31')
 for(const resource of ['transfers','pix/addressKeys','../payments'])await assert.rejects(()=>billingQuery({action:'provider_list',resource},deps))
 await assert.rejects(()=>billingQuery({action:'collection_payments',resource:'installments',id:'../../transfers'},deps))
 assert(!queryActions.includes('withdraw'));await assert.rejects(()=>asaasRequest('production','fixture','POST','/transfers',{}))
})
test('Pix artifacts require canonical open payment lookup in this company account before reading QR',async()=>{
 const paths=[]
 const deps2={...deps,call:async(c,m,path)=>{paths.push(path);return path.endsWith('/pixQrCode')?{payload:'fictional-payload'}:{id:'pay_fixture',billingType:'PIX',value:100,status:'PENDING'}}}
 const result=await billingQuery({action:'artifacts',id:'pay_fixture',kind:'pix'},deps2)
 assert.equal(result.pix.payload,'fictional-payload');assert.deepEqual(paths,['/payments/pay_fixture','/payments/pay_fixture/pixQrCode'])
 await assert.rejects(()=>billingQuery({action:'artifacts',id:'pay_fixture',kind:'pix'},{...deps,call:async()=>({id:'pay_fixture',billingType:'PIX',status:'RECEIVED'})}))
})

test('statement CSV prevents spreadsheet formulas while retaining numeric negative BRL and unknown balances',()=>{
 const csv=statementCsv([{date:'2026-10-19',description:'  =HYPERLINK("https://attacker.invalid")',type:'FEE',amount_cents:-199,balance_cents:null}])
 assert(csv.startsWith('\uFEFF'));assert(csv.includes('"\'  =HYPERLINK(""https://attacker.invalid"")"'));assert(csv.includes('"-1,99";""'))
})
