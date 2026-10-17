// Isolated DUUK browser + provider protocol fixtures. No real payments or messages.
import assert from 'node:assert/strict'
import { mkdir,readFile } from 'node:fs/promises'
import { preview } from 'vite'
import { chromium } from 'playwright-core'
import { adminShellHeaders } from '../../scripts/admin-security.mjs'
import { installSupabaseMock } from './supabase-mock.mjs'
import { layoutIssues,settle } from './screens.mjs'
import * as fixtures from './fixtures.mjs'
const headers=adminShellHeaders(JSON.parse(await readFile(new URL('../../vercel.json',import.meta.url),'utf8')));delete headers['content-type']
const server=await preview({root:new URL('../../',import.meta.url).pathname,preview:{host:'127.0.0.1',port:0,headers}}),origin=`http://127.0.0.1:${server.httpServer.address().port}`
const browser=await chromium.launch({channel:'chrome'}),out='/tmp/duuk-billing-e2e';await mkdir(out,{recursive:true})
try{
 for(const width of [320,390,768,1440])for(const theme of ['dark','light']){
  const context=await browser.newContext({viewport:{width,height:width<768?844:1000},serviceWorkers:'block',reducedMotion:'reduce'}),page=await context.newPage(),calls=[],errors=[],providerCalls=[]
  page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));page.on('request',request=>{if(/asaas\.com/.test(request.url()))providerCalls.push(request.url())})
  let configured=false,items=[],mode='PENDING'
  const handler=async body=>{calls.push(body)
   if(body.action==='status')return {configured,connected:configured,account_name:'DUUK fictícia',account_status:'APPROVED'}
   if(body.action==='list')return {items,total_count:items.length,stats:{open_cents:mode==='PENDING'?5000:0,confirmed_cents:mode==='CONFIRMED'?5000:0,received_cents:mode==='RECEIVED'?5000:0}}
   if(body.action==='configure'){assert.equal(body.environment,'sandbox');assert.equal(body.api_key,'fixture-private-key-1234567890');configured=true;return {configured:true,connected:true}}
   if(body.action==='create'){assert.equal(body.document,'12345678909');assert.equal(body.amount_cents,5000);assert.equal(body.method,'UNDEFINED');items=[{...body,created_by:fixtures.user.id,status:mode,invoice_url:'https://sandbox.asaas.com/i/fixture',net_cents:null}];return {charge:items[0]}}
   if(body.action==='sync'){mode='CONFIRMED';items[0]={...items[0],status:mode};return {charge:items[0]}}
   if(body.action==='cancel'){mode='CANCELED';items[0]={...items[0],status:mode,invoice_url:null};return {charge:items[0]}}
   if(body.action==='disconnect'){configured=false;return {}}
   throw Error('Unexpected billing action '+body.action)
  }
  await installSupabaseMock(page,{user:fixtures.user,profile:fixtures.profile,permissions:fixtures.permissions,tables:fixtures.tables(),rpc:fixtures.rpc,functions:{...fixtures.functions,'duuk-billing':handler},theme})
  try{
   await page.goto(origin+'/admin/cobrancas');await page.getByRole('heading',{name:/^Cobranças/}).waitFor();await page.getByRole('heading',{name:'Conecte a conta empresarial da DUUK'}).waitFor();await settle(page)
   assert(await page.getByRole('button',{name:'Nova cobrança',exact:true}).isDisabled());assert.deepEqual(await layoutIssues(page),[])
   await page.getByRole('button',{name:'Conectar Asaas',exact:true}).click();const config=page.getByRole('dialog',{name:'Conectar Asaas da DUUK'})
   await config.getByLabel('Ambiente da chave').selectOption('production');assert(await config.getByRole('button',{name:'Conectar Asaas',exact:true}).isDisabled());await config.getByLabel('Ambiente da chave').selectOption('sandbox')
   await config.getByLabel('Chave da API Asaas').fill('fixture-private-key-1234567890');await config.getByLabel('E-mail para avisos técnicos').fill('technical@exemplo.test');await config.getByRole('button',{name:'Conectar Asaas',exact:true}).click();await config.waitFor({state:'detached'})
   assert(!await page.evaluate(()=>JSON.stringify(localStorage).includes('fixture-private-key')))
   await page.getByRole('button',{name:'Nova cobrança',exact:true}).click();const editor=page.getByRole('dialog',{name:'Nova cobrança',exact:true})
   await editor.getByLabel('Cliente',{exact:true}).fill('Cliente fictício de teste');await editor.getByLabel(/^CPF ou CNPJ do cliente/).fill('12345678909');await editor.getByLabel('Descrição da cobrança').fill('Filme fictício de homologação');await editor.getByLabel('Valor da cobrança (R$)').fill('50,00')
   assert(await page.evaluate(()=>{const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented}))
   await page.screenshot({path:`${out}/editor-${theme}-${width}.png`,fullPage:true});assert.deepEqual(await layoutIssues(page),[])
   await editor.getByRole('button',{name:'Revisar cobrança',exact:true}).click();assert.equal(calls.filter(x=>x.action==='create').length,0)
   await page.getByRole('dialog',{name:'Gerar cobrança de teste?',exact:true}).getByRole('button',{name:'Gerar cobrança',exact:true}).click();await editor.waitFor({state:'detached'})
   const details=page.getByRole('dialog',{name:'Filme fictício de homologação',exact:true});await details.waitFor();assert.equal(calls.filter(x=>x.action==='create').length,1)
   assert.equal(await details.getByRole('link',{name:'Abrir fatura'}).getAttribute('href'),'https://sandbox.asaas.com/i/fixture');assert(await details.getByText('Ainda não informado',{exact:true}).count());assert(!await page.evaluate(()=>JSON.stringify(localStorage).includes('12345678909')))
   await page.screenshot({path:`${out}/details-${theme}-${width}.png`,fullPage:true});assert.deepEqual(await layoutIssues(page),[])
   await details.getByRole('button',{name:'Conferir no Asaas',exact:true}).click();await details.getByText('Confirmado · aguardando liberação',{exact:true}).waitFor();assert.equal(await details.getByRole('button',{name:'Cancelar cobrança',exact:true}).count(),0)
   await details.getByRole('button',{name:'Fechar',exact:true}).click();await page.getByRole('button',{name:'Ocultar valores',exact:true}).click();assert((await page.locator('.billing-stats').innerText()).includes('R$ •••••'));await page.getByRole('button',{name:'Mostrar valores',exact:true}).click()
   await page.screenshot({path:`${out}/list-${theme}-${width}.png`,fullPage:true});assert.deepEqual(await layoutIssues(page),[]);assert.deepEqual(errors,[]);assert.deepEqual(providerCalls,[])
   if(width===390&&theme==='dark'){
    mode='PENDING';items[0].status='PENDING';await page.getByRole('button',{name:'Atualizar',exact:true}).click();await page.locator('.billing-row').first().click();await details.getByRole('button',{name:'Cancelar cobrança',exact:true}).click();assert.equal(calls.filter(x=>x.action==='cancel').length,0)
    await page.getByRole('dialog',{name:'Cancelar cobrança?',exact:true}).getByRole('button',{name:'Cancelar cobrança',exact:true}).click();await details.getByText('Cancelada',{exact:true}).waitFor();assert.equal(await details.getByRole('link',{name:'Abrir fatura'}).count(),0);assert.equal(calls.filter(x=>x.action==='cancel').length,1);await details.getByRole('button',{name:'Fechar',exact:true}).click()
    await page.getByRole('button',{name:'Desconectar Asaas',exact:true}).click();await page.getByRole('dialog',{name:'Desconectar Asaas?',exact:true}).getByRole('button',{name:'Desconectar Asaas',exact:true}).click();await page.getByRole('heading',{name:'Conecte a conta empresarial da DUUK'}).waitFor();assert(await page.getByRole('button',{name:'Nova cobrança',exact:true}).isDisabled())
   }
   console.log(`billing ${width} ${theme} passed`)
  }catch(error){console.error({width,theme,errors,body:(await page.locator('body').innerText()).slice(0,2200)});throw error}finally{await context.close()}
 }
}finally{await browser.close();await server.httpServer.close()}
