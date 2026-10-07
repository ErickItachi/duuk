import { Activity, ArrowUpRight, Bell, BriefcaseBusiness, CalendarDays, ChartNoAxesCombined, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, CircleHelp, Clock3, Columns3, Copy, Download, Eye, EyeOff, File, FileText, Film, House, Images, Info, LayoutDashboard, Link2, LockKeyhole, LogOut, Mail, Menu, PanelLeftClose, Pencil, Phone, Plus, RefreshCw, RotateCcw, Search, Send, Settings2, ShieldCheck, Sparkles, Trash2, Upload, UserRound, Users, Wallet, WifiOff, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { getImageSources, getVideoSource } from '../media'
import { useContent } from '../content/useContent'
import { MEDIA_PREFIX } from '../content/model'

const icons = { calendar: CalendarDays, left: ChevronLeft, right: ChevronRight, sidebar: PanelLeftClose, restore: RotateCcw, download: Download, logout: LogOut, menu: Menu, refresh: RefreshCw, lock: LockKeyhole, document: FileText, wallet: Wallet, chart: ChartNoAxesCombined, grid: LayoutDashboard, home: House, media: Images, plus: Plus, arrow: ArrowUpRight, close: X, upload: Upload, search: Search, down: ChevronDown, up: ChevronUp, edit: Pencil, check: Check, trash: Trash2, film: Film, eye: Eye, eyeOff: EyeOff, users: Users, user: UserRound, shield: ShieldCheck, settings: Settings2, bell: Bell, mail: Mail, phone: Phone, pipeline: Columns3, activity: Activity, clock: Clock3, info: Info, send: Send, link: Link2, wifi: WifiOff, copy: Copy, file: File, briefcase: BriefcaseBusiness, spark: Sparkles }
export function Icon({ name, size = 18, ...props }) {
  const Component = icons[name] || CircleHelp
  return <Component size={size} strokeWidth={1.6} aria-hidden="true" {...props} />
}

export function RefreshButton({ onRefresh, label = 'Atualizar', compact = false }) {
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const button = useRef(null)
  const refresh = async () => { setBusy(true); setStatus(''); try { const result = await onRefresh(); if (result?.failed) throw new Error(result.error); setStatus('Dados atualizados agora.'); if (!matchMedia('(prefers-reduced-motion: reduce)').matches) button.current?.closest('main')?.querySelectorAll('.admin-page-title h1,.admin-stats strong,.crm-stats strong').forEach(element => element.animate?.([{ opacity: .5, transform: 'translateY(3px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 220, easing: 'ease-out' })) } catch (error) { setStatus(error.message || 'Não foi possível atualizar.') } finally { setBusy(false) } }
  return <span className="admin-refresh"><button ref={button} type="button" className={compact ? 'admin-icon-button' : 'admin-button admin-button--secondary'} aria-label={label} aria-busy={busy} disabled={busy} onClick={refresh}><Icon name="refresh" className={busy ? 'is-spinning' : ''} />{!compact && label}</button>{status && <small role="status">{status}</small>}</span>
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
    <dialog ref={ref} className={`admin-modal${wide ? ' admin-modal--wide' : ''}`} onCancel={(event) => { event.preventDefault(); event.stopPropagation(); onClose() }} aria-labelledby={titleId}>
      <div className="admin-modal__head">
        <div><p className="admin-eyebrow">DUUK / ADMINISTRATIVO</p><h2 id={titleId}>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
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
  const [progress, setProgress] = useState(0)
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
    try { onChange(await upload(selected, kind, setProgress)) } catch (cause) { setError(cause.message) }
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
        <button type="button" className="admin-button admin-button--secondary" onClick={() => input.current.click()} disabled={disabled || busy}><Icon name="upload" />{busy ? `Enviando ${progress}%` : 'Enviar arquivo'}</button>
        <button type="button" className="admin-button admin-button--secondary" onClick={() => setLibraryOpen(true)} disabled={disabled || busy}><Icon name="media" />Biblioteca</button>
        <span>{file ? file.name : kind === 'image' ? 'JPG, PNG, WebP ou AVIF · fotos grandes são otimizadas' : 'MP4 ou WebM · até 50 MB'}</span>
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
