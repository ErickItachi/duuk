import { useEffect, useRef, useSyncExternalStore } from 'react'
import './brand-loader.css'

const motionQuery = () => window.matchMedia('(prefers-reduced-motion: reduce)')
const subscribeMotion = callback => {
  const query = motionQuery()
  query.addEventListener('change', callback)
  return () => query.removeEventListener('change', callback)
}
const reducedMotion = () => motionQuery().matches

export default function BrandLoader({
  label = "Preparando seu espaço",
  detail,
  leaving = false,
  film = false,
}) {
  const video = useRef(null)
  const reduced = useSyncExternalStore(subscribeMotion, reducedMotion)
  useEffect(() => {
    if (!film || reduced) return
    video.current?.play().catch(() => {})
  }, [film, reduced])
  return (
    <div
      className={`duuk-loader${film ? " duuk-loader--film" : ""}${leaving ? " is-leaving" : ""}`}
      role="status"
      aria-live="polite"
    >
      {film && <div className="duuk-loader__film" aria-hidden="true">
        {reduced ? <img src="/admin-assets/loading-duuk-poster.jpg" alt="" width="720" height="1280" /> :
          <video ref={video} autoPlay muted loop playsInline disablePictureInPicture disableRemotePlayback poster="/admin-assets/loading-duuk-poster.jpg" preload="auto" width="720" height="1280">
            <source src="/admin-assets/loading-duuk.mp4" type="video/mp4" />
          </video>}
      </div>}
      <div className="duuk-loader__content">
        {!film && <img
          src="/media/duuk-logo-white.png"
          alt="DUUK"
          width="718"
          height="886"
          fetchPriority="high"
        />}
        <span className="duuk-loader__track" aria-hidden="true">
          <span />
        </span>
        <p>{label}</p>
        {detail && <small>{detail}</small>}
      </div>
    </div>
  );
}
