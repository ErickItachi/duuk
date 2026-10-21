// Actual Edge request/auth code, with isolated database and Meta adapters. Never sends a real message.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { createHmac } from 'node:crypto'
const dataModule=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64')
const actor='00000000-0000-4000-8000-000000000001',thread='00000000-0000-4000-8000-000000000002',generation='00000000-0000-4000-8000-000000000003',connection='00000000-0000-4000-8000-000000000004',lease='00000000-0000-4000-8000-000000000005'
let serve,allowed=true,validSession=true,superAdmin=true,posts=0,failPost=false,badAck=false,coexistence=true,foreignMedia=false,configured=null
let syncPosts=0,receiptPosts=0;const claims=new Map();
const records=new Map(),ops=[],cfg={id:connection,generation,app_id:'123456',waba_id:'234567',phone_id:'345678',expected_phone:'5511999990000',credentials:{app_secret:'a'.repeat(32),access_token:'fixture-access-token-123456789012345',verify_token:'fixture-verify-token'},verify_hash:createHmac('sha256','unused').digest('hex')}
const db={auth:{getUser:async()=>({data:{user:{id:actor}}})},from:()=>({select:()=>({eq:()=>({single:async()=>({data:{is_super_admin:superAdmin}})})})}),rpc:async(name,args)=>{
 if(name==='duuk_authorize_session')return {data:validSession};if(name==='duuk_check_permission')return {data:allowed&&args.requested==='whatsapp'};if(name==='duuk_action_limit')return {data:true}
 assert.equal(name,'duuk_whatsapp_backend');ops.push(args);const p=args.payload
 if(['credentials','hook_credentials'].includes(args.operation))return {data:cfg}
 if(args.operation==='sync_claim'){if(claims.has(p.kind))return {data:{execute:false}};claims.set(p.kind,{state:'requesting'});return {data:{execute:true,generation}}}
 if(args.operation==='sync_ack'){claims.set(p.kind,p);return {data:{}}}
 if(args.operation==='receipt_claim')return {data:{execute:true,provider_id:'wamid.fixtureIncomingRead'}}
 if(args.operation==='status')return {data:{expected_phone:cfg.expected_phone,configured:!!configured,connected:false}}
 if(args.operation==='configure'){configured=p;return {data:{}}}
 if(args.operation==='send_begin'){
  if(records.has(p.id))return {data:{execute:false,message:records.get(p.id)}}
  const m={...p,body:p.text,status:'PREPARING',lease_id:lease,context_provider_id:null};records.set(p.id,m);return {data:{execute:true,internal:m,to:'5511999990001'}}
 }
 if(args.operation==='send_uploaded'){records.get(p.id).media_id=p.media_id;return {data:{}}}
 if(args.operation==='send_dispatch'){const m=records.get(p.id);m.status='SENDING';return {data:m}}
 if(args.operation==='send_ack'){const m=records.get(p.id);m.status='SENT';m.provider_id=p.provider_id;return {data:m}}
 if(args.operation==='send_error'){const m=records.get(p.id);m.status=p.uncertain?'UNCERTAIN':'FAILED';m.last_error=p.error;return {data:m}}
 if(args.operation==='get_message')return {data:records.get(p.id)}
 if(args.operation==='message_media')return {data:{media_id:'456789',mime:'application/pdf',filename:'fixture.pdf',type:'document'}}
 return {data:{}}
}}
globalThis.__whatsappDb=db;globalThis.Deno={env:{get:()=>''},serve:handler=>{serve=handler}}
const sdk=dataModule('export const createClient=()=>globalThis.__whatsappDb'),shared=new URL('../supabase/functions/_shared/',import.meta.url)
let http=await readFile(new URL('http.ts',shared),'utf8');http=http.replace("'npm:@supabase/supabase-js@2.117.2'",JSON.stringify(sdk)).replace("'./session-claims.mjs'",JSON.stringify(new URL('session-claims.mjs',shared).href))
const httpModule=dataModule(stripTypeScriptTypes(http,{mode:'transform'}))
let source=await readFile(new URL('../supabase/functions/duuk-whatsapp/index.ts',import.meta.url),'utf8');source=source.replace("'../_shared/http.ts'",JSON.stringify(httpModule)).replace("'../_shared/whatsapp-cloud.mjs'",JSON.stringify(new URL('whatsapp-cloud.mjs',shared).href));await import(dataModule(stripTypeScriptTypes(source)))
const token=aal=>'header.'+Buffer.from(JSON.stringify({aal,session_id:lease})).toString('base64url')+'.auth-adapter-verifies-signature'
const request=(body,{aal='aal2',origin='https://www.duukfilms.com'}={})=>serve(new Request('https://fixture.invalid/',{method:'POST',headers:{...(body instanceof FormData?{}:{'Content-Type':'application/json'}),origin,authorization:'Bearer '+token(aal)},body:body instanceof FormData?body:JSON.stringify(body)}))
const sendInput=id=>({action:'send',id,thread_id:thread,type:'text',text:'Fixture reply'})
const originalFetch=globalThis.fetch
try{
 globalThis.fetch=async(url,options)=>{
  const u=new URL(url);assert.equal(u.hostname,'graph.facebook.com');const path=u.pathname.replace(/^\/v\d+\.\d+\//,'')
  if(path==='345678/smb_app_data'){syncPosts++;return Response.json({request_id:'fixture-sync-'+syncPosts})}
  if(path==='345678/messages'&&JSON.parse(options.body).status==='read'){receiptPosts++;const body=JSON.parse(options.body);assert.equal(body.message_id,'wamid.fixtureIncomingRead');assert(!body.to&&!body.template);return Response.json({success:true})}
  if(path==='345678/messages'){posts++;const body=JSON.parse(options.body);assert.equal(body.to,'5511999990001');assert(!body.template);if(failPost)throw Error('ambiguous transport');return Response.json(badAck?{}:{messages:[{id:'wamid.fixtureAcknowledged'}],contacts:[{wa_id:body.to}]})}
  if(path==='debug_token')return Response.json({data:{is_valid:true,app_id:cfg.app_id,scopes:['whatsapp_business_management','whatsapp_business_messaging'],expires_at:Math.floor(Date.now()/1000)+3600}})
  if(path==='345678')return Response.json({id:cfg.phone_id,display_phone_number:'+55 11 99999-0000',verified_name:'Fixture',is_on_biz_app:coexistence,platform_type:'CLOUD_API'})
  if(path==='234567/phone_numbers')return Response.json({data:[{id:cfg.phone_id}]})
  if(path==='123456/subscriptions')return Response.json(options.method==='GET'?{data:[]}:{success:true})
  if(path==='234567/subscribed_apps')return Response.json({success:true})
  if(path==='456789')return Response.json({id:'456789',mime_type:'application/pdf',file_size:50,url:foreignMedia?'https://evil.test/private':'https://lookaside.fbsbx.com/whatsapp_business/attachments/?asset_id=456789'})
  throw Error('Unexpected provider operation '+path)
 }
 await test('all member actions require AAL2, current sessions, module permission and trusted browser origin',async()=>{
  assert.equal((await request({action:'status'},{aal:'aal1'})).status,403);validSession=false;assert.equal((await request({action:'status'})).status,401);validSession=true
  allowed=false;for(const action of ['status','contacts','threads','send','photo','media','analytics','configure'])assert.equal((await request({action})).status,403);allowed=true
  assert.equal((await request({action:'status'},{origin:'https://evil.test'})).status,403);assert.equal(posts,0)
 })
 await test('fake webhooks cannot ingest; only exact raw HMAC reaches the private inbox',async()=>{
  const body={object:'whatsapp_business_account',entry:[]},raw=JSON.stringify(body),url='https://fixture.invalid/?hook=1&connection='+connection
  let response=await serve(new Request(url,{method:'POST',body:raw}));assert.equal(response.status,401);assert(!ops.some(x=>x.operation==='ingest'))
  const signature='sha256='+createHmac('sha256',cfg.credentials.app_secret).update(raw).digest('hex')
  response=await serve(new Request(url,{method:'POST',headers:{'x-hub-signature-256':signature},body:raw}));assert.equal(response.status,200);assert.equal(ops.findLast(x=>x.operation==='ingest').actor,null)
  response=await serve(new Request(url,{method:'POST',headers:{'x-hub-signature-256':signature},body:raw+' '}));assert.equal(response.status,401)
 })
 await test('webhook verification secrets are never returned through a browser setup action',async()=>{
  const response=await request({action:'setup'});assert.equal(response.status,400)
  assert(!(await response.text()).includes(cfg.credentials.verify_token))
  assert(!ops.some(x=>x.operation==='setup'))
 })
 await test('signed large history batches above 512 KB are accepted, while webhook bytes remain bounded at 8 MB',async()=>{
  const now=String(Math.floor(Date.now()/1000)),messages=Array.from({length:1000},(_,i)=>({from:'5511999990001',id:'wamid.largeHistory_'+i,timestamp:now,type:'text',text:{body:'🎥'.repeat(300)}})),body={object:'whatsapp_business_account',entry:[{id:cfg.waba_id,changes:[{field:'history',value:{metadata:{phone_number_id:cfg.phone_id},history:[{metadata:{phase:0,chunk_order:1,progress:100},threads:[{id:'5511999990001',messages}]}]}}]}]},raw=JSON.stringify(body),url='https://fixture.invalid/?hook=1&connection='+connection
  assert(Buffer.byteLength(raw)>512000);const signature='sha256='+createHmac('sha256',cfg.credentials.app_secret).update(raw).digest('hex')
  const response=await serve(new Request(url,{method:'POST',headers:{'x-hub-signature-256':signature},body:raw}));assert.equal(response.status,200)
  const payload=ops.findLast(x=>x.operation==='ingest').payload;assert.equal(payload.sync_batches[0].messages.length,1000);assert(payload.sync_batches[0].messages.every(m=>m.source==='history'&&!m.opens_window))
  const oversized=await serve(new Request(url,{method:'POST',headers:{'x-hub-signature-256':signature,'content-length':String(8*1024*1024+1)},body:'{}'}));assert.equal(oversized.status,413)
 })
 await test('non-free message kinds never reach the provider or allocate a send attempt',async()=>{
  const n=ops.filter(x=>x.operation==='send_begin').length
  for(const type of ['template','marketing','interactive'])assert.equal((await request({...sendInput(crypto.randomUUID()),type})).status,400)
  assert.equal(posts,0);assert.equal(ops.filter(x=>x.operation==='send_begin').length,n)
 })
 await test('same send ID is durable before POST and concurrent duplicate clicks dispatch exactly once',async()=>{
  const input=sendInput(crypto.randomUUID()),responses=await Promise.all([request(input),request({...input,to:'5511999990999'})]);assert(responses.every(r=>r.status===200));assert.equal(posts,1);assert.equal(records.get(input.id).status,'SENT')
  await request(input);assert.equal(posts,1)
 })
 await test('network ambiguity and malformed successful acknowledgements remain uncertain without automatic retry',async()=>{
  failPost=true;const input=sendInput(crypto.randomUUID());let response=await request(input);assert.equal((await response.json()).status,'UNCERTAIN');assert.equal(posts,2);await request(input);assert.equal(posts,2);failPost=false
  badAck=true;response=await request(sendInput(crypto.randomUUID()));assert.equal((await response.json()).status,'UNCERTAIN');assert.equal(posts,3);badAck=false
 })
 await test('coexistence is verified at Meta before credentials are stored, and only super admins configure',async()=>{
  const input={action:'configure',app_id:cfg.app_id,waba_id:cfg.waba_id,phone_id:cfg.phone_id,...cfg.credentials,coexistence_confirmed:true}
  superAdmin=false;assert.equal((await request(input)).status,403);superAdmin=true
  coexistence=false;assert.equal((await request(input)).status,409);assert.equal(configured,null)
  coexistence=true;assert.equal((await request({...input,coexistence_confirmed:false})).status,400)
  assert.equal((await request(input)).status,200);assert(configured.credentials.access_token);const result=await (await request({action:'status'})).json();assert(!JSON.stringify(result).includes(cfg.credentials.access_token));assert(!ops.some(x=>/register|migrate/.test(x.operation)))
 })
 await test('initial sync is explicitly consented, super-admin only and never repeats claimed external operations',async()=>{
  const input={action:'sync_start',onboarded_at:new Date().toISOString(),consent:true}
  superAdmin=false;assert.equal((await request(input)).status,403);superAdmin=true;assert.equal(syncPosts,0)
  assert.equal((await request({...input,consent:false})).status,400);assert.equal(syncPosts,0)
  assert.equal((await request(input)).status,200);assert.equal(syncPosts,2);assert(claims.get('history').request_id)
  assert.equal((await request(input)).status,200);assert.equal(syncPosts,2)
  assert.equal((await request({action:'sync_retry'})).status,200);assert.equal(syncPosts,2)
 })
 await test('free rich replies use canonical provider forms and never upload fictitious media',async()=>{
  for(const input of [{type:'location',details:{latitude:-23.5,longitude:-46.6,name:'Studio'}},{type:'contacts',details:{contacts:[{name:'Fixture',phones:[{phone:'+5511999990001',type:'WORK'}]}]}},{type:'interactive',details:{kind:'buttons',body:'Confirmar?',options:[{id:'yes',title:'Sim'}]}}]){
   const response=await request({...sendInput(crypto.randomUUID()),text:'',...input});assert.equal(response.status,200);assert.equal((await response.json()).status,'SENT')
  }
 })
 await test('read and typing use an authorized incoming message ID and only acknowledge confirmed provider success',async()=>{
  const before=ops.filter(x=>x.operation==='receipt_ack').length
  assert.equal((await request({action:'read',id:crypto.randomUUID()})).status,200);assert.equal((await request({action:'typing',id:crypto.randomUUID()})).status,200)
  assert.equal(receiptPosts,2);assert.equal(ops.filter(x=>x.operation==='receipt_ack').length,before+2)
  allowed=false;assert.equal((await request({action:'typing',id:crypto.randomUUID()})).status,403);allowed=true;assert.equal(receiptPosts,2)
 })
 await test('media access starts from an authorized message and blocks arbitrary download URLs',async()=>{
  foreignMedia=true;const response=await request({action:'media',id:crypto.randomUUID()});assert.equal(response.status,502);assert.equal(ops.findLast(x=>x.operation==='message_media').actor,actor);foreignMedia=false
 })
}finally{globalThis.fetch=originalFetch;delete globalThis.Deno;delete globalThis.__whatsappDb}
