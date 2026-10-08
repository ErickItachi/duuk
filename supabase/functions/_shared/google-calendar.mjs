export const calendarScope = 'https://www.googleapis.com/auth/calendar.app.created'
export const calendarRedirect = 'https://www.duukfilms.com/admin/configuracoes/integracoes'
const api = 'https://www.googleapis.com/calendar/v3'
export class GoogleError extends Error {
 constructor(status, code = '') { super(status === 401 || code === 'invalid_grant' ? 'A autorização do Google expirou. Conecte sua conta novamente.' : status === 403 ? 'O Google recusou o acesso. Confira a API Calendar e as permissões concedidas.' : status === 429 ? 'O Google limitou as solicitações. A sincronização será tentada novamente.' : 'Não foi possível sincronizar com o Google. Tente novamente.'); this.status=status; this.code=code }
}
export async function googleRequest(url, options={}, request=fetch) {
 const response=await request(url,{...options,redirect:'error',signal:AbortSignal.timeout(10000)})
 if(response.status===204)return null
 const data=await response.json().catch(()=>({}))
 if(!response.ok)throw new GoogleError(response.status,typeof data.error==='string'?data.error:data.error?.errors?.[0]?.reason||'')
 return data
}
export function authorizationUrl(clientId,state,challenge) {
 const url=new URL('https://accounts.google.com/o/oauth2/v2/auth')
 url.search=new URLSearchParams({client_id:clientId,redirect_uri:calendarRedirect,response_type:'code',scope:`openid email ${calendarScope}`,state,code_challenge:challenge,code_challenge_method:'S256',access_type:'offline',prompt:'consent',include_granted_scopes:'false'}).toString()
 return url.href
}
export async function exchangeToken(params,config,request=fetch) {
 return googleRequest('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...params,client_id:config.id,client_secret:config.secret})},request)
}
export function eventBody(event,responsible='') {
 const addDay=value=>{const d=new Date(value+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10)}
 const start=event.all_day?{date:event.start_date}:{dateTime:`${event.start_date}T${event.start_time.slice(0,8)}-03:00`,timeZone:'America/Sao_Paulo'}
 let end
 if(event.all_day)end={date:addDay(event.end_date)}
 else if(event.end_time)end={dateTime:`${event.end_date}T${event.end_time.slice(0,8)}-03:00`,timeZone:'America/Sao_Paulo'}
 else {const d=new Date(`${event.end_date}T${event.start_time.slice(0,8)}-03:00`);d.setMinutes(d.getMinutes()+60);end={dateTime:d.toISOString(),timeZone:'America/Sao_Paulo'}}
 return {summary:event.title,description:[event.description,event.client_name&&`Cliente: ${event.client_name}`,responsible&&`Responsável: ${responsible}`,'Gerenciado pela Agenda DUUK.','https://www.duukfilms.com/admin/agenda?dia='+event.start_date].filter(Boolean).join('\n\n'),location:event.location||'',start,end,status:event.status==='cancelled'?'cancelled':'confirmed',transparency:'opaque',extendedProperties:{private:{duuk_event_id:event.id}},reminders:{useDefault:true}}
}
// Write-only transport: no events.list, watch, syncToken or personal calendar query.
export async function syncGoogleEvent({calendarId,googleId,event,action,token,responsible='',rotate},request=fetch) {
 const base=`${api}/calendars/${encodeURIComponent(calendarId)}/events`,headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'}
 const call=(url,method,body)=>googleRequest(url,{method,headers,...(body?{body:JSON.stringify(body)}:{})},request)
 if(action==='delete'||!event){try{await call(`${base}/${googleId}?sendUpdates=none`,'DELETE')}catch(e){if(![404,410].includes(e.status))throw e}return googleId}
 const body=eventBody(event,responsible)
 try{await call(`${base}/${googleId}?sendUpdates=none`,'PUT',body);return googleId}catch(e){if(![404,410].includes(e.status))throw e}
 try{await call(base+'?sendUpdates=none','POST',{...body,id:googleId});return googleId}catch(e){if(e.status!==409)throw e}
 // A concurrent insert is safe; a deleted Google tombstone needs a new persistent ID.
 try{await call(`${base}/${googleId}?sendUpdates=none`,'PUT',body);return googleId}catch(e){if(![404,410].includes(e.status))throw e}
 const replacement=await rotate()
 if(!replacement)throw new Error('O compromisso mudou. A próxima tentativa usará os dados atuais.')
 await call(base+'?sendUpdates=none','POST',{...body,id:replacement})
 return replacement
}
export async function createDuukCalendar(token,request=fetch) {
 const data=await googleRequest(api+'/calendars',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({summary:'DUUK · Agenda da equipe',description:'Compromissos enviados pela DUUK. Edite os eventos no painel DUUK.',timeZone:'America/Sao_Paulo'})},request)
 if(!data?.id)throw new Error('O Google não confirmou a criação do calendário.')
 return data.id
}
export async function ensureDuukCalendar(token,existing,request=fetch) {
 if(existing){try{await googleRequest(`${api}/calendars/${encodeURIComponent(existing)}`,{headers:{Authorization:`Bearer ${token}`}},request);return existing}catch(e){if(![404,410].includes(e.status))throw e}}
 return createDuukCalendar(token,request)
}
