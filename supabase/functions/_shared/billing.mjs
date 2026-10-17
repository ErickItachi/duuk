export class BillingError extends Error {
 constructor(message,status=400,uncertain=false){super(message);this.status=status;this.uncertain=uncertain;this.retryAfter=60}
}
export const BILLING_EVENTS=['PAYMENT_CREATED','PAYMENT_AWAITING_RISK_ANALYSIS','PAYMENT_APPROVED_BY_RISK_ANALYSIS','PAYMENT_AUTHORIZED','PAYMENT_CREDIT_CARD_CAPTURE_REFUSED','PAYMENT_DUNNING_REQUESTED','PAYMENT_DUNNING_RECEIVED','PAYMENT_BANK_SLIP_CANCELLED','PAYMENT_UPDATED','PAYMENT_CONFIRMED','PAYMENT_RECEIVED','PAYMENT_OVERDUE','PAYMENT_DELETED','PAYMENT_RESTORED','PAYMENT_REFUNDED','PAYMENT_PARTIALLY_REFUNDED','PAYMENT_REFUND_IN_PROGRESS','PAYMENT_REFUND_DENIED','PAYMENT_CHARGEBACK_REQUESTED','PAYMENT_CHARGEBACK_DISPUTE','PAYMENT_AWAITING_CHARGEBACK_REVERSAL','PAYMENT_RECEIVED_IN_CASH_UNDONE','PAYMENT_ANTICIPATED','PAYMENT_REPROVED_BY_RISK_ANALYSIS']
export const environments=['sandbox','production']
export function billingEnvironment(value){if(!environments.includes(value))throw new BillingError('Escolha Sandbox ou Produção.');return value}
export const providerId=value=>{if(typeof value!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(value))throw new BillingError('Identificador de cobrança inválido.');return value}
export function dateOnly(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T12:00:00Z'))||new Date(value+'T12:00:00Z').toISOString().slice(0,10)!==value)throw new BillingError('Confira o vencimento.');return value}
export function chargeInput(body){
 const text=(value,max,label)=>{if(typeof value!=='string'||!value.trim()||value.trim().length>max)throw new BillingError('Confira '+label+'.');return value.trim()}
 const id=text(body.id,36,'o identificador');if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id))throw new BillingError('Comece uma nova cobrança.')
 const document=String(body.document||'').toUpperCase().replace(/[.\s/-]/g,'')
 if(!/^(?:\d{11}|[A-Z0-9]{12}\d{2})$/.test(document)||/^(.)\1+$/.test(document))throw new BillingError('Informe o CPF ou CNPJ do cliente. Ele será enviado somente ao Asaas.')
 if(!Number.isSafeInteger(body.amount_cents)||body.amount_cents<500||body.amount_cents>100000000000)throw new BillingError('Informe um valor entre R$ 5,00 e R$ 1.000.000.000,00.')
 if(!['UNDEFINED','PIX','BOLETO','CREDIT_CARD'].includes(body.method))throw new BillingError('Escolha a forma de pagamento.')
 const due_date=dateOnly(body.due_date)
 if(due_date<new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date()))throw new BillingError('Escolha um vencimento a partir de hoje.')
 return {id,title:text(body.title,160,'a descrição'),client_name:text(body.client_name,160,'o cliente'),amount_cents:body.amount_cents,due_date,method:body.method,document}
}
export async function asaasRequest(environment,key,method,path,body,params={},fetcher=fetch){
 billingEnvironment(environment)
 if(!/^\/(?:payments|customers|webhooks)(?:\/[A-Za-z0-9_-]+)?$/.test(path)&&!['/myAccount/status/','/myAccount/commercialInfo/'].includes(path))throw new BillingError('Operação de cobrança inválida.')
 const url=new URL('https://'+(environment==='sandbox'?'api-sandbox.asaas.com':'api.asaas.com')+'/v3'+path)
 for(const [name,value] of Object.entries(params))if(value!==undefined)url.searchParams.set(name,String(value))
 let response
 try{response=await fetcher(url,{method,headers:{access_token:key,'User-Agent':'DUUK-Cobrancas/1.0','Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'error',signal:AbortSignal.timeout(15000)})}
 catch{throw new BillingError(method==='GET'?'Não foi possível consultar o Asaas. Tente atualizar.':'O Asaas não confirmou a operação. Verifique o estado antes de tentar uma nova criação.',503,method!=='GET')}
 const content=await response.text();let data
 try{data=content.trim()?JSON.parse(content):null}catch{throw new BillingError('O Asaas retornou uma resposta inesperada. Verifique a operação.',502,method!=='GET')}
 if(response.ok)return data
 const status=response.status
 const message=status===401?'A chave do Asaas expirou ou pertence a outro ambiente. Reconecte a integração.':status===403?'O Asaas não autorizou a operação. Confira o cadastro da empresa e as permissões da chave.':status===404?'Cobrança não encontrada no Asaas. Atualize para conferir.':status===429?'O Asaas pediu uma pausa por limite de uso. Aguarde antes de atualizar.':status===400?'O Asaas recusou os dados. Confira CPF/CNPJ, valor, vencimento e as formas de pagamento habilitadas na conta.':'O Asaas não concluiu a operação. Confira o estado da cobrança.'
 const error=new BillingError(message,status,method!=='GET'&&status>=500);error.retryAfter=Math.min(3600,Math.max(1,Number(response.headers.get('retry-after'))||60));throw error
}
export function invoiceUrl(value,environment){
 try{const url=new URL(value),hosts=environment==='sandbox'?['sandbox.asaas.com']:['www.asaas.com','asaas.com'];return url.protocol==='https:'&&hosts.includes(url.hostname)&&!url.port&&!url.username&&!url.password&&/^\/i\/[A-Za-z0-9_-]+$/.test(url.pathname)&&!url.search&&!url.hash?url.href:null}catch{return null}
}
export function canonicalPayment(payment,charge){
 if(!payment||payment.externalReference!=='duuk:'+charge.id||payment.customer!==charge.customer_id||Math.abs(Number(payment.value)*100-Math.round(Number(payment.value)*100))>0.00001||Math.round(Number(payment.value)*100)!==Number(charge.amount_cents)||charge.payment_id&&payment.id!==charge.payment_id)throw new BillingError('Os dados do Asaas divergem desta cobrança. Confira no provedor antes de continuar.',409)
 const statuses=['PENDING','RECEIVED','CONFIRMED','OVERDUE','REFUNDED','RECEIVED_IN_CASH','REFUND_REQUESTED','REFUND_IN_PROGRESS','CHARGEBACK_REQUESTED','CHARGEBACK_DISPUTE','AWAITING_CHARGEBACK_REVERSAL','DUNNING_REQUESTED','DUNNING_RECEIVED','AWAITING_RISK_ANALYSIS']
 if(!statuses.includes(payment.status))throw new BillingError('O Asaas retornou uma situação ainda não reconhecida. Consulte a fatura.',409)
 const net=Number(payment.netValue),paid=payment.paymentDate
 return {payment_id:providerId(payment.id),customer_id:payment.customer,external_reference:payment.externalReference,amount_cents:Number(charge.amount_cents),status:payment.deleted?'CANCELED':payment.status,invoice_url:payment.deleted?null:invoiceUrl(payment.invoiceUrl,charge.environment),net_cents:payment.netValue!==null&&payment.netValue!==undefined&&Number.isFinite(net)&&net>=0?Math.round(net*100):null,paid_date:typeof paid==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(paid)?paid:null,has_refunds:Array.isArray(payment.refunds)&&payment.refunds.length>0}
}
export async function payerReference(secret,document){
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign'])
 const bytes=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode('duuk-payer:'+document))
 return Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,'0')).join('')
}
export function constantHashEqual(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==64||b.length!==64)return false;let difference=0;for(let i=0;i<64;i++)difference|=a.charCodeAt(i)^b.charCodeAt(i);return difference===0}

export function webhookEvent(body){
 if(typeof body?.id!=='string'||!/^[A-Za-z0-9_.:&-]{1,180}$/.test(body.id)||!BILLING_EVENTS.includes(body.event))throw new BillingError('Evento inválido.')
 return {event_id:body.id,event_type:body.event,payment_id:providerId(body.payment?.id),reference:typeof body.payment?.externalReference==='string'?body.payment.externalReference.slice(0,100):''}
}
