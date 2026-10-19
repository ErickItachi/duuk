// Isolated full UI/provider fixtures. No real charges, audio, messages or permission changes.
import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import { chromium } from 'playwright-core'
import { preview } from 'vite'
import { adminShellHeaders } from '../../scripts/admin-security.mjs'
import { openAdmin, layoutIssues, settle } from './screens.mjs'
import * as fixtures from './fixtures.mjs'
const headers=adminShellHeaders(JSON.parse(await readFile(new URL('../../vercel.json',import.meta.url),'utf8')));delete headers['content-type']
const server=await preview({root:new URL('../../',import.meta.url).pathname,preview:{host:'127.0.0.1',port:0,headers}}),origin=`http://127.0.0.1:${server.httpServer.address().port}`
const browser=await chromium.launch({channel:'chrome'}),out='/tmp/duuk-billing-resources-e2e';await mkdir(out,{recursive:true})
const due=fixtures.TODAY,id='00000000-0000-4000-8000-000000000022'
const summary={configured:true,balance:{amount_cents:123456},pending:{gross_cents:100000,count:1},overdue:{gross_cents:20000,count:1},confirmed:{net_cents:45000,count:1},received:{net_cents:98000,count:1},period:{start:due.slice(0,7)+'-01'},checked_at:due+'T12:00:00Z',errors:{},limits:{daily_limit:100,daily_used:2}}
try{
 for(const width of [320,390,768,1440])for(const theme of ['dark','light']){
  const calls=[],external=[],errors=[]
  let record={id,payment_id:'pay_fixture',created_by:fixtures.user.id,environment:'production',title:'Filme fictício de teste',client_name:'Cliente fictício',amount_cents:100000,net_cents:null,due_date:due,method:'UNDEFINED',status:'PENDING',invoice_url:'https://www.asaas.com/i/fixture'},expired=false
  const payment=()=>({...record,id:'pay_fixture',customer_id:'cus_fixture'})
  const pageResult=items=>({items,total_count:items.length,has_more:false,offset:0,checked_at:due+'T12:00:00Z'})
  const handler=async body=>{calls.push(body)
   if(body.action==='status')return {configured:true,connected:true,account_name:'DUUK fictícia',account_status:'APPROVED'}
   if(body.action==='list')return {items:[record],total_count:1,stats:{open_cents:100000,confirmed_cents:0,received_cents:0}}
   if(body.action==='overview')return summary
   if(body.action==='simulate')return {amount_cents:body.amount_cents,installments:body.installments,entries:['PIX','BOLETO','CREDIT_CARD'].map((method,index)=>({method,available:true,gross_cents:body.amount_cents,net_cents:body.amount_cents-[199,299,7000][index],fee_cents:[199,299,7000][index],installments:body.installments,installment_gross_cents:Math.round(body.amount_cents/body.installments),installment_net_cents:Math.round((body.amount_cents-[199,299,7000][index])/body.installments)})),checked_at:due+'T12:00:00Z'}
   if(body.action==='fees')return {fees:{payment:{pix:{fixedFeeValue:1.99,monthlyCreditsWithoutFee:30,percentageFee:null},bankSlip:{defaultValue:2.99,daysToReceive:1},creditCard:{oneInstallmentPercentage:2.99,upToSixInstallmentsPercentage:3.49,daysToReceive:32}},notification:{whatsAppFeeValue:0.55}},checked_at:due+'T12:00:00Z'}
   if(body.action==='transactions')return pageResult([{id:'txn_fixture',date:due,description:'=HYPERLINK("https://fixture.invalid")',type:'PAYMENT_RECEIVED',amount_cents:100000,balance_cents:123456}])
   if(body.action==='edit'){record={...record,title:body.title,due_date:body.due_date};return {charge:record}}
   if(body.action==='cancel'){record={...record,status:'CANCELED',invoice_url:null};return {charge:record}}
   if(body.action==='restore'){record={...record,status:'PENDING',invoice_url:'https://www.asaas.com/i/fixture'};return {charge:record}}
   if(body.action==='artifacts')return body.kind==='pix'?{pix:{payload:'fictional-pix-payload',encoded_image:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4uUAAAAASUVORK5CYII=',expiration:expired?'2000-01-01 12:00:00':'2099-12-31 12:00:00'}}:{boleto:{identification_field:'1'.repeat(47)}}
   if(body.action==='collection_payments')return pageResult([payment()])
   if(body.action==='provider_list'){
    if(body.resource==='payments')return pageResult([payment()])
    if(body.resource==='customers')return pageResult([{id:'cus_fixture',name:'Cliente no Asaas',email:'cliente@fixture.invalid',notification_disabled:true}])
    if(body.resource==='installments')return pageResult([{id:'ins_fixture',title:'Parcelamento fictício',amount_cents:100000,installments:6,method:'CREDIT_CARD'}])
    if(body.resource==='subscriptions')return pageResult([{id:'sub_fixture',title:'Assinatura fictícia',amount_cents:100000,cycle:'MONTHLY',next_due_date:due,method:'CREDIT_CARD'}])
   }
   throw Error('Unexpected billing action '+body.action)
  }
  const options={route:'/admin/cobrancas',width,theme,functions:{...fixtures.functions,'duuk-billing':handler,'duuk-spotify':{status:{configured:true,connection:{status:'connected',display_name:'Conta Spotify fictícia',scopes:'streaming user-read-email user-read-private'}},player:{data:{is_playing:false,device:{id:'fixture-mac',name:'Mac fictício'},item:{type:'track',name:'Faixa fictícia',artists:[{name:'Artista fictício'}]}}},next:{data:null},pause:{data:null},play:{data:null}}}}
  const opened=await openAdmin(browser,origin,options),{context,page}=opened;page.setDefaultTimeout(12000);page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(/api\.asaas|sdk\.scdn|api\.spotify/.test(request.url()))external.push(request.url())})
  try{
   assert(await page.locator('.billing-brand img').evaluate(img=>img.complete&&img.naturalWidth>0))
   await page.getByRole('tab',{name:'Resumo da conta',exact:true}).click();await page.getByText('Saldo disponível',{exact:true}).waitFor();assert((await page.locator('.billing-account-values').innerText()).includes('1.234,56'));assert.deepEqual(await layoutIssues(page),[])
   await page.getByRole('tab',{name:'Simular venda',exact:true}).click();await page.getByLabel('Valor da venda (R$)').fill('1000,00');await page.getByRole('combobox',{name:/^Parcelas/}).selectOption('6');assert.equal(calls.filter(x=>x.action==='simulate').length,0);await page.getByRole('button',{name:'Simular taxas',exact:true}).click();await page.locator('.billing-simulation').first().waitFor();assert.equal(calls.filter(x=>x.action==='simulate').length,1);assert((await page.locator('.billing-simulation').last().innerText()).includes('930,00'));assert.deepEqual(await layoutIssues(page),[]);await page.screenshot({path:`${out}/simulator-${width}-${theme}.png`,fullPage:true})
   await page.getByRole('tab',{name:'Taxas',exact:true}).click();await page.getByRole('heading',{name:'Taxas da conta DUUK'}).waitFor();await page.getByText('Tarifa padrão',{exact:true}).waitFor();assert.deepEqual(await layoutIssues(page),[])
   await page.getByRole('tab',{name:'Extrato',exact:true}).click();await page.locator('.billing-provider-row').first().waitFor();assert.deepEqual(await layoutIssues(page),[])
   if(width===390&&theme==='dark'){const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Exportar esta página CSV'}).click();const csv=await readFile(await (await pending).path(),'utf8');assert(csv.includes("\"'=HYPERLINK"));assert(csv.includes('1000,00'))}
   await page.getByRole('tab',{name:'Todas as cobranças',exact:true}).click();await page.locator('.billing-provider-row').first().click();let details=page.getByRole('dialog',{name:record.title,exact:true});await details.waitFor();assert.equal(await details.getByRole('link',{name:'Abrir fatura'}).getAttribute('href'),'https://www.asaas.com/i/fixture');await details.getByRole('button',{name:'Pix ou boleto'}).click();const artifacts=page.getByRole('dialog',{name:'Dados para pagamento',exact:true});await artifacts.getByRole('button',{name:'Consultar Pix',exact:true}).click();await artifacts.getByLabel('Pix copia e cola').waitFor();assert(await artifacts.getByRole('img').evaluate(img=>img.complete&&img.naturalWidth>0));assert.deepEqual(await layoutIssues(page),[])
   if(width===390&&theme==='dark'){expired=true;await artifacts.getByRole('button',{name:'Consultar Pix',exact:true}).click();await artifacts.getByText('Este código expirou. Consulte o Pix novamente.').waitFor();assert(await artifacts.getByRole('button',{name:'Copiar Pix',exact:true}).isDisabled())}
   await artifacts.getByRole('button',{name:'Consultar boleto',exact:true}).click();assert.equal(await artifacts.getByLabel('Linha digitável do boleto').inputValue(),'1'.repeat(47));await artifacts.getByRole('button',{name:'Fechar',exact:true}).click();await details.getByRole('button',{name:'Fechar',exact:true}).click()
   await page.getByRole('tab',{name:'Clientes Asaas',exact:true}).click();await page.getByLabel('Nome ou e-mail do cliente').fill('cliente@fixture.invalid');await page.locator('#billing-tab-panel').getByRole('button',{name:'Buscar',exact:true}).click();await page.locator('.billing-provider-row').first().click();await page.getByText('Cliente: Cliente no Asaas',{exact:false}).waitFor();assert(calls.some(x=>x.customer_id==='cus_fixture'&&x.resource==='payments'))
   for(const [name,title] of [['Parcelamentos','Parcelamento fictício'],['Assinaturas','Assinatura fictícia']]){await page.getByRole('tab',{name,exact:true}).click();await page.getByRole('button',{name:new RegExp(title)}).click();await page.getByRole('button',{name:'Voltar à lista',exact:true}).waitFor();await page.locator('.billing-provider-row').first().click();await page.getByRole('dialog',{name:record.title,exact:true}).getByRole('button',{name:'Fechar',exact:true}).click();assert.deepEqual(await layoutIssues(page),[])}
   await page.getByRole('tab',{name:'Cobranças DUUK',exact:true}).click();await page.locator('.billing-row').first().click();await page.getByRole('button',{name:'Alterar cobrança',exact:true}).click();const editor=page.getByRole('dialog',{name:'Alterar cobrança',exact:true});await editor.getByLabel('Descrição da cobrança').fill('Filme revisado fictício');await editor.getByRole('button',{name:'Fechar',exact:true}).click();await page.getByRole('dialog',{name:'Descartar alterações?',exact:true}).getByRole('button',{name:'Cancelar',exact:true}).click();assert.equal(await editor.getByLabel('Descrição da cobrança').inputValue(),'Filme revisado fictício');await editor.getByRole('button',{name:'Salvar no Asaas',exact:true}).click();details=page.getByRole('dialog',{name:'Filme revisado fictício',exact:true});await details.waitFor();await details.getByRole('button',{name:'Cancelar cobrança',exact:true}).click();await page.getByRole('dialog',{name:'Cancelar cobrança?',exact:true}).getByRole('button',{name:'Cancelar cobrança',exact:true}).click();await details.getByRole('button',{name:'Restaurar cobrança',exact:true}).click();await page.getByRole('dialog',{name:'Restaurar cobrança?',exact:true}).getByRole('button',{name:'Restaurar cobrança',exact:true}).click();await details.getByText('Aguardando pagamento',{exact:true}).waitFor();await details.getByRole('button',{name:'Fechar',exact:true}).click()
   await page.goto(origin+'/admin');await page.locator('#dashboard-asaas').waitFor();await page.locator('#dashboard-spotify').waitFor();await page.getByText('Faixa fictícia',{exact:true}).waitFor();await settle(page);assert.deepEqual(await layoutIssues(page),[]);await page.screenshot({path:`${out}/dashboard-${width}-${theme}.png`,fullPage:true});assert.deepEqual(external,[]);assert.deepEqual(errors,[]);assert.deepEqual(opened.errors,[]);assert(!calls.some(x=>['create','configure'].includes(x.action)))
   console.log(`billing resources/dashboard ${width} ${theme} passed`)
  }catch(error){console.error({width,theme,errors:opened.errors,body:(await page.locator('body').innerText()).slice(-3000)});throw error}finally{await context.close()}
 }
 for(const width of [390,1440]){
  const grants=fixtures.functions['duuk-team']({action:'access'}),writes=[]
  grants.keys=grants.keys.map(key=>({...key,label:key.key==='billing'?'Cobranças e consultas Asaas':key.key==='spotify'?'Spotify pessoal':key.label}))
  grants.users=grants.users.map(person=>({...person,role_id:grants.roles[0].id,is_super_admin:false}))
  const team=body=>{
   if(body.action==='access')return grants
   if(body.action==='permission'){writes.push(body);const list=body.user_id?grants.user_permissions:grants.role_permissions,key=body.user_id?'user_id':'role_id';const index=list.findIndex(item=>item[key]===body[key]&&item.permission===body.permission);if(index>=0)list.splice(index,1);if(body.allowed!==null)list.push({[key]:body[key],permission:body.permission,allowed:body.allowed});return {}}
   return fixtures.functions['duuk-team'](body)
  }
  const opened=await openAdmin(browser,origin,{route:'/admin/configuracoes/grupos',width,functions:{...fixtures.functions,'duuk-team':team,'duuk-billing':{overview:summary}}}),{page,context}=opened
  try{
   const billing=page.getByRole('switch',{name:'Acesso a Cobranças e consultas Asaas'}),spotify=page.getByRole('switch',{name:'Acesso a Spotify pessoal'})
   await billing.click();await page.waitForFunction(()=>document.querySelector('[role=switch][aria-label="Acesso a Cobranças e consultas Asaas"]')?.getAttribute('aria-checked')==='false');await billing.click();await page.waitForFunction(()=>document.querySelector('[role=switch][aria-label="Acesso a Cobranças e consultas Asaas"]')?.getAttribute('aria-checked')==='true');await spotify.click();await page.waitForFunction(()=>document.querySelector('[role=switch][aria-label="Acesso a Spotify pessoal"]')?.getAttribute('aria-checked')==='false');assert.deepEqual(await layoutIssues(page),[])
   await page.goto(origin+'/admin/configuracoes/permissoes');const personBilling=page.getByRole('group',{name:'Permissão para Cobranças e consultas Asaas'}),personSpotify=page.getByRole('group',{name:'Permissão para Spotify pessoal'})
   await personBilling.getByRole('button',{name:'Bloquear',exact:true}).click();await page.waitForFunction(()=>Array.from(document.querySelectorAll('[role=group][aria-label="Permissão para Cobranças e consultas Asaas"] button')).some(b=>b.textContent==='Bloquear'&&b.getAttribute('aria-pressed')==='true'))
   await personBilling.getByRole('button',{name:'Herdar',exact:true}).click();await personSpotify.getByRole('button',{name:'Permitir',exact:true}).click();await page.waitForFunction(()=>Array.from(document.querySelectorAll('[role=group][aria-label="Permissão para Spotify pessoal"] button')).some(b=>b.textContent==='Permitir'&&b.getAttribute('aria-pressed')==='true'));assert.deepEqual(await layoutIssues(page),[]);assert.deepEqual(opened.errors,[]);assert(writes.some(x=>x.permission==='billing'&&x.user_id&&x.allowed===null));assert(writes.some(x=>x.permission==='spotify'&&x.role_id&&x.allowed===false))
   console.log(`billing/Spotify group switches and individual allow/deny/inherit ${width} passed`)
  }finally{await context.close()}
 }
 const calls=[],permissionOnly={...fixtures.permissions,billing:false,spotify:false},deniedProfile={...fixtures.profile,is_super_admin:false}
 for(const route of ['/admin','/admin/cobrancas','/admin/spotify']){
  const opened=await openAdmin(browser,origin,{route,permissions:permissionOnly,profile:deniedProfile,functions:{...fixtures.functions,'duuk-billing':body=>{calls.push(body);throw Error('Denied billing requested')},'duuk-spotify':body=>{calls.push(body);throw Error('Denied Spotify requested')}}})
  assert.equal(await opened.page.locator('#dashboard-asaas,#dashboard-spotify').count(),0);if(route!=='/admin')await opened.page.getByRole('heading',{name:'Acesso restrito'}).waitFor();assert.deepEqual(calls,[]);assert.deepEqual(opened.errors,[]);await opened.context.close()
 }
 console.log('billing and Spotify direct routes, dashboard and requests respect individual/group-denied access')
}finally{await browser.close();await server.httpServer.close()}
