import { useEffect, useRef, useState } from 'react'
export default function SpotifyRange({ value = 0, max = 100, disabled, onCommit, ...props }) {
 const [draft, setDraft] = useState(value), editing = useRef(false), sent = useRef(value)
 useEffect(() => { if (!editing.current) { setDraft(value); sent.current = value } }, [value])
 const commit = next => {
  editing.current = false
  if (disabled || next === sent.current) return
  sent.current = next
  Promise.resolve().then(() => onCommit(next)).then(ok => { if (ok === false) { sent.current = value; setDraft(value) } }).catch(() => { sent.current = value; setDraft(value) })
 }
 const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']
 return <input {...props} type="range" min="0" max={max} value={Math.min(draft, max)} disabled={disabled}
  onPointerDown={() => { editing.current = true }} onChange={event => setDraft(Number(event.target.value))}
  onPointerUp={event => commit(Number(event.currentTarget.value))} onPointerCancel={() => { editing.current = false; setDraft(value) }}
  onKeyDown={event => { if (keys.includes(event.key)) editing.current = true }} onKeyUp={event => { if (keys.includes(event.key)) commit(Number(event.currentTarget.value)) }}
  onBlur={event => { if (editing.current) commit(Number(event.currentTarget.value)) }} />
}
