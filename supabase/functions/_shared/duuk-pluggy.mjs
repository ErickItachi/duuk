// Official read-only API. Never follow a provider URL with credentials attached.
export const pluggyOrigin = 'https://api.pluggy.ai'
export class PluggyError extends Error { constructor(message,status=502){super(message);this.status=status} }
export function moneyCents(value) {
 if(typeof value!=='number'||!Number.isFinite(value))throw new PluggyError('O banco retornou um valor inválido.')
 const cents=Math.round(value*100)
 if(!Number.isSafeInteger(cents)||Math.abs(cents)>100000000000||Math.abs(value*100-cents)>0.00001)throw new PluggyError('O banco retornou um valor fora do limite ou com frações de centavo.')
 return cents
}
export function validateProxy(item) {
 if(Number(item?.connector?.id)!==200||item?.connector?.isSandbox===true)throw new PluggyError('Use somente o conector Meu Pluggy (200) da sua conta. Conectores diretos ou de teste não são aceitos.',400)
 return item
}
export function bankAccount(account) {
 if(account?.type!=='BANK'||account?.currencyCode!=='BRL')throw new PluggyError('Selecione uma conta bancária em reais, em vez de cartão de crédito.',400)
 return {id:account.id,label:String(account.name||'Conta bancária').replace(/[\r\n]/g,' ').slice(0,80),last_four:String(account.number||'').replace(/[^a-z0-9-]/ig,'').slice(-4),balance_cents:moneyCents(account.balance)}
}
export function monthRange(month) {
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month))||month<'1900-01'||month>'2100-12')throw new PluggyError('Escolha um mês válido.',400)
 const [year,m]=month.split('-').map(Number),first=new Date(Date.UTC(year,m-1,1)),next=new Date(Date.UTC(year,m,1))
 first.setUTCDate(first.getUTCDate()-1)
 return {from:first.toISOString().slice(0,10),to:next.toISOString().slice(0,10)}
}
export function transactionView(row,month,accountId) {
 if(row.accountId!==accountId||row.currencyCode!=='BRL')throw new PluggyError('O banco retornou uma movimentação de outra conta ou moeda.')
 const parsed=new Date(row.date)
 if(!Number.isFinite(parsed.getTime()))throw new PluggyError('O banco retornou uma data inválida.')
 const pieces=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(parsed).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]))
 const date=`${pieces.year}-${pieces.month}-${pieces.day}`
 if(!date.startsWith(month+'-'))return null
 if(!['DEBIT','CREDIT'].includes(row.type)||!['POSTED','PENDING'].includes(row.status)||typeof row.id!=='string')throw new PluggyError('O banco retornou uma movimentação incompleta.')
 const amount=moneyCents(row.amount)
 // Bank accounts use negative debits / positive credits; refuse contradictions.
 if(amount&&((row.type==='DEBIT'&&amount>0)||(row.type==='CREDIT'&&amount<0)))throw new PluggyError('Confira o sentido de uma movimentação no Meu Pluggy.')
 return {id:row.id,posted_date:date,title:String(row.description||'Movimentação bancária').slice(0,500),amount_cents:amount,status:row.status}
}
export function nextCursor(value,accountId) {
 if(!value)return null
 if(typeof value!=='string'||value.length>4096)throw new PluggyError('A paginação do banco é inválida.')
 const url=new URL(value.startsWith('?')?'/v2/transactions'+value:value,pluggyOrigin)
 if(url.origin!==pluggyOrigin||url.pathname!=='/v2/transactions'||url.searchParams.get('accountId')!==accountId)throw new PluggyError('A paginação do banco apontou para outra origem ou conta.')
 const after=url.searchParams.get('after')
 if(!after||after.length>2048)throw new PluggyError('O cursor do banco é inválido.')
 return after
}
export function providerFailure(status) {
 if(status===401||status===403)return new PluggyError('O Meu Pluggy recusou o acesso. A administração deve revisar as credenciais e o consentimento.',403)
 if(status===404)return new PluggyError('A conexão ou conta não está disponível. Reconecte pelo Meu Pluggy.',404)
 if(status===429)return new PluggyError('O limite de consultas do Meu Pluggy foi atingido. Aguarde antes de atualizar.',429)
 return new PluggyError('O Meu Pluggy está indisponível. Tente novamente; seus registros financeiros foram preservados.')
}
export async function createPluggyClient(credentials,{fetcher=fetch,signal}={}) {
 async function call(path,init={}) {
  const response=await fetcher(pluggyOrigin+path,{...init,signal,redirect:'error',headers:{'Content-Type':'application/json',...(init.headers||{})}})
  if(!response.ok)throw providerFailure(response.status)
  try{return await response.json()}catch{throw new PluggyError('O Meu Pluggy retornou uma resposta inválida.')}
 }
 const auth=await call('/auth',{method:'POST',body:JSON.stringify(credentials)})
 if(typeof auth.apiKey!=='string'||!auth.apiKey)throw new PluggyError('O Meu Pluggy não confirmou o acesso.')
 return path=>call(path,{headers:{'X-API-KEY':auth.apiKey}})
}
export async function readStatement(get,{itemId,accountId,month}) {
 const item=validateProxy(await get('/items/'+encodeURIComponent(itemId))),account=bankAccount(await get('/accounts/'+encodeURIComponent(accountId)))
 // Verify the account still belongs to the configured connection on every read.
 const raw=await get('/accounts?'+new URLSearchParams({itemId,type:'BANK'}))
 if(!Array.isArray(raw.results)||!raw.results.some(a=>a.id===accountId))throw new PluggyError('A conta deixou de pertencer à conexão configurada.',409)
 const range=monthRange(month),rows=new Map(),seen=new Set();let after=null,complete=false
 for(let page=0;page<10;page++){
  const params=new URLSearchParams({accountId,dateFrom:range.from,dateTo:range.to});if(after)params.set('after',after)
  const data=await get('/v2/transactions?'+params)
  if(!Array.isArray(data.results)||data.results.length>500)throw new PluggyError('A lista de movimentações do banco é inválida.')
  for(const rawRow of data.results){const row=transactionView(rawRow,month,accountId);if(row)rows.set(row.id,row)}
  after=nextCursor(data.next,accountId);if(!after){complete=true;break}
  if(seen.has(after))throw new PluggyError('O banco repetiu uma página de movimentações. Atualize mais tarde.')
  seen.add(after)
 }
 const updated=Date.parse(item.lastUpdatedAt)
 return {month,account,transactions:[...rows.values()].sort((a,b)=>b.posted_date.localeCompare(a.posted_date)||a.id.localeCompare(b.id)),complete,provider_updated_at:Number.isFinite(updated)?new Date(updated).toISOString():null,provider_status:item.status||'UNKNOWN',queried_at:new Date().toISOString(),warning:item.status==='UPDATED'?null:'A conexão no Meu Pluggy precisa de atenção. Os dados podem estar desatualizados.'}
}
