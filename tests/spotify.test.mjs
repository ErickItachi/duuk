import test from 'node:test'
import assert from 'node:assert/strict'
import { SPOTIFY_REDIRECT, SPOTIFY_SCOPES, spotifyAuthorization, spotifyFetch, spotifyPlan, spotifyTokens, spotifyUri } from '../supabase/functions/_shared/spotify.mjs'
import { spotifyArtwork, spotifyEmbed, spotifyItems, spotifyLink } from '../src/spotify/model.mjs'
const id='a'.repeat(22),uri='spotify:track:'+id
const response=(status,body={},headers={})=>new Response(status===204?null:JSON.stringify(body),{status,headers:{'Content-Type':'application/json',...headers}})
test('Spotify authorization uses fixed HTTPS callback, PKCE and individual consent without client secrets',()=>{
 const u=new URL(spotifyAuthorization('client','state','challenge'))
 assert.equal(u.origin,'https://accounts.spotify.com');assert.equal(u.pathname,'/authorize')
 assert.equal(u.searchParams.get('redirect_uri'),SPOTIFY_REDIRECT);assert.equal(u.searchParams.get('code_challenge_method'),'S256');assert.equal(u.searchParams.get('show_dialog'),'true')
 assert(!SPOTIFY_SCOPES.includes('streaming'));assert(!u.searchParams.has('client_secret'))
})
test('Spotify request planner accepts bounded resources and rejects arbitrary URLs, IDs and inputs',()=>{
 for(const body of [{action:'https://evil.invalid'},{action:'entity',type:'../../users',id},{action:'items',type:'track',id},{action:'search',q:'',type:'track'},{action:'search',q:'x',type:'arbitrary'},{action:'search',q:'x',offset:-1},{action:'volume',volume_percent:101},{action:'volume',volume_percent:null},{action:'transfer',device_id:'../../x'},{action:'play',uris:[uri],context_uri:'spotify:album:'+id},{action:'enqueue',uri:'https://evil.invalid'},{action:'playlist_add',id,uris:Array(101).fill(uri)}])assert.throws(()=>spotifyPlan(body))
 assert.throws(()=>spotifyUri('spotify:local:private'))
 assert.equal(spotifyPlan({action:'search',q:'foco'}).params.limit,10)
 assert.equal(spotifyPlan({action:'library',operation:'remove',uris:[uri]}).path,'/me/library')
 assert.equal(spotifyPlan({action:'items',type:'playlist',id}).path,`/playlists/${id}/items`)
 assert.equal(spotifyPlan({action:'playlist_create',name:'Concentração'}).body.public,false)
 assert.equal(spotifyPlan({action:'playlist_remove',id,uris:[uri]}).body.items[0].uri,uri)
})
test('Spotify requests cannot select another member and mutations are never automatically retried',async()=>{
 const calls=[]
 for(const account of ['member-a','member-b']){
  await spotifyFetch(spotifyPlan({action:'collection',kind:'playlists',user_id:'other'}),'private-'+account,async(u,o)=>{calls.push({url:String(u),token:o.headers.Authorization,redirect:o.redirect});return response(200,{items:[]})})
 }
 assert(calls.every(c=>c.url.startsWith('https://api.spotify.com/v1/me/playlists')))
 assert.deepEqual(calls.map(c=>c.token),['Bearer private-member-a','Bearer private-member-b']);assert(calls.every(c=>c.redirect==='error'))
 let count=0
 await assert.rejects(spotifyFetch(spotifyPlan({action:'playlist_create',name:'Only once'}),'token',async()=>{count++;throw new Error('Network interrupted')}))
 assert.equal(count,1)
})
test('Spotify responses preserve 204, limits and safe actionable errors without upstream secrets',async()=>{
 assert.equal(await spotifyFetch(spotifyPlan({action:'pause'}),'t',async()=>response(204)),null)
 for(const status of [401,403,404,429,500])await assert.rejects(spotifyFetch(spotifyPlan({action:'player'}),'t',async()=>response(status,{error:{message:'PRIVATE-SENSITIVE-DETAILS'}},{'Retry-After':'120'})),e=>e.status===status&&!e.message.includes('PRIVATE')&&(status!==429||e.retryAfter===120))
 const data=await spotifyTokens({grant_type:'authorization_code',client_id:'public',code_verifier:'verifier'},async(url,o)=>{assert.equal(url,'https://accounts.spotify.com/api/token');assert(!o.body.has('client_secret'));assert.equal(o.redirect,'error');return response(200,{access_token:'private-access',refresh_token:'private-refresh',expires_in:3600})})
 assert.equal(data.expires_in,3600)
 await assert.rejects(spotifyTokens({},async()=>response(400,{error:'invalid_grant',error_description:'PRIVATE'})),e=>e.invalidGrant&&!e.message.includes('PRIVATE'))
})
test('Spotify UI links, images and embeds do not carry tokens or trust arbitrary URLs',()=>{
 assert.equal(spotifyLink(uri),`https://open.spotify.com/track/${id}`)
 assert.equal(new URL(spotifyEmbed(uri)).origin,'https://open.spotify.com')
 for(const value of ['javascript:alert(1)','https://evil.invalid','spotify:track:../../x','spotify:local:x']){assert.equal(spotifyLink(value),'');assert.equal(spotifyEmbed(value),'')}
 assert.equal(spotifyArtwork({images:[{url:'http://insecure.invalid'}]}),'')
 const item={uri,name:'Only member A',type:'track'};assert.deepEqual(spotifyItems({items:[{item}]}),[item]);assert.deepEqual(spotifyItems({items:[{track:item}]}),[item]);assert.deepEqual(spotifyItems({artists:{items:[item]}}),[item])
})
