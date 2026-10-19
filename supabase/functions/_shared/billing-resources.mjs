import { BillingError, dateOnly, invoiceUrl, providerId } from './billing.mjs'

const text=(v,max=200)=>typeof v==='string'?v.slice(0,max):''
export const moneyCents=v=>v===null||v===undefined||!Number.isFinite(Number(v))?null:Math.round(Number(v)*100)
const numeric=v=>v===null||v===undefined||!Number.isFinite(Number(v))?null:Number(v)
const day=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)?v:null
export function monthPeriod(value){
 if(typeof value!=='string'||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(value))throw new BillingError('Escolha um mês válido.')
 const [year,month]=value.split('-').map(Number)
 return {start:value+'-01',end:value+'-'+new Date(Date.UTC(year,month,0)).getUTCDate()}
}
export function pageOffset(value=0){if(!Number.isInteger(value)||value<0||value>50000)throw new BillingError('Confira a página da consulta.');return value}
export function simulationInput(body){
 if(!Number.isSafeInteger(body.amount_cents)||body.amount_cents<500||body.amount_cents>100000000000)throw new BillingError('Informe um valor a partir de R$ 5,00, até R$ 1 bilhão.')
 const count=body.installments??1
 if(!Number.isInteger(count)||count<1||count>21)throw new BillingError('Escolha de 1 a 21 parcelas.')
 return {value:body.amount_cents/100,installmentCount:count,billingTypes:['PIX','BOLETO','CREDIT_CARD']}
}
export function simulationResult(data,input){
 if(!data||moneyCents(data.value)!==moneyCents(input.value))throw new BillingError('O simulador retornou um valor divergente. Tente novamente.',502)
 const entries=[['PIX',data.pix],['BOLETO',data.bankSlip],['CREDIT_CARD',data.creditCard]].map(([method,item])=>{
  if(!item)return {method,available:false}
  const net=moneyCents(item.netValue),gross=moneyCents(data.value)
  if(net===null||net<0||net>gross)throw new BillingError('O Asaas retornou valores incompletos na simulação.',502)
  return {method,available:true,gross_cents:gross,net_cents:net,fee_cents:gross-net,fee_percentage:numeric(item.feePercentage),operation_cents:moneyCents(item.operationFee),fixed_fee_cents:moneyCents(item.feeValue),installments:input.installmentCount,installment_gross_cents:moneyCents(item.installment?.paymentValue),installment_net_cents:moneyCents(item.installment?.paymentNetValue)}
 })
 return {amount_cents:moneyCents(data.value),installments:input.installmentCount,entries,checked_at:new Date().toISOString()}
}
export function safeProviderUrl(value,environment,kind='invoice'){
 if(kind==='invoice')return invoiceUrl(value,environment)
 try{const u=new URL(value),hosts=environment==='sandbox'?['sandbox.asaas.com']:['www.asaas.com','asaas.com'];const allowed=kind==='boleto'?/^\/b\/(?:pdf|view)\/[A-Za-z0-9_-]+$/:/^\/(?:comprovantes|receipt|receipts)(?:\/[A-Za-z0-9_-]+){1,4}$/;return u.protocol==='https:'&&hosts.includes(u.hostname)&&!u.port&&!u.username&&!u.password&&!u.search&&!u.hash&&allowed.test(u.pathname)?u.href:null}catch{return null}
}
export function paymentView(p,environment){
 return {id:providerId(p.id),customer_id:typeof p.customer==='string'?providerId(p.customer):null,title:text(p.description,160)||'Cobrança Asaas',amount_cents:moneyCents(p.value),net_cents:moneyCents(p.netValue),status:text(p.deleted?'CANCELED':p.status,50),method:text(p.billingType,30),due_date:day(p.dueDate),paid_date:day(p.paymentDate),credit_date:day(p.creditDate||p.estimatedCreditDate),created_date:day(p.dateCreated),invoice_url:invoiceUrl(p.invoiceUrl,environment),boleto_url:safeProviderUrl(p.bankSlipUrl,environment,'boleto'),receipt_url:safeProviderUrl(p.transactionReceiptUrl,environment,'receipt'),installment_id:text(p.installment,100)||null,subscription_id:text(p.subscription,100)||null,has_refunds:Array.isArray(p.refunds)&&p.refunds.length>0}
}
export function customerView(c){return {id:providerId(c.id),name:text(c.name,160),email:text(c.email,254),notification_disabled:c.notificationDisabled===true,deleted:c.deleted===true}}
export function subscriptionView(s){return {id:providerId(s.id),customer_id:typeof s.customer==='string'?providerId(s.customer):null,title:text(s.description,160)||'Assinatura Asaas',amount_cents:moneyCents(s.value),status:text(s.status,30),method:text(s.billingType,30),cycle:text(s.cycle,30),next_due_date:day(s.nextDueDate),end_date:day(s.endDate),deleted:s.deleted===true}}
export function installmentView(s,environment){return {id:providerId(s.id),customer_id:typeof s.customer==='string'?providerId(s.customer):null,title:text(s.description,160)||'Parcelamento Asaas',amount_cents:moneyCents(s.value),net_cents:moneyCents(s.netValue),installment_cents:moneyCents(s.paymentValue),installments:Number.isInteger(s.installmentCount)?s.installmentCount:null,method:text(s.billingType,30),created_date:day(s.dateCreated),deleted:s.deleted===true,receipt_url:safeProviderUrl(s.transactionReceiptUrl,environment,'receipt')}}
const privateText=v=>text(v,240).replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b|\b\d{11,14}\b/g,'[documento]')
export function transactionView(t){return {id:providerId(t.id),amount_cents:moneyCents(t.value),balance_cents:moneyCents(t.balance),date:day(t.date),type:text(t.type,80),description:privateText(t.description),payment_id:typeof t.paymentId==='string'?providerId(t.paymentId):null}}
export function pageView(response,map){if(!Array.isArray(response?.data))throw new BillingError('O Asaas retornou uma consulta incompleta.',502);return {items:response.data.slice(0,20).map(map),has_more:response.hasMore===true,total_count:Number.isInteger(response.totalCount)?response.totalCount:null,offset:response.offset||0,checked_at:new Date().toISOString()}}
export function statisticsView(s){return {count:Number.isInteger(s?.quantity)?s.quantity:null,gross_cents:moneyCents(s?.value),net_cents:moneyCents(s?.netValue)}}
const feeFields={
 payment:{bankSlip:['defaultValue','discountValue','expirationDate','daysToReceive'],creditCard:['operationValue','oneInstallmentPercentage','upToSixInstallmentsPercentage','upToTwelveInstallmentsPercentage','upToTwentyOneInstallmentsPercentage','discountOneInstallmentPercentage','discountUpToSixInstallmentsPercentage','discountUpToTwelveInstallmentsPercentage','discountUpToTwentyOneInstallmentsPercentage','discountExpiration','daysToReceive'],debitCard:['operationValue','defaultPercentage','daysToReceive'],pix:['fixedFeeValue','fixedFeeValueWithDiscount','percentageFee','minimumFeeValue','maximumFeeValue','discountExpiration','monthlyCreditsWithoutFee','creditsReceivedOfCurrentMonth']},
 transfer:{ted:['feeValue','consideredInMonthlyTransfersWithoutFee'],pix:['feeValue','discountValue','expirationDate','consideredInMonthlyTransfersWithoutFee']},anticipation:{creditCard:['detachedMonthlyFeeValue','installmentMonthlyFeeValue'],bankSlip:['monthlyFeePercentage']},
 notification:['phoneCallFeeValue','whatsAppFeeValue','messagingFeeValue'],creditBureauReport:['naturalPersonFeeValue','legalPersonFeeValue'],paymentDunning:['feeValue'],invoice:['feeValue']
}
export function feesView(raw){
 const pick=(source,shape)=>Array.isArray(shape)?Object.fromEntries(shape.filter(k=>source?.[k]!==undefined).map(k=>[k,typeof source[k]==='string'?text(source[k],50):typeof source[k]==='boolean'?source[k]:numeric(source[k])])):Object.fromEntries(Object.entries(shape).filter(([k])=>source?.[k]).map(([k,v])=>[k,pick(source[k],v)]))
 const fees=pick(raw,feeFields);if(raw?.transfer?.monthlyTransfersWithoutFee!==undefined)fees.transfer={...fees.transfer,monthlyTransfersWithoutFee:numeric(raw.transfer.monthlyTransfersWithoutFee)}
 return {fees,checked_at:new Date().toISOString()}
}
export function pixView(raw){
 const payload=text(raw?.payload,4096);if(!payload)throw new BillingError('O Asaas não disponibilizou o Pix desta fatura.',409)
 const image=typeof raw.encodedImage==='string'?raw.encodedImage.replace(/^data:image\/png;base64,/,''):''
 const png=image.length<=300000&&/^iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(image)?image:null
 return {payload,encoded_image:png,expiration:typeof raw.expirationDate==='string'?text(raw.expirationDate,40):null}
}
export function boletoView(raw){const value=String(raw?.identificationField||'').replace(/[.\s]/g,'');if(!/^\d{40,60}$/.test(value))throw new BillingError('O Asaas não disponibilizou o código deste boleto.',409);return {identification_field:value,bar_code:typeof raw.barCode==='string'&&/^\d{40,60}$/.test(raw.barCode)?raw.barCode:null}}
export function editInput(body){const title=typeof body.title==='string'?body.title.trim():'';if(!title||title.length>160)throw new BillingError('Informe uma descrição de até 160 caracteres.');const due_date=dateOnly(body.due_date);if(due_date<new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date()))throw new BillingError('Escolha um vencimento a partir de hoje.');return {description:title,dueDate:due_date}}
