import { spotifyPlayable } from './model.mjs'

export const appleMobile = (agent = globalThis.navigator) => /iPad|iPhone|iPod/.test(agent?.userAgent || '') || (agent?.platform === 'MacIntel' && agent?.maxTouchPoints > 1)
export function playbackBody(item, { context, items = [] } = {}) {
 if (!spotifyPlayable(item)) throw new Error('Escolha uma música, episódio, álbum, artista ou playlist.')
 if (!['track', 'episode'].includes(item.type)) return { context_uri: item.uri }
 if (['album', 'playlist'].includes(context?.type)) return { context_uri: context.uri, offset_uri: item.uri }
 const sequence = items.filter(row => ['track', 'episode'].includes(row?.type) && spotifyPlayable(row))
 const position = sequence.findIndex(row => row === item)
 const fallback = sequence.findIndex(row => row.uri === item.uri)
 const start = position < 0 ? fallback : position
 return { uris: start < 0 ? [item.uri] : sequence.slice(start, start + 100).map(row => row.uri) }
}
export function localPlayback(state, device, volume, volumeSupported = true) {
 const track = state?.track_window?.current_track
 if (!track) return null
 return {
  item: { ...track, duration_ms: state.duration || track.duration_ms || 0 },
  context: state.context, progress_ms: Math.max(0, state.position || 0),
  timestamp: Date.now(), is_playing: !state.paused && !state.loading,
  is_buffering: Boolean(state.loading), shuffle_state: Boolean(state.shuffle),
  repeat_state: ['off', 'context', 'track'][state.repeat_mode] || 'off',
  actions: { disallows: state.disallows || {} },
  device: { ...device, is_active: true, supports_volume: volumeSupported, volume_percent: Math.round(Math.max(0, Math.min(1, volume ?? 0.35)) * 100) },
 }
}
export function nativeCommand(instance, body) {
 if (body.action === 'play' && !body.uris && !body.context_uri) return () => instance.resume()
 if (body.action === 'pause') return () => instance.pause()
 if (body.action === 'previous') return () => instance.previousTrack()
 if (body.action === 'next') return () => instance.nextTrack()
 if (body.action === 'seek') return () => instance.seek(body.position_ms)
 if (body.action === 'volume') return () => instance.setVolume(body.volume_percent / 100)
 return null
}
export function nextRepeat(state = 'off', disallows = {}) {
 const modes = ['off', 'context', 'track'], current = Math.max(0, modes.indexOf(state))
 return [1, 2, 3].map(step => modes[(current + step) % 3]).find(mode => mode !== state && !disallows[mode === 'track' ? 'toggling_repeat_track' : 'toggling_repeat_context']) || null
}
