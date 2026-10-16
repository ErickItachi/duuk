export const SPOTIFY_CALLBACK = 'https://www.duukfilms.com/admin/spotify'
export const spotifyLink = item => {
 const uri=typeof item==='string'?item:item?.uri,match=/^spotify:(track|episode|album|artist|playlist|show|audiobook|chapter):([A-Za-z0-9]{22})$/.exec(uri||'')
 return match?`https://open.spotify.com/${match[1]}/${match[2]}`:''
}
export const spotifyPlayable = item => ['track','episode','album','artist','playlist'].includes(item?.type)&&Boolean(spotifyLink(item))
export const spotifyArtwork = item => (item?.images||item?.album?.images||[]).find(image=>typeof image?.url==='string'&&image.url.startsWith('https://'))?.url||''
export const spotifyItems = data => {
 const list=data?.items||data?.artists?.items||data?.tracks?.items||data?.albums?.items||data?.playlists?.items||data?.shows?.items||data?.episodes?.items||data?.audiobooks?.items||data?.queue||[]
 return list.map(row=>row?.type?row:row?.item||row?.track||row?.album||row?.show||row?.episode||row).filter(item=>item&&item.name&&item.uri)
}
export const spotifyTime = value => {const seconds=Math.floor((value||0)/1000);return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`}
export const spotifySubtitle = item => item?.artists?.map(artist=>artist.name).join(', ')||item?.publisher||item?.owner?.display_name||({album:'Álbum',artist:'Artista',playlist:'Playlist',show:'Podcast',audiobook:'Audiolivro',episode:'Episódio',track:'Música'})[item?.type]||'Spotify'
