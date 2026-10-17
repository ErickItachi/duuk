import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { spotifyRequest } from './api'
import { useQuery } from '../office/useQuery'
import { SpotifyContext } from './SpotifyContext'
import { createSpotifyBrowserPlayer, loadSpotifySDK } from './sdk.mjs'
import { appleMobile, localPlayback, nativeCommand, playbackBody } from './playback.mjs'
import './spotify.css'

export default function SpotifyProvider({ children }) {
 const { pathname } = useLocation()
 const status = useQuery(useCallback(() => spotifyRequest({ action: 'status' }), []))
 const [player, setPlayer] = useState(null), [playerError, setPlayerError] = useState(''), [busy, setBusy] = useState(false), [dock, setDock] = useState(false)
 const [browser, setBrowser] = useState({ loading: false, id: '', error: '', needsActivation: false }), [targetId, setTargetId] = useState('')
 const alive = useRef(true), generation = useRef(0), playerRef = useRef(null), target = useRef(''), localId = useRef(''), sdk = useRef(null), starting = useRef(null)
 const reading = useRef(null), nativeReading = useRef(null), blocked = useRef(false), running = useRef(false), localVolume = useRef(0.35), localActive = useRef(false), settlingUntil = useRef(0), volumeMemory = useRef(new Map())
 const volumeSupported = !appleMobile()
 const connected = status.data?.connection?.status === 'connected'
 const streamingAuthorized = ['streaming', 'user-read-email', 'user-read-private'].every(scope => status.data?.connection?.scopes?.split(' ').includes(scope))
 const update = useCallback(value => { playerRef.current = value; if (alive.current) setPlayer(value); if (value?.device?.volume_percent > 0) volumeMemory.current.set(value.device.id, value.device.volume_percent) }, [])
 const select = useCallback(id => { target.current = id || ''; setTargetId(id || '') }, [])
 const receiveLocal = useCallback(state => {
  if (!state || !localId.current || !localActive.current) return
  const value = localPlayback(state, { id: localId.current, name: 'DUUK · Este aparelho', type: appleMobile() ? 'Smartphone' : 'Computer' }, localVolume.current, !appleMobile())
  if (!value) return
  update(value)
  if (value.is_playing && value.progress_ms > 0) setBrowser(old => old.needsActivation ? { ...old, needsActivation: false } : old)
 }, [update])
 const refreshLocal = useCallback(() => {
  if (nativeReading.current) return nativeReading.current
  const handle = sdk.current, current = generation.current
  if (!handle || !localId.current || !localActive.current) return Promise.resolve()
  const request = Promise.all([handle.instance.getCurrentState(), handle.instance.getVolume()]).then(([state, volume]) => {
   if (alive.current && current === generation.current && sdk.current === handle) { localVolume.current = volume; receiveLocal(state) }
  }).catch(() => { if (alive.current && current === generation.current) setPlayerError('Não foi possível conferir o player local. Atualize ou escolha outro dispositivo.') }).finally(() => { if (nativeReading.current === request) nativeReading.current = null })
  nativeReading.current = request; return request
 }, [receiveLocal])
 const refreshPlayer = useCallback(() => {
  if (reading.current) return reading.current
  if (blocked.current) return Promise.resolve()
  const current = generation.current
  const request = spotifyRequest({ action: 'player' }).then(async result => {
   if (!alive.current || current !== generation.current) return
   const remote = result.data
   if (localId.current && remote?.device?.id === localId.current) {
    localActive.current = true
    if (!target.current) select(localId.current)
    await refreshLocal()
   } else if (localActive.current && Date.now() < settlingUntil.current) {
    await refreshLocal()
   } else {
    localActive.current = false
    // Follow a transfer made from the Spotify app once Spotify reports it.
    if (remote?.device?.id) select(remote.device.id)
    else if (target.current === localId.current) select('')
    update(remote)
   }
   setPlayerError('')
  }).catch(cause => { if (alive.current && current === generation.current) { setPlayerError(cause.message); blocked.current = true } }).finally(() => { if (reading.current === request) reading.current = null })
  reading.current = request; return request
 }, [refreshLocal, select, update])
 const retryPlayer = useCallback(async () => { await reading.current; blocked.current = false; await refreshPlayer() }, [refreshPlayer])
 const stopBrowser = useCallback(() => { generation.current++; sdk.current?.dispose(); sdk.current = null; starting.current = null; localId.current = ''; localActive.current = false }, [])
 useEffect(() => { alive.current = true; return () => { alive.current = false; stopBrowser() } }, [stopBrowser])
 useEffect(() => {
  if (!connected) return
  const check = () => { if (document.visibilityState === 'visible' && navigator.onLine && !blocked.current) refreshPlayer() }
  const initial = setTimeout(check, 0), timer = setInterval(check, pathname === '/admin/spotify' || dock ? 15000 : 30000)
  window.addEventListener('focus', check); window.addEventListener('online', check); document.addEventListener('visibilitychange', check)
  return () => { clearTimeout(initial); clearInterval(timer); window.removeEventListener('focus', check); window.removeEventListener('online', check); document.removeEventListener('visibilitychange', check) }
 }, [connected, pathname, dock, refreshPlayer])
 useEffect(() => {
  const timer = setInterval(() => { if (document.visibilityState === 'visible') refreshLocal() }, 1000)
  return () => clearInterval(timer)
 }, [refreshLocal])
 const ensureBrowser = async () => {
  if (localId.current && sdk.current) return { id: localId.current, instance: sdk.current.instance }
  if (starting.current) return starting.current
  stopBrowser(); const current = generation.current, valid = () => alive.current && current === generation.current
  setBrowser({ loading: true, id: '', error: '', needsActivation: false })
  starting.current = (async () => {
   try {
    let initial = await spotifyRequest({ action: 'sdk_token' })
    const Spotify = await loadSpotifySDK()
    if (!valid()) throw new Error('Player encerrado.')
    const handle = createSpotifyBrowserPlayer(Spotify, {
     getToken: async () => { if (!valid()) throw new Error('Player encerrado.'); const result = initial && initial.expires_at > Date.now() + 60000 ? initial : await spotifyRequest({ action: 'sdk_token' }); initial = null; if (!valid()) throw new Error('Player encerrado.'); return result.access_token },
     onReady: id => { if (valid()) { const previous = localId.current; localId.current = id; if (target.current === previous && previous) select(id); setBrowser({ loading: false, id, error: '', needsActivation: false }) } },
     onOffline: () => { if (valid()) { localActive.current = false; localId.current = ''; setBrowser({ loading: false, id: '', error: 'Este aparelho ficou offline. Ative o player novamente ou escolha outro dispositivo.', needsActivation: false }) } },
     onError: error => { if (valid()) { localActive.current = false; localId.current = ''; setBrowser(old => ({ ...old, id: '', loading: false, error })) } },
     onAutoplay: () => { if (valid()) setBrowser(old => ({ ...old, needsActivation: true, error: '' })) },
     onState: state => { if (valid()) receiveLocal(state) },
    })
    sdk.current = handle
    const id = await handle.ready
    if (!valid()) throw new Error('Player encerrado.')
    return { id, instance: handle.instance }
   } catch (cause) { if (valid()) { sdk.current?.dispose(); sdk.current = null; localId.current = ''; setBrowser({ loading: false, id: '', error: cause.message, needsActivation: false }) } throw cause }
   finally { if (valid()) starting.current = null }
  })()
  return starting.current
 }
 const activate = () => {
  const handle = sdk.current
  if (!handle) return
  handle.instance.activateElement().catch(() => { if (alive.current && sdk.current === handle) setBrowser(old => ({ ...old, needsActivation: true })) })
 }
 const perform = async work => {
  if (running.current) throw new Error('Aguarde a operação atual.')
  running.current = true; setBusy(true); setPlayerError('')
  try { return await work() } finally { running.current = false; if (alive.current) setBusy(false) }
 }
 const act = body => {
  const device_id = body.device_id || target.current || playerRef.current?.device?.id
  const here = device_id && device_id === localId.current && sdk.current
  if (here) activate()
  return perform(async () => {
   const command = here && nativeCommand(sdk.current.instance, body)
   if (command) {
    if (body.action === 'volume' && !volumeSupported) throw new Error('Use os botões físicos de volume do seu iPhone ou iPad.')
    await command()
    if (body.action === 'volume') localVolume.current = body.volume_percent / 100
    localActive.current = true; await refreshLocal()
    return { data: null }
   }
   const result = await spotifyRequest({ ...body, ...(device_id ? { device_id } : {}) })
   if (body.action === 'transfer') { localActive.current = device_id === localId.current; select(device_id); settlingUntil.current = Date.now() + 3000; setDock(true) }
   await retryPlayer(); return result
  })
 }
 const playItem = (item, here = false, sequence = {}) => {
  activate()
  return perform(async () => {
   let device_id = target.current || playerRef.current?.device?.id
   if (here || !device_id) { const local = await ensureBrowser(); device_id = local.id; select(device_id) }
   localActive.current = device_id === localId.current; settlingUntil.current = Date.now() + 3000
   await spotifyRequest({ action: 'play', ...playbackBody(item, sequence), device_id })
   setDock(true)
   if (localActive.current) await refreshLocal(); else await retryPlayer()
  })
 }
 const useBrowser = () => { activate(); return perform(async () => { const local = await ensureBrowser(); await spotifyRequest({ action: 'transfer', device_id: local.id, play: false }); localActive.current = true; select(local.id); settlingUntil.current = Date.now() + 3000; setDock(true); await refreshLocal() }) }
 const activateAudio = () => { activate(); return perform(async () => { const local = await ensureBrowser(); await local.instance.resume(); localActive.current = true; select(local.id); setBrowser(old => ({ ...old, needsActivation: false, error: '' })); await refreshLocal() }) }
 const toggleMute = () => { const value = playerRef.current?.device?.volume_percent || 0, id = target.current || playerRef.current?.device?.id; return act({ action: 'volume', volume_percent: value > 0 ? 0 : volumeMemory.current.get(id) || 35 }) }
 const disconnect = async () => { await spotifyRequest({ action: 'disconnect' }); stopBrowser(); setDock(false); update(null); setPlayerError(''); select(''); setBrowser({ loading: false, id: '', error: '', needsActivation: false }); await status.reload() }
 return <SpotifyContext.Provider value={{ status, connected, streamingAuthorized, player, playerError, refreshPlayer: retryPlayer, act, busy, playItem, browser, useBrowser, activateAudio, targetId, dock, hideDock: () => setDock(false), showDock: () => setDock(true), disconnect, toggleMute, localDevice: Boolean(browser.id && player?.device?.id === browser.id), volumeSupported }}>{children}</SpotifyContext.Provider>
}
