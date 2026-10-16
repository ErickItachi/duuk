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
const methodLabels={PIX:'Pix',TED:'Transferência',DOC:'Transferência',TEF:'Transferência',TRANSFERENCIA_MESMA_INSTITUICAO:'Transferência',BOLETO:'Boleto',CONVENIO_ARRECADACAO:'Boleto',CARTAO:'Cartão',SAQUE:'Saque',DEPOSITO:'Depósito',FOLHA_PAGAMENTO:'Salário',PACOTE_TARIFA_SERVICOS:'Tarifa',TARIFA_SERVICOS_AVULSOS:'Tarifa',RENDIMENTO_APLIC_FINANCEIRA:'Investimento',RESGATE_APLIC_FINANCEIRA:'Investimento',APLICACAO_FINANCEIRA:'Investimento',OPERACAO_CREDITO:'Crédito',ENCARGOS_JUROS_CHEQUE_ESPECIAL:'Juros'}
// Only a whitelisted method label leaves the server; payer, receiver and documents never do.
export function paymentMethod(row) {
 return methodLabels[String(row?.paymentData?.paymentMethod||'').toUpperCase()]||methodLabels[String(row?.operationType||'').toUpperCase()]||(row?.creditCardMetadata?'Cartão':null)
}
export function categoryIndex(results) {
 const byId=new Map(),index=new Map(),clean=value=>typeof value==='string'&&value.trim()?value.replace(/[\r\n]/g,' ').trim().slice(0,60):null
 for(const row of Array.isArray(results)?results:[])if(typeof row?.id==='string')byId.set(row.id,row)
 for(const [id,row] of byId){const name=clean(row.descriptionTranslated)||clean(row.description),parent=byId.get(row.parentId);if(name)index.set(id,{name,group:parent?clean(parent.descriptionTranslated)||clean(parent.description)||name:name})}
 return index
}
export function saoPauloDate(value) {
 const parsed=new Date(value)
 if(!Number.isFinite(parsed.getTime()))throw new PluggyError('O banco retornou uma data inválida.')
 const pieces=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(parsed).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]))
 return `${pieces.year}-${pieces.month}-${pieces.day}`
}
export function transactionView(row,month,accountId,categories=new Map()) {
 if(row.accountId!==accountId||row.currencyCode!=='BRL')throw new PluggyError('O banco retornou uma movimentação de outra conta ou moeda.')
 const date=saoPauloDate(row.date)
 if(!date.startsWith(month+'-')&&!(month.length===10&&date>=month))return null
 if(!['DEBIT','CREDIT'].includes(row.type)||!['POSTED','PENDING'].includes(row.status)||typeof row.id!=='string')throw new PluggyError('O banco retornou uma movimentação incompleta.')
 const amount=moneyCents(row.amount)
 // Bank accounts use negative debits / positive credits; refuse contradictions.
 if(amount&&((row.type==='DEBIT'&&amount>0)||(row.type==='CREDIT'&&amount<0)))throw new PluggyError('Confira o sentido de uma movimentação no Meu Pluggy.')
 const known=categories.get(row.categoryId),fallback=typeof row.category==='string'&&row.category.trim()?row.category.trim().slice(0,60):null
 return {id:row.id,posted_date:date,title:String(row.description||'Movimentação bancária').slice(0,500),amount_cents:amount,status:row.status,category:known?.name||fallback,category_group:known?.group||fallback,method:paymentMethod(row)}
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
/** @param {any} credentials @param {{fetcher?: typeof fetch, signal?: AbortSignal}} [options] */
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
async function verifiedAccount(get,{itemId,accountId}) {
 const item=validateProxy(await get('/items/'+encodeURIComponent(itemId))),account=bankAccount(await get('/accounts/'+encodeURIComponent(accountId)))
 // Verify the account still belongs to the configured connection on every read.
 const raw=await get('/accounts?'+new URLSearchParams({itemId,type:'BANK'}))
 if(!Array.isArray(raw.results)||!raw.results.some(a=>a.id===accountId))throw new PluggyError('A conta deixou de pertencer à conexão configurada.',409)
 return {item,account}
}
// Categories only translate labels; a failure here must never hide the statement.
async function readCategories(get) { try{return categoryIndex((await get('/categories')).results)}catch{return new Map()} }
async function readTransactions(get,{accountId,from,to,select,maxPages=10}) {
 const rows=new Map(),seen=new Set();let after=null,complete=false
 for(let page=0;page<maxPages;page++){
  const params=new URLSearchParams({accountId,dateFrom:from,dateTo:to});if(after)params.set('after',after)
  const data=await get('/v2/transactions?'+params)
  if(!Array.isArray(data.results)||data.results.length>500)throw new PluggyError('A lista de movimentações do banco é inválida.')
  for(const rawRow of data.results){const row=select(rawRow);if(row)rows.set(row.id,row)}
  after=nextCursor(data.next,accountId);if(!after){complete=true;break}
  if(seen.has(after))throw new PluggyError('O banco repetiu uma página de movimentações. Atualize mais tarde.')
  seen.add(after)
 }
 return {transactions:[...rows.values()].sort((a,b)=>b.posted_date.localeCompare(a.posted_date)||a.id.localeCompare(b.id)),complete}
}
function freshness(item) {
 const updated=Date.parse(item.lastUpdatedAt)
 return {provider_updated_at:Number.isFinite(updated)?new Date(updated).toISOString():null,provider_status:item.status||'UNKNOWN',queried_at:new Date().toISOString(),warning:item.status==='UPDATED'?null:'A conexão no Meu Pluggy precisa de atenção. Os dados podem estar desatualizados.'}
}
export async function readStatement(get,{itemId,accountId,month}) {
 const {item,account}=await verifiedAccount(get,{itemId,accountId}),range=monthRange(month),categories=await readCategories(get)
 const {transactions,complete}=await readTransactions(get,{accountId,...range,select:row=>transactionView(row,month,accountId,categories)})
 return {month,account,transactions,complete,...freshness(item)}
}
export function historyRange(today,months=6) {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(today)||!Number.isInteger(months)||months<1||months>12)throw new PluggyError('Período inválido.',400)
 const [year,month]=today.split('-').map(Number),first=new Date(Date.UTC(year,month-months,1)),start=first.toISOString().slice(0,10),before=new Date(first),after=new Date(Date.UTC(year,month-1,Number(today.slice(8))+2))
 before.setUTCDate(before.getUTCDate()-1)
 return {start,from:before.toISOString().slice(0,10),to:after.toISOString().slice(0,10),months:Array.from({length:months},(_,i)=>new Date(Date.UTC(year,month-months+i,1)).toISOString().slice(0,7))}
}
const optionalCents=value=>{try{return value==null?null:moneyCents(value)}catch{return null}}
const optionalDate=value=>{try{return value?saoPauloDate(value):null}catch{return null}}
const label=(value,fallback)=>String(value||fallback).replace(/[\r\n]/g,' ').slice(0,80)
export function creditCardView(account) {
 const data=account?.creditData||{}
 return {id:String(account.id),label:label(account.name,'Cartão de crédito'),last_four:String(account.number||'').replace(/[^0-9]/g,'').slice(-4),brand:data.brand?label(data.brand,''):null,balance_cents:optionalCents(account.balance),limit_cents:optionalCents(data.creditLimit),available_cents:optionalCents(data.availableCreditLimit),minimum_cents:optionalCents(data.minimumPayment),close_date:optionalDate(data.balanceCloseDate),due_date:optionalDate(data.balanceDueDate)}
}
export function investmentView(row) {
 return {id:String(row.id),label:label(row.name,'Investimento'),type:typeof row.type==='string'?row.type.slice(0,40):null,balance_cents:optionalCents(row.balance??row.amount)}
}
// Cards and investments come from the same consented connection and are optional extras.
async function readExtras(get,itemId) {
 const extras={cards:null,investments:null}
 try{
  const raw=await get('/accounts?'+new URLSearchParams({itemId,type:'CREDIT'}))
  extras.cards=(Array.isArray(raw.results)?raw.results:[]).filter(a=>a?.type==='CREDIT'&&a?.currencyCode==='BRL').slice(0,6).map(creditCardView)
 }catch{/* optional */}
 try{
  const raw=await get('/investments?'+new URLSearchParams({itemId,pageSize:'100'}))
  extras.investments=(Array.isArray(raw.results)?raw.results:[]).filter(r=>(r?.currencyCode||'BRL')==='BRL'&&r?.status!=='TOTAL_WITHDRAWAL').slice(0,100).map(investmentView).filter(r=>r.balance_cents!==null)
 }catch{/* optional */}
 return extras
}
export async function readOverview(get,{itemId,accountId,today,months=6,extras=false}) {
 const {item,account}=await verifiedAccount(get,{itemId,accountId}),range=historyRange(today,months),categories=await readCategories(get)
 const {transactions,complete}=await readTransactions(get,{accountId,from:range.from,to:range.to,maxPages:20,select:row=>transactionView(row,range.start,accountId,categories)})
 return {months:range.months,today,account,transactions,complete,...(extras?await readExtras(get,itemId):{}),...freshness(item)}
}
