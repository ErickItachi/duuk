// Isolated checks: finance semantics, mailbox identity, loading UI, code email and local sound.
import assert from 'node:assert/strict'
import {mkdir,writeFile} from 'node:fs/promises'
import {chromium} from 'playwright-core'
import {openAdmin,startServer,settle,layoutIssues} from './screens.mjs'
import {installSupabaseMock} from './supabase-mock.mjs'
import * as fixtures from './fixtures.mjs'
import {signingCodeMessage} from '../../supabase/functions/_shared/sign-verification.mjs'
const out=process.env.DUUK_E2E_OUT || '/tmp/duuk-2.3-refinements'
await mkdir(out,{recursive:true})
const {server,origin}=await startServer()
const browser=await chromium.launch(process.env.DUUK_BROWSER_PATH?{executablePath:process.env.DUUK_BROWSER_PATH}:{channel:'chrome'})
try {
 for(const theme of ['dark','light']) for(const width of [320,1440]) {
  const {page,context,errors}=await openAdmin(browser,origin,{route:'/admin/financeiro',width,theme})
  const tones=await page.evaluate(()=>{
   const root=getComputedStyle(document.documentElement), negative=document.querySelector('.finance-money.is-negative'), expense=document.querySelector('.finance-bar--expense'), income=document.querySelector('.finance-bar--income'), kpi=document.querySelector('.finance-kpi[data-kind=negative] .finance-money')
   const normalize=color=>{const e=document.createElement('span');e.style.color=color;document.body.append(e);const c=getComputedStyle(e).color;e.remove();return c}
   return {red:normalize(root.getPropertyValue('--ds-danger')),green:normalize(root.getPropertyValue('--ds-success')),negative:negative&&getComputedStyle(negative).color,kpi:kpi&&getComputedStyle(kpi).color,expense:expense&&getComputedStyle(expense).fill,income:income&&getComputedStyle(income).fill}
  })
  assert.equal(tones.negative,tones.red);assert.equal(tones.kpi,tones.red);assert.equal(tones.expense,tones.red);assert.equal(tones.income,tones.green)
  assert.deepEqual(await layoutIssues(page),[]);assert.deepEqual(errors,[])
  await page.screenshot({path:`${out}/finance-${theme}-${width}.png`})
  await context.close()
 }
 const mail=await openAdmin(browser,origin,{route:'/admin/comercial/emails',width:1440})
 assert.equal(await mail.page.locator('.mail-folders__account .mail-avatar--duuk img').count(),1)
 await mail.page.getByRole('button',{name:'Novo e-mail',exact:true}).click()
 await mail.page.waitForSelector('.mail-compose')
 assert.equal(await mail.page.locator('.mail-compose__sender .mail-avatar--duuk img').count(),1)
 await mail.page.screenshot({path:`${out}/mail-desktop.png`})
 await mail.context.close()
 const phone=await openAdmin(browser,origin,{route:'/admin/comercial/emails',width:320,theme:'light'})
 await phone.page.getByRole('button',{name:'Novo e-mail',exact:true}).click()
 await phone.page.waitForSelector('.mail-compose')
 const phoneDialog=phone.page.locator('.mail-compose')
 assert.equal(await phoneDialog.evaluate(e=>e.scrollWidth>e.clientWidth+1),false)
 await phone.page.screenshot({path:`${out}/mail-mobile.png`});await phone.context.close()

 // Hold only the admin chunk so the real boot loader can be inspected without delaying the product.
 const bootContext=await browser.newContext({viewport:{width:390,height:844}}),boot=await bootContext.newPage()
 await installSupabaseMock(boot,{user:fixtures.user,profile:fixtures.profile,permissions:fixtures.permissions,tables:fixtures.tables(),rpc:fixtures.rpc,functions:fixtures.functions})
 let release;const gate=new Promise(resolve=>{release=resolve})
 await boot.route('**/src/admin/AdminPage.jsx*',async route=>{await gate;await route.continue()})
 await boot.goto(origin+'/admin',{waitUntil:'domcontentloaded'})
 await boot.waitForSelector('.admin-loader')
 assert.equal(await boot.locator('.admin-loader img').count(),1)
 assert.equal(await boot.locator('.admin-loader__spinner').count(),1)
 assert.equal(await boot.locator('.admin-loader__light,.admin-loader__reel,.admin-loader__progress').count(),0)
 assert.equal(await boot.locator('.admin-loader__spinner').evaluate(e=>getComputedStyle(e).width),'14px')
 await boot.screenshot({path:`${out}/loader.png`});release();await boot.waitForSelector('.admin-shell');await bootContext.close()

 // A fresh version must not introduce a changelog dialog or obstruct the update controls.
 for(const width of [320,1440]) {
  const about=await openAdmin(browser,origin,{route:'/admin/configuracoes/sobre',width})
  await about.page.evaluate(()=>{for(const key of Object.keys(localStorage)) if(key.startsWith('duuk-release-seen:'))localStorage.removeItem(key)})
  await about.page.reload();await settle(about.page);await about.page.waitForTimeout(2300)
  assert.equal(await about.page.locator('dialog[open]').count(),0)
  assert.equal(await about.page.getByText('Novidades da DUUK',{exact:true}).count(),0)
  assert.equal(await about.page.getByText('Nesta versão',{exact:true}).count(),0)
  assert.equal(await about.page.getByRole('button',{name:'Verificar atualizações',exact:true}).count(),1)
  assert.deepEqual(await layoutIssues(about.page),[]);assert.deepEqual(about.errors,[])
  await about.page.screenshot({path:`${out}/about-${width}.png`});await about.context.close()
 }

 const email=signingCodeMessage('fictional@test.invalid','000000')
 await writeFile(`${out}/code-email.html`,email.html)
 for(const width of [320,640]) {
  const context=await browser.newContext({viewport:{width,height:1000}}),page=await context.newPage()
  await page.route('https://www.duukfilms.com/media/duuk-logo-white.png',route=>route.fulfill({path:new URL('../../public/media/duuk-logo-white.png',import.meta.url).pathname,contentType:'image/png'}))
  await page.setContent(email.html)
  await page.waitForFunction(()=>document.images[0].complete)
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
  assert.equal(await page.getByText('000000',{exact:true}).count(),1)
  await page.screenshot({path:`${out}/code-email-${width}.png`});await context.close()
 }

 // A local audio double measures two notes, without speakers or any real push/message.
 const sound=await openAdmin(browser,origin,{route:'/admin/notificacoes'})
 await sound.page.addInitScript(()=>{
  window.__notes=0
  window.AudioContext=class {
   state='suspended';currentTime=0;destination={}
   async resume(){this.state='running'} async close(){this.state='closed'}
   createOscillator(){return{frequency:{},connect(){},disconnect(){},start(){window.__notes++},stop(){}}}
   createGain(){return{gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}}}
  }
 })
 await sound.page.reload();await settle(sound.page)
 assert.equal(await sound.page.evaluate(()=>window.__notes),0)
 const created_at=await sound.page.evaluate(()=>new Date().toISOString())
 sound.mock.store.duuk_notifications.push({...fixtures.tables().duuk_notifications[0],id:'qa-sound-new',title:'Novo aviso fictício',created_at,read_at:null})
 await sound.page.getByRole('button',{name:'Atualizar',exact:true}).click();await settle(sound.page)
 assert.equal(await sound.page.evaluate(()=>window.__notes),2)
 await sound.page.getByRole('button',{name:'Atualizar',exact:true}).click();await settle(sound.page)
 assert.equal(await sound.page.evaluate(()=>window.__notes),2)
 await sound.page.goto(origin+'/admin/configuracoes/notificacoes');await settle(sound.page)
 assert.equal(await sound.page.getByRole('switch',{name:'Notificações de Social Media',exact:true}).count(),1)
 await sound.page.getByRole('switch',{name:'Som de notificações neste aparelho',exact:true}).click()
 assert.equal(await sound.page.getByRole('switch',{name:'Som de notificações neste aparelho',exact:true}).getAttribute('aria-checked'),'false')
 const beforePreview=await sound.page.evaluate(()=>window.__notes)
 await sound.page.getByRole('button',{name:'Ouvir som',exact:true}).click()
 await sound.page.waitForFunction(before=>window.__notes===before+2,beforePreview)
 await sound.page.screenshot({path:`${out}/notification-settings.png`})
 await sound.context.close()
 console.log('Finance colors, mailbox identity, clean loader, no version popups, branded code email, fresh sound, no replay and sound controls passed')
} finally {await browser.close();await server.close()}
