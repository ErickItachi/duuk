import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useSearchParams } from 'react-router-dom'

export function useMediaQuery(query) {
  return useSyncExternalStore(
    callback => {
      const list = window.matchMedia(query)
      list.addEventListener('change', callback)
      return () => list.removeEventListener('change', callback)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}

export const isApplePlatform = () => {
  try { return /Mac|iPhone|iPad|iPod/.test(navigator.userAgentData?.platform || navigator.platform || navigator.userAgent) } catch { return false }
}
export const commandKey = () => isApplePlatform() ? '⌘K' : 'Ctrl K'

const editable = 'input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]), textarea, select, [contenteditable=""], [contenteditable="true"]'

// The phone navigation steps aside while the on-screen keyboard is open.
export function useVirtualKeyboard() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const view = window.visualViewport
    if (!view) return
    let frame = 0
    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setOpen(window.innerHeight - view.height > 140 && !!document.activeElement?.matches?.(editable)))
    }
    view.addEventListener('resize', update)
    document.addEventListener('focusin', update)
    document.addEventListener('focusout', update)
    return () => {
      cancelAnimationFrame(frame)
      view.removeEventListener('resize', update)
      document.removeEventListener('focusin', update)
      document.removeEventListener('focusout', update)
    }
  }, [])
  return open
}

const typing = target => target instanceof Element && !!target.closest(editable)

// Global shortcuts. Two-key sequences ("g a") must be typed within one second.
export function useShortcuts({ sequences, onPalette, onHelp, onToggleSidebar }) {
  const handlers = useRef({ sequences, onPalette, onHelp, onToggleSidebar })
  const pending = useRef({ key: '', at: 0 })
  useEffect(() => { handlers.current = { sequences, onPalette, onHelp, onToggleSidebar } })
  useEffect(() => {
    const handle = event => {
      if (event.defaultPrevented || event.isComposing) return
      const current = handlers.current
      const command = event.metaKey || event.ctrlKey
      const dialogOpen = !!document.querySelector('dialog[open]:not(.ds-palette)')
      if (command && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'k') {
        if (dialogOpen || event.target?.closest?.('[contenteditable=""], [contenteditable="true"]')) return
        event.preventDefault(); current.onPalette(); return
      }
      if (command || event.altKey || typing(event.target) || dialogOpen || document.querySelector('dialog.ds-palette[open]')) return
      if (event.key === '/') { event.preventDefault(); current.onPalette(); return }
      if (event.key === '?') { event.preventDefault(); current.onHelp(); return }
      if (event.key === '[' && current.onToggleSidebar) { event.preventDefault(); current.onToggleSidebar(); return }
      const key = event.key.toLowerCase(), now = performance.now()
      if (pending.current.key && now - pending.current.at < 1000) {
        const action = current.sequences[`${pending.current.key} ${key}`]
        pending.current = { key: '', at: 0 }
        if (action) { event.preventDefault(); action() }
        return
      }
      pending.current = key === 'g' ? { key, at: now } : { key: '', at: 0 }
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [])
}

// The command palette opens a module's own creation form with ?novo=<kind>; the parameter is removed once used.
export function useCreateIntent(kind, open, ready = true) {
  const [params, setParams] = useSearchParams()
  const requested = ready && params.get('novo') === kind
  const opener = useRef(open)
  useEffect(() => { opener.current = open })
  useEffect(() => {
    if (!requested) return
    opener.current()
    setParams(previous => { const next = new URLSearchParams(previous); next.delete('novo'); return next }, { replace: true })
  }, [requested, setParams])
}

let sequence = 0

// Keeps the existing notify(message, failed) contract while allowing a short queue of messages.
export function useToasts() {
  const [toasts, setToasts] = useState([])
  const timers = useRef(new Map())
  const remove = useCallback(id => {
    clearTimeout(timers.current.get(id))
    timers.current.delete(id)
    setToasts(list => list.map(toast => toast.id === id ? { ...toast, leaving: true } : toast))
    setTimeout(() => setToasts(list => list.filter(toast => toast.id !== id)), 180)
  }, [])
  const schedule = useCallback((id, failed) => {
    clearTimeout(timers.current.get(id))
    timers.current.set(id, setTimeout(() => remove(id), failed ? 9000 : 5000))
  }, [remove])
  const notify = useCallback((message, failed = false) => {
    if (!message) return
    const id = ++sequence, text = String(message)
    setToasts(list => [...list.filter(toast => toast.message !== text || toast.leaving), { id, message: text, failed: !!failed }].slice(-3))
    schedule(id, failed)
  }, [schedule])
  const hold = useCallback(id => { clearTimeout(timers.current.get(id)); timers.current.delete(id) }, [])
  useEffect(() => { const active = timers.current; return () => active.forEach(clearTimeout) }, [])
  return { toasts, notify, remove, hold, resume: schedule }
}

export const roleLabel = profile => profile?.is_super_admin ? 'Super administrador' : profile?.role_name || 'Equipe DUUK'
