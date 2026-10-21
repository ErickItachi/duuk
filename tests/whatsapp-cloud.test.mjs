import test from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { graphCall, hashBytes, mediaUrl, normalizeWebhook, providerMessage, replyInput, validateMedia, waId, webhookSignature } from '../supabase/functions/_shared/whatsapp-cloud.mjs'
import { canReply } from '../src/whatsapp/model.mjs'
import { packetSamples, recordingMime, webmToOgg } from '../src/whatsapp/audio.mjs'
const id='00000000-0000-4000-8000-000000000001',thread_id='00000000-0000-4000-8000-000000000002',cfg={waba_id:'123456',phone_id:'234567',expected_phone:'5511999990000'},now=Date.now()
const event=(field,value)=>({object:'whatsapp_business_account',entry:[{id:cfg.waba_id,changes:[{field,value:{metadata:{phone_number_id:cfg.phone_id},...value}}]}]})
const inbound={from:'5511999990001',id:'wamid.fixture12345',timestamp:String(Math.floor(now/1000)),type:'text',text:{body:'Hello <script>example</script>'}}
test('free reply boundary rejects templates, bulk and malformed recipients, IDs, captions and emoji sequences',()=>{
 for(const type of ['template','marketing','interactive','contacts','location','unknown'])assert.throws(()=>replyInput({id,thread_id,type,text:'Hello'}))
 assert.equal(replyInput({id,thread_id,text:' Hello '}).text,'Hello')
 assert.throws(()=>replyInput({id,thread_id,text:'x'.repeat(4097)}));assert.throws(()=>replyInput({id,thread_id,type:'audio',text:'caption'}))
 assert.throws(()=>replyInput({id,thread_id,type:'reaction',reply_to:id,emoji:'👍❤️'}));assert.equal(replyInput({id,thread_id,type:'reaction',reply_to:id,emoji:'👍🏽'}).emoji,'👍🏽')
 assert.equal(waId('+5511999990001'),'5511999990001');for(const to of ['../me','1555@x','+05511999990001','5511999990001,many'])assert.throws(()=>waId(to))
 assert.throws(()=>providerMessage({id,type:'template'},'5511999990001'))
 const m=providerMessage({id,type:'text',body:'hello',context_provider_id:'wamid.original123'},'5511999990001');assert.equal(m.to,'5511999990001');assert.equal(m.text.preview_url,false);assert(!('template' in m))
})
test('webhook validates exact raw bytes, account, phone, times and drops unrelated secrets',async()=>{
 const body=event('messages',{messages:[inbound],contacts:[{wa_id:inbound.from,profile:{name:'Fixture'},unneeded:'private-extra'}]}),raw=Buffer.from(JSON.stringify(body)),secret='fixture-app-secret',signature='sha256='+createHmac('sha256',secret).update(raw).digest('hex')
 assert(await webhookSignature(raw,secret,signature));assert(!await webhookSignature(Buffer.concat([raw,Buffer.from(' ')]),secret,signature));assert(!await webhookSignature(raw,'wrong',signature));assert(!await webhookSignature(raw,secret,'sha256=00'))
 const normalized=normalizeWebhook(body,cfg,now);assert.equal(normalized.messages.length,1);assert.equal(normalized.messages[0].opens_window,true);assert(!JSON.stringify(normalized).includes('private-extra'))
 assert.equal(normalizeWebhook(body,{...cfg,phone_id:'999999'},now).messages.length,0);assert.equal(normalizeWebhook(body,{...cfg,waba_id:'999999'},now).messages.length,0)
 assert.equal(normalizeWebhook(event('messages',{messages:[{...inbound,timestamp:String(Math.floor(now/1000)+120)}]}),cfg,now).messages.length,0)
 assert.throws(()=>normalizeWebhook({object:'whatsapp_business_account',entry:{}},cfg,now));assert.throws(()=>normalizeWebhook(event('messages',{messages:Array(20001).fill(inbound)}),cfg,now))
})
test('Business app echoes, reactions, edit/revoke, contacts and removal never open a free reply window',()=>{
 const echo=normalizeWebhook(event('smb_message_echoes',{message_echoes:[{...inbound,from:cfg.expected_phone,to:inbound.from}]}),cfg,now).messages[0];assert.equal(echo.direction,'out');assert.equal(echo.opens_window,false)
 const reaction=normalizeWebhook(event('messages',{messages:[{...inbound,type:'reaction',reaction:{message_id:'wamid.original123',emoji:'👍'}}]}),cfg,now).messages[0];assert.equal(reaction.opens_window,false)
 const edit=normalizeWebhook(event('messages',{messages:[{...inbound,type:'edit',edit:{original_message_id:'wamid.original123',message:{type:'text',text:{body:'Updated'}}}}]}),cfg,now);assert.equal(edit.messages.length,0);assert.equal(edit.mutations[0].body,'Updated')
 const contacts=normalizeWebhook(event('smb_app_state_sync',{state_sync:[{type:'contact',action:'add',contact:{phone_number:inbound.from,full_name:'Fixture'},metadata:{timestamp:inbound.timestamp}}]}),cfg,now);assert.equal(contacts.contacts[0].name,'Fixture');assert.equal(contacts.messages.length,0)
 assert(normalizeWebhook({object:'whatsapp_business_account',entry:[{id:cfg.waba_id,changes:[{field:'account_update',value:{event:'PARTNER_REMOVED',phone_number:cfg.expected_phone}}]}]},cfg,now).disconnected)
})
test('media rejects executable/HTML/SVG, lies, oversize images, invalid stickers and arbitrary download hosts',()=>{
 for(const mime of ['text/html','image/svg+xml','application/x-msdownload','audio/webm'])assert.throws(()=>validateMedia(new Uint8Array([1,2,3]),mime,'file.exe'))
 assert.throws(()=>validateMedia(new TextEncoder().encode('<html>'),'image/png','file.png'))
 assert.equal(validateMedia(new TextEncoder().encode('%PDF-1.7 fixture'),'application/pdf','../../file.pdf',{type:'document'}).filename,'_.._file.pdf')
 assert.throws(()=>validateMedia(new Uint8Array(5*1024*1024+1),'image/png','file.png'))
 const png=new Uint8Array(32);png.set([137,80,78,71,13,10,26,10]);const d=new DataView(png.buffer);d.setUint32(16,60000);d.setUint32(20,60000);assert.throws(()=>validateMedia(png,'image/png','bomb.png'))
 for(const url of ['http://lookaside.fbsbx.com/whatsapp_business/attachments/a','https://lookaside.fbsbx.com.evil.test/whatsapp_business/attachments/a','https://user@lookaside.fbsbx.com/whatsapp_business/attachments/a','https://127.0.0.1/x','https://lookaside.fbsbx.com/not-media'])assert.throws(()=>mediaUrl(url))
 assert(mediaUrl('https://lookaside.fbsbx.com/whatsapp_business/attachments/?asset_id=123').startsWith('https://lookaside.fbsbx.com/'))
})
test('provider transport never retries an ambiguous POST and sanitizes errors',async()=>{
 let calls=0
 await assert.rejects(()=>graphCall('fixture','POST','123456/messages',{}, {},async()=>{calls++;throw Error('contains-private-key')}),e=>e.uncertain&&!e.message.includes('private-key'));assert.equal(calls,1)
 await assert.rejects(()=>graphCall('fixture','POST','123456/messages',{}, {},async()=>Response.json({error:{code:131047,message:'raw-private'}},{status:400})),e=>e.status===409&&!e.uncertain&&!e.message.includes('raw-private'))
 await assert.rejects(()=>graphCall('fixture','GET','https://evil.test/'),/inválida/)
 assert.equal((await hashBytes('fixture')).length,64)
})
test('client reply availability uses connected state, resolution and a two-minute safety margin',()=>{
 const t={status:'open',last_customer_at:new Date(now).toISOString()};assert(canReply({connected:true},t,now));assert(!canReply({connected:false},t,now));assert(!canReply({connected:true},{...t,status:'resolved'},now));assert(!canReply({connected:true},t,now+24*3600000-60000))
})
test('recording chooses native interoperable codecs and rejects invalid or laced WebM',()=>{
 assert.equal(recordingMime({isTypeSupported:m=>m.includes('webm')}),'audio/webm;codecs=opus');assert.equal(recordingMime({isTypeSupported:()=>false}),'');assert.equal(packetSamples(new Uint8Array([0xf8,0])),960);assert.throws(()=>packetSamples(new Uint8Array([])));assert.throws(()=>webmToOgg(new Uint8Array([1,2,3,4])))
})
test('history batches preserve provider provenance and receipts without opening a service window',()=>{
 const history=normalizeWebhook(event('history',{history:[{metadata:{phase:0,chunk_order:1,progress:50},threads:[{id:inbound.from,messages:[{...inbound,from:cfg.expected_phone,history_context:{status:'READ'}},{...inbound,id:'wamid.historyIncoming',type:'media_placeholder'}]}]}]}),cfg,now)
 assert.equal(history.messages.length,0);assert.equal(history.sync_batches.length,1)
 const [outgoing,incoming]=history.sync_batches[0].messages
 assert.equal(outgoing.direction,'out');assert.equal(outgoing.history_status,'READ');assert.equal(outgoing.source,'history');assert.equal(outgoing.opens_window,false);assert.equal(incoming.opens_window,false)
 const asset=normalizeWebhook(event('history',{messages:[{...inbound,type:'image',image:{id:'123456',mime_type:'image/jpeg',caption:'Private caption'}}]}),cfg,now).sync_batches[0].messages[0]
 assert.equal(asset.history_media,true);assert.equal(asset.opens_window,false);assert.equal(asset.media_id,'123456')
 const refused=normalizeWebhook(event('history',{history:[{errors:[{code:2593109,message:'unneeded provider text'}]}]}),cfg,now)
 assert.equal(refused.sync_batches[0].declined,true);assert(!JSON.stringify(refused).includes('unneeded'))
 const old={...inbound,timestamp:String(Math.floor(now/1000)-91*86400)};assert.equal(normalizeWebhook(event('history',{history:[{metadata:{phase:2,chunk_order:1,progress:100},threads:[{id:inbound.from,messages:[old]}]}]}),cfg,now).sync_batches[0].messages.length,0)
})
test('received contact/location/selection contents are bounded explicit data without remote URLs or private extras',()=>{
 const location=normalizeWebhook(event('messages',{messages:[{...inbound,type:'location',location:{latitude:-23.5,longitude:-46.6,name:'Studio',url:'https://untrusted.invalid',unneeded:'private-extra'}}]}),cfg,now).messages[0]
 assert.deepEqual(location.details,{latitude:-23.5,longitude:-46.6,name:'Studio',address:''});assert(!JSON.stringify(location).includes('private-extra'))
 const contacts=normalizeWebhook(event('messages',{messages:[{...inbound,type:'contacts',contacts:[{name:{formatted_name:'Fixture'},phones:[{phone:'+5511999990001',type:'WORK'}],addresses:[{street:'not retained'}],urls:[{url:'https://untrusted.invalid'}]}]}]}),cfg,now).messages[0]
 assert.equal(contacts.details.contacts[0].name,'Fixture');assert(!JSON.stringify(contacts).includes('not retained'))
 const selection=normalizeWebhook(event('messages',{messages:[{...inbound,type:'interactive',interactive:{button_reply:{id:'confirm',title:'Confirmar'}}}]}),cfg,now).messages[0];assert.equal(selection.details.kind,'selection');assert.equal(selection.details.id,'confirm')
})
test('free contact/location replies validate coordinates and canonical card fields before provider conversion',()=>{
 const location=replyInput({id,thread_id,type:'location',details:{latitude:-23.5,longitude:-46.6,name:'Studio',address:'Fixture address'}})
 assert.equal(providerMessage({...location,body:location.text},inbound.from).location.latitude,-23.5)
 for(const latitude of [91,NaN,Infinity,'-23.5',null])assert.throws(()=>replyInput({id,thread_id,type:'location',details:{latitude,longitude:0}}))
 const contacts=replyInput({id,thread_id,type:'contacts',details:{contacts:[{name:'Fixture',phones:[{phone:'+55 (11) 99999-0001',type:'WORK'}],org:'DUUK'}]}})
 const wire=providerMessage({...contacts,body:contacts.text},inbound.from);assert.equal(wire.contacts[0].name.formatted_name,'Fixture');assert.equal(wire.contacts[0].phones[0].phone,'+5511999990001');assert(!wire.template)
 assert.throws(()=>replyInput({id,thread_id,type:'contacts',details:{contacts:[{name:'Fixture',phones:[{phone:'bad-address'}]}]}}))
})
test('free interactive reply buttons and lists reject flows, duplicates and bounds, then convert only canonical actions',()=>{
 const detail={kind:'buttons',body:'Confirmar atendimento?',header:'DUUK',footer:'Equipe',options:[{id:'yes',title:'Sim'},{id:'no',title:'Não'}]},input=replyInput({id,thread_id,type:'interactive',details:detail})
 const wire=providerMessage({...input,body:input.text},inbound.from);assert.equal(wire.interactive.type,'button');assert.equal(wire.interactive.action.buttons.length,2);assert.deepEqual(wire.interactive.header,{type:'text',text:'DUUK'})
 const list=providerMessage({...input,details:{...detail,kind:'list',button:'Escolher',options:[{id:'one',title:'Uma opção',description:'Descrição'}]}},inbound.from)
 assert.equal(list.interactive.type,'list');assert.equal(list.interactive.action.sections[0].rows[0].description,'Descrição')
 for(const details of [{...detail,kind:'flow'},{...detail,options:Array(4).fill(detail.options[0])},{...detail,options:[{id:'same',title:'One'},{id:'same',title:'Two'}]},{...detail,body:'x'.repeat(1025)},{...detail,options:[{id:'one',title:'x'.repeat(21)}]}])assert.throws(()=>replyInput({id,thread_id,type:'interactive',details}))
})
