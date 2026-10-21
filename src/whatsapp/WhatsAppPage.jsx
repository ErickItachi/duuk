import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../content/AuthContext'
import { Icon, RefreshButton } from '../admin/components'
import { EmptyState, ErrorState, LoadingPanel } from '../admin/forms'
import AppLogo from '../admin/AppLogo'
import { useUnsavedChanges } from '../admin/unsavedChanges'
import { useQuery } from '../office/useQuery'
import { useModuleNotifications } from '../admin/notificationContext.mjs'
import { whatsappFile, whatsappRequest as request } from './api'
import { acceptFiles, canReply, dateTime, emojis, fileKind, freeUntil, kindLabels, statusLabels } from './model.mjs'
import { ContactAnalytics, ContactAvatar, ContactEditor } from './Contacts'
import Configuration from './Configuration'
import MediaViewer from './MediaViewer'
import Recorder from './Recorder'
import { RichMessagePreview, RichMessageTools } from './RichMessages'
import './whatsapp.css'
const emptyDraft=()=>({text:'',file:null,reply:null,rich:null,id:crypto.randomUUID(),pending:false})
const shortTime=value=>value?new Date(value).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):''
const dayLabel=value=>new Date(value).toLocaleDateString('pt-BR',{day:'numeric',month:'long',year:'numeric'})
const dayKey=value=>new Date(value).toLocaleDateString('pt-BR')
const receiptEligible=(message,now=Date.now())=>message?.direction==='in'&&message.source==='live'&&Boolean(message.provider_id)&&!message.retracted_at&&!['reaction','system','unsupported'].includes(message.type)&&Number.isFinite(new Date(message.occurred_at).getTime())&&new Date(message.occurred_at).getTime()>=now-30*86400000
const phoneDigits=value=>{const digits=String(value||'').replace(/[^0-9]/g,'');return /^[1-9][0-9]{7,14}$/.test(digits)?digits:''}

