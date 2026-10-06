import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../content/AuthContext'
import { supabase } from '../content/supabase'

let lastView={path:'',time:0}
function track(event,page) {
  if(!import.meta.env.PROD || navigator.globalPrivacyControl || /^\/(admin|assinar)(\/|$)/.test(page))return
  try{if(sessionStorage.getItem('duuk-analytics-disabled')==='1')return}catch{}
  const payload={event,page,device:matchMedia('(max-width: 760px)').matches?'mobile':'desktop'}
  try{if(document.referrer&&new URL(document.referrer).origin!==location.origin)payload.referrer=new URL(document.referrer).origin}catch{}
  fetch(`${supabase.supabaseUrl}/functions/v1/duuk-metrics`,{method:'POST',headers:{apikey:supabase.supabaseKey,'Content-Type':'application/json'},body:JSON.stringify(payload),keepalive:true}).catch(()=>{})
}
export default function AnalyticsTracker() {
  const {pathname}=useLocation(),auth=useAuth()
  useEffect(()=>{
    if(!auth.ready||auth.isAdmin||/^\/(admin|assinar)(\/|$)/.test(pathname))return
    if(lastView.path!==pathname||Date.now()-lastView.time>1500){track('view',pathname);lastView={path:pathname,time:Date.now()}}
    const click=(event)=>{const node=event.target.closest?.('a[href],.film-player');if(!node)return;if(node.matches('.film-player'))track('play',pathname);else if(/^(mailto:|tel:)|wa\.me|api\.whatsapp\.com/.test(node.href))track('contact',pathname)}
    const submit=(event)=>{if(event.target.matches('.contact-form'))track('contact',pathname)}
    document.addEventListener('click',click);document.addEventListener('submit',submit)
    return()=>{document.removeEventListener('click',click);document.removeEventListener('submit',submit)}
  },[pathname,auth.ready,auth.isAdmin])
  return null
}
