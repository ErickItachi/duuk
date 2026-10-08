import {checked,database,handler,HttpError,json,member,readJson,sha256,text} from '../_shared/http.ts'
import {authorizationUrl,calendarRedirect,calendarScope,ensureDuukCalendar,exchangeToken,googleRequest,GoogleError,syncGoogleEvent} from '../_shared/google-calendar.mjs'

const configuration=()=>({id:Deno.env.get('DUUK_GOOGLE_CLIENT_ID')||'',secret:Deno.env.get('DUUK_GOOGLE_CLIENT_SECRET')||''})
const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('')
const tokensOf=(token:any,previous:any={})=>({access_token:token.access_token,refresh_token:token.refresh_token||previous.refresh_token,expires_at:Date.now()+Number(token.expires_in||3600)*1000})
const authorizationFailure=(cause:any)=>cause instanceof GoogleError&&(cause.status===401||cause.code==='invalid_grant'||cause.status===403&&!['rateLimitExceeded','userRateLimitExceeded','dailyLimitExceeded'].includes(cause.code))
export async function dispatch(db:ReturnType<typeof database>,config:ReturnType<typeof configuration>) {
 const rpc=async(operation:string,payload:any={})=>checked(await db.rpc('duuk_calendar_backend',{operation,payload}))
 let processed=0,failed=0;const started=Date.now()
 for(let i=0;i<5&&Date.now()-started<40000;i++){
  const connection=await rpc('claim');if(!connection)break
  const scope={user_id:connection.user_id,generation:connection.generation,lease_id:connection.lease_id}
  try{
   let tokens=connection.tokens
   if(!tokens?.refresh_token)throw new GoogleError(401)
   if(!tokens.access_token||tokens.expires_at<Date.now()+60000){tokens=tokensOf(await exchangeToken({grant_type:'refresh_token',refresh_token:tokens.refresh_token},config),tokens);await rpc('tokens',{...scope,tokens})}
   const jobs=await rpc('jobs',scope)
   for(const job of jobs){
    if(Date.now()-started>40000)break
    // Re-check connection and permission immediately before each outbound write.
    await rpc('jobs',scope)
    let error:string|null=null
    try{
     const person=job.event?.responsible_id?checked(await db.from('duuk_profiles').select('name').eq('id',job.event.responsible_id).maybeSingle()):null
     await syncGoogleEvent({calendarId:connection.calendar_id,googleId:job.google_event_id,event:job.event,action:job.desired_action,token:tokens.access_token,responsible:person?.name||'',rotate:async()=>{const j=await rpc('rotate',{...scope,event_id:job.event_id,revision:job.revision});return j?.google_event_id}})
     processed++
    }catch(cause){if(authorizationFailure(cause))throw cause;error=cause instanceof GoogleError?cause.message:'Não foi possível sincronizar este compromisso. Tentaremos novamente.';failed++}
    await rpc('finish',{...scope,event_id:job.event_id,revision:job.revision,error})
   }
   await rpc('release',scope)
  }catch(cause){failed++;if(cause instanceof HttpError&&cause.status===409)continue
   const message=cause instanceof GoogleError?cause.message:'A conexão com o Google falhou. Tentaremos novamente.'
   if(authorizationFailure(cause))await rpc('error',{...scope,error:message}).catch(()=>{})
   else {const jobs=await rpc('jobs',scope).catch(()=>[]);for(const job of jobs)await rpc('finish',{...scope,event_id:job.event_id,revision:job.revision,error:message}).catch(()=>{});await rpc('release',scope).catch(()=>{})}
  }
 }
 return {processed,failed}
}
handler(async(req,headers)=>{
 const db=database(),body=await readJson(req,12000),config=configuration(),configured=!!config.id&&!!config.secret
 const rpc=async(operation:string,payload:any={})=>checked(await db.rpc('duuk_calendar_backend',{operation,payload}))
 const cron=req.headers.get('x-duuk-cron')
 if(body.action==='dispatch'){
  const secrets=checked(await db.rpc('duuk_backend_secrets'))
  if(!cron||cron!==secrets?.['duuk.push.cron'])throw new HttpError('Acesso restrito.',403)
  return json(configured?await dispatch(db,config):{configured:false,processed:0},headers)
 }
 const user=await member(req,db),scope={user_id:user.id}
 if(body.action==='status')return json({configured,...await rpc('status',scope)},headers)
 if(body.action==='disconnect'){
  const tokens=await rpc('disconnect',scope)
  if(tokens?.refresh_token)await fetch('https://oauth2.googleapis.com/revoke',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:tokens.refresh_token}),signal:AbortSignal.timeout(10000),redirect:'error'}).catch(()=>{})
  return json({disconnected:true},headers)
 }
 await member(req,db,'agenda')
 if(!configured)throw new HttpError('A integração aguarda a configuração do Google Cloud pela administração.',503)
 if(!checked(await db.rpc('duuk_action_limit',{actor:user.id,action_name:'calendar-connect',maximum:20,window_seconds:600})))throw new HttpError('Aguarde alguns minutos antes de tentar novamente.',429)
 if(body.action==='start'){
  const state=random(),verifier=random(),digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier)),challenge=btoa(String.fromCharCode(...new Uint8Array(digest))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','')
  await rpc('start',{...scope,state_hash:await sha256(state),verifier})
  return json({url:authorizationUrl(config.id,state,challenge)},headers)
 }
 if(body.action==='callback'){
  const state=text(body.state,'a conexão',128),code=text(body.code,'o código de autorização',4096,false)
  const pending=await rpc('consume',{...scope,state_hash:await sha256(state)})
  if(body.denied||!code)throw new HttpError('Conexão cancelada no Google. Sua agenda DUUK foi preservada.')
  try{
   const token=await exchangeToken({grant_type:'authorization_code',code,redirect_uri:calendarRedirect,code_verifier:pending.verifier},config)
   if(!String(token.scope||'').split(' ').includes(calendarScope)||!token.refresh_token)throw new HttpError('Permita o calendário DUUK e o acesso contínuo para concluir a conexão.')
   const identity=await googleRequest('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:`Bearer ${token.access_token}`}})
   if(!identity?.sub||!identity.email_verified||!identity.email)throw new HttpError('O Google não confirmou o e-mail da conta.')
   const calendarId=await ensureDuukCalendar(token.access_token,pending.google_subject===identity.sub?pending.calendar_id:null)
   await rpc('connect',{...scope,state_hash:await sha256(state),google_subject:identity.sub,account_email:identity.email,calendar_id:calendarId,tokens:tokensOf(token)})
   return json({connected:true},headers)
  }catch(cause){if(cause instanceof HttpError)throw cause;throw new HttpError(cause instanceof GoogleError?cause.message:'Não foi possível concluir a conexão com o Google. Tente novamente.',400)}
 }
 if(body.action==='retry'){await rpc('retry',scope);return json({queued:true},headers)}
 throw new HttpError('Ação inválida.')
})