// Keep the composer inside the visible viewport when a phone keyboard is open.
// The page still participates in the shell, so menus, updates and navigation remain available.
function useWorkspaceViewport(ref){
 useLayoutEffect(()=>{
  let frame,largestViewport=window.visualViewport?.height||window.innerHeight
  const update=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{
   const element=ref.current;if(!element)return
   const viewport=window.visualViewport;largestViewport=Math.max(largestViewport,viewport?.height||window.innerHeight)
   const focused=element.contains(document.activeElement)&&document.activeElement?.matches('input,textarea,[contenteditable=true]'),keyboard=Boolean(viewport&&(window.innerHeight-viewport.height>160||focused&&largestViewport-viewport.height>160)),nav=document.querySelector('.ds-bottom-nav'),navHeight=nav&&getComputedStyle(nav).display!=='none'?nav.getBoundingClientRect().height:0
   const available=(viewport?viewport.height+viewport.offsetTop:window.innerHeight)-element.getBoundingClientRect().top-(keyboard?0:navHeight)
   element.toggleAttribute('data-keyboard-open',keyboard)
   element.style.setProperty('--wa-viewport-height',Math.max(120,Math.floor(available))+'px')
  })}
  const observer=new ResizeObserver(update),main=ref.current?.closest('.admin-main');if(main)observer.observe(main)
  update();window.addEventListener('resize',update);window.visualViewport?.addEventListener('resize',update);window.visualViewport?.addEventListener('scroll',update)
  return()=>{cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('resize',update);window.visualViewport?.removeEventListener('resize',update);window.visualViewport?.removeEventListener('scroll',update)}
 },[ref])
}
function SharedDetails({message,onContact}){
 const details=message.details||{},location=details.location||(message.type==='location'?details:null),contacts=Array.isArray(details.contacts)?details.contacts:details.contacts?.contacts
 if(message.type==='location'&&location){
  const latitude=Number(location.latitude),longitude=Number(location.longitude),valid=location.latitude!==null&&location.longitude!==null&&location.latitude!==''&&location.longitude!==''&&Number.isFinite(latitude)&&Number.isFinite(longitude)&&Math.abs(latitude)<=90&&Math.abs(longitude)<=180
  return <div className="wa-location-card"><span className="wa-shared-icon"><Icon name="globe" size={22}/></span><div><strong>{location.name||'Localização compartilhada'}</strong>{location.address&&<p>{location.address}</p>}{valid&&<a href={'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(latitude+','+longitude)} target="_blank" rel="noopener noreferrer">Ver no mapa<Icon name="external" size={12}/></a>}</div></div>
 }
 if(message.type==='interactive'&&Array.isArray(details.options))return <div className="wa-interactive-card">{details.header&&<strong>{details.header}</strong>}{details.body&&<p>{details.body}</p>}{details.footer&&<small>{details.footer}</small>}<div className={'wa-interactive-options '+(details.kind==='list'?'is-list':'')} aria-label="Opções enviadas ao cliente">{details.options.slice(0,10).map((option,index)=><span key={option.id||index}>{details.kind==='list'&&<Icon name="list" size={12}/>}<span><strong>{option.title}</strong>{option.description&&<small>{option.description}</small>}</span></span>)}</div><small className="wa-interactive-note">{details.kind==='list'?(details.button||'Lista de opções'):'Opções de atendimento'} · O cliente responde pelo WhatsApp</small></div>
 if(message.type==='contacts'&&Array.isArray(contacts))return <div className="wa-shared-contacts">{contacts.slice(0,20).map((contact,index)=>{
  const name=typeof contact.name==='string'?contact.name:contact.name?.formatted_name||'Contato compartilhado',phone=contact.phones?.map(p=>phoneDigits(p.phone||p.wa_id)).find(Boolean),email=contact.emails?.find(p=>typeof p.email==='string')?.email||'',company=typeof contact.org==='string'?contact.org:contact.org?.company||''
  return <section className="wa-shared-contact" key={index}><span className="wa-shared-icon"><Icon name="user"/></span><div><strong>{name}</strong>{(contact.phones||[]).slice(0,5).map((p,i)=><small key={i}>{p.phone||p.wa_id}</small>)}{company&&<small>{company}</small>}<button type="button" className="admin-text-button" disabled={!phone} onClick={()=>onContact({prefill:{name,wa_id:phone,email,company}})}><Icon name="userPlus" size={13}/>Salvar nos contatos DUUK</button></div></section>
 })}</div>
 return null
}
function Attachment({file,onRemove}){
 const [preview,setPreview]=useState(null)
 useEffect(()=>{const url=URL.createObjectURL(file);queueMicrotask(()=>setPreview({file,url}));return()=>URL.revokeObjectURL(url)},[file])
 const url=preview?.file===file?preview.url:null
 return <div className="wa-attachment">{url&&(file.type.startsWith('image/')?<img src={url} alt="Prévia do anexo"/>:file.type.startsWith('audio/')?<audio controls src={url}/>:file.type.startsWith('video/')?<video controls playsInline src={url}/>:null)}<div><strong>{file.name}</strong><span>{Math.ceil(file.size/1024)} KB · {kindLabels[fileKind(file)]}</span></div><button type="button" className="admin-icon-button" onClick={onRemove} aria-label="Remover anexo"><Icon name="close"/></button></div>
}
function ThreadPane({threadId,status,draft,setDraft,directory,onBack,onUpdated,onContact,onUnsafe,refreshRevision,notify}){
 const [starred,setStarred]=useState(false),[older,setOlder]=useState([]),[busy,setBusy]=useState(false),[sending,setSending]=useState(false),[recording,setRecording]=useState(false),[error,setError]=useState(''),[emojiOpen,setEmojiOpen]=useState(false),[reaction,setReaction]=useState(null),[media,setMedia]=useState(null),[analytics,setAnalytics]=useState(false),[typingEnabled,setTypingEnabled]=useState(false),[receiptBusy,setReceiptBusy]=useState(false),[now,setNow]=useState(()=>Date.now()),running=useRef(false),input=useRef(null),log=useRef(null),stick=useRef(true),anchor=useRef(null),paging=useRef(false),alive=useRef(true),seen=useRef(''),lastMessage=useRef(''),textarea=useRef(null),olderRef=useRef([]),historyRevision=useRef(refreshRevision),typingTimer=useRef(null),typingLast=useRef(0),typingContext=useRef(null),receiptRunning=useRef(false)
 const scrollBottom=useCallback(()=>{if(log.current)log.current.scrollTop=log.current.scrollHeight},[])
 const query=useQuery(useCallback(()=>request({action:'messages',thread_id:threadId,starred}),[threadId,starred])),thread=query.data?.thread?.id===threadId?query.data.thread:null,reload=query.reload
 useUnsavedChanges(recording||sending)
 useEffect(()=>{onUnsafe(recording||sending);return()=>onUnsafe(false)},[recording,sending,onUnsafe])
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;clearTimeout(typingTimer.current)}},[])
 useEffect(()=>{const timer=setInterval(()=>{setNow(Date.now());if(document.visibilityState==='visible'&&navigator.onLine&&!paging.current)reload()},15000);return()=>clearInterval(timer)},[reload])
 useEffect(()=>{if(!thread||!query.data?.items.length||document.visibilityState!=='visible'||starred)return;const latest=query.data.items.filter(m=>m.direction==='in').at(-1)?.occurred_at;if(latest&&seen.current!==latest){seen.current=latest;request({action:'seen',thread_id:threadId,seen_at:latest}).then(onUpdated).catch(()=>{seen.current=''})}},[thread,query.data?.items,threadId,starred,onUpdated])
 const items=[...new Map([...older,...(query.data?.items||[])].map(m=>[m.id,m])).values()].sort((a,b)=>a.occurred_at.localeCompare(b.occurred_at)||(Number(a.sequence||0)-Number(b.sequence||0))||a.id.localeCompare(b.id))
 useEffect(()=>{const latest=query.data?.items.at(-1)?.id||'';if(latest!==lastMessage.current&&(!lastMessage.current||stick.current))scrollBottom();lastMessage.current=latest},[query.data?.items,scrollBottom])
 useLayoutEffect(()=>{if(anchor.current&&log.current){log.current.scrollTop=anchor.current.top+log.current.scrollHeight-anchor.current.height;anchor.current=null}},[older])
 const allowed=canReply(status,thread,now),audioOrSticker=draft.file&&['audio','sticker'].includes(fileKind(draft.file))
 useLayoutEffect(()=>{olderRef.current=older},[older])
 useLayoutEffect(()=>{typingContext.current={enabled:typingEnabled,allowed,pending:draft.pending,recording,sending,text:draft.text,items}},[typingEnabled,allowed,draft.pending,recording,sending,draft.text,items])
 useEffect(()=>{if(!typingEnabled||!allowed||draft.pending||recording||sending)clearTimeout(typingTimer.current)},[typingEnabled,allowed,draft.pending,recording,sending])
 const reconcile=useCallback(message=>{if(!message?.id)return;setOlder(previous=>Object.assign(previous.map(item=>item.id===message.id?message:item),{complete:previous.complete}))},[])
 const refreshVisibleOlder=useCallback(async()=>{
  if(!log.current||!olderRef.current.length)return
  const bounds=log.current.getBoundingClientRect(),olderIds=new Set(olderRef.current.map(item=>item.id)),visible=[...log.current.querySelectorAll('[data-message-id]')].filter(element=>{const box=element.getBoundingClientRect();return olderIds.has(element.dataset.messageId)&&box.bottom>=bounds.top&&box.top<=bounds.bottom}).slice(0,30)
  const results=await Promise.allSettled(visible.map(element=>request({action:'get_message',id:element.dataset.messageId})))
  if(!alive.current)return
  results.forEach(result=>{if(result.status==='fulfilled')reconcile(result.value)})
  const failed=results.find(result=>result.status==='rejected');if(failed)throw failed.reason
 },[reconcile])
 useEffect(()=>{if(historyRevision.current===refreshRevision)return;historyRevision.current=refreshRevision;reload();refreshVisibleOlder().catch(e=>notify(e.message,true))},[refreshRevision,reload,refreshVisibleOlder,notify])
 useLayoutEffect(()=>{if(!textarea.current)return;textarea.current.style.height='auto';textarea.current.style.height=Math.min(140,textarea.current.scrollHeight)+'px'},[draft.text,thread])
 const refresh=async()=>{const data=await reload();await onUpdated();return data}
 const check=async()=>{if(running.current)return;running.current=true;setSending(true);setError('');try{const m=await request({action:'get_message',id:draft.id});if(['SENT','DELIVERED','READ'].includes(m.status)){setDraft(emptyDraft());notify('Envio confirmado.')}else if(m.status==='FAILED'){setDraft(d=>({...d,pending:false,id:crypto.randomUUID()}));setError(m.last_error||'O envio falhou. Você pode revisar e tentar novamente.')}else setError('A Meta ainda não confirmou o resultado. Não reenvie esta mensagem.');await refresh()}catch(e){if(e.message==='Mensagem não encontrada.'){setDraft(d=>({...d,pending:false}));setError('Nenhum envio foi registrado. Revise e tente novamente; a mesma tentativa será reutilizada com proteção contra duplicação.')}else setError(e.message)}finally{running.current=false;setSending(false)}}
 const send=async e=>{
  e.preventDefault();if(e.target!==e.currentTarget||running.current||!allowed||draft.pending||recording)return
  if(audioOrSticker&&draft.text.trim()){setError('Envie áudio e figurinha sem legenda. Seu texto continua aqui; remova-o para enviar este anexo.');return}
  running.current=true;setSending(true);setError('');setDraft(d=>({...d,pending:true}))
  try{
   const body={action:'send',id:draft.id,thread_id:threadId,type:draft.rich?.type||(draft.file?fileKind(draft.file):'text'),details:draft.rich?.details,text:draft.text,reply_to:draft.reply?.id||null},m=draft.file?await whatsappFile(body,draft.file):await request(body)
   if(['SENT','DELIVERED','READ'].includes(m.status)){setDraft(emptyDraft());notify('Mensagem enviada.')}else if(m.status==='FAILED'){setDraft(d=>({...d,pending:false,id:crypto.randomUUID()}));setError(m.last_error||'Não foi possível enviar.')}else setError(m.last_error||'Confira a confirmação antes de reenviar.')
   stick.current=true;await refresh();scrollBottom()
  }catch(e){setError(e.message+' Use Conferir envio antes de tentar novamente.')}finally{running.current=false;setSending(false)}
 }
 const attach=file=>{if(!file||draft.rich)return;if(file.size>(fileKind(file)==='image'?5:10)*1024*1024){setError('O painel aceita até 10 MB por arquivo, ou 5 MB por imagem.');return}if(!acceptFiles.split(',').some(ext=>file.name.toLowerCase().endsWith(ext))){setError('Formato não aceito. Use os formatos indicados abaixo.');return}setDraft(d=>({...d,file}));setError('')}
 const act=async(body)=>{if(busy)return;setBusy(true);try{
  const result=await request(body)
  if(['star','get_message'].includes(body.action))reconcile(result)
  if(body.action==='send'){
   if(['UNCERTAIN','SENDING','PREPARING','FAILED'].includes(result.status))notify(result.last_error||'A reação ainda não foi confirmada. Use Conferir na tentativa.',true)
   if(body.type==='reaction'&&body.reply_to)reconcile(await request({action:'get_message',id:body.reply_to}))
  }
  if(body.action==='star'&&!body.starred&&starred)setOlder(old=>Object.assign(old.filter(m=>m.id!==body.id),{complete:old.complete}))
  await refresh()
 }catch(e){notify(e.message,true)}finally{if(alive.current)setBusy(false)}}
 const confirmReceipt=async(kind,message)=>{
  if(receiptRunning.current||!navigator.onLine||document.visibilityState!=='visible'||!receiptEligible(message)||!status.connected)return
  receiptRunning.current=true;setReceiptBusy(true)
  try{
   const result=await request({action:kind,id:message.id})
   if(result?.success!==true)throw Error('O WhatsApp não confirmou esta ação.')
   if(!alive.current)return
   reconcile(await request({action:'get_message',id:message.id}));await refresh()
   if(kind==='read')notify('Leitura desta mensagem e das anteriores confirmada no WhatsApp.')
  }catch(e){if(alive.current){if(kind==='typing'){setTypingEnabled(false);notify(e.message+' O indicador foi desativado; ative novamente para tentar.',true)}else notify(e.message,true)}}finally{receiptRunning.current=false;if(alive.current)setReceiptBusy(false)}
 }
 const confirmVisibleRead=()=>{
  if(!log.current)return
  const bounds=log.current.getBoundingClientRect(),visible=new Set([...log.current.querySelectorAll('[data-message-id]')].filter(element=>{const box=element.getBoundingClientRect();return box.bottom>bounds.top&&box.top<bounds.bottom}).map(element=>element.dataset.messageId)),message=items.filter(m=>visible.has(m.id)&&receiptEligible(m)&&!m.business_read_at).at(-1)
  if(!message){notify('Role até uma mensagem recente recebida para confirmar sua leitura.');return}
  confirmReceipt('read',message)
 }
 const typed=value=>{
  setDraft(d=>({...d,text:value}));clearTimeout(typingTimer.current)
  if(!typingEnabled||!value.trim()||!allowed||draft.pending||recording||sending)return
  typingTimer.current=setTimeout(()=>{
   const context=typingContext.current
   if(!context?.enabled||!context.allowed||context.pending||context.recording||context.sending||!context.text.trim()||!navigator.onLine||document.visibilityState!=='visible'||receiptRunning.current||Date.now()-typingLast.current<27000)return
   const target=context.items.filter(m=>receiptEligible(m)).at(-1);if(!target)return
   typingLast.current=Date.now();confirmReceipt('typing',target)
  },900)
 }
 const loadOlder=async()=>{if(paging.current||!items.length)return;paging.current=true;setBusy(true);try{const first=items[0],data=await request({action:'messages',thread_id:threadId,starred,before:first.occurred_at,before_id:first.id,before_sequence:first.sequence});anchor.current=log.current?{top:log.current.scrollTop,height:log.current.scrollHeight}:null;setOlder(old=>[...data.items,...old]);paging.current=data.has_more?'more':false;if(!data.has_more)setOlder(old=>Object.assign([...old],{complete:true}))}catch(e){notify(e.message,true)}finally{paging.current=false;setBusy(false)}}
 if(!thread)return query.error?<ErrorState onRetry={reload}>{query.error}</ErrorState>:<LoadingPanel label="Abrindo conversa…"/>
 return <section className="wa-thread" aria-label={'Atendimento de '+thread.contact.name}>
  <header className="wa-thread-head">
   <button className="admin-icon-button wa-back" onClick={onBack} aria-label="Voltar às conversas"><Icon name="back"/></button>
   <ContactAvatar contact={thread.contact}/>
   <button className="wa-contact-title" onClick={()=>onContact(thread.contact)} title="Editar contato"><strong>{thread.contact.name}</strong><span>{thread.contact.company?thread.contact.company+' · ':''}+{thread.contact.wa_id}</span></button>
   <span className={'wa-thread-state '+(thread.status==='resolved'?'is-resolved':'')}><i/>{thread.status==='resolved'?'Concluído':'Em atendimento'}</span>
   <div className="wa-head-actions">{status.connected&&items.some(m=>receiptEligible(m)&&!m.business_read_at)&&<button type="button" className="admin-icon-button" aria-label="Confirmar leitura" title="Confirma no WhatsApp a última mensagem recebida visível e todas as anteriores. Não confirma mensagens do histórico sincronizado." disabled={receiptBusy||busy||!navigator.onLine} onClick={confirmVisibleRead}><Icon name="checkCircle"/></button>}<button className="admin-icon-button" aria-label="Dados do contato" title="Dados do contato" onClick={()=>setAnalytics(true)}><Icon name="chart"/></button><button className="admin-icon-button" aria-label={starred?'Ver todas as mensagens':'Ver mensagens marcadas'} title={starred?'Ver todas as mensagens':'Mensagens marcadas'} aria-pressed={starred} onClick={()=>{setOlder([]);setStarred(s=>!s)}}><Icon name="bookmark"/></button></div>
  </header>
  <div className="wa-thread-tools"><label><Icon name="user" size={13}/><span>Responsável</span><select aria-label="Responsável pela conversa" value={thread.assigned_to||''} disabled={busy} onChange={e=>act({action:'thread_update',thread_id:threadId,version:thread.version,assigned_to:e.target.value||null})}><option value="">Sem responsável</option>{directory.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><button className="admin-text-button wa-resolve" disabled={busy} onClick={()=>act({action:'thread_update',thread_id:threadId,version:thread.version,status:thread.status==='open'?'resolved':'open'})}><Icon name={thread.status==='open'?'check':'restore'} size={14}/>{thread.status==='open'?'Concluir atendimento':'Reabrir atendimento'}</button></div>
  {query.error&&<ErrorState onRetry={reload}>{query.error}</ErrorState>}
  <div className="wa-messages" ref={log} onScroll={()=>{const el=log.current;stick.current=el.scrollHeight-el.scrollTop-el.clientHeight<220}} aria-label={starred?'Mensagens marcadas':'Histórico da conversa'}>
   {query.data.has_more&&!older.complete&&<button className="admin-text-button wa-history-button" disabled={busy} onClick={loadOlder}><Icon name="history" size={14}/>Carregar mensagens anteriores</button>}
   {!!older.length&&<button className="admin-text-button wa-history-button" disabled={busy} onClick={()=>{setBusy(true);refreshVisibleOlder().catch(e=>notify(e.message,true)).finally(()=>{if(alive.current)setBusy(false)})}}>Atualizar mensagens anteriores visíveis<Icon name="refresh" size={12}/></button>}
   {!items.length&&<div className="wa-history-empty"><Icon name={starred?'bookmark':'message'} size={28}/><EmptyState>{starred?'Você ainda não marcou mensagens nesta conversa.':'As mensagens aparecerão depois da conexão oficial e do contato do cliente.'}</EmptyState></div>}
   {items.map((m,index)=><Fragment key={m.id}>
    {(!index||dayKey(items[index-1].occurred_at)!==dayKey(m.occurred_at))&&<div className="wa-day"><span>{dayLabel(m.occurred_at)}</span></div>}
    <article className={'wa-bubble '+(m.direction==='out'?'is-out':'is-in')+(m.retracted_at?' is-retracted':'')} data-message-id={m.id}>
     <div className="wa-sender">{m.direction==='out'?(m.source==='business_app'?'DUUK · WhatsApp Business':m.source==='history'?'DUUK · histórico':'Equipe DUUK'):thread.contact.name.split(' ')[0]}</div>
     {m.context_provider_id&&<blockquote><Icon name="reply" size={12}/><span>{items.find(item=>item.provider_id===m.context_provider_id)?.body?.slice(0,120)||'Respondendo a uma mensagem desta conversa'}</span></blockquote>}
     {m.retracted_at?<p className="wa-retracted"><Icon name="info" size={13}/>Mensagem apagada no WhatsApp.</p>:<>
      {m.type!=='text'&&!['contacts','location','interactive'].includes(m.type)&&<div className="wa-message-kind"><Icon name={['document','image','video'].includes(m.type)?'attachment':m.type==='audio'?'headphones':'message'}/><span>{kindLabels[m.type]||'Mensagem'}{m.filename?' · '+m.filename:''}</span></div>}
      <SharedDetails message={m} onContact={onContact}/>
      {m.body&&!(m.type==='interactive'&&m.details?.options)&&<p>{m.body}</p>}
      {m.media_id&&<button className={'wa-media-button wa-media-button--'+m.type} onClick={()=>setMedia(m)}><span className="wa-media-icon"><Icon name={m.type==='audio'?'headphones':m.type==='video'?'play':m.type==='image'||m.type==='sticker'?'imagePlus':'document'} size={21}/></span><span>Abrir {kindLabels[m.type]?.toLowerCase()||'arquivo'}<small>{m.filename||'Visualização privada'}{m.bytes?' · '+Math.ceil(m.bytes/1024)+' KB':''}</small></span><Icon name="right" size={15}/></button>}
     </>}
     <footer>{m.source==='history'&&<span className="wa-history-tag" title="Mensagem recuperada na sincronização oficial"><Icon name="history" size={10}/>Histórico</span>}{m.business_read_at&&m.direction==='in'&&<span className="wa-business-read" title={'Leitura confirmada no WhatsApp em '+dateTime(m.business_read_at)}><Icon name="check" size={10}/>Leitura confirmada</span>}{m.edited_at&&<span>Editada</span>}{m.starred&&<Icon name="bookmark" size={11}/>}<time dateTime={m.occurred_at} title={dateTime(m.occurred_at)}>{shortTime(m.occurred_at)}</time>{m.direction==='out'&&<span className={'wa-delivery '+(m.status==='READ'?'is-read':'')}><Icon name={m.status==='FAILED'?'alertCircle':['PREPARING','SENDING','UNCERTAIN'].includes(m.status)?'clock':'check'} size={12}/>{statusLabels[m.status]}</span>}</footer>
     {m.last_error&&<p className="wa-send-error">{m.last_error}</p>}
     {!!m.reactions?.length&&<div className="wa-reactions">{m.reactions.map(r=><span key={r.sender} title={r.sender==='business'?'Equipe DUUK':'Contato'}>{r.emoji}</span>)}</div>}
     <div className="wa-message-actions"><button aria-label={m.starred?'Desmarcar mensagem':'Marcar mensagem'} title={m.starred?'Desmarcar mensagem':'Marcar mensagem'} className="admin-icon-button" disabled={busy} onClick={()=>act({action:'star',id:m.id,starred:!m.starred})}><Icon name="bookmark" size={14}/></button>{m.provider_id&&!m.retracted_at&&<><button className="admin-icon-button" aria-label="Responder mensagem" title="Responder mensagem" disabled={!allowed||draft.pending} onClick={()=>{setDraft(d=>({...d,reply:m}));textarea.current?.focus()}}><Icon name="reply" size={14}/></button><button className="admin-icon-button" aria-label="Reagir à mensagem" title="Reagir à mensagem" disabled={!allowed||busy} onClick={()=>setReaction(reaction===m.id?null:m.id)}><span aria-hidden="true">☺</span></button></>}{['PREPARING','SENDING','UNCERTAIN'].includes(m.status)&&<button className="admin-text-button" disabled={busy} onClick={()=>act({action:'get_message',id:m.id})}>Conferir</button>}</div>
     {reaction===m.id&&<div className="wa-emoji-picker" role="group" aria-label="Escolher reação">{[...emojis,''].map(emoji=><button key={emoji} type="button" disabled={busy} aria-label={emoji?'Reagir com '+emoji:'Remover reação'} onClick={()=>{setReaction(null);act({action:'send',id:crypto.randomUUID(),thread_id:threadId,type:'reaction',reply_to:m.id,emoji})}}>{emoji||'×'}</button>)}</div>}
    </article>
   </Fragment>)}
  </div>
  <div className={'wa-window '+(allowed?'is-available':'')} role="status"><Icon name={allowed?'shield':thread.status==='resolved'?'checkCircle':'info'} size={13}/><span>{!status.connected?'Conexão oficial pendente.':thread.status==='resolved'?'Atendimento concluído. Reabra para responder.':allowed?'Atendimento gratuito até '+dateTime(new Date(freeUntil(thread)).toISOString()):'Aguarde uma nova mensagem do cliente para responder gratuitamente.'}</span></div>
  <form className={'wa-composer '+(recording?'is-recording':'')} onSubmit={send}>
   {draft.reply&&<div className="wa-quote"><Icon name="reply" size={15}/><span><strong>Respondendo a {draft.reply.direction==='out'?'DUUK':thread.contact.name.split(' ')[0]}</strong>{draft.reply.body?.slice(0,120)||kindLabels[draft.reply.type]}</span><button type="button" className="admin-icon-button" aria-label="Cancelar resposta" disabled={draft.pending} onClick={()=>setDraft(d=>({...d,reply:null}))}><Icon name="close" size={15}/></button></div>}
   {draft.file&&<Attachment file={draft.file} onRemove={()=>{if(!draft.pending)setDraft(d=>({...d,file:null}))}}/>}
   {draft.rich&&<RichMessagePreview value={draft.rich} onRemove={()=>setDraft(d=>({...d,rich:null}))} disabled={draft.pending||sending}/>}
   <div className="wa-compose-field"><textarea ref={textarea} aria-label="Mensagem do WhatsApp" placeholder={allowed?'Escreva uma resposta…':'Aguardando atendimento disponível'} value={draft.text} maxLength={draft.file?1024:4096} rows={1} disabled={!allowed||draft.pending||recording||Boolean(draft.rich)} onChange={e=>{e.currentTarget.style.height='auto';e.currentTarget.style.height=Math.min(120,e.currentTarget.scrollHeight)+'px';typed(e.target.value)}} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing&&window.matchMedia('(pointer:fine)').matches){e.preventDefault();if(!draft.pending&&allowed&&!recording&&(draft.text.trim()||draft.file||draft.rich))e.currentTarget.form.requestSubmit()}}}/>
    {emojiOpen&&<div className="wa-emoji-picker wa-compose-emojis" role="group" aria-label="Emojis para mensagem">{emojis.map(emoji=><button type="button" key={emoji} onClick={()=>{setDraft(d=>({...d,text:(d.text+emoji).slice(0,d.file?1024:4096)}));setEmojiOpen(false);textarea.current?.focus()}}>{emoji}</button>)}</div>}
    <div className="wa-composer-tools"><div className="wa-actions"><button type="button" className="admin-icon-button" aria-label="Anexar arquivo" title="Imagem, áudio, vídeo, figurinha ou documento" disabled={!allowed||draft.pending||recording||Boolean(draft.rich)} onClick={()=>input.current.click()}><Icon name="attachment"/></button><input hidden ref={input} type="file" accept={acceptFiles} onChange={e=>{attach(e.target.files[0]);e.target.value=''}}/><button type="button" className="admin-icon-button" aria-label="Adicionar emoji" title="Emojis" aria-expanded={emojiOpen} disabled={!allowed||draft.pending||recording||Boolean(draft.rich)} onClick={()=>setEmojiOpen(v=>!v)}>☺</button><RichMessageTools disabled={!allowed||draft.pending||sending||recording||Boolean(draft.file)||Boolean(draft.rich)||Boolean(draft.text.trim())} onPrepare={rich=>{setEmojiOpen(false);setDraft(d=>({...d,rich}))}}/><Recorder disabled={!allowed||draft.pending||Boolean(draft.file)||Boolean(draft.rich)} onFile={attach} onError={setError} onRecording={setRecording}/></div>{draft.pending?<button type="button" className="admin-button wa-send is-check" disabled={sending} onClick={check}><Icon name="refresh" size={15}/>{sending?'Conferindo…':'Conferir envio'}</button>:<button className="admin-button wa-send" disabled={!allowed||sending||recording||!draft.file&&!draft.rich&&!draft.text.trim()}><span className="ds-visually-hidden">{sending?'Enviando…':'Enviar'}</span><Icon name="send" size={16}/></button>}</div>
   </div>
   <div className="wa-composer-footnote"><details className="wa-file-help"><summary>Formatos e limites<Icon name="info" size={11}/></summary><p>Imagens JPEG/PNG até 5 MB. Áudio, vídeo, PDF, TXT e Office até 10 MB. Figurinhas WebP 512 × 512: 100 KB estáticas ou 500 KB animadas. Gravações de até 2 minutos.</p></details><label className="wa-typing-option" title="Ao ativar, o cliente verá quando você digitar. Isso também confirma a leitura da mensagem recebida e das anteriores."><input type="checkbox" checked={typingEnabled} disabled={!status.connected||receiptBusy} onChange={e=>{clearTimeout(typingTimer.current);setTypingEnabled(e.target.checked)}}/><span>Mostrar digitação</span><Icon name="info" size={10}/></label>{draft.text.length>0&&<span className="wa-character-count">{draft.text.length}/{draft.file?1024:4096}</span>}</div>
   {error&&<ErrorState>{error}</ErrorState>}
  </form>{media&&<MediaViewer message={media} onClose={()=>setMedia(null)}/>} {analytics&&<ContactAnalytics thread={thread} onClose={()=>setAnalytics(false)}/>}
 </section>
}
export default function WhatsAppPage({notify}){
 const {refresh:refreshNotifications}=useModuleNotifications()
 const auth=useAuth(),[params,setParams]=useSearchParams(),[config,setConfig]=useState(()=>params.get('configurar')==='1'),[tab,setTab]=useState('threads'),[search,setSearch]=useState(''),[filter,setFilter]=useState('open'),[offset,setOffset]=useState(0),[selected,setSelected]=useState(null),[contact,setContact]=useState(null),[drafts,setDrafts]=useState({}),[opening,setOpening]=useState(false),[unsafe,setUnsafe]=useState(false),[refreshRevision,setRefreshRevision]=useState(0),workspace=useRef(null)
 const statusQuery=useQuery(useCallback(()=>request({action:'status'}),[])),directoryQuery=useQuery(useCallback(()=>request({action:'directory'}),[])),list=useQuery(useCallback(()=>request({action:tab,search,filter,offset}),[tab,search,filter,offset])),reloadList=list.reload,reloadStatus=statusQuery.reload
 useUnsavedChanges(Object.values(drafts).some(d=>d.text||d.file||d.rich||d.pending))
 useEffect(()=>{if(params.has('configurar'))setParams({}, {replace:true})},[params,setParams])
 useEffect(()=>{const timer=setInterval(()=>{if(document.visibilityState==='visible'&&navigator.onLine){reloadList();reloadStatus()}},30000);return()=>clearInterval(timer)},[reloadList,reloadStatus])
 const updateDraft=updater=>setDrafts(old=>({...old,[selected]:typeof updater==='function'?updater(old[selected]):updater}))
 const openThread=async c=>{if(unsafe){notify('Conclua a gravação ou o envio antes de trocar de conversa.',true);return}if(opening)return;setOpening(true);try{const t=await request({action:'open_thread',contact_id:c.id});setDrafts(d=>d[t.id]?d:{...d,[t.id]:emptyDraft()});setSelected(t.id);setTab('threads');setSearch('');setOffset(0);await reloadList()}catch(e){notify(e.message,true)}finally{setOpening(false)}}
 const choose=t=>{if(unsafe){notify('Conclua a gravação ou o envio antes de trocar de conversa.',true);return}setDrafts(d=>d[t.id]?d:{...d,[t.id]:emptyDraft()});setSelected(t.id)}
 useWorkspaceViewport(workspace)
 const status=statusQuery.data,admin=auth.profile?.is_super_admin
 const refreshReadState=useCallback(async()=>{const result=await reloadList();await refreshNotifications?.();return result},[reloadList,refreshNotifications])
 const refreshAll=async()=>{const results=await Promise.all([reloadStatus(),refreshReadState()]);setRefreshRevision(value=>value+1);return results.find(result=>result?.failed)||results[0]}
 return <><div className={'wa-workspace '+(selected?'has-thread':'')} ref={workspace}>
  <header className="wa-workspace-head"><div className="wa-workspace-identity"><span className="wa-duuk-mark"><img src="/media/duuk-logo-white.png" alt="DUUK"/></span><div><span className="wa-eyebrow">Relacionamento e comercial</span><h1>Central de atendimento</h1></div></div><div className="wa-workspace-actions">{auth.hasPermission('ai')&&<button type="button" className="admin-icon-button wa-ai-entry" aria-label="Abrir DUUK AI" title="DUUK AI" onClick={()=>document.querySelector('.duuk-ai-help')?.click()}><Icon name="spark" size={17}/></button>}<RefreshButton onRefresh={refreshAll}/>{admin&&<button className="admin-button admin-button--secondary wa-connection-button" aria-label="Conexão" onClick={()=>setConfig(true)}><Icon name="settings" size={15}/><span>Conexão</span></button>}</div></header>
  {status&&statusQuery.error&&<ErrorState onRetry={reloadStatus}>{statusQuery.error}</ErrorState>}
  {!status?<div className="wa-initial-state">{statusQuery.error?<ErrorState onRetry={reloadStatus}>{statusQuery.error}</ErrorState>:<LoadingPanel label="Preparando sua central…"/>}</div>:<div className={'wa-shell '+(selected?'has-thread':'')}>
   <aside className="wa-sidebar" aria-label="Caixa de atendimento">
    <div className="wa-brand"><AppLogo app="whatsapp" size={30}/><div><strong>{status.verified_name||'WhatsApp da DUUK'}</strong><span className={status.connected?'is-connected':''}><i/>{status.connected?'Conectado · atendimento gratuito':status.configured?'Conexão precisa de atenção':'Conexão oficial pendente'}</span></div></div>
    {!status.connected&&<div className="wa-pending"><Icon name="phone2" size={16}/><p>{status.expected_phone?'Número comercial salvo. ':''}Seu WhatsApp Business continua no celular. {admin?<button type="button" onClick={()=>setConfig(true)}>Confira a ativação pela Meta<Icon name="right" size={11}/></button>:'O administrador precisa ativar a conexão oficial.'}</p></div>}
    <div className="wa-sidebar-heading"><h2>{tab==='threads'?'Caixa de entrada':'Seus contatos'}</h2><button className="admin-icon-button wa-add-contact" aria-label="Adicionar contato" title="Adicionar contato" onClick={()=>setContact({})}><Icon name="compose" size={18}/></button></div>
    <div className="wa-tabs" role="group" aria-label="Área do WhatsApp">{[['threads','Conversas','message'],['contacts','Contatos','users']].map(([key,label,icon])=><button key={key} type="button" aria-pressed={tab===key} onClick={()=>{setTab(key);setOffset(0);setSearch('')}}><Icon name={icon} size={14}/>{label}</button>)}</div>
    <label className="wa-search"><Icon name="search" size={16}/><input aria-label="Pesquisar contatos ou conversas" placeholder="Buscar nome, número ou empresa" value={search} maxLength={160} onChange={e=>{setSearch(e.target.value);setOffset(0)}}/>{search&&<button type="button" aria-label="Limpar pesquisa" onClick={()=>{setSearch('');setOffset(0)}}><Icon name="close" size={13}/></button>}</label>
    <div className="wa-list-heading">{tab==='threads'?<label className="wa-filter-wrap"><Icon name="filter" size={13}/><select className="wa-filter" aria-label="Filtrar conversas" value={filter} onChange={e=>{setFilter(e.target.value);setOffset(0)}}>{[['open','Em atendimento'],['mine','Minhas conversas'],['unassigned','Sem responsável'],['resolved','Concluídas'],['all','Todas as conversas']].map(([v,l])=><option value={v} key={v}>{l}</option>)}</select></label>:<span>Agenda compartilhada</span>}{list.data&&!list.error&&<small>{list.data.items.length} nesta página</small>}</div>
    {list.error&&<ErrorState onRetry={reloadList}>{list.error}</ErrorState>}
    <div className="wa-contact-list" aria-busy={list.loading}>
     {list.loading&&!list.data?<div className="wa-list-loading" role="status">Carregando…</div>:!list.data?.items.length?<div className="wa-list-empty"><Icon name={tab==='contacts'?'users':'inbox'} size={24}/><strong>{search?'Nenhum resultado':tab==='contacts'?'Sua agenda começa aqui':'Tudo em dia por aqui'}</strong><p>{search?'Tente outro nome ou número.':tab==='contacts'?'Cadastre seus contatos para organizar o atendimento.':'Nenhuma conversa neste filtro.'}</p>{tab==='contacts'&&!search&&<button type="button" className="admin-text-button" onClick={()=>setContact({})}>Adicionar contato<Icon name="plus" size={13}/></button>}</div>:list.data.items.map(item=>{
      const c=tab==='contacts'?item:item.contact,selectedItem=item.id===selected&&tab==='threads'
      return <div key={item.id} className={'wa-list-row '+(selectedItem?'is-selected':'')}><button className="wa-list-main" disabled={opening} aria-current={selectedItem?'true':undefined} onClick={()=>tab==='contacts'?openThread(c):choose(item)}><ContactAvatar contact={c}/><span className="wa-list-copy"><span className="wa-list-topline"><strong>{c.name}</strong>{tab==='threads'&&item.last_message_at&&<time dateTime={item.last_message_at}>{dayKey(item.last_message_at)===dayKey(new Date())?shortTime(item.last_message_at):new Date(item.last_message_at).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}</time>}</span><span className="wa-list-bottomline"><small>{tab==='contacts'?c.company||'+'+c.wa_id:item.preview||'Aguardando mensagem do cliente'}</small>{item.unread>0&&<b className="wa-unread" aria-label={item.unread+' não lidas'}>{item.unread>99?'99+':item.unread}</b>}</span>{tab==='contacts'&&c.tags?.length>0&&<span className="wa-contact-tags">{c.tags.slice(0,2).map(tag=><em key={tag}>{tag}</em>)}</span>}</span></button>{tab==='contacts'&&<button className="admin-icon-button" aria-label={'Editar '+c.name} title="Editar contato" onClick={()=>setContact(c)}><Icon name="edit" size={15}/></button>}</div>
     })}
    </div>
    <div className="wa-pagination"><span><Icon name="lock" size={11}/>Caixa privada da equipe</span><div><button className="admin-icon-button" disabled={!offset||list.loading} aria-label="Página anterior" onClick={()=>setOffset(n=>n-20)}><Icon name="left" size={15}/></button><span>{Math.floor(offset/20)+1}</span><button className="admin-icon-button" disabled={!list.data?.has_more||list.loading} aria-label="Próxima página" onClick={()=>setOffset(n=>n+20)}><Icon name="right" size={15}/></button></div></div>
   </aside>
   {selected?<ThreadPane key={selected} threadId={selected} status={status} draft={drafts[selected]} setDraft={updateDraft} directory={directoryQuery.data||[]} onBack={()=>{if(unsafe)notify('Conclua a gravação ou o envio antes de voltar.',true);else setSelected(null)}} onUnsafe={setUnsafe} onUpdated={refreshReadState} onContact={setContact} refreshRevision={refreshRevision} notify={notify}/>:<div className="wa-welcome"><div className="wa-welcome-content"><div className="wa-welcome-symbol"><Icon name="message" size={48}/><span><Icon name="check" size={15}/></span></div><span className="wa-eyebrow">DUUK · Central de atendimento</span><h2>Boas conversas.<br/><span>Grandes conexões.</span></h2><p>{status.connected?'Uma caixa compartilhada para cuidar de cada cliente. Selecione uma conversa e continue o atendimento.':'O ponto de encontro entre a DUUK e seus clientes. Organize os contatos enquanto a conexão oficial é preparada.'}</p><div className="wa-welcome-actions"><button className="admin-button" onClick={()=>setContact({})}><Icon name="userPlus" size={16}/>Adicionar contato</button>{!status.connected&&admin&&<button className="admin-text-button" onClick={()=>setConfig(true)}>Preparar conexão<Icon name="right" size={14}/></button>}</div><div className="wa-welcome-features"><span><Icon name="users" size={16}/>Em equipe</span><span><Icon name="attachment" size={16}/>Áudios e arquivos</span><span><Icon name="bookmark" size={16}/>Tudo organizado</span></div></div><div className="wa-welcome-privacy"><Icon name="shield" size={13}/><span>Histórico privado de 90 dias · Somente atendimento gratuito</span></div></div>}
  </div>}
 </div>{config&&admin&&status&&<Configuration status={status} onClose={()=>setConfig(false)} onSaved={async data=>{if(data)statusQuery.updateData(()=>data);else await reloadStatus()}}/>}{contact&&<ContactEditor key={contact.id||'new'} initial={contact.id?contact:null} prefill={contact.prefill} onClose={()=>setContact(null)} onSaved={async()=>{await reloadList();await reloadStatus();notify('Contato salvo.')}}/>}
 </>
}
