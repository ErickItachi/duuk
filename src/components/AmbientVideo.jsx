import { useEffect, useRef } from 'react'

export default function AmbientVideo({ src, ...props }) {
  const videoRef = useRef(null)

  useEffect(() => {
    const video = videoRef.current
    if (video.getAttribute('src') !== src) video.src = src
    let inViewport = false

    const syncPlayback = () => {
      if (inViewport && document.visibilityState === 'visible') {
        video.play().catch(() => {})
      } else {
        video.pause()
      }
    }

    const observer = new IntersectionObserver(([entry]) => {
      inViewport = entry.isIntersecting
      syncPlayback()
    })

    observer.observe(video)
    document.addEventListener('visibilitychange', syncPlayback)
    return () => {
      observer.disconnect()
      document.removeEventListener('visibilitychange', syncPlayback)
      video.pause()
      video.removeAttribute('src')
      video.load()
    }
  }, [src])

  return <video ref={videoRef} src={src} {...props} />
}
