import { checked, database, handler, HttpError, json, member, rateLimit, readJson, sha256 } from '../_shared/http.ts'
import { verifiedSessionClaims } from '../_shared/session-claims.mjs'
import { SPOTIFY_REDIRECT, SPOTIFY_SCOPES, SpotifyError, spotifyAuthorization, spotifyFetch, spotifyPlan, spotifyTokens } from '../_shared/spotify.mjs'

handler(async (req,headers) => {
 const db=database(),user=await member(req,db),body=await readJson(req,16000)
 const session=verifiedSessionClaims(req.headers.get('authorization')!.slice(7))!.session
 const rpc=async(operation:string,payload:Record<string,unknown>={})=>checked(await db.rpc('duuk_spotify_backend',{actor:user.id,operation,payload})) as any
 const tokenExpiry=(seconds:number)=>new Date(Date.now()+Math.min(86400,Math.max(1,seconds))*1000).toISOString()
 try {
  if(body.action==='status')return json(await rpc('status'),headers)
  if(body.action==='configure')return json(await rpc('configure',{client_id:body.client_id}),headers)
  if(body.action==='disconnect')return json(await rpc('disconnect'),headers)
  if(body.action==='start') {
   await rateLimit(db,user.id,'spotify-connect',8,600)
   const state='sp.'+crypto.randomUUID()+crypto.randomUUID(),verifier=crypto.randomUUID()+crypto.randomUUID()
   const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))
   const challenge=btoa(String.fromCharCode(...new Uint8Array(digest))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','')
   const config=await rpc('start',{state_hash:await sha256(state),verifier,session_id:session})
   return json({url:spotifyAuthorization(config.client_id,state,challenge)},headers)
  }
  if(body.action==='callback') {
   await rateLimit(db,user.id,'spotify-connect',8,600)
   if(typeof body.state!=='string'||!/^sp\.[a-f0-9-]{72}$/.test(body.state))throw new HttpError('Conexão inválida. Comece novamente no Spotify.',400)
   const state_hash=await sha256(body.state),config=await rpc('consume',{state_hash,session_id:session})
   if(body.denied)throw new HttpError('Conexão cancelada no Spotify. Você pode tentar novamente.',400)
   if(typeof body.code!=='string'||body.code.length>3000||!body.code)throw new HttpError('O Spotify não confirmou a conexão.',400)
   const tokens=await spotifyTokens({client_id:config.client_id,grant_type:'authorization_code',code:body.code,redirect_uri:SPOTIFY_REDIRECT,code_verifier:config.verifier})
   if(!tokens.refresh_token)throw new HttpError('O Spotify não forneceu a renovação da conexão. Tente conectar novamente.',400)
   const profile=await spotifyFetch({method:'GET',path:'/me',params:{}},tokens.access_token)
   const account_id=profile?.account_id||profile?.id
   if(typeof account_id!=='string'||!account_id||account_id.length>300)throw new HttpError('Não foi possível confirmar sua conta Spotify.',400)
   await rpc('connect',{state_hash,session_id:session,account_id,display_name:profile.display_name||'Minha conta Spotify',tokens,expires_at:tokenExpiry(tokens.expires_in),scopes:tokens.scope||SPOTIFY_SCOPES})
   return json(await rpc('status'),headers)
  }
  // Validate the bounded operation before reading credentials or making any request.
  const plan=body.action==='sdk_token'?null:spotifyPlan(body)
  await rateLimit(db,user.id,'spotify-api',80)
  const credentials=await rpc('credentials');let tokens=credentials.tokens,expiresAt=credentials.expires_at
  if(new Date(credentials.expires_at).getTime()<Date.now()+60000) {
   const lease=await rpc('claim_refresh',{generation:credentials.generation})
   const identity={generation:credentials.generation,lease_id:lease.lease_id}
   try {
    const refreshed=await spotifyTokens({client_id:credentials.client_id,grant_type:'refresh_token',refresh_token:tokens.refresh_token})
    tokens={...tokens,...refreshed,refresh_token:refreshed.refresh_token||tokens.refresh_token}
    expiresAt=tokenExpiry(tokens.expires_in)
    await rpc('rotate',{...identity,tokens,expires_at:expiresAt})
   } catch(cause) {
    if(cause instanceof SpotifyError && cause.invalidGrant)await rpc('reconnect',identity)
    else { await rpc('release',identity).catch(()=>{}); if(cause instanceof SpotifyError && cause.status===429)await rpc('cooldown',{seconds:cause.retryAfter}) }
    throw cause
   }
  }
  if(body.action==='sdk_token'){
   const scopes=String(credentials.scopes).split(' ')
   if(!['streaming','user-read-email','user-read-private'].every(scope=>scopes.includes(scope)))throw new HttpError('Reconecte sua conta para autorizar o player completo do Spotify.',403)
   return json({access_token:tokens.access_token,expires_at:new Date(expiresAt).getTime()},headers)
  }
  try { return json({data:await spotifyFetch(plan,tokens.access_token)},headers) }
  catch(cause) {
   if(cause instanceof SpotifyError && cause.status===429)await rpc('cooldown',{seconds:cause.retryAfter})
   throw cause
  }
 } catch(cause) {
  if(cause instanceof SpotifyError)throw new HttpError(cause.message,cause.status)
  throw cause
 }
})
