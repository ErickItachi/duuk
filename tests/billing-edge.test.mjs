// Executes the actual Edge handler and auth guard with isolated database/provider adapters.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
const dataModule=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64')
let serve,allowed=true,superAdmin=true,validSession=true,postCount=0,failPost=false,status='PENDING',deleted=false,metadata={},createdInput,configured
const id='00000000-0000-4000-8000-000000000022',actor='00000000-0000-4000-8000-000000000001',generation='00000000-0000-4000-8000-000000000003',config_id='00000000-0000-4000-8000-000000000004',lease_id='00000000-0000-4000-8000-000000000005',operations=[]
const credentials={api_key:'fixture-private-key-1234567890',webhook_token:'a'.repeat(64),config_id,generation,account_id:'account_fixture',contact_email:'technical@test.invalid',account_status:'APPROVED'}
let charge={id,environment:'sandbox',customer_id:'cus_fixture',payment_id:'pay_fixture',amount_cents:5000,status:'PENDING'}
const db={auth:{getUser:async()=>({data:{user:{id:actor}}})},from:()=>({select:()=>({eq:()=>({single:async()=>({data:{is_super_admin:superAdmin}})})})}),rpc:async(name,args)=>{
 if(name==='duuk_authorize_session')return {data:validSession}
 if(name==='duuk_check_permission')return {data:allowed&&args.requested==='billing'}
 if(name==='duuk_action_limit')return {data:true}
 if(name==='duuk_backend_secrets')return {data:{'duuk.push.cron':'fixture-cron-secret-123456789'}}
 assert.equal(name,'duuk_billing_backend');operations.push(args);const p=args.payload
 if(args.operation==='credentials')return {data:credentials}
 if(args.operation==='status')return {data:{configured:!!configured,connected:!!configured}}
 if(args.operation==='configure'){configured=p;return {data:{}}}
 if(args.operation==='config_ready')return {data:{}}
 if(args.operation==='begin_create'){createdInput=p;charge={...p,environment:'sandbox',customer_id:null,payment_id:null,status:'CREATING'};return {data:{execute:true,internal:charge}}}
 if(args.operation==='customer_saved'){charge.customer_id=p.customer_id;return {data:{}}}
 if(args.operation==='payment_start'){charge.payment_started=true;return {data:{}}}
 if(args.operation==='created'||args.operation==='sync_apply'){charge={...charge,...p};return {data:charge}}
 if(args.operation==='creation_error'){charge.status=p.uncertain?'UNCERTAIN':'FAILED';return {data:{}}}
 if(args.operation==='get')return {data:charge}
 if(args.operation==='sync_claim')return {data:{lease_id,charge}}
 if(args.operation==='cancel_applied'){charge.status='CANCELED';return {data:charge}}
 if(args.operation==='hook_check')return {data:{hash:await (async()=>Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('a'.repeat(64)))).toString('hex'))()}}
 if(args.operation==='jobs')return {data:[]}
 return {data:{}}
}}
globalThis.__billingDb=db
globalThis.Deno={env:{get:()=>''},serve:handler=>{serve=handler}}
const sdk=dataModule('export const createClient=()=>globalThis.__billingDb')
const sharedRoot=new URL('../supabase/functions/_shared/',import.meta.url)
let http=await readFile(new URL('http.ts',sharedRoot),'utf8');http=http.replace("'npm:@supabase/supabase-js@2.117.2'",JSON.stringify(sdk)).replace("'./session-claims.mjs'",JSON.stringify(new URL('session-claims.mjs',sharedRoot).href))
const httpModule=dataModule(stripTypeScriptTypes(http,{mode:'transform'}))
let source=await readFile(new URL('../supabase/functions/duuk-billing/index.ts',import.meta.url),'utf8');source=source.replace("'../_shared/http.ts'",JSON.stringify(httpModule)).replace("'../_shared/billing.mjs'",JSON.stringify(new URL('billing.mjs',sharedRoot).href)).replace("'../_shared/billing-resources.mjs'",JSON.stringify(new URL('billing-resources.mjs',sharedRoot).href)).replace("'../_shared/billing-queries.mjs'",JSON.stringify(new URL('billing-queries.mjs',sharedRoot).href))
await import(dataModule(stripTypeScriptTypes(source)))
const token=aal=>'header.'+Buffer.from(JSON.stringify({aal,session_id:lease_id})).toString('base64url')+'.verified-by-auth-adapter'
const request=(body,{aal='aal2',origin='https://www.duukfilms.com',headers={},query=''}={})=>serve(new Request('https://fixture.invalid/'+query,{method:'POST',headers:{'content-type':'application/json',origin,authorization:'Bearer '+token(aal),...headers},body:JSON.stringify(body)}))
const originalFetch=globalThis.fetch
try{
 globalThis.fetch=async(url,options)=>{
  const path=new URL(url).pathname,method=options.method
  assert(['api-sandbox.asaas.com','api.asaas.com'].includes(new URL(url).hostname))
  if(path==='/v3/myAccount/status/')return Response.json({id:'account_fixture',general:'APPROVED'})
  if(path==='/v3/myAccount/commercialInfo/')return Response.json({personType:'JURIDICA',companyName:'DUUK fictícia',cpfCnpj:'must-not-persist'})
  if(path==='/v3/webhooks')return Response.json(method==='GET'?{data:[]}:{id:'hook_fixture'})
  if(path==='/v3/customers')return Response.json(method==='GET'?{data:[{id:'cus_fixture',externalReference:new URL(url).searchParams.get('externalReference'),notificationDisabled:true}]}:{id:'cus_fixture'})
  if(path==='/v3/payments'&&method==='POST'){postCount++;const body=JSON.parse(options.body);assert.equal(body.postalService,false);assert(!body.creditCard);assert(!body.installmentCount);if(failPost)throw Error('ambiguous network');return Response.json({id:'pay_fixture',customer:body.customer,externalReference:body.externalReference,value:body.value,status:'PENDING',invoiceUrl:'https://sandbox.asaas.com/i/fixture'})}
  if(path==='/v3/payments/pay_fixture/restore'){assert.equal(method,'POST');deleted=false;return Response.json({id:'pay_fixture',customer:'cus_fixture',externalReference:'duuk:'+id,value:50,status:'PENDING',deleted:false,...metadata})}
  if(path==='/v3/payments/pay_fixture'){if(method==='PUT')metadata=JSON.parse(options.body);if(method==='DELETE'){deleted=true;return Response.json({deleted:true})}return Response.json({id:'pay_fixture',customer:'cus_fixture',externalReference:'duuk:'+id,value:50,status,deleted,...metadata})}
  throw Error('Unexpected provider route '+path)
 }
 await test('Edge rejects AAL1, revoked sessions, permissions, foreign origin and forged callbacks',async()=>{
  assert.equal((await request({action:'create'},{aal:'aal1'})).status,403)
  validSession=false;assert.equal((await request({action:'status'})).status,401);validSession=true
  allowed=false;for(const action of ['status','overview','fees','simulate','transactions','provider_list','artifacts','edit','restore'])assert.equal((await request({action})).status,403);allowed=true
  assert.equal((await request({action:'status'},{origin:'https://attacker.test'})).status,403)
  assert.equal((await request({action:'dispatch'})).status,403)
  assert.equal((await request({id:'evt_fixture',event:'PAYMENT_RECEIVED',payment:{id:'pay_fixture'}},{query:'?hook=1&environment=sandbox&connection='+config_id})).status,401)
  assert.equal(operations.filter(x=>x.operation==='begin_create').length,0);assert.equal(postCount,0)
 })
 await test('company configuration persists only operational account fields and checks super admin',async()=>{
  const input={action:'configure',environment:'sandbox',api_key:credentials.api_key,contact_email:credentials.contact_email}
  superAdmin=false;assert.equal((await request(input)).status,403);superAdmin=true
  assert.equal((await request(input)).status,200);assert.equal(configured.account_id,'account_fixture');assert(!JSON.stringify(configured).includes('must-not-persist'))
  assert.equal((await request({...input,environment:'production',fees_accepted:false})).status,400)
 })
 await test('creation binds a safe provider invoice and uncertain POST is never retried',async()=>{
  const input={action:'create',environment:'sandbox',id,title:'Fictional film',client_name:'Fictional client',document:'12345678909',amount_cents:5000,method:'UNDEFINED',due_date:'2099-12-01'}
  let response=await request(input);assert.equal(response.status,200);assert.equal((await response.json()).charge.status,'PENDING');assert.equal(postCount,1);assert(!JSON.stringify(createdInput).includes('12345678909'));assert(!('document' in createdInput))
  failPost=true;response=await request(input);assert.equal((await response.json()).charge.status,'UNCERTAIN');assert.equal(postCount,2);failPost=false
 })
 await test('cancel refuses a paid charge, then cancels a provider-confirmed pending charge',async()=>{
  charge={...charge,payment_id:'pay_fixture',customer_id:'cus_fixture'};status='RECEIVED';assert.equal((await request({action:'cancel',id})).status,409)
  status='PENDING';assert.equal((await (await request({action:'cancel',id})).json()).charge.status,'CANCELED')
 })
 await test('edits are limited to open bound invoices; restore reuses the cancelled invoice identity',async()=>{
  charge={...charge,status:'PENDING'};deleted=false;status='RECEIVED'
  assert.equal((await request({action:'edit',id,title:'Updated fixture',due_date:'2099-12-31'})).status,409)
  status='PENDING';let response=await request({action:'edit',id,title:'Updated fixture',due_date:'2099-12-31',amount_cents:1})
  assert.equal(response.status,200);assert.equal((await response.json()).charge.title,'Updated fixture');assert.deepEqual(metadata,{description:'Updated fixture',dueDate:'2099-12-31'})
  assert.equal((await request({action:'restore',id})).status,409)
  charge.status='CANCELED';deleted=true;response=await request({action:'restore',id});assert.equal(response.status,200);assert.equal((await response.json()).charge.payment_id,'pay_fixture');assert.equal(deleted,false)
 })
 await test('authenticated webhook is reduced to ids and persisted before acknowledgement',async()=>{
  const response=await request({id:'evt_official&123',event:'PAYMENT_RECEIVED',payment:{id:'pay_fixture',externalReference:'duuk:'+id,creditCard:{number:'not-retained'}}},{query:'?hook=1&environment=sandbox&connection='+config_id,headers:{'asaas-access-token':'a'.repeat(64)}})
  assert.equal(response.status,200);const queued=operations.findLast(x=>x.operation==='enqueue');assert.equal(queued.actor,null);assert(!JSON.stringify(queued).includes('creditCard'))
 })
}finally{globalThis.fetch=originalFetch;delete globalThis.Deno;delete globalThis.__billingDb}
