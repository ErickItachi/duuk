// All Spotify/Supabase data and iframe content are intercepted. Never plays real audio.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { preview } from 'vite'
import { readFile } from 'node:fs/promises'
import { chromium } from 'playwright-core'
import { adminShellHeaders } from '../../scripts/admin-security.mjs'
import { installSupabaseMock, SUPABASE_URL } from './supabase-mock.mjs'
import { layoutIssues, settle } from './screens.mjs'
import * as fixtures from './fixtures.mjs'
const headers=adminShellHeaders(JSON.parse(await readFile(new URL('../../vercel.json',import.meta.url),'utf8')));delete headers['content-type']
const server=await preview({root:new URL('../../',import.meta.url).pathname,preview:{host:'127.0.0.1',port:0,headers}}),origin=`http://127.0.0.1:${server.httpServer.address().port}`
const browser=await chromium.launch({channel:'chrome'}),out='/tmp/duuk-spotify-e2e';await mkdir(out,{recursive:true})
const track={id:'a'.repeat(22),uri:'spotify:track:'+'a'.repeat(22),type:'track',name:'Música fictícia de trabalho',artists:[{name:'Artista de teste'}],duration_ms:180000,album:{name:'Álbum de teste',images:[{url:SUPABASE_URL+'/storage/v1/object/sign/duuk-media/fixture.png'}]}}
const playlist={id:'b'.repeat(22),uri:'spotify:playlist:'+'b'.repeat(22),type:'playlist',name:'Foco da pessoa A',description:'Lista privada fictícia',public:false,owner:{display_name:'Pessoa A'},images:track.album.images,snapshot_id:'isolated-snapshot'}
try{
 for(const width of [320,390,768,1440])for(const theme of ['dark','light']){
  const context=await browser.newContext({viewport:{width,height:width<768?844:1000},serviceWorkers:'block',reducedMotion:'reduce'}),page=await context.newPage(),errors=[],calls=[]
  page.on('pageerror',e=>errors.push(e.message));let connected=true,created=0,iframeLoads=0
  await page.addInitScript(()=>{window.__spotifyCsp=[];document.addEventListener('securitypolicyviolation',e=>window.__spotifyCsp.push(e.violatedDirective))})
  const handler=body=>{calls.push(body)
   if(body.action==='status')return {configured:true,client_id:'f'.repeat(32),connection:connected?{display_name:'Pessoa A',status:'connected'}:null}
   if(body.action==='disconnect'){connected=false;return {}}
   if(body.action==='player')return {data:{item:track,is_playing:false,progress_ms:30000,timestamp:123,repeat_state:'off',shuffle_state:false,device:{id:'fixture-device',name:'Computador de teste',type:'Computer',supports_volume:true,volume_percent:30},actions:{disallows:{}}}}
   if(body.action==='collection')return {data:{items:body.kind==='playlists'?[playlist]:[{track}],next:null}}
   if(body.action==='search')return {data:{tracks:{items:[track],next:null}}}
   if(body.action==='entity')return {data:playlist}
   if(body.action==='items')return {data:{items:[{item:track}]}}
   if(body.action==='queue')return {data:{currently_playing:track,queue:[track]}}
   if(body.action==='devices')return {data:{devices:[{id:'fixture-device',name:'Computador de teste',type:'Computer',is_active:true},{id:'fixture-phone',name:'Celular de teste',type:'Smartphone',is_active:false}]}}
   if(body.action==='playlist_create'){created++;return {data:{...playlist,name:body.name}}}
   return {data:null}
  }
  const mock=await installSupabaseMock(page,{user:fixtures.user,profile:fixtures.profile,permissions:fixtures.permissions,tables:fixtures.tables(),rpc:fixtures.rpc,functions:{...fixtures.functions,'duuk-spotify':handler},theme})
  await page.route('https://open.spotify.com/embed/**',route=>{iframeLoads++;return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Isolated Spotify fixture</title><p>Player oficial simulado. Nenhum áudio.</p>'})})
  try {
  page.setDefaultTimeout(15000)
  await page.goto(origin+'/admin/spotify');await page.getByText(playlist.name,{exact:true}).waitFor();await settle(page)
  assert.equal(iframeLoads,0,'Spotify iframe prefetched without a gesture')
  assert.deepEqual(await layoutIssues(page),[])
  await page.screenshot({path:`${out}/library-${theme}-${width}.png`,fullPage:true})
  await page.getByRole('tab',{name:'Buscar',exact:true}).click();await page.getByRole('textbox',{name:'Buscar no Spotify',exact:true}).fill('Música fictícia');await page.getByRole('tabpanel').getByRole('button',{name:'Buscar',exact:true}).click();await page.getByRole('button',{name:track.name,exact:true}).waitFor()
  await page.getByRole('button',{name:`Ouvir ${track.name} no painel`,exact:true}).last().click();await page.locator('.spotify-dock iframe').waitFor();await page.waitForTimeout(200)
  const frame=await page.locator('.spotify-dock iframe').getAttribute('src');assert(frame.startsWith('https://open.spotify.com/embed/track/'));assert(!frame.includes('token'))
  if(width===390&&theme==='dark'){
   await page.locator('.spotify-dock iframe').evaluate(el=>el.dataset.continuity='same-player')
   await page.locator('a[href="/admin"]:visible').first().click();await page.waitForSelector('.dashboard-hero')
   assert.equal(await page.locator('.spotify-dock iframe').getAttribute('data-continuity'),'same-player')
   await page.goBack();await page.getByRole('tab',{name:'Buscar',exact:true}).click();await page.getByRole('textbox',{name:'Buscar no Spotify',exact:true}).fill('Música fictícia');await page.getByRole('tabpanel').getByRole('button',{name:'Buscar',exact:true}).click();await page.getByRole('button',{name:track.name,exact:true}).waitFor()
   assert.equal(await page.locator('.spotify-dock iframe').getAttribute('data-continuity'),'same-player')
   assert.equal(iframeLoads,1)
  }
  await page.screenshot({path:`${out}/player-${theme}-${width}.png`,fullPage:true})
  assert.deepEqual(await layoutIssues(page),[])
  await page.getByRole('button',{name:'Fechar player e parar a reprodução'}).click();await page.locator('.spotify-dock').waitFor({state:'detached'})
  await page.getByRole('button',{name:`Adicionar ${track.name} à fila`,exact:true}).click();await page.waitForTimeout(100);assert(calls.some(b=>b.action==='enqueue'&&b.uri===track.uri))
  await page.getByRole('button',{name:`Salvar ${track.name} na biblioteca`,exact:true}).click();await page.waitForTimeout(100);assert(calls.some(b=>b.action==='library'&&b.operation==='save'))
  await page.getByRole('button',{name:`Adicionar ${track.name} a uma playlist`,exact:true}).click();await page.getByRole('dialog',{name:'Adicionar à sua playlist'}).waitFor();await page.getByRole('combobox',{name:'Playlist',exact:true}).selectOption(playlist.id);await page.getByRole('button',{name:'Adicionar música',exact:true}).click();await page.waitForSelector('dialog[open]',{state:'detached'});assert(calls.some(b=>b.action==='playlist_add'&&b.id===playlist.id))
  await page.getByRole('tab',{name:'Biblioteca',exact:true}).click();await page.getByRole('button',{name:'Criar playlist',exact:true}).click();await page.getByRole('textbox',{name:'Nome da playlist',exact:true}).fill('Nova playlist isolada');assert(await page.evaluate(()=>{const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);return event.defaultPrevented}));assert.equal(await page.getByRole('checkbox',{name:'Playlist pública no Spotify'}).isChecked(),false);await page.getByRole('button',{name:'Salvar playlist',exact:true}).click();await page.waitForSelector('dialog[open]',{state:'detached'});assert.equal(created,1)
  await page.getByRole('tab',{name:'Dispositivos',exact:true}).click();await page.getByRole('button',{name:/Celular de teste/}).click();await page.waitForTimeout(100);assert(calls.some(b=>b.action==='transfer'&&b.device_id==='fixture-phone'&&b.play!==true))
  const button=page.getByRole('button',{name:'Abrir DUUK AI',exact:true});assert(await button.isVisible());assert.match(await button.innerText(),/DUUK AI/);const rect=await button.boundingBox();assert(rect.width>=100&&rect.height>=44)
  await page.getByRole('button',{name:'Desconectar minha conta',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Desconectar minha conta',exact:true}).click();await page.getByRole('button',{name:'Conectar minha conta',exact:true}).waitFor();assert(!connected)
  const persisted=await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}));assert(!persisted.includes('private-refresh'));assert(!persisted.includes(track.name));assert(!calls.some(b=>b.user_id||b.actor))
  assert.deepEqual(await page.evaluate(()=>window.__spotifyCsp),[]);assert.deepEqual(errors,[])
  assert(mock.calls.filter(c=>c.path==='/functions/v1/duuk-ai').length===0)
  console.log(`${theme} ${width}: library, search, embed gesture, queue, save, playlist creation/add, device transfer, disconnect, AI launcher and CSP passed`)
  } catch(error) { await page.screenshot({path:`${out}/failure-${theme}-${width}.png`,fullPage:false}); console.log(await page.locator('.duuk-ai-help').boundingBox());throw error }
  await context.close()
 }
 // Existing mandatory MFA suite checks provider does not mount before AAL2.
}finally{await browser.close();await new Promise(resolve=>server.httpServer.close(resolve))}
