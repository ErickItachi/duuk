import { useEffect, useRef } from 'react'

let apiPromise
function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (apiPromise) return apiPromise
  apiPromise = new Promise((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady
    const timer = window.setTimeout(() => { apiPromise = null; reject(new Error('O player não respondeu.')) }, 15000)
    window.onYouTubeIframeAPIReady = () => { window.clearTimeout(timer); previous?.(); resolve(window.YT) }
    const script = document.createElement('script')
    script.src = 'https://www.youtube.com/iframe_api'
    script.async = true
    script.onerror = () => { window.clearTimeout(timer); apiPromise = null; reject(new Error('O player não carregou.')) }
    document.head.append(script)
  })
  return apiPromise
}

export default function YouTubeAmbient({ videoId, videoRef, onAutoplayBlocked }) {
  const container = useRef(null)
  useEffect(() => {
    const wrapper = container.current
    let player
    let disposed = false
    let inViewport = true
    let ready = false
    let manuallyStarted = false
    let filmOpen = false
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => {
      if (!ready) return
      if (inViewport && !filmOpen && document.visibilityState === 'visible' && (manuallyStarted || (!motion.matches && !navigator.connection?.saveData))) {
        player.mute(); player.playVideo()
      } else player.pauseVideo()
    }
    const observer = new IntersectionObserver(([entry]) => { inViewport = entry.isIntersecting && entry.intersectionRatio >= .25; sync() }, { threshold: .25 })
    observer.observe(wrapper)
    const onFilm = (event) => { filmOpen = event.detail.open; sync() }
    document.addEventListener('visibilitychange', sync)
    document.addEventListener('duuk:player', onFilm)
    motion.addEventListener('change', sync)
    videoRef.current = { play: async () => { manuallyStarted = true; await initialization; sync() } }
    const initialization = loadYouTubeApi().then((YT) => {
      if (disposed) return
      const node = document.createElement('div')
      wrapper.append(node)
      player = new YT.Player(node, {
        host: 'https://www.youtube-nocookie.com', width: '100%', height: '100%', videoId,
        playerVars: { enablejsapi: 1, autoplay: 0, controls: 0, playsinline: 1, loop: 1, playlist: videoId, rel: 0, origin: window.location.origin },
        events: {
          onReady: () => { if (!disposed) { ready = true; player.mute(); sync(); if (motion.matches || navigator.connection?.saveData) onAutoplayBlocked(true) } },
          onStateChange: (event) => { if (event.data === YT.PlayerState.PLAYING) onAutoplayBlocked(false) },
          onAutoplayBlocked: () => onAutoplayBlocked(true),
          onError: () => onAutoplayBlocked(true),
        },
      })
    }).catch(() => { if (!disposed) onAutoplayBlocked(true) })
    return () => {
      disposed = true; observer.disconnect(); player?.destroy(); videoRef.current = null
      document.removeEventListener('visibilitychange', sync); document.removeEventListener('duuk:player', onFilm); motion.removeEventListener('change', sync)
      wrapper.replaceChildren()
    }
  }, [videoId, videoRef, onAutoplayBlocked])
  return <div ref={container} className="home-hero__youtube" aria-hidden="true" />
}
