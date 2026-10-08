import { Activity, ArrowUpRight, Bell, Bold, BriefcaseBusiness, CalendarDays, ChartNoAxesCombined, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, CircleHelp, Clock3, Cloud, CloudAlert, CloudCheck, CloudUpload, ExternalLink, HardDrive, Columns3, Copy, Download, Eye, EyeOff, File, FileText, Film, Forward, GripVertical, Highlighter, House, Images, Inbox, Info, Italic, LayoutDashboard, Link2, List, ListOrdered, LockKeyhole, LogOut, Mail, Menu, PanelLeftClose, PanelLeftOpen, Paperclip, Pencil, Phone, Plus, Redo2, RefreshCw, Reply, ReplyAll, RotateCcw, Search, Send, Settings2, ShieldCheck, Sparkles, Trash2, Underline, Undo2, Upload, UserRound, Users, Wallet, WifiOff, X, RemoveFormatting } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { getImageSources, getVideoSource } from '../media'
import { useContent } from '../content/useContent'
import { MEDIA_PREFIX } from '../content/model'

const icons = { calendar: CalendarDays, left: ChevronLeft, right: ChevronRight, sidebar: PanelLeftClose, sidebarOpen: PanelLeftOpen, restore: RotateCcw, download: Download, logout: LogOut, menu: Menu, refresh: RefreshCw, lock: LockKeyhole, document: FileText, wallet: Wallet, chart: ChartNoAxesCombined, grid: LayoutDashboard, home: House, media: Images, plus: Plus, arrow: ArrowUpRight, close: X, upload: Upload, search: Search, down: ChevronDown, up: ChevronUp, edit: Pencil, check: Check, trash: Trash2, film: Film, eye: Eye, eyeOff: EyeOff, users: Users, user: UserRound, shield: ShieldCheck, settings: Settings2, bell: Bell, mail: Mail, phone: Phone, pipeline: Columns3, activity: Activity, clock: Clock3, info: Info, send: Send, link: Link2, wifi: WifiOff, copy: Copy, file: File, briefcase: BriefcaseBusiness, spark: Sparkles, inbox: Inbox, attachment: Paperclip, bold: Bold, italic: Italic, underline: Underline, highlight: Highlighter, list: List, listOrdered: ListOrdered, clearFormat: RemoveFormatting, undo: Undo2, redo: Redo2, reply: Reply, replyAll: ReplyAll, forward: Forward, cloud: Cloud, cloudCheck: CloudCheck, cloudAlert: CloudAlert, cloudUpload: CloudUpload, external: ExternalLink, drive: HardDrive }
export function Icon({ name, size = 18, ...props }) {
  const Component = (name === 'grip' ? GripVertical : icons[name]) || CircleHelp
  return <Component size={size} strokeWidth={1.6} aria-hidden="true" {...props} />
}

export function RefreshButton({ onRefresh, label = 'Atualizar', compact = false, disabled = false }) {
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const button = useRef(null)
  const running = useRef(false), alive = useRef(true), spinner = useRef(null), feedbackTimer = useRef(null)
  useEffect(() => { alive.current = true; return () => { alive.current = false; spinner.current?.cancel(); clearTimeout(feedbackTimer.current) } }, [])
  const refresh = async () => {
    if (running.current || disabled) return
    running.current = true; setBusy(true); setStatus(''); clearTimeout(feedbackTimer.current)
    const started = performance.now(), reduced = matchMedia('(prefers-reduced-motion: reduce)').matches, icon = button.current?.querySelector('svg')
    if (!reduced) spinner.current = icon?.animate?.([{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], { duration: 800, iterations: Infinity })
    let message
    try {
      const result = await onRefresh()
      if (result?.failed) throw new Error(result.error)
      message = 'Dados atualizados agora.'
      if (!reduced && alive.current) button.current?.closest('main')?.querySelectorAll('.admin-stats strong,.crm-stats strong').forEach((element, index) => element.animate?.([{ opacity: .55, transform: 'translateY(3px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 320, delay: Math.min(index * 35, 140), easing: 'cubic-bezier(.22,1,.36,1)' }))
    } catch (error) { message = error.message || 'Não foi possível atualizar.' }
    await new Promise(resolve => setTimeout(resolve, Math.max(0, 400 - (performance.now() - started))))
    if (!alive.current) return
    if (spinner.current) {
      const angle = (Number(spinner.current.currentTime || 0) % 800) / 800 * 360
      spinner.current.cancel()
      spinner.current = icon.animate([{ transform: `rotate(${angle}deg)` }, { transform: 'rotate(360deg)' }], { duration: 200, easing: 'ease-out' })
      await spinner.current.finished.catch(() => {})
    }
    if (alive.current) { setStatus(message); setBusy(false); running.current = false; feedbackTimer.current = setTimeout(() => { if (alive.current) setStatus('') }, 6000) }
  }
  return <span className="admin-refresh"><button ref={button} type="button" className={compact ? 'admin-icon-button' : 'admin-button admin-button--secondary'} aria-label={label} aria-busy={busy} disabled={busy || disabled} onClick={refresh}><Icon name="refresh" />{!compact && label}</button><small role="status">{status}</small></span>
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
