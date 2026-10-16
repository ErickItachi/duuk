import test from 'node:test'
import assert from 'node:assert/strict'
import { createSpotifyBrowserPlayer, sdkErrorMessage } from '../src/spotify/sdk.mjs'
const tick=()=>new Promise(resolve=>setTimeout(resolve,0))
function fixture(getToken=async()=>'ephemeral-access'){
 let options,instance;const events=new Map(),calls=[]
 class Player{
  constructor(o){options=o;instance=this}
  addListener(k,f){events.set(k,f)}
  connect(){calls.push('connect');return Promise.resolve(true)}
  disconnect(){calls.push('disconnect')}
 }
 const handle=createSpotifyBrowserPlayer({Player},{getToken,onState:s=>calls.push(s),onReady:id=>calls.push(id),onError:e=>calls.push(e),onOffline:()=>calls.push('offline'),onAutoplay:()=>calls.push('activate')})
 return {handle,events,calls,get options(){return options},get instance(){return instance}}
}
test('full player registers a Connect device and obtains fresh access tokens only through the callback',async()=>{
 let requests=0;const f=fixture(async()=>'ephemeral-'+(++requests)),tokens=[]
 await tick();assert.equal(f.calls[0],'connect')
 f.options.getOAuthToken(t=>tokens.push(t));await tick();f.options.getOAuthToken(t=>tokens.push(t));await tick()
 assert.deepEqual(tokens,['ephemeral-1','ephemeral-2'])
 f.events.get('ready')({device_id:'own-device'});assert.equal(await f.handle.ready,'own-device')
 f.events.get('autoplay_failed')();f.events.get('not_ready')();assert(f.calls.includes('activate'));assert(f.calls.includes('offline'))
 f.handle.dispose();f.handle.dispose();assert.equal(f.calls.filter(x=>x==='disconnect').length,1)
})
test('disconnect blocks a late credential response and all late SDK events',async()=>{
 let resolveToken;const f=fixture(()=>new Promise(resolve=>{resolveToken=resolve})),tokens=[]
 f.options.getOAuthToken(t=>tokens.push(t));await tick();f.handle.dispose();const before=f.calls.length
 resolveToken('private-late-access');await tick();f.events.get('ready')({device_id:'late'});f.events.get('player_state_changed')({private:'track'});f.events.get('autoplay_failed')()
 assert.deepEqual(tokens,[]);assert.equal(f.calls.length,before);await assert.rejects(f.handle.ready,/encerrado/)
})
test('player failures are actionable and never expose raw upstream errors',async()=>{
 const f=fixture();f.events.get('authentication_error')({message:'PRIVATE ERROR TOKEN'});await assert.rejects(f.handle.ready,/Reconecte/)
 assert(!f.calls.join(' ').includes('PRIVATE'));assert.match(sdkErrorMessage('account_error'),/Premium/);assert.match(sdkErrorMessage('initialization_error'),/iPhone/);f.handle.dispose()
})
