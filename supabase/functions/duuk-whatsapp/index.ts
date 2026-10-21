import { checked, cors, database, HttpError, json, member, rateLimit, readBody, readJson, text } from '../_shared/http.ts'
import { boundedBytes, graphCall, graphId, hashBytes, MAX_FILE, mediaUrl, messageId, normalizeWebhook, providerMessage, replyInput, requestId, validateMedia, waId, webhookSignature, WhatsAppError } from '../_shared/whatsapp-cloud.mjs'

const callbackBase='https://ilohuxhyfqikjlvoarts.supabase.co/functions/v1/duuk-whatsapp'
const id=(v:unknown)=>requestId(v)
const base64=(bytes:Uint8Array)=>{let out='';for(let p=0;p<bytes.length;p+=8192)out+=String.fromCharCode(...bytes.slice(p,p+8192));return btoa(out)}
const constant=(a:string,b:string)=>{let diff=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return diff===0}
Deno.serve(async req=>{
 let headers:Record<string,string>={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}
 try{
  const url=new URL(req.url),hook=url.searchParams.get('hook')==='1'
  if(!hook){headers=cors(req);if(req.method==='OPTIONS')return new Response(null,{status:204,headers})}
  if(hook?!['GET','POST'].includes(req.method):req.method!=='POST')throw new HttpError('Método não permitido.',405)
  if(hook&&req.method==='POST'&&!/^sha256=[a-f0-9]{64}$/.test(req.headers.get('x-hub-signature-256')||''))throw new HttpError('Webhook não autorizado.',401)
  const db=database();let actor:string|null=null
  const rpc=async(operation:string,payload:Record<string,unknown>={})=>checked(await db.rpc('duuk_whatsapp_backend',{actor,operation,payload})) as any
  if(hook){
   const connection_id=id(url.searchParams.get('connection')),cfg=await rpc('hook_credentials',{connection_id}),scope={connection_id,generation:cfg.generation}
   if(req.method==='GET'){
    const token=url.searchParams.get('hub.verify_token')||'',challenge=url.searchParams.get('hub.challenge')||''
    if(url.searchParams.get('hub.mode')!=='subscribe'||token.length>255||!/^\d{1,100}$/.test(challenge)||!constant(await hashBytes(token),cfg.verify_hash||''))throw new HttpError('Webhook não autorizado.',401)
    await rpc('hook_verified',scope);return new Response(challenge,{headers:{...headers,'Content-Type':'text/plain'}})
   }
   const raw=await readBody(req,8*1024*1024)
   if(!await webhookSignature(raw,cfg.credentials.app_secret,req.headers.get('x-hub-signature-256')))throw new HttpError('Webhook não autorizado.',401)
   let body;try{body=JSON.parse(new TextDecoder().decode(raw))}catch{throw new HttpError('Evento inválido.')}
   await rpc('ingest',{...scope,...normalizeWebhook(body,cfg)});return json({received:true},headers)
  }
  actor=(await member(req,db,'whatsapp')).id
  let body:any,file:File|null=null
  if(req.headers.get('content-type')?.startsWith('multipart/form-data')){
   const bytes=await readBody(req,MAX_FILE+40000),form=await new Request(req.url,{method:'POST',headers:{'Content-Type':req.headers.get('content-type')!},body:bytes}).formData(),payload=form.get('payload')
   if(typeof payload!=='string'||payload.length>20000)throw new HttpError('Requisição inválida.')
   try{body=JSON.parse(payload)}catch{throw new HttpError('Requisição inválida.')}
   const item=form.get('file');file=item instanceof File?item:null
  }else body=await readJson(req,20000)
  if(!body||typeof body!=='object'||Array.isArray(body))throw new HttpError('Requisição inválida.')
  const admin=async()=>{const p=checked(await db.from('duuk_profiles').select('is_super_admin').eq('id',actor!).single());if(!p?.is_super_admin)throw new HttpError('Somente um super administrador configura o WhatsApp.',403)}
  const credentials=()=>rpc('credentials')
  const configureWebhook=async(cfg:any)=>{
   const currentPhone=await graphCall(cfg.credentials.access_token,'GET',cfg.phone_id,undefined,{fields:'is_on_biz_app,platform_type'})
   if(currentPhone?.is_on_biz_app!==true||currentPhone?.platform_type!=='CLOUD_API')throw new HttpError('A coexistência não está ativa neste número. Confira o WhatsApp Business antes de reconectar.',409)
   const callback=callbackBase+'?hook=1&connection='+cfg.id,appToken=cfg.app_id+'|'+cfg.credentials.app_secret
   const existing=await graphCall(appToken,'GET',graphId(cfg.app_id)+'/subscriptions'),current=(existing?.data||[]).find((x:any)=>x.object==='whatsapp_business_account')
   if(current?.callback_url&&current.callback_url!==callback)throw new HttpError('Este aplicativo já usa outro webhook do WhatsApp. Use um aplicativo dedicado à DUUK para preservar a integração existente.',409)
   const form=new FormData();form.set('object','whatsapp_business_account');form.set('fields','messages,history,smb_message_echoes,smb_app_state_sync,account_update');form.set('callback_url',callback);form.set('verify_token',cfg.credentials.verify_token)
   const subscribed=await graphCall(appToken,'POST',cfg.app_id+'/subscriptions',form)
   if(subscribed?.success!==true)throw new HttpError('A Meta não confirmou o webhook.',502)
   const linked=await graphCall(cfg.credentials.access_token,'POST',cfg.waba_id+'/subscribed_apps',{})
   if(linked?.success!==true)throw new HttpError('A Meta não confirmou a assinatura do número.',502)
   await rpc('ready',{generation:cfg.generation})
  }
  if(['status','directory'].includes(body.action))return json(await rpc(body.action),headers)
  if(body.action==='expected_phone'){
   await admin();await rpc('expected_phone',{phone:waId(body.phone)});return json(await rpc('status'),headers)
  }
  if(body.action==='configure'){
   await admin();await rateLimit(db,actor,'whatsapp-configure',5,600)
   if(body.coexistence_confirmed!==true)throw new HttpError('Conclua a conexão oficial que preserva o WhatsApp Business no celular antes de configurar o painel.')
   const app_id=graphId(body.app_id),waba_id=graphId(body.waba_id),phone_id=graphId(body.phone_id),app_secret=text(body.app_secret,'o segredo do aplicativo',255),access_token=text(body.access_token,'o token da Meta',4096)
   if(!/^[a-f0-9]{32}$/i.test(app_secret)||access_token.length<30||/\s/.test(access_token))throw new HttpError('Confira as credenciais da Meta no formulário seguro.')
   const debug=await graphCall(app_id+'|'+app_secret,'GET','debug_token',undefined,{input_token:access_token}),info=debug?.data
   if(!info?.is_valid||String(info.app_id)!==app_id||!['whatsapp_business_management','whatsapp_business_messaging'].every(scope=>info.scopes?.includes(scope)))throw new HttpError('O token precisa pertencer a este aplicativo e ter as duas permissões oficiais do WhatsApp.')
   const expires=[info.expires_at,info.data_access_expires_at].map(Number).filter(n=>n>0),expiry=expires.length?Math.min(...expires):null
   if(expiry&&expiry*1000<Date.now()+300000)throw new HttpError('O token está expirando. Gere uma autorização válida na Meta.')
   const phone=await graphCall(access_token,'GET',phone_id,undefined,{fields:'id,display_phone_number,verified_name,is_on_biz_app,platform_type'}),numbers=await graphCall(access_token,'GET',waba_id+'/phone_numbers',undefined,{fields:'id',limit:100})
   if(phone?.is_on_biz_app!==true||phone?.platform_type!=='CLOUD_API')throw new HttpError('A Meta ainda não confirmou a coexistência deste número. Preserve o aplicativo do celular e conclua a conexão oficial primeiro.',409)
   if(String(phone?.id)!==phone_id||!numbers?.data?.some((x:any)=>String(x.id)===phone_id))throw new HttpError('O número não pertence à conta WhatsApp informada.')
   const status=await rpc('status'),canonical=waId(String(phone.display_phone_number||'').replace(/[^+\d]/g,''))
   if(!status.expected_phone||canonical!==status.expected_phone)throw new HttpError('O número da Meta precisa ser o mesmo número comercial salvo na DUUK.')
   const verify_token=Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('')
   await rpc('configure',{app_id,waba_id,phone_id,display_phone:phone.display_phone_number,verified_name:phone.verified_name,token_expires_at:expiry?new Date(expiry*1000).toISOString():null,credentials:{app_secret,access_token,verify_token},verify_hash:await hashBytes(verify_token)})
   await configureWebhook(await credentials());return json(await rpc('status'),headers)
  }
  if(['repair','disconnect'].includes(body.action)){
   await admin()
   const cfg=await credentials().catch(()=>null)
   if(body.action==='disconnect'){
    let unsubscribed=false
    if(cfg)try{unsubscribed=(await graphCall(cfg.credentials.access_token,'DELETE',cfg.waba_id+'/subscribed_apps'))?.success===true}catch{/* Local access is always removed. */}
    await rpc('disconnect');return json({...await rpc('status'),unsubscribed},headers)
   }
   if(!cfg)throw new HttpError('Conecte o aplicativo da Meta primeiro.',409)
   await configureWebhook(cfg);return json(await rpc('status'),headers)
  }
  if(['sync_start','sync_retry'].includes(body.action)){
   await admin();await rateLimit(db,actor,'whatsapp-sync',3,600)
   if(body.action==='sync_retry'){await rpc('sync_retry');return json(await rpc('status'),headers)}
   if(body.consent!==true||!Number.isFinite(Date.parse(body.onboarded_at)))throw new HttpError('Confirme a sincronização e informe quando a coexistência foi concluída.')
   const onboarded_at=new Date(body.onboarded_at).toISOString(),cfg=await credentials()
   // Each Meta sync operation can run only once. Claim it durably before the POST, never retry it.
   for(const kind of ['contacts','history']){
    const claim=await rpc('sync_claim',{kind,onboarded_at})
    if(!claim.execute)continue
    try{
     const ack=await graphCall(cfg.credentials.access_token,'POST',cfg.phone_id+'/smb_app_data',{messaging_product:'whatsapp',sync_type:kind==='contacts'?'smb_app_state_sync':'history'})
     if(typeof ack?.request_id!=='string'||!ack.request_id||ack.request_id.length>255)throw new WhatsAppError('A Meta não confirmou a solicitação de sincronização. Confira antes de repetir.',502,true)
     await rpc('sync_ack',{kind,generation:claim.generation,request_id:ack.request_id})
    }catch(cause){
     const uncertain=!(cause instanceof WhatsAppError)||cause.uncertain
     await rpc('sync_ack',{kind,generation:claim.generation,uncertain,error:uncertain?'A solicitação pode ter sido aceita. Aguarde os eventos; não repita o pedido na Meta.':cause instanceof Error?cause.message:'A sincronização não foi aceita.'}).catch(()=>{})
    }
   }
   return json(await rpc('status'),headers)
  }
  if(['contacts','threads'].includes(body.action)){
   const offset=Number(body.offset||0);if(!Number.isInteger(offset)||offset<0||offset>10000)throw new HttpError('Página inválida.')
   if(body.action==='threads'&&!['open','resolved','all','mine','unassigned'].includes(body.filter||'open'))throw new HttpError('Filtro inválido.')
   return json(await rpc(body.action,{search:text(body.search,'a busca',160,false),offset,filter:body.filter||'open'}),headers)
  }
  if(body.action==='contact_save'){
   const email=text(body.email,'o e-mail',254,false),tags=Array.isArray(body.tags)?body.tags:[]
   if(email&&!/^\S+@\S+\.\S+$/.test(email)||tags.length>10||tags.some((t:any)=>typeof t!=='string'||t.length>30||!t.trim()))throw new HttpError('Confira o e-mail e as etiquetas do contato.')
   return json(await rpc('contact_save',{...(body.id?{id:id(body.id),version:body.version}:{}),name:text(body.name,'o nome',160),wa_id:waId(String(body.wa_id||'').replace(/[\s()-]/g,'')),email,company:text(body.company,'a empresa',160,false),notes:text(body.notes,'as observações',4000,false),tags:[...new Set(tags.map((s:string)=>s.trim()))]}),headers)
  }
  if(['photo','photo_save'].includes(body.action)){
   const input={id:id(body.id),version:body.version}
   if(body.action==='photo_save')await rateLimit(db,actor,'whatsapp-photo',10)
   if(body.action==='photo')return json(await rpc('photo',input),headers)
   if(body.remove===true)return json(await rpc('photo_save',{...input,base64:null,mime:null}),headers)
   if(!file)throw new HttpError('Escolha uma foto.')
   const bytes=new Uint8Array(await file.arrayBuffer()),spec=validateMedia(bytes,file.type,file.name,{type:'image',avatar:true})
   return json(await rpc('photo_save',{...input,base64:base64(bytes),mime:spec.mime}),headers)
  }
  if(body.action==='open_thread')return json(await rpc('open_thread',{contact_id:id(body.contact_id)}),headers)
  if(['thread','messages','analytics','seen','thread_update'].includes(body.action)){
   const input:any={thread_id:id(body.thread_id)}
   if(body.action==='messages'){input.starred=body.starred===true;if(body.before){if(!Number.isFinite(Date.parse(body.before)))throw new HttpError('Página inválida.');input.before=new Date(body.before).toISOString();input.before_id=id(body.before_id);if(!Number.isSafeInteger(Number(body.before_sequence))||Number(body.before_sequence)<1)throw new HttpError('Página inválida.');input.before_sequence=Number(body.before_sequence)}}
   if(body.action==='seen'){if(!Number.isFinite(Date.parse(body.seen_at)))throw new HttpError('Data inválida.');input.seen_at=new Date(body.seen_at).toISOString()}
   if(body.action==='thread_update'){input.version=body.version;if('assigned_to' in body)input.assigned_to=body.assigned_to?id(body.assigned_to):null;if(body.status)input.status=body.status}
   return json(await rpc(body.action,input),headers)
  }
  if(['star','get_message'].includes(body.action))return json(await rpc(body.action,{id:id(body.id),starred:body.starred===true}),headers)
  if(['read','typing'].includes(body.action)){
   await rateLimit(db,actor,'whatsapp-receipt',20)
   const input={id:id(body.id),kind:body.action},claim=await rpc('receipt_claim',input)
   if(!claim.execute)return json({success:true,skipped:true},headers)
   const cfg=await credentials(),result=await graphCall(cfg.credentials.access_token,'POST',cfg.phone_id+'/messages',{messaging_product:'whatsapp',status:'read',message_id:messageId(claim.provider_id),...(body.action==='typing'?{typing_indicator:{type:'text'}}:{})})
   if(result?.success!==true)throw new HttpError('O WhatsApp não confirmou a leitura.',502)
   await rpc('receipt_ack',input);return json({success:true},headers)
  }
  if(body.action==='media'){
   await rateLimit(db,actor,'whatsapp-media',30)
   const m=await rpc('message_media',{id:id(body.id)}),cfg=await credentials(),meta=await graphCall(cfg.credentials.access_token,'GET',graphId(m.media_id))
   if(String(meta?.id)!==m.media_id||Number(meta?.file_size)>MAX_FILE)throw new HttpError('A mídia não está disponível ou supera 10 MB.',413)
   const assetUrl=mediaUrl(meta.url)
   let response;try{response=await fetch(assetUrl,{headers:{Authorization:'Bearer '+cfg.credentials.access_token},redirect:'error',signal:AbortSignal.timeout(20000)})}catch{throw new HttpError('Não foi possível obter esta mídia. Tente novamente.',503)}
   if(!response.ok)throw new HttpError('Esta mídia expirou ou não está mais disponível na Meta.',410)
   const bytes=await boundedBytes(response.body,MAX_FILE),spec=validateMedia(bytes,meta.mime_type||m.mime,m.filename||'arquivo',{type:m.type}),digest=await hashBytes(bytes)
   const expected=meta.sha256||m.sha256
   if(expected){const hex=/^[a-f0-9]{64}$/i.test(expected)?expected.toLowerCase():Array.from(Uint8Array.from(atob(expected),(v:string)=>v.charCodeAt(0)),v=>v.toString(16).padStart(2,'0')).join('');if(!constant(digest,hex))throw new HttpError('A integridade desta mídia não pôde ser confirmada.',502)}
   return json({base64:base64(bytes),mime:spec.mime,filename:spec.filename},headers)
  }
  if(body.action==='send'){
   await rateLimit(db,actor,'whatsapp-send',20)
   const input=replyInput(body);let bytes:Uint8Array|null=null,spec:any=null
   if(!['text','reaction','contacts','location','interactive'].includes(input.type)){
    if(!file)throw new HttpError('Escolha o arquivo antes de enviar.')
    bytes=new Uint8Array(await file.arrayBuffer());spec=validateMedia(bytes,file.type,file.name,{type:input.type})
   }else if(file)throw new HttpError('Este envio não utiliza anexo.')
   const {id:nonce,...content}=input,hash=bytes?await hashBytes(bytes):null,request_hash=await hashBytes(JSON.stringify({...content,sha256:hash,filename:spec?.filename||null}))
   const start=await rpc('send_begin',{...input,request_hash,sha256:hash,mime:spec?.mime||null,filename:spec?.filename||null,byte_size:spec?.size||null})
   if(!start.execute)return json(start.message,headers)
   const scope={id:nonce,lease_id:start.internal.lease_id};let dispatched=false
   try{
    const cfg=await credentials()
    if(bytes&&spec){
     const form=new FormData();form.set('messaging_product','whatsapp');form.set('type',spec.mime);form.set('file',new Blob([new Uint8Array(bytes)],{type:spec.mime}),spec.filename)
     const uploaded=await graphCall(cfg.credentials.access_token,'POST',cfg.phone_id+'/media',form)
     await rpc('send_uploaded',{...scope,media_id:graphId(uploaded?.id)})
    }
    const m=await rpc('send_dispatch',scope);dispatched=true
    const ack=await graphCall(cfg.credentials.access_token,'POST',cfg.phone_id+'/messages',providerMessage(m,start.to));let provider_id
    try{provider_id=messageId(ack?.messages?.[0]?.id)}catch{throw new WhatsAppError('O WhatsApp retornou uma confirmação incompleta. Confira a tentativa.',502,true)}
    if(ack?.contacts?.[0]?.wa_id&&ack.contacts[0].wa_id!==start.to)throw new WhatsAppError('O WhatsApp não confirmou o destinatário esperado. Confira a tentativa.',502,true)
    await rpc('send_ack',{...scope,provider_id})
   }catch(cause){
    // An unknown result after dispatch must never cause an automatic duplicate message.
    const uncertain=dispatched&&(!(cause instanceof WhatsAppError)||cause.uncertain)
    await rpc('send_error',{...scope,uncertain,error:uncertain?'O resultado não foi confirmado. Use Conferir; não reenvie esta mensagem.':cause instanceof Error?cause.message:'Não foi possível enviar.'}).catch(()=>{})
   }
   return json(await rpc('get_message',{id:nonce}),headers)
  }
  throw new HttpError('Operação não permitida.',400)
 }catch(cause){
  const known=cause instanceof HttpError||cause instanceof WhatsAppError,status=known?cause.status:500
  if(!known)console.error(JSON.stringify({source:'whatsapp',type:cause instanceof Error?cause.name:'unknown'}))
  return json({error:known?cause.message:'Não foi possível concluir a operação.'},headers,status)
 }
})
