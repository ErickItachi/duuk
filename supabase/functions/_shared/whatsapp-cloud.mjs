// Official Meta Cloud API only. No WhatsApp Web sessions, passwords, templates or broadcasts.
export const GRAPH_VERSION='v26.0'
export const MAX_FILE=10*1024*1024
export class WhatsAppError extends Error{constructor(message,status=400,uncertain=false){super(message);this.status=status;this.uncertain=uncertain}}
export const graphId=v=>{if(typeof v!=='string'||!/^\d{5,40}$/.test(v))throw new WhatsAppError('Confira os identificadores da Meta.');return v}
export const waId=v=>{if(typeof v!=='string'||!/^\+?[1-9]\d{7,14}$/.test(v))throw new WhatsAppError('Informe o telefone com código do país e DDD.');return v.replace(/^\+/,'')}
export const requestId=v=>{if(typeof v!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v))throw new WhatsAppError('Abra uma nova tentativa de envio.');return v}
export const messageId=v=>{if(typeof v!=='string'||!/^wamid\.[A-Za-z0-9_+=/.-]{5,490}$/.test(v))throw new WhatsAppError('Identificador de mensagem inválido.');return v}
const text=(v,n)=>typeof v==='string'?v.slice(0,n):''
// eslint-disable-next-line no-control-regex
export const filename=v=>(text(v,180).replace(/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069/\\]/g,'_').replace(/^\.+/,'')||'arquivo')
export function replyInput(body){
 const type=body.type||'text',allowed=['text','image','audio','video','document','sticker','reaction','contacts','location','interactive'];if(!allowed.includes(type))throw new WhatsAppError('Este tipo de envio não está disponível no atendimento gratuito.')
 const value=text(body.text,5000).trim();if(type==='text'&&(!value||value.length>4096))throw new WhatsAppError('Escreva uma mensagem de até 4.096 caracteres.')
 if(!['text','reaction','contacts','location','interactive'].includes(type)&&value.length>1024)throw new WhatsAppError('A legenda pode ter até 1.024 caracteres.')
 if(['audio','sticker'].includes(type)&&value)throw new WhatsAppError('Áudio e figurinha são enviados sem legenda. Envie o texto separadamente.')
 let emoji=null,details=null
 if(['contacts','location','interactive'].includes(type)){if(value)throw new WhatsAppError('Cartões são enviados sem legenda.');details=replyDetails(type,body.details)}
 if(type==='reaction'){
  emoji=typeof body.emoji==='string'?body.emoji:null
  if(emoji===null||emoji.length>32||emoji&&(!/\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(emoji)||[...new Intl.Segmenter('pt-BR',{granularity:'grapheme'}).segment(emoji)].length!==1))throw new WhatsAppError('Escolha um único emoji para reagir.')
  if(!body.reply_to)throw new WhatsAppError('Escolha a mensagem para reagir.')
 }
 return {id:requestId(body.id),thread_id:requestId(body.thread_id),type,text:type==='reaction'?'':type==='location'?details.name||details.address||'Localização':type==='contacts'?details.contacts.map(c=>c.name).join(', '):type==='interactive'?details.body:value,details,reply_to:body.reply_to?requestId(body.reply_to):null,emoji}
}
export function replyDetails(type,value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw new WhatsAppError('Confira os dados para compartilhar.')
 if(type==='interactive'){
  const validText=(v,max,required=false)=>{if(v==null&&!required)return '';if(typeof v!=='string'||v.length>max||required&&!v.trim())throw new WhatsAppError('Confira o texto e os limites do cartão interativo.');return v.trim()}
  const kind=value.kind;if(!['buttons','list'].includes(kind)||!Array.isArray(value.options)||value.options.length<1||value.options.length>(kind==='buttons'?3:10))throw new WhatsAppError('Use até três botões ou dez opções de lista.')
  const options=value.options.map(o=>({id:validText(o?.id,kind==='buttons'?256:200,true),title:validText(o?.title,kind==='buttons'?20:24,true),description:kind==='list'?validText(o?.description,72):''}))
  if(new Set(options.map(o=>o.id)).size!==options.length||new Set(options.map(o=>o.title)).size!==options.length)throw new WhatsAppError('Cada opção precisa ter identificador e título únicos.')
  return {kind,body:validText(value.body,kind==='buttons'?1024:4096,true),header:validText(value.header,60),footer:validText(value.footer,60),button:kind==='list'?validText(value.button,20,true):'',options}
 }
 if(type==='location'){
  if(typeof value.latitude!=='number'||typeof value.longitude!=='number'||!Number.isFinite(value.latitude)||Math.abs(value.latitude)>90||!Number.isFinite(value.longitude)||Math.abs(value.longitude)>180)throw new WhatsAppError('Informe coordenadas válidas.')
  if(typeof value.name!=='string'&&value.name!=null||typeof value.address!=='string'&&value.address!=null||(value.name||'').length>160||(value.address||'').length>500)throw new WhatsAppError('Confira o nome e o endereço da localização.')
  return {latitude:value.latitude,longitude:value.longitude,name:(value.name||'').trim(),address:(value.address||'').trim()}
 }
 if(!Array.isArray(value.contacts)||value.contacts.length<1||value.contacts.length>3)throw new WhatsAppError('Compartilhe de um a três contatos por vez.')
 return {contacts:value.contacts.map(c=>{
  if(!c||typeof c.name!=='string'||!c.name.trim()||c.name.length>160||!Array.isArray(c.phones)||c.phones.length<1||c.phones.length>3||c.emails!=null&&!Array.isArray(c.emails)||(c.emails?.length||0)>3||typeof c.org!=='string'&&c.org!=null||(c.org||'').length>160)throw new WhatsAppError('Confira o nome e os telefones do contato.')
  return {name:c.name.trim(),phones:c.phones.map(p=>({phone:'+'+waId(String(p?.phone||'').replace(/[\s()-]/g,'')),type:['HOME','WORK','CELL','MAIN'].includes(p?.type)?p.type:'CELL'})),emails:(c.emails||[]).map(e=>{if(typeof e?.email!=='string'||e.email.length>254||!/^\S+@\S+\.\S+$/.test(e.email))throw new WhatsAppError('Confira o e-mail do contato.');return {email:e.email,type:e.type==='WORK'?'WORK':'HOME'}}),org:(c.org||'').trim()}
 })}
}
const mediaTypes={
 'image/jpeg':['image',5*1024*1024], 'image/png':['image',5*1024*1024], 'image/webp':['sticker',500*1024],
 'audio/aac':['audio',MAX_FILE],'audio/mp4':['audio',MAX_FILE],'audio/mpeg':['audio',MAX_FILE],'audio/amr':['audio',MAX_FILE],'audio/ogg':['audio',MAX_FILE],
 'video/mp4':['video',MAX_FILE],'video/3gpp':['video',MAX_FILE],
 'application/pdf':['document',MAX_FILE],'text/plain':['document',MAX_FILE],'application/msword':['document',MAX_FILE],
 'application/vnd.ms-excel':['document',MAX_FILE],'application/vnd.ms-powerpoint':['document',MAX_FILE],
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':['document',MAX_FILE],
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':['document',MAX_FILE],
 'application/vnd.openxmlformats-officedocument.presentationml.presentation':['document',MAX_FILE],
}
const extensions={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',mp3:'audio/mpeg',m4a:'audio/mp4',aac:'audio/aac',amr:'audio/amr',ogg:'audio/ogg',opus:'audio/ogg',mp4:'video/mp4','3gp':'video/3gpp',pdf:'application/pdf',txt:'text/plain',doc:'application/msword',xls:'application/vnd.ms-excel',ppt:'application/vnd.ms-powerpoint',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation'}
export function mediaMime(mime,name){const normalized=String(mime||'').split(';')[0].trim().toLowerCase();return normalized==='application/octet-stream'||!normalized?extensions[String(name||'').toLowerCase().split('.').pop()]||'':normalized}
const ascii=(b,start,n)=>String.fromCharCode(...b.slice(start,start+n))
export function imageSize(bytes,mime){
 const b=bytes,d=new DataView(b.buffer,b.byteOffset,b.byteLength)
 if(mime==='image/png'&&b.length>=24&&ascii(b,1,3)==='PNG')return {width:d.getUint32(16),height:d.getUint32(20),animated:false}
 if(mime==='image/webp'&&b.length>=30&&ascii(b,0,4)==='RIFF'&&ascii(b,8,4)==='WEBP'){
  const kind=ascii(b,12,4)
  if(kind==='VP8X')return {width:1+b[24]+(b[25]<<8)+(b[26]<<16),height:1+b[27]+(b[28]<<8)+(b[29]<<16),animated:Boolean(b[20]&2)}
  if(kind==='VP8 '&&b[23]===0x9d&&b[24]===1&&b[25]===0x2a)return {width:d.getUint16(26,true)&0x3fff,height:d.getUint16(28,true)&0x3fff,animated:false}
  if(kind==='VP8L'&&b[20]===0x2f)return {width:1+(((b[22]&0x3f)<<8)|b[21]),height:1+(((b[24]&15)<<10)|(b[23]<<2)|((b[22]&0xc0)>>6)),animated:false}
 }
 if(mime==='image/jpeg'&&b[0]===255&&b[1]===216){
  for(let i=2;i+8<b.length;){if(b[i]!==255){i++;continue}const marker=b[i+1];if(marker===0xda||marker===0xd9)break;if(marker===0xd8||marker===1){i+=2;continue}const size=d.getUint16(i+2);if(size<2||i+2+size>b.length)break;if([0xc0,0xc1,0xc2].includes(marker))return {height:d.getUint16(i+5),width:d.getUint16(i+7),animated:false};i+=size+2}
 }
 return null
}
/** @param {Uint8Array} bytes @param {string} mime @param {string} name @param {{type?:string,avatar?:boolean}} options */
export function validateMedia(bytes,mime,name,{type,avatar=false}={}){
 mime=mediaMime(mime,name);const spec=mediaTypes[mime]
 if(!spec||type&&spec[0]!==type||!bytes.length||bytes.length>spec[1])throw new WhatsAppError('Arquivo não aceito. Use um formato compatível e respeite o limite exibido.',413)
 let valid=false;const head=ascii(bytes,0,16)
 if(mime.startsWith('image/')){const size=imageSize(bytes,mime);valid=Boolean(size&&size.width>0&&size.height>0&&size.width*size.height<=25000000);if(mime==='image/webp'&&(!size||size.width!==512||size.height!==512||bytes.length>(size.animated?500:100)*1024))throw new WhatsAppError('Figurinhas devem ser WebP 512 × 512, até 100 KB estáticas ou 500 KB animadas.');if(avatar&&(!size||size.width>512||size.height>512||bytes.length>70000||!['image/jpeg','image/png'].includes(mime)))throw new WhatsAppError('Use uma foto JPEG/PNG de até 512 × 512 e 70 KB.')}
 else if(mime==='application/pdf')valid=head.startsWith('%PDF-')
 else if(mime==='text/plain'){try{new TextDecoder('utf-8',{fatal:true}).decode(bytes);valid=!bytes.includes(0)}catch{valid=false}}
 else if(mime.includes('openxmlformats'))valid=bytes[0]===0x50&&bytes[1]===0x4b&&bytes[2]===3&&bytes[3]===4
 else if(['application/msword','application/vnd.ms-excel','application/vnd.ms-powerpoint'].includes(mime))valid=bytes[0]===0xd0&&bytes[1]===0xcf&&bytes[2]===0x11&&bytes[3]===0xe0
 else if(['audio/mp4','video/mp4','video/3gpp'].includes(mime))valid=ascii(bytes,4,4)==='ftyp'
 else if(mime==='audio/ogg')valid=head.startsWith('OggS')&&new TextDecoder().decode(bytes.slice(0,160)).includes('OpusHead')
 else if(mime==='audio/amr')valid=head.startsWith('#!AMR')
 else if(mime==='audio/aac')valid=bytes[0]===255&&(bytes[1]&0xf6)===0xf0
 else if(mime==='audio/mpeg')valid=head.startsWith('ID3')||bytes[0]===255&&(bytes[1]&0xe0)===0xe0
 if(!valid)throw new WhatsAppError('O conteúdo do arquivo não corresponde ao formato informado.')
 const safeName=filename(name),ext=safeName.toLowerCase().split('.').pop(),canonical=extensions[ext]===mime?safeName:safeName.slice(0,170)+'.'+Object.keys(extensions).find(e=>extensions[e]===mime)
 return {mime,type:spec[0],filename:canonical,size:bytes.length}
}
export function graphFailure(data,status){
 const code=Number(data?.error?.code)
 return new WhatsAppError(code===131047?'A janela gratuita terminou. Aguarde uma nova mensagem do cliente.':code===190||code===102?'A autorização da Meta expirou. Peça ao administrador para reconectar.':code===10||code===200?'A Meta não concedeu acesso a este número. Confira as permissões do aplicativo.':code===131051?'Este formato de mensagem não é aceito pelo WhatsApp.':status===429||[4,17,130429,131048].includes(code)?'O WhatsApp limitou os envios. Aguarde antes de tentar novamente.':'A Meta não concluiu a operação. Confira a conexão e o formato dos dados.',code===131047?409:code===190||code===102?401:status===429?429:status>=500?503:400,status>=500)
}
export async function graphCall(token,method,path,body,params={},fetcher=fetch){
 if(!/^(?:\d{5,40})(?:\/(?:messages|media|phone_numbers|subscribed_apps|subscriptions|smb_app_data))?$/.test(path)&&path!=='debug_token')throw new WhatsAppError('Operação da Meta inválida.')
 const url=new URL('https://graph.facebook.com/'+GRAPH_VERSION+'/'+path);for(const [k,v] of Object.entries(params))if(v!==undefined)url.searchParams.set(k,String(v))
 let response;try{response=await fetcher(url,{method,headers:{Authorization:'Bearer '+token,...(body instanceof FormData?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:body instanceof FormData?body:JSON.stringify(body)}),redirect:'error',signal:AbortSignal.timeout(20000)})}catch{throw new WhatsAppError('Não foi possível confirmar a operação no WhatsApp. Confira o estado antes de reenviar.',503,method!=='GET')}
 let result;try{result=await response.json()}catch{throw new WhatsAppError('A Meta retornou uma resposta incompleta. Confira o envio antes de tentar novamente.',502,method!=='GET')}
 if(!response.ok||result?.error)throw graphFailure(result,response.status);return result
}
export async function webhookSignature(raw,secret,signature){
 if(!/^sha256=[a-f0-9]{64}$/.test(signature||''))return false
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign'])
 const digest=new Uint8Array(await crypto.subtle.sign('HMAC',key,raw)),given=signature.slice(7);let difference=0
 for(let i=0;i<32;i++)difference|=digest[i]^parseInt(given.slice(i*2,i*2+2),16)
 return difference===0
}
export async function hashBytes(bytes){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',typeof bytes==='string'?new TextEncoder().encode(bytes):bytes)),v=>v.toString(16).padStart(2,'0')).join('')}
const stamp=(value,now)=>{const n=Number(value)*1000;return Number.isFinite(n)&&n>0&&n<=now+60000&&n>=now-90*86400000?new Date(Math.min(n,now)).toISOString():null}
const list=value=>{if(value===undefined)return [];if(!Array.isArray(value)||value.length>20000)throw new WhatsAppError('Lote de eventos inválido.',413);return value}
// Reduce provider data to bounded, explicit fields. Never persist raw webhook objects.
export function messageDetails(message){
 if(message?.type==='interactive'){
  const v=message.interactive,reply=v?.button_reply||v?.list_reply
  if(reply)return {kind:'selection',id:text(reply.id,256),title:text(reply.title,24),description:text(reply.description,72)}
  if(['button','list'].includes(v?.type)){
   const options=v.type==='button'?list(v.action?.buttons).map(b=>b.reply):list(v.action?.sections).flatMap(s=>list(s.rows))
   try{return replyDetails('interactive',{kind:v.type==='button'?'buttons':'list',body:v.body?.text,header:v.header?.type==='text'?v.header.text:'',footer:v.footer?.text,button:v.action?.button,options})}catch{return null}
  }
 }
 if(message?.type==='location'){
  const v=message.location,latitude=Number(v?.latitude),longitude=Number(v?.longitude)
  if(!Number.isFinite(latitude)||Math.abs(latitude)>90||!Number.isFinite(longitude)||Math.abs(longitude)>180)return null
  return {latitude,longitude,name:text(v.name,160),address:text(v.address,500)}
 }
 if(message?.type==='contacts')return {contacts:list(message.contacts).slice(0,10).map(c=>({name:text(c.name?.formatted_name||[c.name?.first_name,c.name?.last_name].filter(Boolean).join(' '),160),phones:list(c.phones).slice(0,3).map(p=>({phone:text(p.phone,40),type:text(p.type,20)})),emails:list(c.emails).slice(0,3).map(e=>({email:text(e.email,254),type:text(e.type,20)})),org:text(c.org?.company,160)}))}
 return null
}
export function normalizeWebhook(body,config,now=Date.now()){
 const messages=[],statuses=[],contacts=[],mutations=[],sync_batches=[];let disconnected=false
 if(body?.object!=='whatsapp_business_account'){
  if(body?.messaging_product==='whatsapp'&&String(body.metadata?.phone_number_id)===config.phone_id&&list(body.history).length&&list(body.history).every(h=>list(h.errors).length&&list(h.errors).every(e=>Number(e.code)===2593109)))body={object:'whatsapp_business_account',entry:[{id:config.waba_id,changes:[{field:'history',value:body}]}]};else throw new WhatsAppError('Evento inválido.')
 }
 const own=String(config.expected_phone||config.display_phone||'').replace(/[^0-9]/g,'')
 const validId=v=>{try{return messageId(v)}catch{return null}}
 const normalizeMessage=(m,from,direction,source,contact)=>{
  let id;try{id=messageId(m.id);waId(from)}catch{return null}
  const at=stamp(m.timestamp,now);if(!at)return null
  const type=['text','image','audio','video','document','sticker','reaction','button','interactive','contacts','location','order','system','media_placeholder'].includes(m.type)?m.type:'unsupported',media=m[type],context=m.type==='reaction'?m.reaction?.message_id:m.context?.id,details=messageDetails(m)
  return {provider_id:id,from,direction,source,name:text(contact?.profile?.name,120),occurred_at:at,type,text:type==='text'?text(m.text?.body,4096):['image','video','document'].includes(type)?text(media?.caption,1024):type==='button'?text(m.button?.text,200):type==='interactive'?text(m.interactive?.button_reply?.title||m.interactive?.list_reply?.title||m.interactive?.body?.text,4096):type==='location'?details?.name||details?.address||'Localização':type==='contacts'?details?.contacts?.map(c=>c.name).filter(Boolean).join(', ').slice(0,1024)||'Contato compartilhado':'',details,context_id:validId(context),emoji:type==='reaction'?text(m.reaction?.emoji,32):null,opens_window:source==='live'&&direction==='in'&&!['reaction','system','unsupported','media_placeholder'].includes(type),media_id:['image','audio','video','document','sticker'].includes(type)&&/^\d{5,40}$/.test(media?.id||'')?media.id:null,mime:mediaMime(media?.mime_type,''),filename:media?.filename?filename(media.filename):null,sha256:text(media?.sha256,90),history_status:source==='history'&&['DELIVERED','ERROR','PENDING','PLAYED','READ','SENT'].includes(m.history_context?.status)?m.history_context.status:null}
 }
 for(const entry of list(body.entry)){
  if(String(entry.id)!==config.waba_id)continue
  for(const change of list(entry.changes)){
   const value=change.value
   if(change.field==='account_update'){
    if(['PARTNER_REMOVED','ACCOUNT_OFFBOARDED'].includes(value?.event)&&(!value.phone_number||String(value.phone_number).replace(/[^0-9]/g,'')===own))disconnected=true
    continue
   }
   if(String(value?.metadata?.phone_number_id)!==config.phone_id)continue
   if(change.field==='smb_app_state_sync'){
    const batch=[]
    for(const c of list(value.state_sync)){let phone;try{phone=waId(c.contact?.phone_number)}catch{continue}const ts=Number(c.metadata?.timestamp)*1000,at=Number.isFinite(ts)&&ts>0&&ts<=now+60000?new Date(Math.min(ts,now)).toISOString():null;if(c.type==='contact'&&['add','remove'].includes(c.action)&&at)batch.push({wa_id:phone,name:text(c.contact.full_name||c.contact.first_name,120),at,removed:c.action==='remove'})}
    if(batch.length)sync_batches.push({kind:'contacts',contacts:batch})
    // Compatibility directory events are processed through the durable queue in Edge.
    contacts.push(...batch.filter(c=>!c.removed))
    continue
   }
   if(change.field==='history'){
    for(const h of list(value.history)){
     if(list(h.errors).some(e=>Number(e.code)===2593109)){sync_batches.push({kind:'history',declined:true,messages:[]});continue}
     const metadata=h.metadata||{},phase=Number(metadata.phase),chunk_order=Number(metadata.chunk_order),progress=Number(metadata.progress)
     if(!Number.isInteger(phase)||phase<0||phase>2||!Number.isInteger(chunk_order)||chunk_order<0||!Number.isInteger(progress)||progress<0||progress>100)continue
     const batch=[]
     for(const thread of list(h.threads)){
      let peer;try{peer=waId(thread.id)}catch{continue}
      for(const m of list(thread.messages)){
       let sender;try{sender=waId(m.from);if(sender!==own&&sender!==peer||m.to&&waId(m.to)!==peer)continue}catch{continue}
       const normalized=normalizeMessage(m,peer,sender===own?'out':'in','history')
       if(normalized)batch.push(normalized)
      }
     }
     sync_batches.push({kind:'history',phase,chunk_order,progress,messages:batch})
    }
    // Media assets follow separately, with the same message ID. These never open a window.
    const batch=[]
    for(const m of list(value.messages)){
     let peer;try{peer=waId(m.from===own?m.to:m.from)}catch{continue}
     const normalized=normalizeMessage(m,peer,m.from===own?'out':'in','history')
     if(normalized?.media_id)batch.push({...normalized,history_media:true})
    }
    if(batch.length)sync_batches.push({kind:'history',messages:batch,media:true})
    continue
   }
   if(!['messages','smb_message_echoes'].includes(change.field))continue
   const echo=change.field==='smb_message_echoes'
   for(const m of list(echo?value.message_echoes:value.messages)){
    let from;try{from=waId(echo?m.to:m.from);if(echo&&waId(m.from)!==own)continue}catch{continue}
    const at=stamp(m.timestamp,now);if(!at)continue
    if(['edit','revoke'].includes(m.type)){
     const original=validId(m[m.type]?.original_message_id),replacement=m.edit?.message
     if(original)mutations.push({original,contact:from,direction:echo?'out':'in',at,remove:m.type==='revoke',body:replacement?.type==='text'?text(replacement.text?.body,4096):['image','video','document'].includes(replacement?.type)?text(replacement[replacement.type]?.caption,1024):null})
     continue
    }
    const normalized=normalizeMessage(m,from,echo?'out':'in',echo?'business_app':'live',list(value.contacts).find(c=>c.wa_id===from))
    if(normalized)messages.push(normalized)
   }
   if(echo)continue
   for(const s of list(value.statuses)){
    let recipient,id;try{recipient=waId(s.recipient_id);id=messageId(s.id)}catch{continue}
    const at=stamp(s.timestamp,now);if(!at||!['sent','delivered','read','failed'].includes(s.status))continue
    statuses.push({provider_id:id,recipient,status:s.status.toUpperCase(),occurred_at:at,request_id:typeof s.biz_opaque_callback_data==='string'&&/^duuk:[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(s.biz_opaque_callback_data)?s.biz_opaque_callback_data.slice(5):null,error_code:Number.isInteger(s.errors?.[0]?.code)?s.errors[0].code:null})
   }
  }
 }
 const sync_count=sync_batches.reduce((n,b)=>n+(b.messages?.length||b.contacts?.length||1),0)
 if(messages.length+statuses.length+contacts.length+mutations.length+sync_count>20000)throw new WhatsAppError('Lote de eventos muito grande.',413)
 return {messages,statuses,contacts,mutations,disconnected,sync_batches}
}
export function providerMessage(message,to){
 if(!['text','image','audio','video','document','sticker','reaction','contacts','location','interactive'].includes(message.type))throw new WhatsAppError('Somente respostas gratuitas são permitidas.')
 const base={messaging_product:'whatsapp',recipient_type:'individual',to:waId(to),type:message.type,biz_opaque_callback_data:'duuk:'+requestId(message.id)}
 if(message.type==='text')base.text={body:message.body,preview_url:false}
 else if(message.type==='interactive'){
  const d=replyDetails('interactive',message.details)
  base.interactive={type:d.kind==='buttons'?'button':'list',body:{text:d.body},...(d.header?{header:{type:'text',text:d.header}}:{}),...(d.footer?{footer:{text:d.footer}}:{}),action:d.kind==='buttons'?{buttons:d.options.map(o=>({type:'reply',reply:{id:o.id,title:o.title}}))}:{button:d.button,sections:[{title:'Opções',rows:d.options.map(o=>({id:o.id,title:o.title,...(o.description?{description:o.description}:{})}))}]}}
 }
 else if(message.type==='location'){const d=replyDetails('location',message.details);base.location={latitude:d.latitude,longitude:d.longitude,...(d.name?{name:d.name}:{}),...(d.address?{address:d.address}:{})}}
 else if(message.type==='contacts'){const d=replyDetails('contacts',message.details);base.contacts=d.contacts.map(c=>({name:{formatted_name:c.name,first_name:c.name},phones:c.phones,...(c.emails.length?{emails:c.emails}:{}),...(c.org?{org:{company:c.org}}:{})}))}
 else if(message.type==='reaction')base.reaction={message_id:messageId(message.context_provider_id),emoji:message.emoji||''}
 else{const media={id:graphId(message.media_id)};if(message.body&&['image','video','document'].includes(message.type))media.caption=message.body;if(message.type==='document')media.filename=filename(message.filename);base[message.type]=media}
 if(message.context_provider_id&&message.type!=='reaction')base.context={message_id:messageId(message.context_provider_id)}
 return base
}
export async function boundedBytes(stream,maximum=MAX_FILE){const reader=stream?.getReader();if(!reader)throw new WhatsAppError('Arquivo vazio.');const parts=[];let count=0;try{while(true){const r=await reader.read();if(r.done)break;count+=r.value.length;if(count>maximum){await reader.cancel();throw new WhatsAppError('Este arquivo ultrapassa o limite de 10 MB do painel.',413)}parts.push(r.value)}}finally{reader.releaseLock()}const result=new Uint8Array(count);let offset=0;for(const p of parts){result.set(p,offset);offset+=p.length}return result}
export function mediaUrl(value){try{const u=new URL(value);if(u.protocol==='https:'&&['lookaside.fbsbx.com','lookaside.whatsapp.net'].includes(u.hostname)&&!u.username&&!u.password&&!u.port&&u.pathname.startsWith('/whatsapp_business/attachments/'))return u.href}catch{}throw new WhatsAppError('A Meta não disponibilizou um endereço de mídia válido.',502)}
