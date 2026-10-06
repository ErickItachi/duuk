export function youtubeId(input) {
  const value = String(input || '').trim()
  if (/^[A-Za-z0-9_-]{11}$/.test(value)) return value
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password) return ''
    let id = ''
    if (url.hostname === 'youtu.be') id = /^\/([^/]+)\/?$/.exec(url.pathname)?.[1]
    else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'www.youtube-nocookie.com'].includes(url.hostname)) {
      id = url.pathname === '/watch' ? url.searchParams.get('v') : /^(?:\/embed\/|\/shorts\/|\/live\/)([^/]+)\/?$/.exec(url.pathname)?.[1]
    }
    return /^[A-Za-z0-9_-]{11}$/.test(id || '') ? id : ''
  } catch { return '' }
}

export function heroVideo(media, mobile = false) {
  const videoKey = mobile ? 'videoMobile' : 'video'
  return { poster: media[mobile ? 'posterMobile' : 'poster'], video: media[videoKey],
    provider: media[`${videoKey}Provider`] || 'mp4', videoId: youtubeId(media[`${videoKey}Id`]) }
}
