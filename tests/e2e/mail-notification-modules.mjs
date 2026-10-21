// Received HTML and notification data are fictional; every API call is intercepted.
import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { preview } from 'vite'
import { chromium } from 'playwright-core'
import { adminShellHeaders } from '../../scripts/admin-security.mjs'
import { openAdmin, layoutIssues } from './screens.mjs'
import * as fixtures from './fixtures.mjs'

const out='/tmp/duuk-mail-notification-modules';await mkdir(out,{recursive:true})
const sanitizer=new URL('../../supabase/functions/_shared/mail-received.ts',import.meta.url).href
const fixture=new URL('../fixtures/mail-layout.html',import.meta.url).pathname
const html=execFileSync(process.env.DUUK_DENO_PATH||'deno',['eval','--node-modules-dir=none',`import {cleanReceivedMailHtml} from ${JSON.stringify(sanitizer)};console.log(cleanReceivedMailHtml(await Deno.readTextFile(${JSON.stringify(fixture)})));`],{encoding:'utf8'})
assert(!html.includes('tracker.invalid')&&!html.includes('<script'))
const headers=adminShellHeaders(JSON.parse(await readFile(new URL('../../vercel.json',import.meta.url),'utf8')));delete headers['content-type']
const server=await preview({root:process.env.DUUK_MAIL_PREVIEW_ROOT||new URL('../../',import.meta.url).pathname,preview:{host:'127.0.0.1',port:0,headers}}),origin=`http://127.0.0.1:${server.httpServer.address().port}`
const browser=await chromium.launch({channel:'chrome'})
try{
 for(const width of [320,390,768,1440])for(const theme of ['dark','light']){
  if(process.env.DUUK_MAIL_CASES&&!process.env.DUUK_MAIL_CASES.split(',').includes(`${width}-${theme}`))continue
  const tables=fixtures.tables();let centralPending=true
  // E-mail is intentionally older than the 100-item notification list.
  tables.duuk_notifications=[...Array.from({length:110},(_,i)=>({id:`agenda-${i}`,user_id:fixtures.user.id,category:'agenda',required_permission:'agenda',title:`Agenda fictícia ${i}`,body:'Fixture',link:'/admin/agenda',read_at:null,created_at:`2026-10-13T${String(i%23).padStart(2,'0')}:00:00Z`})),{id:'old-mail',user_id:fixtures.user.id,category:'commercial',required_permission:'mail',title:'E-mail antigo fictício',link:'/admin/comercial/emails?mensagem=2',read_at:null,created_at:'2026-10-01T10:00:00Z'}]
  const rpc={...fixtures.rpc,duuk_notification_summary:(body,ctx)=>{const result=fixtures.rpc.duuk_notification_summary(body,ctx);if(centralPending)result.modules['/admin/whatsapp']=1;return result}}
  const mail=body=>{if(body.action==='status')return {configured:true,can_configure:true,address:'contato@exemplo.test'};if(body.action==='list')return fixtures.functions['duuk-mail'].list(body);if(body.action==='read')return {uid:2,subject:'Verificação fictícia de segurança',html,text:'Mensagem fictícia.',from:[{name:'Conta de demonstração',address:'notificacao@example.test'}],to:[{address:'contato@exemplo.test'}],date:'2026-10-14T08:42:00-03:00',remote_images_blocked:true,attachments:[]};throw Error(`Unexpected mail action ${body.action}`)}
  const opened=await openAdmin(browser,origin,{route:'/admin/comercial/emails',width,theme,tables,rpc,functions:{...fixtures.functions,'duuk-mail':mail}}),{page,context,mock}=opened
  page.setDefaultTimeout(10000)
  const external=[];page.on('request',r=>{if(/tracker\.invalid|example\.test/.test(r.url()))external.push(r.url())})
  try{
   await page.locator('.mail-row').first().click();const frame=page.frameLocator('iframe[title="Conteúdo do e-mail"]');await frame.getByRole('heading',{name:'Verifique o e-mail adicionado à sua Conta',exact:true}).waitFor()
   const dimensions=await frame.locator('h2').evaluate(e=>({width:e.getBoundingClientRect().width,viewport:innerWidth,scroll:document.documentElement.scrollWidth,background:getComputedStyle(document.body).backgroundColor,text:getComputedStyle(e.closest('td')).color,layout:getComputedStyle(e.closest('table')).tableLayout}))
   assert(dimensions.width>dimensions.viewport*.65,`Message squeezed: ${JSON.stringify(dimensions)}`);assert.equal(dimensions.layout,'auto');assert(dimensions.scroll<=dimensions.viewport+2,`Message overflows: ${JSON.stringify(dimensions)}`)
   assert.equal(dimensions.background,theme==='dark'?'rgb(27, 27, 27)':'rgb(255, 255, 255)');assert.equal(dimensions.text,theme==='dark'?'rgb(222, 222, 222)':'rgba(0, 0, 0, 0.87)')
   assert.equal(await page.locator('iframe[title="Conteúdo do e-mail"]').evaluate(e=>e.contentDocument),null,'Opaque sandbox must protect panel credentials')
   await page.getByRole('button',{name:'Visual original',exact:true}).click();await frame.locator('body').evaluate(e=>getComputedStyle(e).backgroundColor).then(value=>assert.equal(value,'rgb(255, 255, 255)'))
   await page.getByRole('button',{name:'Usar tema do painel',exact:true}).click()
   if(width===1440){const before=await page.locator('.mail-reader').evaluate(e=>e.getBoundingClientRect().width);await page.getByRole('button',{name:'Ampliar mensagem',exact:true}).click();assert(await page.locator('.mail-reader').evaluate(e=>e.getBoundingClientRect().width)>before*1.5);await page.getByRole('button',{name:'Mostrar lista',exact:true}).click()}
   await page.screenshot({path:`${out}/reader-${width}-${theme}.png`,fullPage:true});assert.deepEqual(await layoutIssues(page),[])
   const nav=width>=768?page.locator('.ds-sidebar'):page.locator('.ds-drawer[open]')
   if(width<768)await page.getByRole('button',{name:'Menu, há notificações em outros módulos',exact:true}).click()
   await nav.locator('a[href="/admin/comercial/emails"] .ds-module-dot').waitFor();await nav.locator('a[href="/admin/whatsapp"] .ds-module-dot').waitFor()
   assert.equal(mock.calls.filter(c=>c.path==='/rest/v1/duuk_notifications'&&c.method==='GET').at(0).search.includes('limit=100'),true)
   assert.match(await nav.locator('a[href="/admin/comercial/emails"]').getAttribute('aria-label'),/não lidas/)
   await page.screenshot({path:`${out}/badges-${width}-${theme}.png`,fullPage:true})
   if(width===1440){await page.getByRole('button',{name:'Minimizar menu',exact:true}).click();assert.equal(await nav.locator('a[href="/admin/comercial/emails"] .ds-module-dot').isVisible(),true);await page.screenshot({path:`${out}/rail-${theme}.png`});await page.getByRole('button',{name:'Expandir menu',exact:true}).click()}
   else if(width<768)await page.getByRole('button',{name:'Fechar menu',exact:true}).click()
   // Explicit notification reading clears only notifications, without marking chat messages read.
   await page.locator('a.admin-notification-bell').click();await page.getByRole('button',{name:'Marcar todas como lidas',exact:true}).click();await page.getByText('Notificações marcadas como lidas.',{exact:true}).waitFor()
   if(width<768)await page.getByRole('button',{name:'Menu, há notificações em outros módulos',exact:true}).click()
   assert.equal(await nav.locator('a[href="/admin/comercial/emails"] .ds-module-dot').count(),0);assert.equal(await nav.locator('a[href="/admin/whatsapp"] .ds-module-dot').count(),1)
   centralPending=false;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await nav.locator('a[href="/admin/whatsapp"] .ds-module-dot').waitFor({state:'detached'})
   if(width<768)await page.getByRole('button',{name:'Fechar menu',exact:true}).click()
   assert.deepEqual(external,[]);// Playwright's clock initialization also targets opaque frames; Chrome correctly refuses it.
   assert.deepEqual(opened.errors.filter(error=>!error.includes("Blocked script execution in 'about:srcdoc' because the document's frame is sandboxed")),[]);assert.deepEqual(await layoutIssues(page),[])
   assert(!mock.calls.some(c=>c.path.includes('/functions/v1/duuk-mail')&&['send','flag'].includes(c.body?.action)))
   console.log(`${width} ${theme}: original layout, safe sandbox, theme, expanded reading, module indicators beyond list limit, explicit reading and chat independence passed`)
  }catch(error){await page.screenshot({path:`${out}/failure-${width}-${theme}.png`,fullPage:true});console.error({width,theme,error:error.message,errors:opened.errors});throw error}finally{await context.close()}
 }
}finally{await browser.close();await server.httpServer.close()}
