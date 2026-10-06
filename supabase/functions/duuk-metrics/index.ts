import { checked, database, handler, HttpError, json, readJson, sha256 } from '../_shared/http.ts'
handler(async(req,headers)=>{
  if(Number(req.headers.get('content-length'))>2048)throw new HttpError('Requisição inválida.')
  const data=await readJson(req,2048),page=String(data.page||'').slice(0,200)
  if(!/^\/[a-z0-9/-]*$/.test(page)||!['view','play','contact'].includes(data.event))throw new HttpError('Evento inválido.')
  let source='Direto'
  if(data.referrer){
    source='Outros'
    let host='';try{host=new URL(data.referrer).hostname}catch{}
    for(const [domain,label] of [['google.com','Google'],['google.com.br','Google'],['instagram.com','Instagram'],['youtube.com','YouTube'],['youtu.be','YouTube'],['bing.com','Bing'],['linkedin.com','LinkedIn']])if(host===domain||host.endsWith('.'+domain))source=label
  }
  if(/bot|crawler|spider|preview/i.test(req.headers.get('user-agent')||''))return json({recorded:false},headers)
  const ip=(req.headers.get('x-forwarded-for')||'').split(',')[0]
  const digest=await sha256(`${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}:${new Date().toISOString().slice(0,10)}:${ip}`)
  const recorded=checked(await database().rpc('duuk_office_metric',{route:page,kind:data.event,device_kind:data.device==='mobile'?'mobile':'desktop',source_kind:source,request_digest:digest}))
  return json({recorded},headers)
})
