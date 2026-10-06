import { useEffect, useId, useRef, useState } from 'react'
import { getImageSources, getVideoSource } from '../media'
import { useContent } from '../content/useContent'
import { MEDIA_PREFIX } from '../content/model'

const paths = {
  grid: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  home: 'M3 10l9-7 9 7v11h-7v-7h-4v7H3z',
  media: 'M3 5h18v14H3z M3 15l5-5 5 5 3-3 5 5 M15 8h.01',
  plus: 'M12 5v14 M5 12h14',
  arrow: 'M7 17L17 7 M7 7h10v10',
  close: 'M6 6l12 12 M18 6L6 18',
  upload: 'M12 16V3 M7 8l5-5 5 5 M4 15v6h16v-6',
  search: 'M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  down: 'M6 9l6 6 6-6',
  up: 'M6 15l6-6 6 6',
  edit: 'M14 5l5 5 M3 21l5-1L21 7l-5-5L3 15z',
  check: 'M5 12l4 4L19 6',
  trash: 'M3 6h18 M9 6V3h6v3 M6 6l1 15h10l1-15 M10 10v7 M14 10v7',
  film: 'M3 3h18v18H3z M7 3v18 M17 3v18 M3 8h4 M3 16h4 M17 8h4 M17 16h4',
}

export function Icon({ name, size = 18 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>
}

export function Modal({ title, subtitle, children, onClose, wide = false }) {
  const ref = useRef(null)
  const titleId = useId()
  useEffect(() => {
    const dialog = ref.current
    dialog.showModal()
    return () => dialog.close()
  }, [])
  return (
    <dialog ref={ref} className={`admin-modal${wide ? ' admin-modal--wide' : ''}`} onCancel={(event) => { event.preventDefault(); onClose() }} aria-labelledby={titleId}>
      <div className="admin-modal__head">
        <div><p className="admin-eyebrow">DUUK / CONTEÚDO</p><h2 id={titleId}>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
        <button type="button" className="admin-icon-button" onClick={onClose} aria-label="Fechar"><Icon name="close" /></button>
      </div>
      {children}
    </dialog>
  )
}

export function ConfirmModal({ title, message, action, onConfirm, onClose }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async () => {
    setBusy(true)
    try { await onConfirm(); onClose() } catch (cause) { setError(cause.message); setBusy(false) }
  }
  return <Modal title={title} onClose={() => { if (!busy) onClose() }}>
    <div className="admin-confirm"><p>{message}</p>{error && <p className="admin-error" role="alert">{error}</p>}</div>
    <div className="admin-modal__foot"><button type="button" className="admin-button admin-button--secondary" onClick={onClose} disabled={busy}>Cancelar</button><button type="button" className="admin-button" onClick={submit} disabled={busy}>{busy ? 'Aguarde…' : action}</button></div>
  </Modal>
}

export function MediaField({ label, value = '', kind, onChange, disabled = false, onBusyChange }) {
  const { upload, urls, media, draft } = useContent()
  const input = useRef(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [libraryOpen, setLibraryOpen] = useState(false)
  const src = value.startsWith(MEDIA_PREFIX) ? urls[value] : kind === 'image' ? getImageSources(value).src : getVideoSource(value)
  const file = media.find((item) => item.id === value)
  const existing = kind === 'image'
    ? [...draft.projects.map((project) => ({ id: project.poster, name: project.title })), ...['poster', 'posterMobile'].map((key) => ({ id: draft.heroMedia[key], name: key === 'poster' ? 'Capa da abertura · Desktop' : 'Capa da abertura · Celular' }))]
    : [...draft.projects.filter((project) => project.provider === 'mp4').map((project) => ({ id: project.video, name: project.title })), ...['video', 'videoMobile'].map((key) => ({ id: draft.heroMedia[key], name: key === 'video' ? 'Abertura · Desktop' : 'Abertura · Celular' }))]
  const candidates = [...new Map([...media.filter((item) => item.type.startsWith(`${kind}/`)), ...existing].filter((item) => item.id).map((item) => [item.id, item])).values()]
  const uploadFile = async (selected) => {
    if (!selected || disabled || busy) return
    setError(''); setBusy(true); onBusyChange?.(true)
    try { onChange(await upload(selected, kind)) } catch (cause) { setError(cause.message) }
    finally { setBusy(false); onBusyChange?.(false); if (input.current) input.current.value = '' }
  }
  return (
    <div className="admin-media-field">
      <span className="admin-label">{label}</span>
      <div className={`admin-media-field__preview${kind === 'video' ? ' admin-media-field__preview--video' : ''}`}>
        {src ? kind === 'image' ? <img src={src} alt={`Prévia de ${label.toLowerCase()}`} /> : <video src={src} controls playsInline preload="metadata" /> : <div className="admin-media-placeholder"><Icon name={kind === 'image' ? 'media' : 'film'} size={28} /><span>{kind === 'image' ? 'Escolha uma imagem' : 'Escolha um vídeo'}</span></div>}
      </div>
      <div className="admin-media-field__upload" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); uploadFile(event.dataTransfer.files[0]) }}>
        <input ref={input} type="file" aria-label={`Enviar ${label.toLowerCase()}`} accept={kind === 'image' ? 'image/jpeg,image/png,image/webp,image/avif' : 'video/mp4,video/webm'} onChange={(event) => uploadFile(event.target.files[0])} disabled={disabled || busy} hidden />
        <button type="button" className="admin-button admin-button--secondary" onClick={() => input.current.click()} disabled={disabled || busy}><Icon name="upload" />{busy ? 'Enviando…' : 'Enviar arquivo'}</button>
        <button type="button" className="admin-button admin-button--secondary" onClick={() => setLibraryOpen(true)} disabled={disabled || busy}><Icon name="media" />Biblioteca</button>
        <span>{file ? file.name : kind === 'image' ? 'JPG, PNG, WebP ou AVIF' : 'MP4 ou WebM · até 250 MB'}</span>
      </div>
      <label className="admin-field"><span>Ou use um endereço HTTPS</span><input aria-label={`Endereço de ${label.toLowerCase()}`} value={value.startsWith(MEDIA_PREFIX) ? '' : value} placeholder="https://…" onChange={(event) => { setError(''); onChange(event.target.value.trim()) }} disabled={disabled || busy} /></label>
      {value && <button type="button" className="admin-text-button" onClick={() => onChange('')} disabled={disabled || busy}>Remover {kind === 'image' ? 'imagem' : 'vídeo'}</button>}
      {error && <p className="admin-error" role="alert">{error}</p>}
      {libraryOpen && <Modal title={kind === 'image' ? 'Escolher imagem' : 'Escolher vídeo'} onClose={() => setLibraryOpen(false)}>
        <div className="admin-media-picker">{candidates.map((item) => <button type="button" key={item.id} onClick={() => { onChange(item.id); setLibraryOpen(false) }}>{kind === 'image' ? <img src={item.id.startsWith(MEDIA_PREFIX) ? urls[item.id] : getImageSources(item.id).src} alt="" /> : <Icon name="film" size={24} />}<span>{item.name}</span><Icon name="plus" size={16} /></button>)}</div>
      </Modal>}
    </div>
  )
}
