import test from 'node:test'
import assert from 'node:assert/strict'
import {authorizationUrl,calendarScope,calendarRedirect,eventBody,syncGoogleEvent,exchangeToken,ensureDuukCalendar} from '../supabase/functions/_shared/google-calendar.mjs'
const event={id:'11111111-1111-4111-8111-111111111111',title:'Gravação DUUK',description:'Campanha',client_name:'Cliente',location:'Estúdio',start_date:'2026-12-31',end_date:'2027-01-01',all_day:true,status:'confirmed'}
const response=(status,data={})=>new Response(status===204?null:JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}})
test('OAuth pede somente calendário criado pelo app e identidade, com state, PKCE e acesso offline',()=>{
 const u=new URL(authorizationUrl('client-id','state-test','pkce-challenge'))
 assert.equal(u.origin,'https://accounts.google.com');assert.equal(u.searchParams.get('redirect_uri'),calendarRedirect)
 assert.deepEqual(u.searchParams.get('scope').split(' '),['openid','email',calendarScope])
 assert.equal(u.searchParams.get('state'),'state-test');assert.equal(u.searchParams.get('code_challenge_method'),'S256');assert.equal(u.searchParams.get('access_type'),'offline')
 assert(!u.searchParams.has('client_secret'))
})
test('datas de dia inteiro têm fim exclusivo e horários preservam Brasília e virada de ano',()=>{
 assert.equal(eventBody(event).end.date,'2027-01-02')
 const body=eventBody({...event,end_date:'2026-12-31',all_day:false,start_time:'23:30:00',end_time:null},'Equipe')
 assert.equal(body.start.dateTime,'2026-12-31T23:30:00-03:00');assert.equal(body.end.dateTime,'2027-01-01T03:30:00.000Z')
 assert(body.description.includes('Responsável: Equipe'));assert.equal(body.extendedProperties.private.duuk_event_id,event.id)
 assert.equal(eventBody({...event,status:'cancelled'}).status,'cancelled')
})
test('duas contas recebem criações, edições e exclusões sem qualquer leitura de eventos pessoais',async()=>{
 const calendars=new Map(),calls=[]
 const fetcher=async(url,options)=>{
  calls.push([url,options.method,options.headers.Authorization]);assert.notEqual(options.method,'GET');assert.equal(options.redirect,'error')
  const parts=new URL(url).pathname.split('/'),calendar=decodeURIComponent(parts[4]),id=parts[6]||JSON.parse(options.body).id,key=calendar+':'+id
  if(options.method==='PUT'&&!calendars.has(key))return response(404)
  if(options.method==='DELETE'){calendars.delete(key);return response(204)}
  calendars.set(key,JSON.parse(options.body));return response(200,{id})
 }
 for(const account of ['a','b'])await syncGoogleEvent({calendarId:'duuk-'+account,googleId:'duuk123',event,action:'upsert',token:'token-'+account},fetcher)
 assert.equal(calendars.size,2)
 for(const account of ['a','b'])await syncGoogleEvent({calendarId:'duuk-'+account,googleId:'duuk123',event:{...event,title:'Novo título'},action:'upsert',token:'token-'+account},fetcher)
 assert([...calendars.values()].every(e=>e.summary==='Novo título'))
 for(const account of ['a','b'])await syncGoogleEvent({calendarId:'duuk-'+account,googleId:'duuk123',event:null,action:'delete',token:'token-'+account},fetcher)
 assert.equal(calendars.size,0);assert(calls.every(([u])=>!u.includes('/primary/')&&!u.includes('syncToken')))
})
test('reenvio depois de resposta perdida não duplica e tombstone usa novo ID persistido',async()=>{
 let inserts=0,rotations=0
 const methods=[]
 const fetcher=async(url,options)=>{methods.push(options.method);if(options.method==='PUT')return response(410);inserts++;return response(inserts===1?409:200)}
 const id=await syncGoogleEvent({calendarId:'duuk-calendar',googleId:'old',event,action:'upsert',token:'token',rotate:async()=>{rotations++;return 'replacement'}},fetcher)
 assert.equal(id,'replacement');assert.equal(rotations,1);assert.deepEqual(methods,['PUT','POST','PUT','POST'])
 let count=0;await syncGoogleEvent({calendarId:'duuk-calendar',googleId:'known',event,action:'upsert',token:'token'},async()=>{count++;return response(200)});assert.equal(count,1)
 await syncGoogleEvent({calendarId:'duuk-calendar',googleId:'gone',action:'delete',token:'token'},async()=>response(404))
})
test('renovação mantém segredo no servidor e erros do Google não vazam conteúdo',async()=>{
 const token=await exchangeToken({grant_type:'refresh_token',refresh_token:'private-refresh'},{id:'client',secret:'private-client'},async(url,options)=>{assert.equal(url,'https://oauth2.googleapis.com/token');assert.equal(options.body.get('refresh_token'),'private-refresh');assert.equal(options.body.get('client_secret'),'private-client');return response(200,{access_token:'new-access',expires_in:3600})})
 assert.equal(token.access_token,'new-access')
 await assert.rejects(()=>exchangeToken({}, {id:'id',secret:'secret'},async()=>response(400,{error:'invalid_grant',error_description:'sensitive provider details'})),e=>!e.message.includes('sensitive')&&e.code==='invalid_grant')
})
test('reconexão verifica somente calendário criado pelo app e recria calendário removido',async()=>{
 const calls=[];const id=await ensureDuukCalendar('token','own-calendar',async(url,options)=>{calls.push([url,options.method||'GET']);return options.method==='POST'?response(200,{id:'new-calendar'}):response(404)})
 assert.equal(id,'new-calendar');assert.deepEqual(calls.map(c=>c[1]),['GET','POST']);assert(calls.every(c=>!c[0].includes('/events')))
})
