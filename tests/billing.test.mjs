import test from 'node:test'
import assert from 'node:assert/strict'
import { asaasRequest, billingEnvironment, canonicalPayment, chargeInput, constantHashEqual, dateOnly, invoiceUrl, payerReference, providerId, webhookEvent } from '../supabase/functions/_shared/billing.mjs'
import { canCancel, safeInvoice } from '../src/billing/model.mjs'
const id='00000000-0000-4000-8000-000000000022'
const input={id,title:'Filme de teste',client_name:'Cliente fictício',document:'123.456.789-09',amount_cents:150050,due_date:'2099-12-01',method:'UNDEFINED'}
const charge={...input,environment:'sandbox',customer_id:'cus_fixture',payment_id:'pay_fixture'}
const payment={id:'pay_fixture',customer:'cus_fixture',externalReference:'duuk:'+id,value:1500.50,netValue:1498.51,status:'PENDING',invoiceUrl:'https://sandbox.asaas.com/i/fixture'}
test('billing input validates money, document, method and calendar date',()=>{
 assert.equal(chargeInput(input).document,'12345678909')
 assert.equal(chargeInput({...input,document:'AB.123.CDE/0001-09'}).document,'AB123CDE000109')
 for(const amount_cents of [499,NaN,Infinity,500.1,100000000001])assert.throws(()=>chargeInput({...input,amount_cents}))
 for(const document of ['00000000000','bad','<script>',null])assert.throws(()=>chargeInput({...input,document}))
 assert.throws(()=>chargeInput({...input,due_date:'2000-01-01'}));assert.throws(()=>chargeInput({...input,method:'PIX;DELETE'}))
 assert.throws(()=>dateOnly('2026-02-30'));assert.equal(dateOnly('2028-02-29'),'2028-02-29')
 assert.throws(()=>providerId('../secrets'));assert.throws(()=>billingEnvironment('live'))
})
test('canonical receipt binds customer, reference, payment, exact cents and status',()=>{
 const got=canonicalPayment(payment,charge);assert.equal(got.net_cents,149851);assert.equal(got.amount_cents,150050)
 for(const patch of [{customer:'cus_other'},{externalReference:'duuk:other'},{id:'pay_other'},{value:1500.501},{value:'NaN'},{value:0},{status:'NEW_STATUS'}])assert.throws(()=>canonicalPayment({...payment,...patch},charge))
 assert.equal(canonicalPayment({...payment,netValue:null},charge).net_cents,null)
 assert.equal(canonicalPayment({...payment,netValue:0},charge).net_cents,0)
 assert.equal(canonicalPayment({...payment,deleted:true},charge).invoice_url,null)
 assert.equal(canonicalPayment({...payment,refunds:[{value:10}]},charge).has_refunds,true)
 assert.equal(canonicalPayment({...payment,status:'CONFIRMED'},charge).paid_date,null)
 assert(!JSON.stringify(got).includes(input.document));assert(!JSON.stringify(got).includes('cpfCnpj'))
})
test('invoice links reject wrong environments, credential tricks, scripts and redirects',()=>{
 for(const link of ['javascript:alert(1)','https://sandbox.asaas.com.attacker.test/i/x','https://sandbox.asaas.com@evil.test/i/x','https://www.asaas.com/i/x','https://sandbox.asaas.com/i/x?redirect=evil','http://sandbox.asaas.com/i/x','https://sandbox.asaas.com/i/x#token']){
  assert.equal(invoiceUrl(link,'sandbox'),null);assert.equal(safeInvoice({environment:'sandbox',invoice_url:link}),'')
 }
 assert.equal(safeInvoice({environment:'sandbox',invoice_url:payment.invoiceUrl}),payment.invoiceUrl)
 assert.equal(safeInvoice({environment:'sandbox',invoice_url:payment.invoiceUrl,status:'CANCELED'}),'')
 assert(canCancel({status:'PENDING'}));assert(!canCancel({status:'RECEIVED'}));assert(!canCancel({status:'UNCERTAIN'}))
})
test('API fixes provider origin and never retries a mutation after an ambiguous result',async()=>{
 let calls=0
 await assert.rejects(asaasRequest('sandbox','private-key','POST','/payments',{value:5},{},async(url,options)=>{
  calls++;assert.equal(url.origin,'https://api-sandbox.asaas.com');assert.equal(options.redirect,'error');assert.equal(options.headers.access_token,'private-key');assert(options.headers['User-Agent']);throw new Error('sensitive provider data')
 }),error=>error.uncertain===true&&!error.message.includes('sensitive'))
 assert.equal(calls,1)
 await assert.rejects(asaasRequest('production','private-key','GET','/../../secrets',undefined,{},()=>{throw Error('must not fetch')}))
 await assert.rejects(asaasRequest('sandbox','private-key','POST','/payments',{}, {},async()=>new Response('{"errors":[{"description":"CPF secret"}]}',{status:400})),error=>error.status===400&&!error.uncertain&&!error.message.includes('secret'))
 await assert.rejects(asaasRequest('sandbox','private-key','POST','/payments',{}, {},async()=>new Response('not JSON',{status:200})),error=>error.uncertain&&error.status===502)
 await assert.rejects(asaasRequest('sandbox','private-key','GET','/payments',undefined,{},async()=>new Response('{}',{status:429,headers:{'retry-after':'120'}})),error=>error.retryAfter===120)
})
test('payer references are keyed and constant comparison rejects missing secrets',async()=>{
 const a=await payerReference('secret-a',chargeInput(input).document),b=await payerReference('secret-b',chargeInput(input).document)
 assert.match(a,/^[a-f0-9]{64}$/);assert.notEqual(a,b);assert(!a.includes('12345678909'));assert(constantHashEqual(a,a));assert(!constantHashEqual(a,b));assert(!constantHashEqual(undefined,a));assert(!constantHashEqual('',''))
})

test('official webhook identifiers accept ampersands and discard personal fields',()=>{
 const event=webhookEvent({id:'evt_05b708f961d739ea7eba7e4db318f621&368604920',event:'PAYMENT_RECEIVED',payment:{id:'pay_fixture',externalReference:'duuk:'+id,creditCard:{number:'do not store'},customer:'private-customer'}})
 assert.equal(event.event_id,'evt_05b708f961d739ea7eba7e4db318f621&368604920');assert.equal(Object.keys(event).length,4);assert(!JSON.stringify(event).includes('creditCard'));assert.throws(()=>webhookEvent({id:'evt',event:'UNKNOWN'}))
})
