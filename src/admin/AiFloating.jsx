import { useEffect, useId, useRef, useState } from 'react'
import { Icon } from './components'

const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), Math.max(minimum, maximum))
const viewport = () => {
  const view = window.visualViewport
  const left = view?.offsetLeft || 0, top = view?.offsetTop || 0
  return { left, top, width: view?.width || window.innerWidth, height: view?.height || window.innerHeight }
}
const readPosition = key => {
  try {
    const value = JSON.parse(localStorage.getItem(key))
    return value && Number.isFinite(value.x) && Number.isFinite(value.y) ? { x: clamp(value.x, 0, 1), y: clamp(value.y, 0, 1) } : null
  } catch { return null }
}

// Store only normalized coordinates, separately for each member and device.
function useFloatingPosition(ref, { userId, kind, enabled = true }) {
  const storageKey = `duuk-ai-position:${userId || 'guest'}:${kind}`
  const [position, setPosition] = useState(null), [dragging, setDragging] = useState(false)
  const gesture = useRef(null), last = useRef(null), frame = useRef(null), suppressClick = useRef(false)
  const bounds = () => {
    const view = viewport(), rect = ref.current?.getBoundingClientRect()
    if (!rect) return null
    const edge = kind === 'launcher' ? 16 : 20
    const minimum = { x: view.left + edge, y: view.top + edge }
    const maximum = { x: view.left + view.width - rect.width - edge, y: view.top + view.height - rect.height - edge }
    if (kind === 'launcher') {
      const topbar = document.querySelector('.admin-topbar')?.getBoundingClientRect()
      if (topbar && topbar.bottom > view.top) minimum.y = Math.min(topbar.bottom + 12, maximum.y)
      const dock = document.querySelector('.spotify-dock')?.getBoundingClientRect()
      if (dock && dock.top < view.top + view.height) maximum.y = Math.max(minimum.y, Math.min(maximum.y, dock.top - rect.height - 12))
      const footer = document.querySelector('.admin-footer')?.getBoundingClientRect()
      if (footer && footer.bottom > view.top && footer.top < view.top + view.height) maximum.y = Math.max(minimum.y, footer.top - rect.height - 12)
      // On phones the launcher stays above the tab bar while it is visible.
      const tabs = document.querySelector('.ds-bottom-nav')?.getBoundingClientRect()
      if (tabs && tabs.height && tabs.top < view.top + view.height) maximum.y = Math.max(minimum.y, Math.min(maximum.y, tabs.top - rect.height - 12))
    }
    return { view, rect, minimum, maximum }
  }
  const fit = value => {
    const area = bounds()
    if (!area) return
    const next = { x: clamp(value.x, area.minimum.x, area.maximum.x), y: clamp(value.y, area.minimum.y, area.maximum.y) }
    last.current = next
    setPosition(previous => previous?.x === next.x && previous?.y === next.y ? previous : next)
    return next
  }
  const save = () => {
    const area = bounds(), value = last.current
    if (!area || !value) return
    try { localStorage.setItem(storageKey, JSON.stringify({ x: (value.x - area.view.left) / Math.max(1, area.view.width - area.rect.width), y: (value.y - area.view.top) / Math.max(1, area.view.height - area.rect.height) })) } catch { /* Usable even when local storage is blocked. */ }
  }
  useEffect(() => {
    if (!enabled) { last.current = null; setPosition(null); return }
    const place = () => {
      const area = bounds()
      if (!area) return
      const stored = readPosition(storageKey)
      fit(stored ? { x: area.view.left + stored.x * (area.view.width - area.rect.width), y: area.view.top + stored.y * (area.view.height - area.rect.height) } : { x: area.view.left + area.view.width - area.rect.width - 16, y: area.view.top + area.view.height - area.rect.height - 16 })
    }
    const resize = () => {
      cancelAnimationFrame(frame.current)
      frame.current = requestAnimationFrame(() => { if (last.current) fit(last.current); else place() })
    }
    frame.current = requestAnimationFrame(place)
    window.addEventListener('resize', resize)
    window.addEventListener('scroll', resize, true)
    window.visualViewport?.addEventListener('resize', resize)
    window.visualViewport?.addEventListener('scroll', resize)
    const observer = new ResizeObserver(resize)
    const content = document.querySelector('.admin-main')
    if (content) observer.observe(content)
    const overlays = new MutationObserver(place), shell = document.querySelector('.admin-shell')
    if (shell) overlays.observe(shell, { childList: true })
    return () => {
      cancelAnimationFrame(frame.current)
      window.removeEventListener('resize', resize)
      window.removeEventListener('scroll', resize, true)
      window.visualViewport?.removeEventListener('resize', resize)
      window.visualViewport?.removeEventListener('scroll', resize)
      observer.disconnect(); overlays.disconnect()
      gesture.current = null
    }
    // Helpers intentionally read current viewport geometry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, storageKey])
  const pointerDown = event => {
    if (!enabled || !event.isPrimary || event.button !== 0) return
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return
    suppressClick.current = false
    gesture.current = { id: event.pointerId, startX: event.clientX, startY: event.clientY, x: rect.left, y: rect.top, moved: false }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const pointerMove = event => {
    const active = gesture.current
    if (!active || active.id !== event.pointerId) return
    const dx = event.clientX - active.startX, dy = event.clientY - active.startY
    if (!active.moved && Math.hypot(dx, dy) < 6) return
    active.moved = true
    suppressClick.current = true
    setDragging(true)
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() => fit({ x: active.x + dx, y: active.y + dy }))
  }
  const pointerEnd = event => {
    const active = gesture.current
    if (!active || active.id !== event.pointerId) return
    cancelAnimationFrame(frame.current)
    if (active.moved) { fit({ x: active.x + event.clientX - active.startX, y: active.y + event.clientY - active.startY }); save() }
    gesture.current = null
    setDragging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  const pointerCancel = event => {
    cancelAnimationFrame(frame.current)
    gesture.current = null
    setDragging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  const keyDown = event => {
    if (!enabled || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
    event.preventDefault()
    event.stopPropagation()
    const rect = ref.current?.getBoundingClientRect(), step = event.shiftKey ? 32 : 12
    if (!rect) return
    fit({ x: rect.left + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0), y: rect.top + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0) })
    save()
  }
  return {
    dragging,
    style: enabled && position ? { left: position.x, top: position.y, right: 'auto', bottom: 'auto' } : undefined,
    handlers: { onPointerDown: pointerDown, onPointerMove: pointerMove, onPointerUp: pointerEnd, onPointerCancel: pointerCancel, onKeyDown: keyDown },
    consumeDrag: event => { const moved = suppressClick.current && event.detail !== 0; suppressClick.current = false; return moved },
  }
}

export function AiFloatingLauncher({ userId, onOpen }) {
  const button = useRef(null), hintId = useId()
  const floating = useFloatingPosition(button, { userId, kind: 'launcher' })
  return <>
    <button ref={button} type="button" className={`duuk-ai-help${floating.dragging ? ' is-dragging' : ''}`} style={floating.style} {...floating.handlers} aria-label="Abrir DUUK AI" aria-describedby={hintId} title="DUUK AI · arraste para mover" onClick={event => { if (!floating.consumeDrag(event)) onOpen() }}>
      <span className="duuk-ai-help__spark" aria-hidden="true"><Icon name="spark" size={19} /></span><span className="duuk-ai-help__label">DUUK <b>AI</b></span>
    </button>
    <span id={hintId} className="duuk-ai-floating-hint">Arraste para mudar a posição, ou use as setas do teclado. Pressione Enter para abrir.</span>
  </>
}

export function AiFloatingDialog({ onClose, children }) {
  const dialog = useRef(null)
  useEffect(() => {
    const element = dialog.current, opener = document.activeElement
    element.showModal()
    return () => {
      element.close()
      // Discard confirmation is a second native dialog. Restore focus only
      // after both dialogs leave, when their former buttons no longer exist.
      requestAnimationFrame(() => { if (opener?.isConnected && !document.querySelector('dialog[open]')) opener.focus() })
    }
  }, [])
  return <dialog ref={dialog} className="admin-modal admin-modal--wide duuk-ai-floating-dialog" aria-label="DUUK AI" onCancel={event => { event.preventDefault(); event.stopPropagation(); onClose() }}>
    {children}
  </dialog>
}
