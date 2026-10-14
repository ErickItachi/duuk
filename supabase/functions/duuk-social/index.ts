import { checked,cors,database,HttpError,json,member,readBody,readJson,sha256,text,uuid } from '../_shared/http.ts'
import { graphVersion,InstagramError,parseSignedRequest,readProfile,createInstagramClient,socialRedirect,socialScopes } from '../_shared/instagram.mjs'
import { dailyMaintenance,dispatchDue,finishConnection,publishClaimed,readInsights,readOverview,startConnection } from '../_shared/social-worker.mjs'

// Instagram API with Instagram Login only. Tokens and the App Secret stay in Vault and in this function;
// responses to the browser never carry them.
type Db=ReturnType<typeof database>
const base=`${Deno.env.get('SUPABASE_URL')}/functions/v1/duuk-social`
async function backend(db:Db,operation:string,payload:Record<string,unknown>={}){return checked(await db.rpc('duuk_social_backend',{operation,payload}))}
async function limit(db:Db,actor:string,name:string,maximum:number){if(!checked(await db.rpc('duuk_action_limit',{actor,action_name:name,maximum,window_seconds:60})))throw new HttpError('Aguarde um pouco antes de repetir esta ação.',429)}
// Instagram downloads the file from this short-lived link while it builds the container.
async function mediaUrl(db:Db,path:string){const signed=checked(await db.storage.from('duuk-social').createSignedUrl(path,3600));if(!signed?.signedUrl)throw new HttpError('Arquivo indisponível.',500);return signed.signedUrl}
const instagramFailure=(cause:unknown)=>{if(cause instanceof InstagramError)return new HttpError(cause.message,cause.status);if(cause instanceof HttpError)return cause;return new HttpError('Não foi possível falar com o Instagram. Tente novamente.',502)}
const plain=(body:string,status=200)=>new Response(body,{status,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}})
function background(work:Promise<unknown>){const runtime=(globalThis as any).EdgeRuntime;if(runtime?.waitUntil)runtime.waitUntil(work.catch(()=>null));else work.catch(()=>null)}

async function cronAllowed(db:Db,req:Request){const secrets=checked(await db.rpc('duuk_backend_secrets')),cron=req.headers.get('x-duuk-cron');return !!cron&&cron===secrets?.['duuk.push.cron']}

// Meta calls these two URLs with a form field `signed_request`, signed with the App Secret.
async function metaCallback(db:Db,req:Request,kind:'deauthorize'|'data_deletion'){
 const form=new URLSearchParams(new TextDecoder().decode(await readBody(req,8000)))
 const settings=await backend(db,'settings')
 if(!settings.configured)throw new HttpError('App não configurado.',404)
 let signed
 try{signed=await parseSignedRequest(form.get('signed_request'),settings.app_secret)}catch(cause){throw instagramFailure(cause)}
 if(kind==='deauthorize'){await backend(db,kind,{ig_user_id:signed.userId});return json({done:true},{'Cache-Control':'no-store'})}
 const code=Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('')
 await backend(db,kind,{ig_user_id:signed.userId,code})
 return json({url:`${base}/deletion?code=${code}`,confirmation_code:code},{'Cache-Control':'no-store'})
}

