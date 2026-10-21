// Fictional clients and synthetic images; clipboard stays in RAM and all API calls are isolated.
import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import sharp from 'sharp'
import { chromium } from 'playwright-core'
import { preview } from 'vite'
import { adminShellHeaders } from '../../scripts/admin-security.mjs'
import { openAdmin, layoutIssues } from './screens.mjs'
import * as fixtures from './fixtures.mjs'

const out='/tmp/duuk-profile-client';await mkdir(out,{recursive:true})
const pixels=Buffer.alloc(3000*2000*3);let seed=421
for(let i=0;i<pixels.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;pixels[i]=seed>>>24}
const source=await sharp(pixels,{raw:{width:3000,height:2000,channels:3}}).jpeg({quality:97}).withMetadata({exif:{IFD0:{Copyright:'Fictional crop test'}}}).toBuffer()
assert(source.length>2097152&&source.length<20*1024*1024)
const headers=adminShellHeaders(JSON.parse(await readFile(new URL('../../vercel.json',import.meta.url),'utf8')));delete headers['content-type']
const server=await preview({root:process.env.DUUK_PROFILE_PREVIEW_ROOT||new URL('../../',import.meta.url).pathname,preview:{host:'127.0.0.1',port:0,headers}}),origin=`http://127.0.0.1:${server.httpServer.address().port}`
const browser=await chromium.launch({channel:'chrome'})
try{
 for(const width of [320,390,1440])for(const theme of ['dark','light']){
  if(process.env.DUUK_PROFILE_CASES&&!process.env.DUUK_PROFILE_CASES.split(',').includes(`${width}-${theme}`))continue
  const profile={...fixtures.profile},uploads=[]
  const team=body=>{if(body.__file){uploads.push(body.__file);profile.avatar_url='data:image/jpeg;base64,'+body.__file.base64;return {avatar_url:profile.avatar_url}}if(body.action==='profile'){Object.assign(profile,{name:body.name,phone:body.phone,job_title:body.job_title});return {}}return fixtures.functions['duuk-team'](body)}
  const opened=await openAdmin(browser,origin,{route:'/admin/comercial/clientes',width,theme,profile,functions:{...fixtures.functions,'duuk-team':team}}),{page,context,mock}=opened
  page.setDefaultTimeout(12000)
  try{
   await page.evaluate(()=>{window.__clipboard=[];window.__copyFail=false;Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{if(window.__copyFail)throw Error('Clipboard denied fixture');window.__clipboard.push(value)}}})})
   await page.getByRole('button',{name:'Novo lead',exact:true}).click()
   const editor=page.getByRole('dialog',{name:'Novo cliente / lead',exact:true});await editor.getByLabel('Nome',{exact:true}).fill('Cliente Exemplo')
   await editor.getByRole('button',{name:'Copiar pedido de dados',exact:true}).click();await editor.getByText('Pronta para colar e enviar ao cliente.',{exact:true}).waitFor()
   const copied=await page.evaluate(()=>window.__clipboard.at(-1));assert(copied.startsWith('Olá, Cliente!'));for(const field of ['Nome completo','Telefone/WhatsApp','E-mail','Cidade','projeto','Data do evento'])assert(copied.includes(field));assert(!copied.includes('Valor estimado')&&!copied.includes('Responsável'))
   assert.equal(mock.calls.filter(c=>c.path==='/rest/v1/duuk_clients'&&['POST','PATCH'].includes(c.method)).length,0,'Copiar não pode cadastrar ou editar o cliente')
   await page.evaluate(()=>{window.__copyFail=true});await editor.getByRole('button',{name:'Mensagem copiada',exact:true}).click();const message=editor.getByLabel('Mensagem para solicitar dados',{exact:true});await message.waitFor({state:'visible'});assert.equal(await message.inputValue(),copied);await page.waitForFunction(()=>{const t=document.activeElement;return t?.tagName==='TEXTAREA'&&t.selectionEnd===t.value.length});assert.deepEqual(await layoutIssues(page),[])
   assert.equal(await editor.getByRole('button',{name:'Mensagem copiada',exact:true}).count(),0,'Falha atual não pode continuar anunciando cópia confirmada')
   await page.screenshot({path:`${out}/client-copy-${width}-${theme}.png`,fullPage:true});await editor.getByRole('button',{name:'Cancelar',exact:true}).click()
   await page.locator('.crm-client__open').first().click();const detail=page.locator('dialog[open]');await detail.getByRole('button',{name:'Copiar pedido de dados',exact:true}).waitFor();await detail.getByRole('button',{name:'Fechar',exact:true}).click()
   await page.goto(origin+'/admin/configuracoes/perfil');await page.getByRole('button',{name:'Trocar foto',exact:true}).waitFor()
   const choose=page.getByLabel('Escolher foto de perfil',{exact:true}),payload={name:'foto-grande.jpg',mimeType:'image/jpeg',buffer:source}
   await choose.setInputFiles(payload);const crop=page.getByRole('dialog',{name:'Enquadrar foto de perfil',exact:true});await crop.locator('.avatar-crop__frame').waitFor();assert.equal(uploads.length,0)
   await crop.getByRole('button',{name:'Cancelar',exact:true}).click();assert.equal(uploads.length,0);assert.equal(await page.locator('.settings-profile__identity img').count(),0)
   await choose.setInputFiles(payload);await crop.locator('.avatar-crop__frame').waitFor();const zoom=crop.getByRole('slider',{name:/Zoom da foto/});await zoom.focus();await page.keyboard.press('End');assert.equal(await zoom.inputValue(),'4')
   const frame=crop.getByRole('group',{name:/Posição da foto/});await frame.focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowUp');assert.notEqual(await frame.locator('img').evaluate(e=>e.style.left),'50%');assert.deepEqual(await layoutIssues(page),[])
   await page.screenshot({path:`${out}/avatar-crop-${width}-${theme}.png`,fullPage:true});await crop.getByRole('button',{name:'Usar enquadramento',exact:true}).click();await crop.waitFor({state:'detached'});await page.locator('.settings-profile__identity img').waitFor();assert.equal(uploads.length,0,'Enquadrar prepara a foto sem enviá-la')
   await page.getByRole('button',{name:'Salvar perfil',exact:true}).click();await page.getByText('Perfil atualizado.',{exact:true}).waitFor();assert.equal(uploads.length,1)
   const uploaded=Buffer.from(uploads[0].base64,'base64'),meta=await sharp(uploaded).metadata();assert.equal(meta.width,512);assert.equal(meta.height,512);assert.equal(meta.format,'jpeg');assert.equal(meta.exif,undefined);assert(uploaded.length<2097152&&uploaded.length<source.length/10);assert.equal(uploads[0].name,'foto-perfil.jpg')
   if(width===320&&theme==='dark'){await choose.setInputFiles({name:'grande-demais.jpg',mimeType:'image/jpeg',buffer:Buffer.alloc(20*1024*1024+1)});await page.getByText('Use JPG, PNG ou WebP de até 20 MB.',{exact:true}).waitFor();assert.equal(await page.locator('dialog[open]').count(),0);assert.equal(uploads.length,1)}
   assert.deepEqual(await layoutIssues(page),[]);assert.deepEqual(opened.errors,[])
   console.log(`${width} ${theme}: copy without writes, manual clipboard fallback, large photo, cancel, keyboard/zoom and optimized private upload passed`)
  }catch(error){await page.screenshot({path:`${out}/failure-${width}-${theme}.png`,fullPage:true});console.error({width,theme,error:error.message,errors:opened.errors});throw error}finally{await context.close()}
 }
 const mail=await openAdmin(browser,origin,{route:'/admin/comercial/emails',width:390});try{await mail.page.getByRole('button',{name:'Novo e-mail',exact:true}).click();const brand=mail.page.locator('.mail-compose__sender .mail-avatar--duuk');await brand.waitFor();assert.match(await brand.evaluate(e=>getComputedStyle(e).backgroundImage),/linear-gradient/);assert.match(await brand.locator('img').getAttribute('src'),/duuk-logo-white\.png$/);assert.deepEqual(mail.errors,[]);console.log('Commercial sender uses the original white logo over the orange background')}finally{await mail.context.close()}
}finally{await browser.close();await server.httpServer.close()}
