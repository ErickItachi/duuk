import { checked, cors, database, HttpError, json, member, rateLimit, readJson, sha256, uuid } from '../_shared/http.ts'
import { asaasRequest, BILLING_EVENTS, BillingError, billingEnvironment, canonicalPayment, chargeInput, constantHashEqual, payerReference, providerId, webhookEvent } from '../_shared/billing.mjs'
import { billingQuery, queryActions } from '../_shared/billing-queries.mjs'
import { editInput } from '../_shared/billing-resources.mjs'

const callbackBase='https://ilohuxhyfqikjlvoarts.supabase.co/functions/v1/duuk-billing'
Deno.serve(async req=>{
 let headers:Record<string,string>={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}
 try{
  const url=new URL(req.url),hook=url.searchParams.get('hook')==='1'
  if(!hook){headers=cors(req);if(req.method==='OPTIONS')return new Response(null,{status:204,headers})}
  if(req.method!=='POST')throw new HttpError('Método não permitido.',405)
  if(hook&&!/^[a-f0-9]{64}$/.test(req.headers.get('asaas-access-token')||''))throw new HttpError('Webhook não autorizado.',401)
  const db=database(),body=await readJson(req,hook?64000:20000)
  let actor:string|null=null,environment=billingEnvironment(hook?url.searchParams.get('environment'):body.environment||'sandbox')
  const rpc=async(operation:string,payload:Record<string,unknown>={})=>checked(await db.rpc('duuk_billing_backend',{actor,operation,payload:{environment,...payload}})) as any
  const call=async(credentials:any,method:string,path:string,data?:unknown,params:Record<string,unknown>={})=>{
   try{return await asaasRequest(environment,credentials.api_key,method,path,data,params)}
   catch(cause){if(cause instanceof BillingError&&cause.status===429)await rpc('cooldown',{seconds:cause.retryAfter}).catch(()=>{});throw cause}
  }
  const credentials=async(config_id?:string)=>rpc('credentials',config_id?{config_id}:{})
  const sync=async(id:string,expectedConfig?:string,eventType?:string)=>{
   const cfg=await credentials(expectedConfig),scope={generation:cfg.generation,id}
   const claim=await rpc('sync_claim',scope),lease={...scope,lease_id:claim.lease_id},charge=claim.charge
   try{
    let payment
    if(charge.payment_id){
     try{payment=await call(cfg,'GET','/payments/'+providerId(charge.payment_id))}
     catch(cause){if(cause instanceof BillingError&&cause.status===404&&eventType==='PAYMENT_DELETED')return await rpc('cancel_applied',lease);throw cause}
    }else{
     const found=await call(cfg,'GET','/payments',undefined,{externalReference:'duuk:'+id,limit:2})
     const matching=(found?.data||[]).filter((p:any)=>p.externalReference==='duuk:'+id)
     if(matching.length>1)throw new BillingError('O Asaas retornou mais de uma cobrança para esta tentativa. Confira no provedor.',409)
     payment=matching[0]
     if(!payment&&!charge.customer_id&&!charge.payment_started){
      const clients=await call(cfg,'GET','/customers',undefined,{externalReference:'duuk-payer:'+charge.payer_hash,limit:2})
      const client=(clients?.data||[]).find((c:any)=>c.externalReference==='duuk-payer:'+charge.payer_hash&&c.notificationDisabled===true)
      if(client)return await rpc('customer_recovered',{...lease,customer_id:providerId(client.id)})
     }
     if(!payment)throw new BillingError('A criação ainda não foi confirmada. Confira no Asaas; uma nova cobrança não será gerada automaticamente.',409)
    }
    return await rpc('sync_apply',{...lease,...canonicalPayment(payment,charge)})
   }catch(cause){await rpc('sync_error',{...lease,error:cause instanceof Error?cause.message:'Não foi possível conferir a cobrança.'}).catch(()=>{});throw cause}
  }
  const dispatch=async()=>{
   const original=environment,deadline=Date.now()+45000;let processed=0
   for(let index=0;index<3&&Date.now()<deadline-20000;index++){
    const jobs=await rpc('jobs',{limit:1});if(!jobs.length)break
    const job=jobs[0]
    // The job and connection are both server-owned. No caller supplies an account.
    environment=job.environment||original
    try{await sync(job.charge_id,job.config_id,job.event_type);await rpc('job_finish',{id:job.id,lease_id:job.lease_id,success:true});processed++}
    catch(cause){await rpc('job_finish',{id:job.id,lease_id:job.lease_id,success:false,error:cause instanceof Error?cause.message:'Não foi possível conferir.',retry_seconds:cause instanceof BillingError&&cause.status===429?cause.retryAfter:Math.min(3600,60*2**Math.min(job.attempts,6))}).catch(()=>{})}
   }
   environment=original;return {processed}
  }
  if(hook){
   const config_id=uuid(url.searchParams.get('connection')),stored=await rpc('hook_check',{config_id}),given=req.headers.get('asaas-access-token')||''
   if(given.length<32||given.length>255||!constantHashEqual(await sha256(given),stored.hash))throw new HttpError('Webhook não autorizado.',401)
   await rpc('enqueue',{config_id,...webhookEvent(body)})
   // The event is durable before acknowledgement; Cron retries work if execution is suspended.
   const runtime=(globalThis as unknown as {EdgeRuntime?:{waitUntil(task:Promise<unknown>):void}}).EdgeRuntime
   if(runtime)runtime.waitUntil(dispatch().catch(()=>{}))
   return json({received:true},headers)
  }
  if(body.action==='dispatch'){
   const cron=req.headers.get('x-duuk-cron');if(!cron||cron.length<20||cron.length>255)throw new HttpError('Acesso restrito.',403);const secrets=checked(await db.rpc('duuk_backend_secrets'))
   if(!cron||!constantHashEqual(await sha256(cron),await sha256(secrets?.['duuk.push.cron']||'')))throw new HttpError('Acesso restrito.',403)
   return json(await dispatch(),headers)
  }
  const user=await member(req,db,'billing');actor=user.id
  if(queryActions.includes(body.action)){
   await rateLimit(db,actor,'billing-'+body.action,body.action==='simulate'?20:30)
   return json(await billingQuery(body,{environment,rpc,credentials,call}),headers)
  }
  const admin=async()=>{const profile=checked(await db.from('duuk_profiles').select('is_super_admin').eq('id',actor!).single());if(!profile?.is_super_admin)throw new HttpError('Somente um super administrador configura o Asaas.',403)}
  if(['status','list','get'].includes(body.action))return json(await rpc(body.action,body.action==='list'?{month:body.month,offset:body.offset||0,status:body.status||'all',search:typeof body.search==='string'?body.search.slice(0,200):''}:body.action==='get'?{id:uuid(body.id)}:{}),headers)
  const configureWebhook=async(cfg:any)=>{
   const callback=callbackBase+'?hook=1&environment='+environment+'&connection='+cfg.config_id
   const settings={name:'DUUK Cobranças '+environment,url:callback,email:cfg.contact_email,enabled:true,interrupted:false,authToken:cfg.webhook_token,events:BILLING_EVENTS,sendType:'SEQUENTIALLY',apiVersion:3}
   const existing=await call(cfg,'GET','/webhooks',undefined,{limit:100}),own=(existing?.data||[]).find((w:any)=>w.url===callback)
   const result=await call(cfg,own?'PUT':'POST',own?'/webhooks/'+providerId(own.id):'/webhooks',settings)
   await rpc('config_ready',{generation:cfg.generation,webhook_id:providerId(result.id)})
  }
  if(body.action==='configure'){
   await admin();await rateLimit(db,actor,'billing-configure',5,600)
   const key=typeof body.api_key==='string'?body.api_key.trim():''
   if(key.length<20||key.length>1000||/\s/.test(key))throw new HttpError('Informe a chave da API somente neste formulário.',400)
   if(typeof body.contact_email!=='string'||body.contact_email.length>254||!/^\S+@\S+\.\S+$/.test(body.contact_email))throw new HttpError('Informe o e-mail para avisos técnicos do Asaas.',400)
   if(environment==='production'&&body.fees_accepted!==true)throw new HttpError('Revise as tarifas do Asaas antes de conectar a Produção.',400)
   const temporary={api_key:key},[account,commercial]=await Promise.all([call(temporary,'GET','/myAccount/status/'),call(temporary,'GET','/myAccount/commercialInfo/')])
   if(typeof account?.id!=='string'||commercial?.personType!=='JURIDICA')throw new HttpError('Conecte uma conta empresarial do Asaas, em nome da DUUK e com CNPJ.',400)
   const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('')
   await rpc('configure',{api_key:key,account_id:account.id,account_name:commercial.companyName||commercial.name||'DUUK',account_status:account.general,contact_email:body.contact_email.trim().toLowerCase(),fees_accepted:body.fees_accepted===true,webhook_token:token,webhook_hash:await sha256(token)})
   await configureWebhook(await credentials());return json(await rpc('status'),headers)
  }
  if(['repair','account_refresh','disconnect'].includes(body.action)){
   await admin();
   if(body.action==='disconnect'){const cfg=await credentials().catch(()=>null);if(cfg?.webhook_id)await call(cfg,'DELETE','/webhooks/'+providerId(cfg.webhook_id)).catch(()=>{});await rpc('disconnect');return json(await rpc('status'),headers)}
   const cfg=await credentials()
   if(body.action==='repair')await configureWebhook(cfg)
   else if(body.action==='account_refresh'){const account=await call(cfg,'GET','/myAccount/status/');if(account.id!==cfg.account_id)throw new HttpError('A conta do Asaas mudou.',409);await rpc('config_refresh',{generation:cfg.generation,account_status:account.general})}

   return json(await rpc('status'),headers)
  }
  if(body.action==='create'){
   await rateLimit(db,actor,'billing-create',10,600)
   const input=chargeInput(body),cfg=await credentials(),payer_hash=await payerReference(cfg.webhook_token,input.document)
   const {document,...safe}=input,request_hash=await sha256(JSON.stringify({...safe,payer_hash})),scope={generation:cfg.generation,id:input.id}
   const prepared=await rpc('begin_create',{...safe,...scope,payer_hash,request_hash})
   if(!prepared.execute)return json({charge:prepared.charge},headers)
   const charge=prepared.internal
   try{
    let customer=charge.customer_id
    if(!customer){
     const result=await call(cfg,'GET','/customers',undefined,{externalReference:'duuk-payer:'+payer_hash,limit:2})
     const found=(result?.data||[]).filter((c:any)=>c.externalReference==='duuk-payer:'+payer_hash)
     if(found.length>1)throw new BillingError('Há mais de um cadastro deste cliente no Asaas. Confira no provedor.',409)
     if(found[0]){if(found[0].notificationDisabled!==true)throw new BillingError('Desative as notificações automáticas deste cliente no Asaas antes de continuar.',409);customer=providerId(found[0].id)}
     else{await rpc('customer_start',scope);const created=await call(cfg,'POST','/customers',{name:input.client_name,cpfCnpj:document,externalReference:'duuk-payer:'+payer_hash,notificationDisabled:true});customer=providerId(created.id)}
     await rpc('customer_saved',{...scope,customer_id:customer})
    }
    await rpc('payment_start',scope)
    const payment=await call(cfg,'POST','/payments',{customer,billingType:input.method,value:input.amount_cents/100,dueDate:input.due_date,description:input.title,externalReference:'duuk:'+input.id,postalService:false})
    const result=await rpc('created',{...scope,...canonicalPayment(payment,{...charge,customer_id:customer})})
    return json({charge:result},headers)
   }catch(cause){await rpc('creation_error',{...scope,uncertain:!(cause instanceof BillingError)||cause.uncertain||cause.status!==400,error:cause instanceof Error?cause.message:'A criação precisa ser conferida.'}).catch(()=>{});return json({charge:await rpc('get',{id:input.id})},headers)}
  }
  if(body.action==='sync'){await rateLimit(db,actor,'billing-sync',20);return json({charge:await sync(uuid(body.id))},headers)}
  if(['edit','restore'].includes(body.action)){
   const update=body.action==='edit'?editInput(body):null
   await rateLimit(db,actor,'billing-'+body.action,10,600)
   const cfg=await credentials(),scope={generation:cfg.generation,id:uuid(body.id)},claim=await rpc('sync_claim',scope),lease={...scope,lease_id:claim.lease_id},charge=claim.charge
   try{
    if(!charge.payment_id)throw new HttpError('Conclua a criação antes de alterar esta cobrança.',409)
    const path='/payments/'+providerId(charge.payment_id)
    let payment=await call(cfg,'GET',path)
    canonicalPayment(payment,charge)
    if(body.action==='edit'){
     if(payment.deleted||!['PENDING','OVERDUE'].includes(payment.status))throw new HttpError('Somente cobranças abertas podem ser alteradas.',409)
     payment=await call(cfg,'PUT',path,update)
    }else{
     if(charge.status!=='CANCELED')throw new HttpError('Somente cobranças canceladas podem ser restauradas.',409)
     if(payment.deleted)payment=await call(cfg,'POST',path+'/restore')
    }
    return json({charge:await rpc('sync_apply',{...lease,...canonicalPayment(payment,charge)})},headers)
   }catch(cause){await rpc('sync_error',{...lease,error:cause instanceof Error?cause.message:'Confira a alteração no Asaas.'}).catch(()=>{});throw cause}
  }
  if(body.action==='cancel'){
   await rateLimit(db,actor,'billing-cancel',10,600)
   const cfg=await credentials(),scope={generation:cfg.generation,id:uuid(body.id)},claim=await rpc('sync_claim',scope),lease={...scope,lease_id:claim.lease_id},charge=claim.charge
   try{
    if(!charge.payment_id){if(charge.payment_started||!['DRAFT','FAILED'].includes(charge.status))throw new HttpError('Verifique a criação no Asaas antes de cancelar.',409)}
    else{const payment=await call(cfg,'GET','/payments/'+providerId(charge.payment_id));canonicalPayment(payment,charge);if(!['PENDING','OVERDUE'].includes(payment.status))throw new HttpError('Somente cobranças em aberto podem ser canceladas aqui. Pagamentos e estornos são tratados no Asaas.',409);const deleted=await call(cfg,'DELETE','/payments/'+providerId(charge.payment_id));if(deleted&&deleted.deleted!==true)throw new BillingError('O Asaas ainda não confirmou o cancelamento. Atualize a cobrança.',409)}
    return json({charge:await rpc('cancel_applied',lease)},headers)
   }catch(cause){await rpc('sync_error',{...lease,error:cause instanceof Error?cause.message:'Confira o cancelamento no Asaas.'}).catch(()=>{});throw cause}
  }
  throw new HttpError('Operação inválida.',400)
 }catch(cause){
  const known=cause instanceof HttpError||cause instanceof BillingError
  if(!known)console.error(JSON.stringify({source:'duuk-billing',type:cause instanceof Error?cause.name:'unknown'}))
  return json({error:known?cause.message:'Não foi possível concluir a operação de cobrança. Tente atualizar.'},headers,known?cause.status:500)
 }
})
