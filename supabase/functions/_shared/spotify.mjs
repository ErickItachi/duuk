export const SPOTIFY_REDIRECT = 'https://www.duukfilms.com/admin/spotify'
export const SPOTIFY_SCOPES = ['user-read-private','user-read-playback-state','user-modify-playback-state','user-read-currently-playing','user-read-recently-played','user-top-read','user-library-read','user-library-modify','playlist-read-private','playlist-read-collaborative','playlist-modify-private','playlist-modify-public','user-follow-read','user-follow-modify'].join(' ')
export class SpotifyError extends Error { constructor(message,status=400){super(message);this.status=status;this.retryAfter=60;this.invalidGrant=false} }
const fail = message => { throw new SpotifyError(message) }
const id = value => /^[A-Za-z0-9]{22}$/.test(value || '') ? value : fail('Identificador Spotify inválido.')
const integer = (value,min,max) => Number.isInteger(Number(value)) && value!=='' && value!==null && Number(value)>=min && Number(value)<=max ? Number(value) : fail('Confira o valor informado.')
const text = (value,max) => typeof value==='string' && value.trim().length>0 && value.length<=max ? value.trim() : fail('Confira o texto informado.')
export const spotifyUri = (value,types=['track','episode','album','artist','playlist','show','audiobook']) => {
 const match=/^spotify:([a-z]+):([A-Za-z0-9]{22})$/.exec(value||'')
 return match && types.includes(match[1]) ? value : fail('Use um item válido do Spotify.')
}
const uriList = (values,types) => Array.isArray(values)&&values.length>0&&values.length<=100 ? values.map(value=>spotifyUri(value,types)) : fail('Selecione de 1 a 100 itens.')
const device = value => value===undefined||value==='' ? undefined : /^[A-Za-z0-9_-]{1,200}$/.test(value) ? value : fail('Dispositivo inválido.')
const bool = value => typeof value==='boolean' ? value : fail('Opção inválida.')
const make = (method,path,params={},body) => ({method,path,params:Object.fromEntries(Object.entries(params).filter(([,v])=>v!==undefined)),...(body===undefined?{}:{body})})
export function spotifyPlan(body) {
 const {action}=body, offset=()=>integer(body.offset??0,0,10000)
 if(action==='player')return make('GET','/me/player')
 if(action==='devices')return make('GET','/me/player/devices')
 if(action==='queue')return make('GET','/me/player/queue')
 if(action==='search') {
  const type=body.type||'track';if(!['track','album','artist','playlist','show','episode','audiobook'].includes(type))fail('Categoria inválida.')
  return make('GET','/search',{q:text(body.q,200),type,limit:10,offset:offset()})
 }
 if(action==='collection') {
  const path={playlists:'/me/playlists',tracks:'/me/tracks',albums:'/me/albums',episodes:'/me/episodes',shows:'/me/shows',audiobooks:'/me/audiobooks',artists:'/me/following',recent:'/me/player/recently-played',top_tracks:'/me/top/tracks',top_artists:'/me/top/artists'}[body.kind]
  if(!path)fail('Coleção inválida.')
  return make('GET',path,{limit:20,...(body.kind==='artists'?{type:'artist',after:body.after?id(body.after):undefined}:body.kind==='recent'?{before:body.before?integer(body.before,1,8640000000000000):undefined}:{offset:offset()}),...(['top_tracks','top_artists'].includes(body.kind)?{time_range:['short_term','medium_term','long_term'].includes(body.time_range)?body.time_range:'medium_term'}:{})})
 }
 if(action==='entity'||action==='items') {
  const type=body.type; if(!['track','album','artist','playlist','show','episode','audiobook'].includes(type))fail('Categoria inválida.')
  const suffix=action==='entity'?'':({album:'/tracks',artist:'/albums',playlist:'/items',show:'/episodes',audiobook:'/chapters'}[type]??fail('Este item não possui uma lista.'))
  return make('GET',`/${type==='show'?'shows':type+'s'}/${id(body.id)}${suffix}`,suffix?{limit:20,offset:offset()}:{})
 }
 if(action==='library') {
  const uris=uriList(body.uris)
  if(!['save','remove','contains'].includes(body.operation))fail('Operação inválida.')
  return make(({save:'PUT',remove:'DELETE',contains:'GET'})[body.operation],body.operation==='contains'?'/me/library/contains':'/me/library',{uris:uris.join(',')})
 }
 if(action==='playlist_create')return make('POST','/me/playlists',{}, {name:text(body.name,100),description:typeof body.description==='string'?body.description.slice(0,300):'',public:body.public===true})
 if(action==='playlist_edit')return make('PUT',`/playlists/${id(body.id)}`,{}, {name:text(body.name,100),description:typeof body.description==='string'?body.description.slice(0,300):'',public:bool(body.public)})
 if(action==='playlist_add')return make('POST',`/playlists/${id(body.id)}/items`,{}, {uris:uriList(body.uris,['track','episode']),...(body.position===undefined?{}:{position:integer(body.position,0,100000)})})
 if(action==='playlist_remove')return make('DELETE',`/playlists/${id(body.id)}/items`,{}, {items:uriList(body.uris,['track','episode']).map(uri=>({uri})),...(body.snapshot_id?{snapshot_id:text(body.snapshot_id,200)}:{})})
 if(action==='playlist_reorder')return make('PUT',`/playlists/${id(body.id)}/items`,{}, {range_start:integer(body.range_start,0,100000),insert_before:integer(body.insert_before,0,100000),range_length:integer(body.range_length??1,1,100),...(body.snapshot_id?{snapshot_id:text(body.snapshot_id,200)}:{})})
 const d={device_id:device(body.device_id)}
 if(action==='play') {
  if(body.context_uri&&body.uris)fail('Escolha uma lista ou uma faixa.')
  return make('PUT','/me/player/play',d,body.context_uri?{context_uri:spotifyUri(body.context_uri,['album','artist','playlist']),...(body.offset===undefined?{}:{offset:{position:integer(body.offset,0,100000)}})}:body.uris?{uris:uriList(body.uris,['track','episode'])}:{})
 }
 if(action==='pause')return make('PUT','/me/player/pause',d)
 if(action==='next'||action==='previous')return make('POST',`/me/player/${action}`,d)
 if(action==='seek')return make('PUT','/me/player/seek',{...d,position_ms:integer(body.position_ms,0,86400000)})
 if(action==='volume')return make('PUT','/me/player/volume',{...d,volume_percent:integer(body.volume_percent,0,100)})
 if(action==='shuffle')return make('PUT','/me/player/shuffle',{...d,state:bool(body.state)})
 if(action==='repeat')return ['off','context','track'].includes(body.state)?make('PUT','/me/player/repeat',{...d,state:body.state}):fail('Modo de repetição inválido.')
 if(action==='transfer') {const target=device(body.device_id);if(!target)fail('Escolha um dispositivo.');return make('PUT','/me/player',{}, {device_ids:[target],play:body.play===true})}
 if(action==='enqueue')return make('POST','/me/player/queue',{...d,uri:spotifyUri(body.uri,['track','episode'])})
 fail('Recurso Spotify indisponível.')
}
export async function spotifyFetch(plan,token,fetcher=fetch) {
 const url=new URL('https://api.spotify.com/v1'+plan.path)
 for(const [key,value] of Object.entries(plan.params))url.searchParams.set(key,String(value))
 const response=await fetcher(url,{method:plan.method,headers:{Authorization:`Bearer ${token}`,...(plan.body===undefined?{}:{'Content-Type':'application/json'})},...(plan.body===undefined?{}:{body:JSON.stringify(plan.body)}),signal:AbortSignal.timeout(15000),redirect:'error'})
 if(response.status===204)return null
 if(response.ok)return response.json()
 let message='O Spotify não concluiu a operação.'
 if(response.status===401)message='Sua autorização Spotify expirou. Reconecte sua conta.'
 if(response.status===403)message='O Spotify não liberou este recurso. Confira o Premium, as contas autorizadas do aplicativo e as permissões da conexão.'
 if(response.status===404)message='Nenhum dispositivo ativo ou item disponível. Abra o Spotify ou ative o player da DUUK.'
 if(response.status===429)message='O Spotify pediu uma pausa por limite de uso. Aguarde antes de tentar novamente.'
 const error=new SpotifyError(message,response.status);error.retryAfter=Math.min(86400,Math.max(1,Number(response.headers.get('retry-after'))||60));throw error
}
export async function spotifyTokens(params,fetcher=fetch) {
 const response=await fetcher('https://accounts.spotify.com/api/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(params),signal:AbortSignal.timeout(15000),redirect:'error'})
 const data=await response.json().catch(()=>({}))
 if(response.status===429){const error=new SpotifyError('O Spotify pediu uma pausa por limite de uso. Aguarde antes de tentar novamente.',429);error.retryAfter=Math.min(86400,Math.max(1,Number(response.headers.get('retry-after'))||60));throw error}
 if(!response.ok||typeof data.access_token!=='string'||!Number.isFinite(data.expires_in)) {
  const error=new SpotifyError(data.error==='invalid_grant'?'A autorização expirou. Conecte sua conta novamente.':'Não foi possível autorizar no Spotify. Confira o Client ID, o endereço de retorno e o Premium do proprietário.',400)
  error.invalidGrant=data.error==='invalid_grant';throw error
 }
 return data
}
export function spotifyAuthorization(clientId,state,challenge) {
 const url=new URL('https://accounts.spotify.com/authorize')
 url.search=new URLSearchParams({client_id:clientId,response_type:'code',redirect_uri:SPOTIFY_REDIRECT,state,scope:SPOTIFY_SCOPES,code_challenge_method:'S256',code_challenge:challenge,show_dialog:'true'}).toString()
 return url.href
}