Deno.serve(async req=>{
 const path=new URL(req.url).pathname
 let headers:Record<string,string>={'Cache-Control':'no-store'}
 try{
  const db=database()
  if(req.method==='GET'&&path.endsWith('/deletion')){
   const code=new URL(req.url).searchParams.get('code')||''
   if(!/^[a-f0-9]{32}$/.test(code))return plain('Código de confirmação inválido.',400)
   const status=await backend(db,'deletion_status',{code})
   if(!status)return plain('Solicitação não encontrada.',404)
   return plain(`DUUK Admin · exclusão de dados do Instagram\nCódigo: ${code}\nSituação: ${status.completed_at?'concluída':'em andamento'}\nRecebida em: ${new Date(status.requested_at).toISOString()}`)
  }
  if(req.method==='POST'&&path.endsWith('/deauthorize'))return await metaCallback(db,req,'deauthorize')
  if(req.method==='POST'&&path.endsWith('/data-deletion'))return await metaCallback(db,req,'data_deletion')

  headers=cors(req)
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers})
  if(req.method!=='POST')throw new HttpError('Método não permitido.',405)
  const body=await readJson(req,20000)

  if(['dispatch','daily'].includes(body.action)&&req.headers.has('x-duuk-cron')){
   if(!await cronAllowed(db,req))throw new HttpError('Acesso restrito.',403)
   const fetcher=globalThis.fetch.bind(globalThis)
   // Answer pg_net at once; the work continues in the background within the function's time limit.
   background(body.action==='dispatch'
    ?dispatchDue({backend:(op:string,p:Record<string,unknown>)=>backend(db,op,p),fetch:fetcher,mediaUrl:(p:string)=>mediaUrl(db,p)}).then(r=>console.log(JSON.stringify({source:'social',action:'dispatch',...r})))
    :dailyMaintenance({backend:(op:string,p:Record<string,unknown>)=>backend(db,op,p),fetch:fetcher}).then(r=>console.log(JSON.stringify({source:'social',action:'daily',...r}))))
   return json({accepted:true},headers,202)
  }

  const user=await member(req,db,'social'),scope={user_id:user.id},call=(op:string,p:Record<string,unknown>={})=>backend(db,op,{...p,...scope})
  const fetcher=globalThis.fetch.bind(globalThis)
  try{
   switch(body.action){
    case 'status':{
     const status=await call('status')
     return json({...status,redirect_uri:socialRedirect,scopes:socialScopes,graph_version:graphVersion,deauthorize_url:`${base}/deauthorize`,data_deletion_url:`${base}/data-deletion`},headers)
    }
    case 'configure_app':{
     await limit(db,user.id,'social-manage',8)
     return json(await call('configure',{app_id:text(body.app_id,'o ID do app',30),app_secret:text(body.app_secret,'a chave secreta',128,false)||null,app_mode:body.app_mode,access_level:body.access_level,expected_version:body.expected_version}),headers)
    }
    case 'remove_app':{
     await limit(db,user.id,'social-manage',8)
     return json(await call('unconfigure',{expected_version:body.expected_version}),headers)
    }
    case 'connect_start':{
     await limit(db,user.id,'social-manage',8)
     return json(await startConnection({backend:(op:string,p:Record<string,unknown>)=>backend(db,op,p),userId:user.id,ownerKind:body.owner_kind,clientId:body.owner_kind==='client'?uuid(body.client_id):null,hash:sha256}),headers)
    }
    case 'connect_finish':{
     await limit(db,user.id,'social-manage',8)
     const account=await finishConnection({backend:(op:string,p:Record<string,unknown>)=>backend(db,op,p),fetch:fetcher,userId:user.id,code:text(body.code,'o código do Instagram',2000),state:text(body.state,'o pedido de conexão',200),hash:sha256})
     return json({account},headers)
    }
    case 'disconnect':{
     await limit(db,user.id,'social-manage',8)
     return json(await call('disconnect',{account_id:uuid(body.account_id),expected_version:body.expected_version}),headers)
    }
    case 'refresh_account':{
     await limit(db,user.id,'social-read',20)
     const accountId=uuid(body.account_id),stored=await backend(db,'token',{account_id:accountId})
     if(stored.status!=='active'||!stored.token)throw new HttpError(`A conta @${stored.username} precisa ser reconectada.`,409)
     try{return json({account:await backend(db,'account_update',{account_id:accountId,...await readProfile(createInstagramClient({token:stored.token,fetch:fetcher}))})},headers)}
     catch(cause){if(cause instanceof InstagramError&&cause.kind==='auth')await backend(db,'account_problem',{account_id:accountId,status:'expired',message:cause.message}).catch(()=>null);throw cause}
    }
    case 'overview':{
     await limit(db,user.id,'social-read',30)
     return json(await readOverview({backend:(op:string,p:Record<string,unknown>)=>backend(db,op,p),fetch:fetcher,accountId:uuid(body.account_id),force:body.force===true}),headers)
    }
    case 'insights':{
     await limit(db,user.id,'social-read',30)
     return json(await readInsights({backend:(op:string,p:Record<string,unknown>)=>backend(db,op,p),fetch:fetcher,accountId:uuid(body.account_id),days:Number(body.days),force:body.force===true}),headers)
    }
    case 'publish_now':{
     // Explicit request from a member: the database checks version, status, account and permission first.
     await limit(db,user.id,'social-publish',6)
     const post=await call('claim_now',{post_id:uuid(body.post_id),expected_version:body.expected_version})
     const result=await publishClaimed({post,backend:(op:string,p:Record<string,unknown>)=>backend(db,op,p),fetch:fetcher,mediaUrl:(p:string)=>mediaUrl(db,p),notify:false})
     return json(result,headers)
    }
    default:throw new HttpError('Operação não permitida.')
   }
  }catch(cause){throw instagramFailure(cause)}
 }catch(error){
  if(!(error instanceof HttpError)||error.status>=500)console.error(JSON.stringify({source:'social',type:error instanceof Error?error.name:'unknown',status:error instanceof HttpError?error.status:500}))
  return json({error:error instanceof HttpError?error.message:'Não foi possível concluir. Tente novamente.'},headers,error instanceof HttpError?error.status:500)
 }
})
