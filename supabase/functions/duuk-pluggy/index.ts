import { checked,database,handler,HttpError,json,member,readJson,text,uuid } from '../_shared/http.ts'
import { bankAccount,createPluggyClient,PluggyError,readOverview,readStatement,saoPauloDate,validateProxy } from '../_shared/duuk-pluggy.mjs'
// Use awaited results: secrets are returned only to this server-only RPC caller.
async function backend(db:ReturnType<typeof database>,operation:string,payload:Record<string,unknown>){return checked(await db.rpc('duuk_pluggy_backend',{operation,payload}))}
handler(async(req,headers)=>{
 const db=database(),user=await member(req,db,'finance'),body=await readJson(req,5000),scope={user_id:user.id}
 if(body.action==='status')return json(await backend(db,'status',scope),headers)
 const manage=['probe','configure','disconnect'].includes(body.action)
 if(manage){const profile=checked(await db.from('duuk_profiles').select('active,is_super_admin').eq('id',user.id).single());if(!profile?.active||!profile.is_super_admin)throw new HttpError('A conexão bancária é restrita à super administração.',403)}
 if(!['probe','configure','disconnect','statement','overview'].includes(body.action))throw new HttpError('Operação não permitida.')
 if(!checked(await db.rpc('duuk_action_limit',{actor:user.id,action_name:manage?'pluggy-configure':'pluggy-read',maximum:manage?8:30,window_seconds:60})))throw new HttpError('Aguarde antes de consultar o banco novamente.',429)
 if(body.action==='disconnect')return json(await backend(db,'disconnect',{...scope,expected_version:body.expected_version}),headers)
 const stored=await backend(db,'configuration',scope)
 try{
  const credentials=manage?{clientId:body.client_id?text(body.client_id,'o Client ID',200):stored.credentials?.clientId,clientSecret:body.client_secret?text(body.client_secret,'o Client Secret',300):stored.credentials?.clientSecret}:stored.credentials
  if(!credentials?.clientId||!credentials?.clientSecret)throw new HttpError('A administração precisa conectar o Meu Pluggy.',409)
  const get=await createPluggyClient(credentials,{signal:AbortSignal.timeout(45000)})
  if(body.action==='statement'||body.action==='overview'){
   if(!stored.item_id||!stored.account_id)throw new HttpError('Nenhuma conta bancária conectada.',409)
   if(body.connection_version!=null&&body.connection_version!==stored.version)throw new HttpError('A conexão mudou. Atualize os extratos.',409)
   const statement=body.action==='overview'?await readOverview(get,{itemId:stored.item_id,accountId:stored.account_id,today:saoPauloDate(Date.now()),months:6,extras:body.extras===true}):await readStatement(get,{itemId:stored.item_id,accountId:stored.account_id,month:body.month})
   const current=await backend(db,'status',scope)
   if(!current.configured||current.version!==stored.version)throw new HttpError('A conexão mudou durante a consulta. Atualize os extratos.',409)
   return json(statement,headers)
  }
  const itemId=uuid(body.item_id),item=validateProxy(await get('/items/'+itemId)),accounts=await get('/accounts?'+new URLSearchParams({itemId,type:'BANK'}))
  if(!Array.isArray(accounts.results))throw new HttpError('O Meu Pluggy não retornou as contas.',502)
  const candidates=accounts.results.filter((a:any)=>a.type==='BANK'&&a.currencyCode==='BRL').map(bankAccount)
  if(body.action==='probe')return json({accounts:candidates.map((account:any)=>({id:account.id,label:account.label,last_four:account.last_four})),provider_status:item.status},headers)
  const account=candidates.find((a:any)=>a.id===body.account_id)
  if(!account)throw new HttpError('Escolha uma conta bancária desta conexão.')
  await backend(db,'configure',{...scope,credentials,item_id:itemId,account_id:account.id,account_label:account.label,account_last_four:account.last_four,connector_id:200,own_data_confirmed:body.own_data_confirmed===true,expected_version:body.expected_version})
  return json({saved:true},headers)
 }catch(cause){if(cause instanceof PluggyError)throw new HttpError(cause.message,cause.status);if(cause instanceof HttpError)throw cause;throw new HttpError('Não foi possível consultar o Meu Pluggy. Confira a conexão e tente novamente.',502)}
})
