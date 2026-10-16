import { Link } from 'react-router-dom'
import { Icon } from '../admin/components'
import { useSpotify } from './SpotifyContext'
import { spotifyEmbed } from './model.mjs'
export default function SpotifyDock(){
 const music=useSpotify(),item=music.embedded
 if(!item)return null
 return <aside className="spotify-dock" aria-label="Player pessoal do Spotify">
  <div className="spotify-dock__head"><Link to="/admin/spotify"><img src="/admin-assets/integrations/spotify.png" alt="" width="18" height="18"/>Spotify<span>Minha música</span></Link><button type="button" className="admin-icon-button" aria-label="Fechar player e parar a reprodução" onClick={music.closeEmbed}><Icon name="close" size={16}/></button></div>
  <iframe key={item.uri} title={`Spotify · ${item.name}`} src={spotifyEmbed(item)} width="100%" height="152" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="eager" referrerPolicy="no-referrer" />
 </aside>
}
