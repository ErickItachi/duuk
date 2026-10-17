import test from 'node:test'
import assert from 'node:assert/strict'
import { appleMobile, localPlayback, nativeCommand, nextRepeat, playbackBody } from '../src/spotify/playback.mjs'
const track=n=>({uri:'spotify:track:'+n.repeat(22),type:'track',name:n})
test('playback preserves the selected playlist context and the remaining search sequence',()=>{
 const one=track('a'),two=track('b'),three=track('c'),items=[one,two,three]
 assert.deepEqual(playbackBody(one,{items}),{uris:items.map(t=>t.uri)})
 assert.deepEqual(playbackBody(two,{items}),{uris:[two.uri,three.uri]})
 const context={type:'playlist',uri:'spotify:playlist:'+'d'.repeat(22)}
 assert.deepEqual(playbackBody(two,{context,items}),{context_uri:context.uri,offset_uri:two.uri})
 assert.throws(()=>playbackBody({uri:'javascript:evil',type:'track'}))
})
test('local controls select official SDK methods; remote-only operations remain API operations',async()=>{
 const calls=[],sdk=Object.fromEntries(['pause','resume','nextTrack','previousTrack','seek','setVolume'].map(method=>[method,value=>{calls.push([method,value]);return Promise.resolve()}]))
 for(const body of [{action:'pause'},{action:'play'},{action:'next'},{action:'previous'},{action:'seek',position_ms:24000},{action:'volume',volume_percent:65}])await nativeCommand(sdk,body)()
 assert.deepEqual(calls.map(v=>v[0]),['pause','resume','nextTrack','previousTrack','seek','setVolume']);assert.equal(calls.at(-1)[1],.65)
 assert.equal(nativeCommand(sdk,{action:'play',uris:[track('a').uri]}),null);assert.equal(nativeCommand(sdk,{action:'shuffle'}),null)
})
test('SDK metadata uses the real track, position, duration, volume, repeat and restrictions',()=>{
 const state={paused:false,loading:false,position:34000,duration:200000,shuffle:true,repeat_mode:2,disallows:{skipping_next:true},track_window:{current_track:track('a')}}
 const result=localPlayback(state,{id:'own'},0,false)
 assert.equal(result.progress_ms,34000);assert.equal(result.item.duration_ms,200000);assert.equal(result.device.volume_percent,0);assert.equal(result.device.supports_volume,false);assert.equal(result.repeat_state,'track');assert.equal(result.shuffle_state,true);assert(result.actions.disallows.skipping_next)
 assert.equal(localPlayback({...state,loading:true},{id:'own'},.5).is_playing,false)
 assert.equal(localPlayback(null,{},.5),null)
})
test('iOS volume is physical and repeat skips only modes Spotify disallows',()=>{
 assert(appleMobile({userAgent:'iPhone'}));assert(appleMobile({platform:'MacIntel',maxTouchPoints:5}));assert(!appleMobile({platform:'MacIntel',maxTouchPoints:0}))
 assert.equal(nextRepeat('off',{toggling_repeat_context:true}),'track');assert.equal(nextRepeat('off',{toggling_repeat_context:true,toggling_repeat_track:true}),null)
})
