export const soundPreferenceKey = userId => `duuk-notification-sound:${userId}`
const playedKey = userId => `duuk-notification-chime:${userId}`
export function soundEnabled(storage, userId) {
  try { return storage?.getItem(soundPreferenceKey(userId)) !== 'off' } catch { return true }
}

// A baseline prevents historical items, reloads and read-state changes from ringing.
export function notificationArrivals(previous, items, now = Date.now()) {
  const seen = new Set(items.map(item => item.id))
  if (!previous) return { seen, fresh: [] }
  return { seen, fresh: items.filter(item => !previous.has(item.id) && !item.read_at && Number.isFinite(Date.parse(item.created_at)) && now - Date.parse(item.created_at) >= -5000 && now - Date.parse(item.created_at) <= 30000) }
}

// Shared by tabs, with no message content stored. The Web Lock in the caller
// serializes this claim where supported; the timestamp also limits bursts.
export function claimNotificationSound(storage, userId, ids, now = Date.now()) {
  let previous
  try { previous = JSON.parse(storage?.getItem(playedKey(userId))) } catch { /* unavailable storage */ }
  const known = Array.isArray(previous?.ids) ? previous.ids.filter(id => typeof id === 'string') : []
  const fresh = ids.filter(id => !known.includes(id))
  if (!fresh.length) return false
  const quiet = Number.isFinite(previous?.at) && now - previous.at < 2500
  try { storage?.setItem(playedKey(userId), JSON.stringify({ ids: [...new Set([...fresh, ...known])].slice(0, 100), at: quiet ? previous.at : now })) } catch { /* still usable in private mode */ }
  return !quiet
}

// A soft, short two-note chime. Web Audio stays local and needs a user gesture.
export function createNotificationChime(AudioContextClass) {
  let context
  const unlock = async () => {
    if (!AudioContextClass) return false
    try {
      context ||= new AudioContextClass()
      if (context.state === 'suspended') await context.resume()
      return context.state === 'running'
    } catch { return false }
  }
  return {
    unlock,
    play() {
      if (context?.state !== 'running') return false
      try {
        const start = context.currentTime
        for (const [delay, frequency] of [[0, 659.25], [.13, 987.77]]) {
          const tone = context.createOscillator(), volume = context.createGain()
          tone.type = 'sine'; tone.frequency.value = frequency
          volume.gain.setValueAtTime(0, start + delay)
          volume.gain.linearRampToValueAtTime(.055, start + delay + .012)
          volume.gain.exponentialRampToValueAtTime(.0001, start + delay + .25)
          tone.connect(volume); volume.connect(context.destination)
          tone.start(start + delay); tone.stop(start + delay + .28)
          tone.onended = () => { tone.disconnect(); volume.disconnect() }
        }
        return true
      } catch { return false }
    },
    close() { const old = context; context = null; old?.close().catch(() => {}) },
  }
}
