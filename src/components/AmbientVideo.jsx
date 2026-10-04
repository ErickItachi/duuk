import { useEffect, useRef } from 'react'
import { getImageSources, getVideoSource } from '../media'

export default function AmbientVideo({ src, poster, active = true, priority = false, videoRef: externalRef, onAutoplayBlocked, onPlaying, ...props }) {
  const internalRef = useRef(null)
  const videoRef = externalRef || internalRef
  const activeRef = useRef(active)
  const videoSrc = getVideoSource(src, 'ambient')
  const autoplayAllowed = !window.matchMedia('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    const video = videoRef.current
    if (!video) return undefined
    let inViewport = false
    let playerOpen = document.body.classList.contains('film-is-open')
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    video.muted = true
    video.defaultMuted = true
    video.playsInline = true
    video.setAttribute('muted', '')

    const loadSource = () => {
      if (activeRef.current && !motion.matches && video.getAttribute('src') !== videoSrc) {
        video.src = videoSrc
      }
    }

    const syncPlayback = () => {
      const previewActive = priority && document.querySelector('.project-strip__video[data-active="true"]') !== null
      if (activeRef.current && inViewport && !previewActive && !playerOpen && !motion.matches && document.visibilityState === 'visible') {
        loadSource()
        if (video.paused) video.play().catch(() => onAutoplayBlocked?.(true))
      } else {
        video.pause()
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

    playbackObserver.observe(video)
    loadObserver.observe(video)
    video.addEventListener('canplay', syncPlayback)
    document.addEventListener('duuk:activity', syncPlayback)
    document.addEventListener('duuk:player', onPlayerChange)
    document.addEventListener('visibilitychange', syncPlayback)
    motion.addEventListener('change', syncPlayback)
    return () => {
      playbackObserver.disconnect()
      loadObserver.disconnect()
      video.removeEventListener('canplay', syncPlayback)
      document.removeEventListener('duuk:activity', syncPlayback)
      document.removeEventListener('duuk:player', onPlayerChange)
      document.removeEventListener('visibilitychange', syncPlayback)
      motion.removeEventListener('change', syncPlayback)
      video.pause()
      video.removeAttribute('src')
      video.load()
    }
  }, [videoSrc, videoRef, onAutoplayBlocked, priority])

  useEffect(() => {
    activeRef.current = active
    videoRef.current?.dispatchEvent(new Event('duuk:activity', { bubbles: true }))
  }, [active, videoRef])

  return (
    <video
      {...props}
      ref={videoRef}
      src={priority && autoplayAllowed ? videoSrc : undefined}
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
      onError={() => onAutoplayBlocked?.(true)}
    />
  )
}
