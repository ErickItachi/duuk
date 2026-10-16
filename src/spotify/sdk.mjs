// Official SDK, on demand. Tokens stay in memory and are never persisted.
let loading
export function loadSpotifySDK(win=window,doc=document) {
 if(win.Spotify?.Player)return Promise.resolve(win.Spotify)
 if(loading)return loading
 loading=new Promise((resolve,reject)=>{
  const script=doc.createElement('script'),previous=win.onSpotifyWebPlaybackSDKReady
  const finish=error=>{clearTimeout(timer);script.onerror=null;win.onSpotifyWebPlaybackSDKReady=previous;if(error){script.remove();loading=null;reject(error)}else resolve(win.Spotify)}
  const timer=setTimeout(()=>finish(new Error('O player Spotify demorou a carregar. Tente novamente.')),20000)
  win.onSpotifyWebPlaybackSDKReady=()=>finish()
  script.src='https://sdk.scdn.co/spotify-player.js';script.async=true
  script.onerror=()=>finish(new Error('Não foi possível carregar o player oficial. Confira sua conexão ou bloqueador de conteúdo.'))
  doc.head.append(script)
 })
 return loading
}
export const sdkErrorMessage=kind=>({
 initialization_error:'Este navegador não disponibilizou o áudio protegido. Use Safari/Chrome atualizado ou escolha seu iPhone, MacBook ou outro dispositivo Spotify.',
 authentication_error:'O Spotify não autorizou o player. Reconecte sua conta para autorizar a reprodução completa.',
 account_error:'O player completo exige Spotify Premium na conta conectada.',
 playback_error:'O Spotify não conseguiu reproduzir esta faixa. Escolha outra música ou dispositivo.',
 autoplay_failed:'Toque em Ativar áudio para permitir a reprodução neste aparelho.'
})[kind]||'Não foi possível iniciar o Spotify.'
export function createSpotifyBrowserPlayer(Spotify,{getToken,onState,onReady,onError,onOffline,onAutoplay}) {
 let disposed=false,settled=false,resolveReady,rejectReady
 const instance=new Spotify.Player({name:'DUUK · Este aparelho',volume:0.35,getOAuthToken:callback=>{
  Promise.resolve().then(getToken).then(token=>{if(!disposed)callback(token)}).catch(error=>{if(!disposed)failure(error.message)})
 }})
 const ready=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject})
 ready.catch(()=>{})
 const timer=setTimeout(()=>failure('O player não ficou disponível. Tente novamente ou escolha outro dispositivo.'),25000)
 const failure=message=>{if(disposed)return;clearTimeout(timer);if(!settled){settled=true;rejectReady(new Error(message))}onError(message)}
 instance.addListener('ready',({device_id})=>{if(disposed)return;clearTimeout(timer);if(!settled){settled=true;resolveReady(device_id)}onReady(device_id)})
 instance.addListener('not_ready',()=>{if(!disposed)onOffline()})
 instance.addListener('player_state_changed',state=>{if(!disposed)onState(state)})
 for(const kind of ['initialization_error','authentication_error','account_error','playback_error'])instance.addListener(kind,()=>failure(sdkErrorMessage(kind)))
 instance.addListener('autoplay_failed',()=>{if(!disposed)onAutoplay()})
 Promise.resolve().then(()=>instance.connect()).then(ok=>{if(!ok)failure('O Spotify não conectou este aparelho. Tente novamente.')}).catch(()=>failure('Não foi possível conectar o player Spotify.'))
 return {instance,ready,dispose(){if(disposed)return;disposed=true;clearTimeout(timer);if(!settled){settled=true;rejectReady(new Error('Player encerrado.'))}instance.disconnect()}}
}
