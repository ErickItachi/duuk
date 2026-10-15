import { useCallback, useEffect, useRef, useState } from 'react'
import { claimNotificationSound, createNotificationChime, notificationArrivals, soundEnabled, soundPreferenceKey } from './notification-sound.mjs'
const deviceStorage = () => { try { return window.localStorage } catch { return null } }

export function useNotificationSound(userId, items, ready) {
  const [enabled, setEnabled] = useState(() => soundEnabled(deviceStorage(), userId))
  const chime = useRef(null), seen = useRef(null)
  useEffect(() => {
    seen.current = null
    const audio = createNotificationChime(window.AudioContext || window.webkitAudioContext)
    chime.current = audio
    const unlock = event => { if (event.isTrusted && soundEnabled(deviceStorage(), userId)) audio.unlock() }
    const changed = event => { if (event.key === soundPreferenceKey(userId)) setEnabled(soundEnabled(deviceStorage(), userId)) }
    window.addEventListener('pointerdown', unlock, { passive: true })
    window.addEventListener('keydown', unlock)
    window.addEventListener('storage', changed)
    return () => { chime.current = null; audio.close(); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); window.removeEventListener('storage', changed) }
  }, [userId])
  useEffect(() => {
    if (!ready) return
    const next = notificationArrivals(seen.current, items)
    seen.current = next.seen
    if (!enabled || document.visibilityState !== 'visible' || !next.fresh.length) return
    let cancelled = false
    const ring = () => {
      if (cancelled || document.visibilityState !== 'visible' || !soundEnabled(deviceStorage(), userId)) return
      if (claimNotificationSound(deviceStorage(), userId, next.fresh.map(item => item.id))) chime.current?.play()
    }
    if (navigator.locks?.request) navigator.locks.request(`duuk-notification-sound:${userId}`, ring).catch(() => {})
    else ring()
    return () => { cancelled = true }
  }, [userId, ready, items, enabled])
  const toggle = useCallback(() => {
    const next = !enabled
    try { deviceStorage()?.setItem(soundPreferenceKey(userId), next ? 'on' : 'off') } catch { /* device storage may be blocked */ }
    setEnabled(next)
    if (next) chime.current?.unlock()
  }, [userId, enabled])
  const preview = useCallback(async () => (await chime.current?.unlock()) && chime.current?.play(), [])
  return { enabled, toggle, preview, supported: !!(window.AudioContext || window.webkitAudioContext) }
}
