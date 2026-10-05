import { useEffect, useMemo, useRef } from 'react'
import { getAdaptiveVideoSource, getAmbientFallback, getImageSources } from '../media'

export default function AmbientVideo({ src, poster, active = true, priority = false, videoRef: externalRef, onAutoplayBlocked, onPlaying, ...props }) {
  const internalRef = useRef(null)
  const videoRef = externalRef || internalRef
  const activeRef = useRef(active)
  const videoSrc = useMemo(() => getAmbientFallback(src), [src])
  const adaptiveSrc = getAdaptiveVideoSource(src)
  const autoplayAllowed = !window.matchMedia('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    const video = videoRef.current
    if (!video) return undefined
    let inViewport = false
    let disposed = false
    let sourceLoading = false
    let hls
    let playerOpen = document.body.classList.contains('film-is-open')
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    video.muted = true
    video.defaultMuted = true
    video.playsInline = true
    video.setAttribute('muted', '')

    const loadFallback = () => {
      hls?.destroy()
      hls = undefined
      video.src = videoSrc
    }

    const loadSource = async () => {
      if (!activeRef.current || motion.matches || sourceLoading) return
      sourceLoading = true
      if (!adaptiveSrc || navigator.connection?.saveData) {
        loadFallback()
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = adaptiveSrc
      } else {
        try {
          // The light build keeps its demuxing worker bundled in the lazy chunk.
          const { default: Hls } = await import('hls.js/dist/hls.light.min.js')
          if (disposed) return
          if (!Hls.isSupported()) {
            loadFallback()
          } else {
            const downlink = navigator.connection?.downlink
            hls = new Hls({
              autoStartLoad: false,
              startLevel: -1,
              testBandwidth: false,
              abrEwmaDefaultEstimate: (downlink > 0 ? downlink : 12) * 1000000,
              abrEwmaDefaultEstimateMax: 20000000,
              capLevelOnFPSDrop: true,
              maxBufferLength: 8,
              maxMaxBufferLength: 12,
              maxBufferSize: 12 * 1024 * 1024,
            })
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
              hls.startLoad(video.currentTime)
              syncPlayback()
            })
            hls.on(Hls.Events.ERROR, (_, data) => {
              if (data.fatal) {
                loadFallback()
                syncPlayback()
              }
            })
            hls.loadSource(adaptiveSrc)
            hls.attachMedia(video)
          }
        } catch {
          if (!disposed) loadFallback()
        }
      }
      if (!disposed) syncPlayback()
    }

    const syncPlayback = () => {
      const previewActive = priority && document.querySelector('.project-strip__video[data-active="true"]') !== null
      if (activeRef.current && inViewport && !previewActive && !playerOpen && !motion.matches && document.visibilityState === 'visible') {
        loadSource()
        hls?.resumeBuffering()
        if (video.paused && video.getAttribute('src')) {
          video.play().catch((error) => {
            if (error.name === 'NotAllowedError') onAutoplayBlocked?.(true)
          })
        }
      } else {
        video.pause()
        hls?.pauseBuffering()
      }
    }

    const playbackObserver = new IntersectionObserver(([entry]) => {
      inViewport = entry.isIntersecting && entry.intersectionRatio >= 0.25
      syncPlayback()
    }, { threshold: 0.25 })
    const loadObserver = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) loadSource()
    }, { rootMargin: '200px 0px' })
    const onPlayerChange = (event) => {
      playerOpen = event.detail.open
      syncPlayback()
    }
    const onSourceError = () => {
      if (adaptiveSrc && video.getAttribute('src') === adaptiveSrc) {
        loadFallback()
        syncPlayback()
      } else {
        onAutoplayBlocked?.(true)
      }
    }

    playbackObserver.observe(video)
    loadObserver.observe(video)
    video.addEventListener('canplay', syncPlayback)
    video.addEventListener('error', onSourceError)
    document.addEventListener('duuk:activity', syncPlayback)
    document.addEventListener('duuk:player', onPlayerChange)
    document.addEventListener('visibilitychange', syncPlayback)
    motion.addEventListener('change', syncPlayback)
    return () => {
      disposed = true
      playbackObserver.disconnect()
      loadObserver.disconnect()
      video.removeEventListener('canplay', syncPlayback)
      video.removeEventListener('error', onSourceError)
      document.removeEventListener('duuk:activity', syncPlayback)
      document.removeEventListener('duuk:player', onPlayerChange)
      document.removeEventListener('visibilitychange', syncPlayback)
      motion.removeEventListener('change', syncPlayback)
      video.pause()
      hls?.destroy()
      video.removeAttribute('src')
      video.load()
    }
  }, [videoSrc, adaptiveSrc, videoRef, onAutoplayBlocked, priority])

  useEffect(() => {
    activeRef.current = active
    videoRef.current?.dispatchEvent(new Event('duuk:activity', { bubbles: true }))
  }, [active, videoRef])

  return (
    <video
      {...props}
      ref={videoRef}
      src={priority && autoplayAllowed && !adaptiveSrc ? videoSrc : undefined}
      poster={getImageSources(poster).src}
      muted
      loop
      playsInline
      autoPlay={active && autoplayAllowed}
      data-active={active}
      onPlaying={(event) => {
        event.currentTarget.dataset.ready = 'true'
        onAutoplayBlocked?.(false)
        onPlaying?.(event)
      }}
    />
  )
}
