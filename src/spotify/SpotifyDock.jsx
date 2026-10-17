import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../admin/components'
import { useSpotify } from './SpotifyContext'
import { spotifyArtwork, spotifySubtitle } from './model.mjs'
import SpotifyRange from './SpotifyRange'
export default function SpotifyDock(){
 const music=useSpotify(),[error,setError]=useState(''),item=music.player?.item
 if(!music.dock)return null
 const act=async body=>{setError('');try{await music.act(body);return true}catch(cause){setError(cause.message);return false}}
 return <aside className="spotify-dock" aria-label="Player pessoal do Spotify">
  <div className="spotify-dock__head"><Link to="/admin/spotify"><img src="/admin-assets/integrations/spotify.png" alt="" width="18" height="18"/>Spotify<span>{music.player?.device?.name||'Minha música'}</span></Link><button type="button" className="admin-icon-button" aria-label="Recolher player" onClick={music.hideDock}><Icon name="close" size={16}/></button></div>
  <div className="spotify-dock__body">{item&&spotifyArtwork(item)&&<img src={spotifyArtwork(item)} width="44" height="44" alt=""/>}<Link to="/admin/spotify"><strong>{item?.name||'Escolha uma música'}</strong><span>{item?spotifySubtitle(item):'Músicas completas com Spotify Premium'}</span></Link><div><button className="admin-icon-button" type="button" disabled={music.busy||!item||music.player?.actions?.disallows?.skipping_prev} aria-label="Música anterior" onClick={()=>act({action:'previous'})}><Icon name="skipBack"/></button><button className="admin-icon-button" type="button" disabled={music.busy||!item||music.player?.actions?.disallows?.[music.player?.is_playing?'pausing':'resuming']} aria-label={music.player?.is_playing?'Pausar minha música':'Continuar minha música'} onClick={()=>act({action:music.player?.is_playing?'pause':'play'})}><Icon name={music.player?.is_playing?'pause':'play'}/></button><button className="admin-icon-button" type="button" disabled={music.busy||!item||music.player?.actions?.disallows?.skipping_next} aria-label="Próxima música" onClick={()=>act({action:'next'})}><Icon name="skipForward"/></button></div></div>
  {music.player?.device?.supports_volume&&<div className="spotify-dock__volume"><button type="button" className="admin-icon-button" disabled={music.busy||music.player.device.is_restricted} aria-label={music.player.device.volume_percent===0?'Ativar som do player':'Silenciar player'} onClick={()=>music.toggleMute().catch(cause=>setError(cause.message))}><Icon name="volume" size={16}/></button><SpotifyRange aria-label="Volume do player flutuante" value={music.player.device.volume_percent??35} disabled={music.busy||music.player.device.is_restricted} onCommit={volume_percent=>act({action:'volume',volume_percent})}/><span>{music.player.device.volume_percent??35}%</span></div>}
  {music.browser.needsActivation&&<button className="spotify-dock__activate" type="button" disabled={music.busy} onClick={()=>music.activateAudio().catch(cause=>setError(cause.message))}>Ativar áudio neste aparelho</button>}
  {(error||music.playerError||music.browser.error)&&<p className="spotify-dock__error" role="alert">{error||music.playerError||music.browser.error}</p>}
 </aside>
}
