import { BillingError, providerId } from './billing.mjs'
import { boletoView, customerView, feesView, installmentView, moneyCents, monthPeriod, pageOffset, pageView, paymentView, pixView, simulationInput, simulationResult, statisticsView, subscriptionView, transactionView } from './billing-resources.mjs'

export const queryActions=['overview','fees','simulate','transactions','provider_list','collection_payments','artifacts']
// Only explicitly selected DTO fields leave the server. In particular, customer documents,
// billingInfo/card tokens and credentials must never reach the browser.
export async function billingQuery(body,{environment,rpc,credentials,call}){
 const cfg=body.action==='overview'?(await rpc('status')).configured?await credentials():null:await credentials()
 if(!cfg)return {configured:false}
 if(body.action==='simulate'){const input=simulationInput(body);return simulationResult(await call(cfg,'POST','/payments/simulate',input),input)}
 if(body.action==='fees')return feesView(await call(cfg,'GET','/myAccount/fees/'))
 if(body.action==='overview'){
  const period=monthPeriod(body.month),filters={'dueDate[ge]':period.start,'dueDate[le]':period.end}
  const keys=['balance','pending','overdue','confirmed','received','limits']
  const results=await Promise.allSettled([
   call(cfg,'GET','/finance/balance'),
   ...['PENDING','OVERDUE','CONFIRMED','RECEIVED'].map(status=>call(cfg,'GET','/finance/payment/statistics',undefined,{...filters,status})),
   call(cfg,'GET','/payments/limits'),
  ])
  const output={configured:true,period,checked_at:new Date().toISOString(),errors:{}}
  results.forEach((result,index)=>{
   const key=keys[index]
   if(result.status==='rejected'){output.errors[key]=result.reason instanceof BillingError?result.reason.message:'Consulta indisponível.';return}
   const value=result.value
   output[key]=key==='balance'?{amount_cents:moneyCents(value?.balance)}:key==='limits'?{daily_limit:Number.isInteger(value?.creation?.daily?.limit)?value.creation.daily.limit:null,daily_used:Number.isInteger(value?.creation?.daily?.used)?value.creation.daily.used:null,reached:value?.creation?.daily?.wasReached===true}:statisticsView(value)
  })
  return output
 }
 const offset=pageOffset(body.offset),params={offset,limit:20}
 if(body.action==='transactions'){
  const period=monthPeriod(body.month)
  return pageView(await call(cfg,'GET','/financialTransactions',undefined,{...params,startDate:period.start,finishDate:period.end,order:'desc'}),transactionView)
 }
 if(body.action==='provider_list'){
  if(!['payments','customers','installments','subscriptions'].includes(body.resource))throw new BillingError('Escolha uma consulta válida.')
  if(body.resource==='customers'&&typeof body.search==='string'&&body.search.trim())params[body.search.includes('@')?'email':'name']=body.search.trim().slice(0,160)
  if(body.customer_id)params.customer=providerId(body.customer_id)
  if(body.resource==='payments'){
   const period=monthPeriod(body.month);params['dueDate[ge]']=period.start;params['dueDate[le]']=period.end
   if(body.status&&body.status!=='all'){if(!['PENDING','OVERDUE','CONFIRMED','RECEIVED','REFUNDED','RECEIVED_IN_CASH','AWAITING_RISK_ANALYSIS'].includes(body.status))throw new BillingError('Situação inválida.');params.status=body.status}
   if(body.method&&body.method!=='all'){if(!['PIX','BOLETO','CREDIT_CARD','UNDEFINED'].includes(body.method))throw new BillingError('Forma de pagamento inválida.');params.billingType=body.method}
  }
  const maps={payments:p=>paymentView(p,environment),customers:customerView,installments:s=>installmentView(s,environment),subscriptions:subscriptionView}
  return pageView(await call(cfg,'GET','/'+body.resource,undefined,params),maps[body.resource])
 }
 if(body.action==='collection_payments'){
  if(!['installments','subscriptions'].includes(body.resource))throw new BillingError('Consulta inválida.')
  return pageView(await call(cfg,'GET','/'+body.resource+'/'+providerId(body.id)+'/payments',undefined,params),p=>paymentView(p,environment))
 }
 if(body.action==='artifacts'){
  const id=providerId(body.id),payment=await call(cfg,'GET','/payments/'+id),safe=paymentView(payment,environment)
  if(!['PENDING','OVERDUE'].includes(safe.status))throw new BillingError('Esta cobrança não está aberta para pagamento.',409)
  if(body.kind==='pix'&&['PIX','UNDEFINED'].includes(safe.method))return {payment:safe,pix:pixView(await call(cfg,'GET','/payments/'+id+'/pixQrCode'))}
  if(body.kind==='boleto'&&['BOLETO','UNDEFINED'].includes(safe.method))return {payment:safe,boleto:boletoView(await call(cfg,'GET','/payments/'+id+'/identificationField'))}
  throw new BillingError('Esta forma de pagamento não está disponível nesta cobrança.',409)
 }
 throw new BillingError('Consulta inválida.')
}
