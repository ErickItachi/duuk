import { Fragment, useCallback, useEffect, useId, useRef, useState } from 'react'
import { useAuth } from '../content/AuthContext'
import { ConfirmModal, Icon, Modal } from '../admin/components'
import { FieldError, Pagination, SearchField } from '../admin/forms'
import { matchesQuery, usePagination } from '../admin/ds/list'
import { useUnsavedChanges } from '../admin/unsavedChanges'
import { aiRequest, streamAiRequest } from './api'
import ActionCards from './ActionCards'
import './ai.css'

const modes = [
  { id: 'script', icon: 'film', label: 'Criar roteiro', description: 'Imagem, som e uma história que funciona.', prompt: 'Quero criar um roteiro audiovisual. Meu briefing é: ' },
  { id: 'concept', icon: 'spark', label: 'Desenvolver conceito', description: 'Encontre a ideia que sustenta o filme.', prompt: 'Vamos desenvolver um conceito de campanha. A ideia inicial é: ' },
  { id: 'commercial', icon: 'briefcase', label: 'Assistente comercial', description: 'Propostas claras e conversas melhores.', prompt: 'Preciso de ajuda comercial para um projeto audiovisual: ' },
  { id: 'help', icon: 'info', label: 'Ajuda com a DUUK', description: 'O próximo passo dentro da plataforma.', prompt: 'Como posso utilizar o DUUK Admin para ' },
]
const documentTypes = [['script', 'Roteiro'], ['concept', 'Conceito'], ['proposal', 'Proposta'], ['briefing', 'Briefing'], ['other', 'Documento']]
const consentVersion = '2026-10-09'
const dateLabel = value => value ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(value)) : ''
// Below this width the conversation list opens as a drawer over the chat instead of beside it.
const drawerQuery = '(max-width: 1023px)'
// Whether the conversation list stays open beside the chat on wider screens. A per-device convenience only.
const listPreference = 'duuk-ai-list-open'
const readListOpen = () => { try { return localStorage.getItem(listPreference) !== '0' } catch { return true } }
const storeListOpen = value => { try { localStorage.setItem(listPreference, value ? '1' : '0') } catch { /* Kept for this visit only. */ } }
const percent = (used, limit) => Math.max(0, Math.min(100, Math.round(Number(used || 0) / Math.max(1, Number(limit)) * 100)))

// All model output is rendered as React text. No raw HTML or remote images are
// interpreted; links are restricted to explicit HTTPS addresses.
function InlineText({ text }) {
  return text.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`|\[[^\]\n]+\]\(https:\/\/[^\s)]+\))/g).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>
    if (part.startsWith('`') && part.endsWith('`')) return <code key={index}>{part.slice(1, -1)}</code>
    const link = part.match(/^\[([^\]]+)\]\((https:\/\/[^\s)]+)\)$/)
    if (link) return <a key={index} href={link[2]} target="_blank" rel="noopener noreferrer">{link[1]}</a>
    return <Fragment key={index}>{part}</Fragment>
  })
}
function Markdown({ content = '' }) {
  const blocks = [], lines = content.replace(/\r\n/g, '\n').split('\n')
  for (let index = 0; index < lines.length;) {
    const line = lines[index]
    if (!line.trim()) { index++; continue }
    if (/^```/.test(line)) { const code = []; index++; while (index < lines.length && !/^```/.test(lines[index])) code.push(lines[index++]); index++; blocks.push(<pre key={blocks.length}><code>{code.join('\n')}</code></pre>); continue }
    const heading = line.match(/^(#{1,4})\s+(.+)$/)
    if (heading) { blocks.push(<h3 className={`duuk-ai-markdown__h${heading[1].length}`} key={blocks.length}><InlineText text={heading[2]} /></h3>); index++; continue }
    if (/^\s*([-*]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line), items = []
      while (index < lines.length && (ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*]\s+/).test(lines[index])) items.push(<li key={items.length}><InlineText text={lines[index++].replace(/^\s*([-*]|\d+[.)])\s+/, '')} /></li>)
      blocks.push(ordered ? <ol key={blocks.length}>{items}</ol> : <ul key={blocks.length}>{items}</ul>); continue
    }
    if (/^\s*>\s?/.test(line)) { blocks.push(<blockquote key={blocks.length}><InlineText text={line.replace(/^\s*>\s?/, '')} /></blockquote>); index++; continue }
    if (/^\s*[-*_]{3,}\s*$/.test(line)) { blocks.push(<hr key={blocks.length} />); index++; continue }
    const paragraph = [line]; index++
    while (index < lines.length && lines[index].trim() && !/^(#{1,4}\s|```|\s*([-*]|\d+[.)])\s|\s*>)/.test(lines[index])) paragraph.push(lines[index++])
    blocks.push(<p key={blocks.length}>{paragraph.map((text, i) => <Fragment key={i}>{i > 0 && <br />}<InlineText text={text} /></Fragment>)}</p>)
  }
  return <div className="duuk-ai-markdown">{blocks}</div>
}

async function exportPdf(document) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  pdf.setTitle(document.title); pdf.setAuthor('DUUK'); pdf.setCreator('DUUK Admin')
  const logoResponse = await fetch('/media/duuk-logo-white.png', { credentials: 'same-origin' })
  if (!logoResponse.ok) throw new Error('Não foi possível carregar a logo da DUUK. Tente novamente.')
  const logo = await pdf.embedPng(await logoResponse.arrayBuffer())
  const safe = value => Array.from(String(value).replace(/[\t\r]/g, ' ').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[–—]/g, '-')).map(char => { try { font.encodeText(char); return char } catch { return '' } }).join('')
  const wrap = (value, size, type = font) => {
    const result = [], words = safe(value).split(/\s+/); let line = ''
    for (const word of words) {
      if (type.widthOfTextAtSize([line, word].filter(Boolean).join(' '), size) <= 491) { line = [line, word].filter(Boolean).join(' '); continue }
      if (line) result.push(line); line = ''
      for (const char of word) { if (type.widthOfTextAtSize(line + char, size) > 491) { result.push(line); line = '' } line += char }
    }
    if (line) result.push(line)
    return result.length ? result : ['']
  }
  let page, y = 0
  const newPage = () => {
    page = pdf.addPage([595.28, 841.89]); page.drawRectangle({ x: 0, y: 749, width: 595.28, height: 93, color: rgb(.055, .05, .045) })
    const dimensions = logo.scaleToFit(39, 54); page.drawImage(logo, { x: 52, y: 767, ...dimensions })
    page.drawText('DUUK / CRIATIVO', { x: 115, y: 790, font: bold, size: 10, color: rgb(1, .96, .93) })
    page.drawText('Documento de trabalho', { x: 115, y: 773, font, size: 9, color: rgb(.76, .71, .68) })
    page.drawRectangle({ x: 0, y: 745, width: 595.28, height: 4, color: rgb(.92, .29, .25) }); y = 712
  }
  const write = (text, size, type, gap = 5) => {
    for (const line of wrap(text, size, type)) { if (y < 68) newPage(); page.drawText(line, { x: 52, y, font: type, size, color: rgb(.12, .11, .1) }); y -= size + gap }
  }
  newPage(); write(document.title, 22, bold, 7); y -= 14
  for (const line of document.content.split('\n')) {
    if (!line.trim()) { y -= 9; continue }
    const heading = /^#{1,4}\s+/.test(line)
    write(line.replace(/^#{1,4}\s+/, '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1'), heading ? 14 : 10.5, heading ? bold : font, heading ? 7 : 5)
    if (heading) y -= 4
  }
  const pages = pdf.getPages()
  pages.forEach((item, index) => { item.drawLine({ start: { x: 52, y: 44 }, end: { x: 543, y: 44 }, thickness: .5, color: rgb(.85, .82, .8) }); item.drawText(`DUUK | ${index + 1} / ${pages.length}`, { x: 52, y: 29, font, size: 8, color: rgb(.45, .4, .37) }) })
  const url = URL.createObjectURL(new Blob([await pdf.save()], { type: 'application/pdf' })), anchor = documentGlobal().createElement('a')
  anchor.href = url; anchor.download = `${document.title.replace(/[^\p{L}\p{N} ._-]/gu, '').slice(0, 100) || 'DUUK-documento'}.pdf`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
const documentGlobal = () => window.document

function DocumentEditor({ document, conversationId, onClose, onSaved, notify }) {
  const readOnly = document.can_edit === false
  const [form, setForm] = useState({ title: document.title || 'Novo documento', content: document.content || '', document_type: document.document_type || 'script', project_id: document.project_id || '', shared: document.shared === true })
  const [original, setOriginal] = useState(JSON.stringify(form)), [version, setVersion] = useState(document.version || document.current_version || 1)
  const [projects, setProjects] = useState([]), [versions, setVersions] = useState([]), [busy, setBusy] = useState(false), [error, setError] = useState(''), [showVersions, setShowVersions] = useState(false)
  const [attempted, setAttempted] = useState(false), [discard, setDiscard] = useState(false), formRef = useRef(null), fieldId = useId()
  const dirty = !readOnly && JSON.stringify(form) !== original
  // The server trims and requires both values; say so next to each field before sending.
  const problems = attempted && !readOnly ? { title: form.title.trim() ? '' : 'Informe um título para o documento.', content: form.content.trim() ? '' : 'Escreva o conteúdo do documento.' } : {}
  useUnsavedChanges(dirty || busy)
  useEffect(() => { let alive = true; aiRequest({ action: 'projects' }).then(result => { if (alive) setProjects(result.projects || []) }).catch(() => {}); return () => { alive = false } }, [])
  const close = () => { if (busy) return; if (dirty) setDiscard(true); else onClose() }
  const field = (name, value) => { setForm(old => ({ ...old, [name]: value })); setError('') }
  const save = async event => {
    event.preventDefault(); if (readOnly) return
    if (!form.title.trim() || !form.content.trim()) { setAttempted(true); requestAnimationFrame(() => formRef.current?.querySelector('[aria-invalid="true"]')?.focus()); return }
    setBusy(true); setError('')
    try { const result = await aiRequest({ action: 'save_document', ...(document.id ? { id: document.id, expected_version: version } : {}), conversation_id: document.conversation_id || conversationId || null, ...form, project_id: form.project_id || null }); const saved = result.document || result; setVersion(saved.version || saved.current_version || version + 1); setOriginal(JSON.stringify(form)); onSaved(saved); notify('Documento salvo na DUUK.'); onClose() }
    catch (cause) { setError(cause.message) } finally { setBusy(false) }
  }
  const history = async () => { setShowVersions(!showVersions); if (showVersions || !document.id) return; try { const result = await aiRequest({ action: 'versions', id: document.id }); setVersions(result.versions || []) } catch (cause) { setError(cause.message) } }
  const pdf = async () => { setBusy(true); setError(''); try { await exportPdf(form) } catch (cause) { setError(cause.message) } finally { setBusy(false) } }
  return <><Modal title={readOnly ? 'Visualizar documento' : document.id ? 'Editar documento' : 'Salvar documento'} subtitle={readOnly ? 'Documento compartilhado. Você pode consultar o conteúdo e exportar o PDF.' : 'Salve o texto e vincule a um projeto quando fizer sentido.'} onClose={close} wide>
    <form ref={formRef} className="duuk-ai-document" onSubmit={save} noValidate aria-busy={busy}>
      <div className="admin-modal__body duuk-ai-document__fields">
        <div className="admin-field"><label className="admin-label" htmlFor={`${fieldId}-title`}>Título</label><input id={`${fieldId}-title`} autoFocus required maxLength={160} value={form.title} onChange={e => field('title', e.target.value)} disabled={busy} readOnly={readOnly} aria-invalid={problems.title ? true : undefined} aria-describedby={problems.title ? `${fieldId}-title-error` : undefined} /><FieldError id={`${fieldId}-title-error`}>{problems.title}</FieldError></div>
        <div className="duuk-ai-document__selects"><label className="admin-field"><span>Tipo</span><select aria-label="Tipo" value={form.document_type} onChange={e => field('document_type', e.target.value)} disabled={busy || readOnly}>{documentTypes.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label className="admin-field"><span>Projeto</span><select aria-label="Projeto" value={form.project_id} onChange={e => { field('project_id', e.target.value); if (!e.target.value) field('shared', false) }} disabled={busy || readOnly}><option value="">Pessoal, sem projeto</option>{projects.map(project => <option key={project.id} value={project.id}>{project.title}</option>)}</select>{!readOnly && <small>O documento continua privado até você autorizar o compartilhamento abaixo.</small>}</label></div>
        {form.project_id && <label className="admin-check duuk-ai-document__sharing"><input type="checkbox" checked={form.shared} onChange={e => field('shared', e.target.checked)} disabled={busy || readOnly} /><span>Compartilhar este documento com os membros que têm acesso ao projeto. O histórico da conversa permanece privado.</span></label>}
        <div className="admin-field"><label className="admin-label" htmlFor={`${fieldId}-content`}>Conteúdo</label><textarea id={`${fieldId}-content`} aria-label="Conteúdo" required maxLength={60000} rows={16} value={form.content} onChange={e => field('content', e.target.value)} disabled={busy} readOnly={readOnly} aria-invalid={problems.content ? true : undefined} aria-describedby={problems.content ? `${fieldId}-content-error` : undefined} /><FieldError id={`${fieldId}-content-error`}>{problems.content}</FieldError></div>
        {document.id && <button type="button" className="admin-text-button duuk-ai-document__history" onClick={history} disabled={busy} aria-expanded={showVersions}><Icon name="history" size={15} />{showVersions ? 'Ocultar versões' : 'Histórico de versões'}</button>}
        {showVersions && <div className="duuk-ai-versions">{versions.length ? versions.map(item => <button type="button" key={item.id || item.version} disabled={busy} onClick={() => { field('content', item.content); if (item.title) field('title', item.title); setShowVersions(false) }}><span>Versão {item.version}</span><small>{dateLabel(item.created_at)}</small><span>{readOnly ? 'Ver texto' : 'Usar texto'}</span></button>) : <p>Nenhuma versão anterior disponível.</p>}<small>{readOnly ? 'Selecione uma versão para consultar ou exportar o texto.' : 'Usar uma versão preenche o editor. Salve para criar uma nova versão.'}</small></div>}
        {error && <p className="admin-error" role="alert"><Icon name="alertCircle" /><span>{error}</span></p>}
      </div>
      <div className="admin-modal__foot"><button type="button" className="admin-button admin-button--secondary duuk-ai-document__pdf" disabled={busy || !form.content.trim()} onClick={pdf}><Icon name="download" />PDF</button><button type="button" className="admin-button admin-button--secondary" onClick={close} disabled={busy}>{readOnly ? 'Fechar' : 'Cancelar'}</button>{!readOnly && <button className="admin-button" disabled={busy} aria-busy={busy}>{busy ? 'Aguarde…' : document.id ? 'Salvar nova versão' : 'Salvar documento'}</button>}</div>
    </form>
  </Modal>{discard && <ConfirmModal title="Descartar alterações?" message="As alterações deste documento ainda não foram salvas." action="Descartar" onConfirm={async () => onClose()} onClose={() => setDiscard(false)} />}</>
}

function ListSkeleton() {
  return <div className="duuk-ai-list-skeleton" role="status"><span className="ds-visually-hidden">Carregando a lista.</span>{[72, 56, 64, 48].map(width => <span key={width} className="ds-skeleton ds-skeleton--text" style={{ width: `${width}%` }} aria-hidden="true" />)}</div>
}

export default function AiPage({ embedded = false, context = '', notify = () => {}, onDirtyChange, onClose }) {
  const auth = useAuth()
  const memberId = auth?.user?.id || auth?.profile?.id
  const [history, setHistory] = useState([]), [documents, setDocuments] = useState([]), [conversation, setConversation] = useState(null), [messages, setMessages] = useState([])
  const [actions, setActions] = useState([]), [actionOptions, setActionOptions] = useState({ people: [], clients: [] }), [actionOptionsLoading, setActionOptionsLoading] = useState(false), [actionOptionsError, setActionOptionsError] = useState(''), [actionOptionsRevision, setActionOptionsRevision] = useState(0), [actionOptionsQuery, setActionOptionsQuery] = useState(''), [actionChanges, setActionChanges] = useState({}), [actionOperations, setActionOperations] = useState({})
  const [mode, setMode] = useState(embedded && context ? 'help' : 'free'), [draft, setDraft] = useState(''), [consent, setConsent] = useState(false), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [status, setStatus] = useState(null), [sidebar, setSidebar] = useState(false), [tab, setTab] = useState('conversations'), [renaming, setRenaming] = useState(null), [renameTitle, setRenameTitle] = useState(''), [deleting, setDeleting] = useState(null), [editing, setEditing] = useState(null), [document, setDocument] = useState(null), [copied, setCopied] = useState(''), [retry, setRetry] = useState(null)
  const [configure, setConfigure] = useState(false), [apiKey, setApiKey] = useState(''), [freeTier, setFreeTier] = useState(false), [configuring, setConfiguring] = useState(false), [configurationError, setConfigurationError] = useState('')
  const [privacy, setPrivacy] = useState(null), [privacyAccepted, setPrivacyAccepted] = useState(false), [compact, setCompact] = useState(() => matchMedia(drawerQuery).matches)
  const [consentBusy, setConsentBusy] = useState(false), [consentError, setConsentError] = useState('')
  const [listOpen, setListOpen] = useState(readListOpen), [listQuery, setListQuery] = useState(''), [renameBusy, setRenameBusy] = useState(false), [discardAsk, setDiscardAsk] = useState(null), [statusRetrying, setStatusRetrying] = useState(false), [keyAttempted, setKeyAttempted] = useState(false)
  const controller = useRef(null), running = useRef(false), revision = useRef(0), scroll = useRef(null), input = useRef(null), nearBottom = useRef(true), alive = useRef(true), consentRef = useRef(false), menu = useRef(null), usage = useRef(null), shell = useRef(null)
  const consentEpoch = useRef(0), accountEpoch = useRef(0), toggleButton = useRef(null), drawer = useRef(null)
  const fieldId = useId()
  const hasActionChanges = Object.values(actionChanges).some(Boolean), actionBusy = Object.values(actionOperations).some(Boolean)
  const dirty = Boolean(draft.trim()) || busy || hasActionChanges || Boolean(apiKey) || configuring || consentBusy
  // Phones, tablets and the floating help show the list as a drawer over the chat; wide screens keep it beside the chat.
  const overlay = embedded || compact, showList = overlay ? sidebar : listOpen
  const actionDirtyChanged = useCallback((id, value) => setActionChanges(old => old[id] === value ? old : { ...old, [id]: value }), [])
  const actionBusyChanged = useCallback((id, value) => setActionOperations(old => old[id] === value ? old : { ...old, [id]: value }), [])
  const actionUpdated = useCallback(updated => setActions(old => old.map(action => action.id === updated.id ? updated : action)), [])
  const refreshActionOptions = useCallback(() => setActionOptionsRevision(old => old + 1), [])
  const searchActionClients = useCallback(query => setActionOptionsQuery(query.trim().slice(0, 100)), [])
  useUnsavedChanges(dirty)
  useEffect(() => { onDirtyChange?.(dirty); return () => onDirtyChange?.(false) }, [dirty, onDirtyChange])
  useEffect(() => { const media = matchMedia(drawerQuery), change = event => setCompact(event.matches); media.addEventListener('change', change); return () => media.removeEventListener('change', change) }, [])
  useEffect(() => { const close = event => { for (const detail of [menu.current, usage.current]) if (detail && !detail.contains(event.target)) detail.removeAttribute('open') }; window.document.addEventListener('pointerdown', close); return () => window.document.removeEventListener('pointerdown', close) }, [])
  useEffect(() => { const element = input.current; if (element) { element.style.height = 'auto'; element.style.height = `${Math.min(element.scrollHeight, 144)}px` } }, [draft])
  useEffect(() => {
    if (!window.visualViewport) return
    const viewport = window.visualViewport, element = shell.current, dialog = embedded ? element?.closest('dialog') : null
    let frame
    const resize = () => {
      if (embedded) { dialog?.style.setProperty('--duuk-ai-viewport-height', `${Math.round(viewport.height)}px`); dialog?.style.setProperty('--duuk-ai-viewport-top', `${Math.round(viewport.offsetTop)}px`); return }
      // iOS may shrink only the visual viewport when its keyboard opens. Keep
      // this page's composer visible without changing the surrounding admin.
      const active = window.document.activeElement
      const keyboardOpen = viewport.scale <= 1.05 && window.innerHeight - viewport.height > 100 && element?.contains(active) && active?.closest('.duuk-ai-composer')
      if (keyboardOpen) {
        element.dataset.keyboardOpen = 'true'
        element.style.setProperty('--duuk-ai-page-height', `${Math.max(170, Math.floor(viewport.offsetTop + viewport.height - element.getBoundingClientRect().top - 12))}px`)
      } else { element?.removeAttribute('data-keyboard-open'); element?.style.removeProperty('--duuk-ai-page-height') }
    }
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(resize) }
    resize(); viewport.addEventListener('resize', schedule); viewport.addEventListener('scroll', schedule); window.addEventListener('scroll', schedule); element?.addEventListener('focusin', schedule); element?.addEventListener('focusout', schedule)
    return () => { cancelAnimationFrame(frame); viewport.removeEventListener('resize', schedule); viewport.removeEventListener('scroll', schedule); window.removeEventListener('scroll', schedule); element?.removeEventListener('focusin', schedule); element?.removeEventListener('focusout', schedule); element?.removeAttribute('data-keyboard-open'); element?.style.removeProperty('--duuk-ai-page-height'); dialog?.style.removeProperty('--duuk-ai-viewport-height'); dialog?.style.removeProperty('--duuk-ai-viewport-top') }
  }, [embedded])
  const stopGeneration = useCallback(() => controller.current?.abort(), [])
  const invalidate = useCallback(() => { revision.current++ }, [])
  const invalidateConsent = useCallback(() => { consentEpoch.current++ }, [])
  const invalidateAccount = useCallback(() => { accountEpoch.current++ }, [])
  const isActiveAccount = useCallback(epoch => alive.current && epoch === accountEpoch.current, [])
  const applyStatus = useCallback((result, epoch, account) => {
    if (!isActiveAccount(account) || epoch !== consentEpoch.current) return
    // The authenticated backend is the only source of consent. Never inherit an
    // acceptance from this browser, another member or an older policy version.
    const accepted = result.consent?.accepted === true && result.consent.version === consentVersion
    consentRef.current = accepted; setConsent(accepted); setStatus(result)
  }, [isActiveAccount])
  const refreshList = useCallback(async () => { const account = accountEpoch.current, [result, library] = await Promise.all([aiRequest({ action: 'list' }), aiRequest({ action: 'documents' })]); if (isActiveAccount(account)) { setHistory(result.conversations || []); setDocuments(library.documents || []) } }, [isActiveAccount])
  useEffect(() => {
    let cancelled = false; alive.current = true; consentRef.current = false; invalidateConsent(); invalidateAccount()
    const account = accountEpoch.current
    const load = async () => {
      // Resolve against the member's server record each time the panel mounts
      // or the signed-in account changes, including the contextual popup.
      await Promise.resolve(); if (cancelled) return
      running.current = false; controller.current = null
      setHistory([]); setDocuments([]); setConversation(null); setMessages([]); setActions([]); setActionOptions({ people: [], clients: [] }); setActionOptionsError(''); setActionOptionsLoading(false); setActionOptionsQuery(''); setActionChanges({}); setActionOperations({}); setDraft(''); setMode(embedded && context ? 'help' : 'free'); setSidebar(false); setTab('conversations'); setRenaming(null); setRenameTitle(''); setDeleting(null); setEditing(null); setDocument(null); setCopied(''); setRetry(null)
      setConfigure(false); setApiKey(''); setFreeTier(false); setConfiguring(false); setConfigurationError(''); setBusy(false); setError('')
      setConsent(false); setStatus(null); setPrivacy(null); setPrivacyAccepted(false); setConsentBusy(false); setConsentError(''); setLoading(true)
      setListQuery(''); setRenameBusy(false); setDiscardAsk(null); setStatusRetrying(false); setKeyAttempted(false)
      const epoch = consentEpoch.current, results = await Promise.allSettled([refreshList(), aiRequest({ action: 'status' })])
      if (cancelled || !isActiveAccount(account)) return
      if (results[0].status === 'rejected') setError(results[0].reason.message)
      if (results[1].status === 'fulfilled') applyStatus(results[1].value, epoch, account)
      else { setStatus({ configured: false, status_unavailable: true }); setError(results[1].reason.message) }
      setLoading(false)
    }
    load()
    return () => { cancelled = true; alive.current = false; invalidateConsent(); invalidateAccount(); stopGeneration(); invalidate() }
  }, [memberId, embedded, context, applyStatus, refreshList, stopGeneration, invalidate, invalidateConsent, invalidateAccount, isActiveAccount])
  const needsActionOptions = actions.some(action => action.kind === 'followup.create' || action.status === 'pending' && action.kind === 'agenda.create')
  useEffect(() => {
    let cancelled = false
    const account = accountEpoch.current
    const load = async () => {
      await Promise.resolve(); if (cancelled || !isActiveAccount(account)) return
      if (!needsActionOptions) { setActionOptionsLoading(false); return }
      setActionOptionsLoading(true); setActionOptionsError('')
      try { const result = await aiRequest({ action: 'action_options', query: actionOptionsQuery }); if (!cancelled && isActiveAccount(account)) setActionOptions(old => ({ people: result.people || [], clients: [...old.clients.filter(client => !(result.clients || []).some(updated => updated.id === client.id)), ...(result.clients || [])] })) }
      catch (cause) { if (!cancelled && isActiveAccount(account)) setActionOptionsError(cause.message) }
      finally { if (!cancelled && isActiveAccount(account)) setActionOptionsLoading(false) }
    }
    load()
    return () => { cancelled = true }
  }, [needsActionOptions, conversation?.id, memberId, actionOptionsRevision, actionOptionsQuery, isActiveAccount])
  useEffect(() => { const element = scroll.current; if (nearBottom.current && element) element.scrollTo({ top: element.scrollHeight, behavior: busy ? 'instant' : 'smooth' }) }, [messages, actions, busy])
  // Unsent text or a card under review asks before it is replaced, in a design-system dialog.
  const guardDiscard = run => {
    if (running.current || actionBusy) return
    if (draft.trim() || hasActionChanges) setDiscardAsk({ run }); else run()
  }
  const openConversation = async item => {
    const current = ++revision.current, account = accountEpoch.current; setLoading(true); setSidebar(false); setError(''); setRetry(null); setEditing(null)
    try { const result = await aiRequest({ action: 'conversation', id: item.id }); if (current !== revision.current || !isActiveAccount(account)) return; setConversation(result.conversation); setMessages(result.messages || []); setActions(result.actions || []); setActionChanges({}); setActionOperations({}); setMode(result.conversation?.mode || 'free'); setDraft(''); nearBottom.current = true } catch (cause) { if (current === revision.current && isActiveAccount(account)) setError(cause.message) } finally { if (current === revision.current && isActiveAccount(account)) setLoading(false) }
  }
  const open = item => guardDiscard(() => { openConversation(item) })
  const startFresh = () => { revision.current++; setLoading(false); setConversation(null); setMessages([]); setActions([]); setActionChanges({}); setActionOperations({}); setDraft(''); setEditing(null); setMode(embedded && context ? 'help' : 'free'); setError(''); setRetry(null); setSidebar(false); input.current?.focus() }
  const fresh = () => guardDiscard(startFresh)
  const copy = async (text, id) => { try { await navigator.clipboard.writeText(text); setCopied(id); setTimeout(() => setCopied(''), 2400) } catch { notify('Não foi possível copiar. Selecione o texto e copie.', true) } }
  const generate = async (payload, baseMessages) => {
    if (running.current || actionBusy || !consentRef.current || status?.configured !== true) return
    const requestController = new AbortController(), account = accountEpoch.current
    running.current = true; setBusy(true); setError(''); setRetry(null); controller.current = requestController; nearBottom.current = true
    const pending = `pending:${payload.client_request_id}`, userMessage = { id: `user:${payload.client_request_id}`, role: 'user', content: payload.message }
    const prefix = baseMessages || messages
    setMessages([...prefix, userMessage, { id: pending, role: 'assistant', content: '', pending: true }]); setDraft(old => old.trim() === payload.message ? '' : old); setEditing(null)
    let accumulated = '', conversationId = payload.conversation_id, completed = false
    try {
      await streamAiRequest(payload, { signal: requestController.signal, onEvent: event => {
        if (!isActiveAccount(account) || requestController.signal.aborted) return
        if (event.type === 'meta' && event.conversation_id) { conversationId = event.conversation_id; setConversation(old => ({ ...old, id: conversationId, title: old?.title || payload.message.slice(0, 80), mode: payload.mode })) }
        if (event.type === 'delta') { accumulated += event.text || ''; setMessages(old => old.map(item => item.id === pending ? { ...item, content: accumulated } : item)) }
        if (event.type === 'done') { completed = true; conversationId = event.conversation_id || conversationId; setMessages(old => old.map(item => item.id === pending ? { ...item, ...(typeof event.message === 'object' ? event.message : {}), content: event.message?.content || accumulated, pending: false } : item)); if (Array.isArray(event.actions)) setActions(old => [...old.filter(action => !event.actions.some(updated => updated.id === action.id)), ...event.actions]); if (Array.isArray(event.action_errors)) { const actionError = event.action_errors.map(value => typeof value === 'string' ? value : value?.error).find(value => typeof value === 'string'); if (actionError) setError(actionError.slice(0, 1000)) } }
      } })
      if (!isActiveAccount(account)) return
      if (requestController.signal.aborted) throw new DOMException('Geração interrompida.', 'AbortError')
      if (conversationId) { const result = await aiRequest({ action: 'conversation', id: conversationId }); if (!isActiveAccount(account)) return; setConversation(result.conversation); setMessages(result.messages || []); setActions(result.actions || []) }
      await refreshList()
    } catch (cause) {
      if (!isActiveAccount(account)) return
      const aborted = requestController.signal.aborted || cause.name === 'AbortError'
      setMessages(old => old.map(item => item.id === pending ? { ...item, pending: false, interrupted: !completed } : item))
      setError(aborted ? 'Geração interrompida. O texto recebido continua aqui.' : cause.message)
      if (!completed) { setRetry({ payload, baseMessages: prefix }); setDraft(old => old || payload.message) }
      refreshList().catch(() => {})
    } finally { if (isActiveAccount(account)) { running.current = false; controller.current = null; setBusy(false); const epoch = consentEpoch.current; aiRequest({ action: 'status' }).then(result => applyStatus(result, epoch, account)).catch(() => {}) } }
  }
  const requestGeneration = (payload, baseMessages) => {
    if (running.current || actionBusy || !status?.configured) return
    if (!consentRef.current) { setPrivacyAccepted(false); setConsentError(''); setPrivacy({ payload, baseMessages }); return }
    generate(payload, baseMessages)
  }
  const submit = event => {
    event.preventDefault(); if (!draft.trim()) return
    if (retry && !editing && draft.trim() === retry.payload.message) { requestGeneration(retry.payload, retry.baseMessages); return }
    const index = editing ? messages.findIndex(item => item.id === editing.id) : -1
    const payload = { message: draft.trim(), mode, context, consent: true, consent_version: consentVersion, actions_supported: true, client_request_id: crypto.randomUUID(), ...(conversation?.id ? { conversation_id: conversation.id } : {}), ...(editing ? { edit_message_id: editing.id } : {}) }
    requestGeneration(payload, index >= 0 ? messages.slice(0, index) : undefined)
  }
  const regenerate = index => {
    const previous = messages.slice(0, index).findLast(item => item.role === 'user')
    if (!previous || String(previous.id).startsWith('user:')) return
    const userIndex = messages.findIndex(item => item.id === previous.id)
    requestGeneration({ message: previous.content, mode, context, consent: true, consent_version: consentVersion, actions_supported: true, conversation_id: conversation.id, client_request_id: crypto.randomUUID(), regenerate: true }, messages.slice(0, userIndex))
  }
  const rename = async event => { event.preventDefault(); if (renameBusy || !renameTitle.trim()) return; const account = accountEpoch.current; setRenameBusy(true); try { await aiRequest({ action: 'rename', id: renaming.id, title: renameTitle.trim() }); if (!isActiveAccount(account)) return; setHistory(old => old.map(item => item.id === renaming.id ? { ...item, title: renameTitle.trim() } : item)); if (conversation?.id === renaming.id) setConversation(old => ({ ...old, title: renameTitle.trim() })); setRenaming(null) } catch (cause) { if (isActiveAccount(account)) setRenaming(old => old ? { ...old, error: cause.message } : old) } finally { if (isActiveAccount(account)) setRenameBusy(false) } }
  const remove = async () => { const account = accountEpoch.current; await aiRequest({ action: 'delete', id: deleting.id }); if (!isActiveAccount(account)) return; setHistory(old => old.filter(item => item.id !== deleting.id)); if (conversation?.id === deleting.id) { setConversation(null); setMessages([]); setActions([]); setActionChanges({}); setActionOperations({}); setDraft(''); setEditing(null); setRetry(null); setError('') } }
  const openDocument = async item => { const account = accountEpoch.current; try { const result = await aiRequest({ action: 'document', id: item.id }); if (!isActiveAccount(account)) return; setDocument({ ...(result.document || result), can_edit: result.can_edit ?? result.document?.can_edit }); setSidebar(false) } catch (cause) { if (isActiveAccount(account)) { setSidebar(false); setError(cause.message) } } }
  const selectMode = item => { setMode(item.id); if (!draft.trim()) setDraft(item.prompt); input.current?.focus() }
  const showConfiguration = () => { menu.current?.removeAttribute('open'); setConfigure(true); setConfigurationError(''); setKeyAttempted(false) }
  const showRename = () => { menu.current?.removeAttribute('open'); setRenaming(conversation); setRenameTitle(conversation.title || '') }
  const closePrivacy = () => { if (consentBusy) return; setPrivacy(null); setPrivacyAccepted(false); setConsentError('') }
  const acceptPrivacy = async event => {
    event.preventDefault(); if (!privacyAccepted || !privacy?.payload || consentBusy) return
    const pending = privacy, current = revision.current; consentEpoch.current++; setConsentBusy(true); setConsentError('')
    try {
      const result = await aiRequest({ action: 'consent', accepted: true, version: consentVersion })
      if (result.consent?.accepted !== true || result.consent.version !== consentVersion) throw new Error('Não foi possível salvar sua autorização. Tente novamente.')
      if (!alive.current || current !== revision.current) return
      consentRef.current = true; setConsent(true); setStatus(old => ({ ...old, consent: result.consent })); setPrivacy(null); setPrivacyAccepted(false)
      generate(pending.payload, pending.baseMessages)
    } catch (cause) { if (alive.current && current === revision.current) setConsentError(cause.message) }
    finally { if (alive.current && current === revision.current) { consentEpoch.current++; setConsentBusy(false) } }
  }
  const revokePrivacy = async () => {
    if (consentBusy) return
    const current = revision.current; consentEpoch.current++; setConsentBusy(true); setConsentError('')
    try {
      const result = await aiRequest({ action: 'consent', accepted: false, version: consentVersion })
      if (result.consent?.accepted !== false) throw new Error('Não foi possível revogar sua autorização. Tente novamente.')
      if (!alive.current || current !== revision.current) return
      consentRef.current = false; setConsent(false); setStatus(old => ({ ...old, consent: result.consent })); setPrivacy(null); setPrivacyAccepted(false)
    } catch (cause) { if (alive.current && current === revision.current) setConsentError(cause.message) }
    finally { if (alive.current && current === revision.current) { consentEpoch.current++; setConsentBusy(false) } }
  }
  const saveConfiguration = async event => {
    event.preventDefault(); if (!freeTier || !apiKey.trim() || configuring) return
    if (apiKey.trim().length < 20) { setKeyAttempted(true); requestAnimationFrame(() => window.document.getElementById(`${fieldId}-key`)?.focus()); return }
    const account = accountEpoch.current; setConfiguring(true); setConfigurationError('')
    const key = apiKey.trim(); setApiKey('')
    try { await aiRequest({ action: 'configure', api_key: key, free_tier_confirmed: true }); if (!isActiveAccount(account)) return; const epoch = consentEpoch.current, result = await aiRequest({ action: 'status' }); if (!isActiveAccount(account)) return; applyStatus(result, epoch, account); setConfigure(false); setFreeTier(false); setError(''); notify('Gemini configurado com segurança.') }
    catch (cause) { if (isActiveAccount(account)) setConfigurationError(cause.message) } finally { if (isActiveAccount(account)) setConfiguring(false) }
  }
  // Repeats the same read-only requests as the first load, keeping drafts and the open conversation.
  const retryStatus = async () => {
    if (statusRetrying) return
    const account = accountEpoch.current, epoch = consentEpoch.current
    setStatusRetrying(true); setError('')
    const results = await Promise.allSettled([refreshList(), aiRequest({ action: 'status' })])
    if (!isActiveAccount(account)) return
    if (results[0].status === 'rejected') setError(results[0].reason.message)
    if (results[1].status === 'fulfilled') applyStatus(results[1].value, epoch, account)
    else setError(results[1].reason.message)
    setStatusRetrying(false)
  }
  const toggleList = () => {
    if (!overlay) { const next = !listOpen; setListOpen(next); storeListOpen(next); return }
    const next = !sidebar
    setSidebar(next)
    if (next) requestAnimationFrame(() => drawer.current?.querySelector('[role="tab"][aria-selected="true"]')?.focus())
  }
  const closeDrawer = () => { setSidebar(false); requestAnimationFrame(() => toggleButton.current?.focus()) }
  const selectTab = next => { setTab(next); setListQuery('') }
  const configured = status?.configured === true, lastAssistant = messages.findLastIndex(item => item.role === 'assistant')
  const suggestions = embedded ? [
    modes[0], modes[1],
    { ...modes[3], label: 'Usar esta tela', prompt: 'Explique como usar esta tela do DUUK Admin e as principais ações disponíveis.' },
    { id: 'free', icon: 'edit', label: 'Melhorar um texto', prompt: 'Melhore este texto mantendo uma linguagem simples e humana: ' },
  ] : [{ id: 'free', icon: 'calendar', label: 'Agendar compromisso', prompt: 'Quero agendar um compromisso: ' }, modes[0], modes[1]]
  const actionCardProps = { options: actionOptions, optionsError: actionOptionsError, optionsLoading: actionOptionsLoading, memberId, hasPermission: auth?.hasPermission, onUpdated: actionUpdated, onDirtyChange: actionDirtyChanged, onBusyChange: actionBusyChanged, onRefreshOptions: refreshActionOptions, onSearchClients: searchActionClients, generating: busy }
  const listSource = tab === 'conversations' ? history : documents
  const listItems = listQuery.trim() ? listSource.filter(item => matchesQuery(listQuery, item.title)) : listSource
  const listPager = usePagination(listItems, { pageSize: 25, resetKey: `${tab}|${listQuery}` })
  const requestsLimit = status?.limits?.requests_per_day, requestsUsed = status?.usage?.requests_today || 0, tokensLimit = status?.limits?.tokens_per_day
  const keyError = keyAttempted && apiKey.trim().length < 20 ? 'Confira a chave: ela tem pelo menos 20 caracteres.' : ''
  const Heading = embedded ? 'h2' : 'h1'
  return <section ref={shell} className={`duuk-ai${embedded ? ' duuk-ai--embedded' : ''}${showList ? ' has-list' : ''}${overlay ? ' is-overlay' : ''}`} aria-label="DUUK AI" onKeyDown={event => { if (event.key === 'Escape' && overlay && sidebar && !renaming && !deleting && !document && !privacy && !configure && !discardAsk) { event.preventDefault(); event.stopPropagation(); closeDrawer() } }}>
    <header className="duuk-ai-header">
      <div className="duuk-ai-header__identity">
        <button ref={toggleButton} type="button" className="admin-icon-button duuk-ai-history-toggle" aria-label="Histórico e documentos" title={showList ? 'Recolher histórico' : 'Histórico e documentos'} aria-expanded={showList} onClick={toggleList}><Icon name={showList ? 'sidebar' : 'sidebarOpen'} /></button>
        <div className="duuk-ai-identity-copy"><Heading className="duuk-ai-title">DUUK AI</Heading>{embedded && <span>Seu espaço de criação</span>}</div>
        {conversation?.id && <span className="duuk-ai-conversation-name" title={conversation.title}>{conversation.title || 'Nova conversa'}</span>}
      </div>
      <div className="duuk-ai-header__actions">
        <button type="button" className="admin-button admin-button--secondary admin-button--sm duuk-ai-new" aria-label="Nova conversa" title="Nova conversa" onClick={fresh} disabled={busy || actionBusy}><Icon name="compose" /><span>Nova conversa</span></button>
        {(auth?.profile?.is_super_admin || conversation?.id) && <details ref={menu} className="duuk-ai-menu"><summary className="admin-icon-button" aria-label="Mais opções" title="Mais opções"><Icon name="more" /></summary><div className="ds-menu duuk-ai-menu__panel">
          {conversation?.id && <button type="button" className="ds-menu__item" aria-label="Renomear conversa atual" onClick={showRename} disabled={busy}><Icon name="edit" />Renomear conversa</button>}
          {auth?.profile?.is_super_admin && <button type="button" className="ds-menu__item" onClick={showConfiguration} disabled={busy}><Icon name="settings" />Configurar Gemini</button>}
        </div></details>}
        {embedded && onClose && <button type="button" className="admin-icon-button duuk-ai-close" aria-label="Fechar DUUK AI" onClick={onClose}><Icon name="close" /></button>}
      </div>
    </header>
    <div className="duuk-ai-workspace">
      {showList && overlay && <div className="duuk-ai-scrim" aria-hidden="true" onClick={closeDrawer} />}
      {showList && <aside ref={drawer} className="duuk-ai-sidebar" aria-label="Histórico do DUUK AI">
        <div className="duuk-ai-sidebar__top">
          <div className="ds-segmented duuk-ai-sidebar__tabs" role="tablist" aria-label="Biblioteca AI"><button type="button" role="tab" aria-selected={tab === 'conversations'} onClick={() => selectTab('conversations')}>Conversas</button><button type="button" role="tab" aria-selected={tab === 'documents'} onClick={() => selectTab('documents')}>Documentos</button></div>
          {overlay && <button type="button" className="admin-icon-button" aria-label="Fechar histórico" onClick={closeDrawer}><Icon name="close" /></button>}
        </div>
        {listSource.length > 0 && <SearchField className="duuk-ai-sidebar__search" value={listQuery} onChange={setListQuery} label={tab === 'conversations' ? 'Buscar conversas' : 'Buscar documentos'} />}
        {tab === 'documents' && <button className="admin-button admin-button--secondary admin-button--sm duuk-ai-create-document" type="button" onClick={() => setDocument({ title: '', content: '' })}><Icon name="plus" />Novo documento</button>}
        <div className="duuk-ai-sidebar__list" role="tabpanel" aria-label={tab === 'conversations' ? 'Conversas' : 'Documentos'}>
          {loading && !listSource.length ? <ListSkeleton /> : tab === 'conversations' ? listPager.items.length ? <ul>{listPager.items.map(item => <li key={item.id} className={`duuk-ai-history-item${conversation?.id === item.id ? ' is-active' : ''}`}>
            <button type="button" onClick={() => open(item)} disabled={busy || actionBusy} aria-current={conversation?.id === item.id ? 'true' : undefined}><span>{item.title || 'Nova conversa'}</span><small>{dateLabel(item.updated_at || item.created_at)}</small></button>
            <div className="duuk-ai-history-item__actions"><button type="button" className="admin-icon-button" aria-label={`Renomear ${item.title}`} title="Renomear" onClick={() => { setRenaming(item); setRenameTitle(item.title || '') }} disabled={busy || actionBusy}><Icon name="edit" size={15} /></button><button type="button" className="admin-icon-button admin-icon-button--danger" aria-label={`Excluir ${item.title}`} title="Excluir" onClick={() => setDeleting(item)} disabled={busy || actionBusy}><Icon name="trash" size={15} /></button></div>
          </li>)}</ul> : <p className="duuk-ai-sidebar__empty">{listQuery.trim() ? 'Nenhuma conversa encontrada para esta busca.' : 'Suas conversas aparecerão aqui.'}</p>
            : listPager.items.length ? <ul>{listPager.items.map(item => <li key={item.id}><button className="duuk-ai-document-item" type="button" onClick={() => openDocument(item)}><Icon name="document" size={16} /><span>{item.title}<small>{item.shared ? 'Compartilhado no projeto' : 'Privado'} · {dateLabel(item.updated_at || item.created_at)}</small></span></button></li>)}</ul> : <p className="duuk-ai-sidebar__empty">{listQuery.trim() ? 'Nenhum documento encontrado para esta busca.' : 'Salve uma resposta ou crie seu primeiro documento.'}</p>}
        </div>
        <Pagination pager={listPager} noun={tab === 'conversations' ? 'conversas' : 'documentos'} label={tab === 'conversations' ? 'Páginas de conversas' : 'Páginas de documentos'} />
      </aside>}
      <div className="duuk-ai-chat" inert={overlay && sidebar ? true : undefined}>
        <div className={`duuk-ai-messages${!messages.length ? ' is-empty' : ''}`} ref={scroll} role="log" aria-label="Mensagens da conversa" aria-busy={busy || loading} onScroll={() => { const el = scroll.current; nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100 }}>
          {loading ? <div className="duuk-ai-skeleton" role="status"><span className="ds-visually-hidden">Abrindo sua conversa.</span><span className="ds-skeleton duuk-ai-skeleton__user" aria-hidden="true" /><span className="ds-skeleton ds-skeleton--circle" aria-hidden="true" /><span className="ds-skeleton ds-skeleton--text" aria-hidden="true" /><span className="ds-skeleton ds-skeleton--text" aria-hidden="true" /><span className="ds-skeleton ds-skeleton--text" aria-hidden="true" /></div> : !messages.length ? <div className="duuk-ai-welcome">
            <span className="duuk-ai-welcome__mark" aria-hidden="true"><i /><Icon name="spark" size={28} /></span>
            <span className="duuk-ai-welcome__eyebrow">IDEIA. DIREÇÃO. AÇÃO.</span>
            <h2>{embedded ? 'Sua próxima ideia\ncomeça aqui.' : 'O que vamos fazer?'}</h2>
            <p>{embedded ? 'Apoio para esta tela e para sua próxima ideia.' : 'Crie ideias e organize a rotina da DUUK. Ações para salvar aparecem aqui para você confirmar.'}</p>
            <div className="duuk-ai-suggestions">{suggestions.map(item => <button key={item.id} type="button" onClick={() => selectMode(item)}><span className="duuk-ai-suggestions__icon" aria-hidden="true"><Icon name={item.icon} size={16} /></span><span>{item.label}</span><Icon name="right" size={14} /></button>)}</div>
          </div> : messages.map((item, index) => <article key={item.id || index} className={`duuk-ai-message duuk-ai-message--${item.role}`}>
            <div className={`duuk-ai-message__who${item.role === 'user' ? ' ds-visually-hidden' : ''}`}>{item.role !== 'user' && <span className="duuk-ai-avatar" aria-hidden="true"><Icon name="spark" size={13} /></span>}<span>{item.role === 'user' ? 'Você' : 'DUUK AI'}</span>{item.pending && <small>Escrevendo<span className="duuk-ai-writing">…</span></small>}{item.interrupted && <small className="is-interrupted"><Icon name="warning" size={13} />Interrompida</small>}</div>
            <div className="duuk-ai-message__body">{item.content ? <Markdown content={item.content} /> : item.pending ? <div className="duuk-ai-thinking" aria-label="Preparando resposta"><i /><i /><i /></div> : <p className="duuk-ai-message__empty">A resposta não foi concluída.</p>}</div>
            {item.role === 'assistant' && !item.pending && <ActionCards actions={actions.filter(action => action.message_id === item.id)} {...actionCardProps} />}
            {!item.pending && item.content && <div className="duuk-ai-message__actions">
              <button type="button" onClick={() => copy(item.content, item.id)} aria-label="Copiar mensagem" title="Copiar"><Icon name={copied === item.id ? 'check' : 'copy'} size={14} /><span>{copied === item.id ? 'Copiado' : 'Copiar'}</span></button>
              {item.role === 'user' ? <button type="button" disabled={busy || String(item.id).startsWith('user:')} onClick={() => { setEditing(item); setDraft(item.content); setRetry(null); input.current?.focus() }}><Icon name="edit" size={14} /><span>Editar</span></button> : <>
                <button type="button" aria-label="Salvar documento" onClick={() => setDocument({ title: conversation?.title || 'Documento DUUK', content: item.content, document_type: mode === 'commercial' ? 'proposal' : mode === 'concept' ? 'concept' : mode === 'script' ? 'script' : 'other' })}><Icon name="document" size={14} /><span>Salvar</span></button>
                {index === lastAssistant && <button type="button" disabled={busy || actionBusy || !configured || !conversation?.id} onClick={() => regenerate(index)} title="Regenerar"><Icon name="refresh" size={14} /><span>Regenerar</span></button>}
              </>}
            </div>}
          </article>)}
          {!loading && <ActionCards actions={actions.filter(action => !messages.some(message => message.role === 'assistant' && message.id === action.message_id))} {...actionCardProps} />}
        </div>
        <div className="duuk-ai-compose-area">
          {status?.configured === false && <div className="ds-alert ds-alert--info duuk-ai-notice" role="status"><Icon name="info" /><p>{status.status_unavailable ? 'Não foi possível consultar o Gemini.' : 'A conexão com o Gemini ainda não foi configurada.'}</p>{status.status_unavailable ? <button type="button" className="admin-button admin-button--secondary admin-button--sm" onClick={retryStatus} disabled={statusRetrying} aria-busy={statusRetrying}>{statusRetrying ? 'Consultando…' : 'Tentar novamente'}</button> : auth?.profile?.is_super_admin && <button type="button" className="admin-button admin-button--sm" onClick={showConfiguration}>Conectar</button>}</div>}
          {error && <div className="admin-error duuk-ai-error" role="alert"><Icon name="alertCircle" /><span>{error}</span>{retry && <button type="button" className="admin-text-button" disabled={busy || !configured} onClick={() => requestGeneration(retry.payload, retry.baseMessages)}><Icon name="refresh" size={14} />Tentar novamente</button>}<button type="button" className="admin-icon-button duuk-ai-error__close" aria-label="Fechar aviso" onClick={() => setError('')}><Icon name="close" size={15} /></button></div>}
          {editing && <div className="duuk-ai-editing"><Icon name="edit" size={14} /><span>Editando mensagem</span><button type="button" className="admin-icon-button" onClick={() => { setEditing(null); setDraft('') }} aria-label="Cancelar edição"><Icon name="close" size={15} /></button></div>}
          <form className="duuk-ai-composer" onSubmit={submit}>
            <label className="ds-visually-hidden" htmlFor={embedded ? 'duuk-ai-message-panel' : 'duuk-ai-message'}>Mensagem para o DUUK AI</label>
            <textarea ref={input} id={embedded ? 'duuk-ai-message-panel' : 'duuk-ai-message'} rows={2} maxLength={12000} value={draft} placeholder={mode === 'help' ? 'O que você precisa fazer?' : 'Escreva uma mensagem…'} onChange={e => { setDraft(e.target.value); if (retry && e.target.value.trim() !== retry.payload.message) setRetry(null) }} onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(e) } }} />
            <div className="duuk-ai-composer__bottom">
              <label className="duuk-ai-mode"><span className="ds-visually-hidden">Modo da conversa</span><select aria-label="Modo da conversa" value={mode} onChange={event => setMode(event.target.value)}><option value="free">Livre</option>{modes.map(item => <option key={item.id} value={item.id}>{item.id === 'script' ? 'Roteiro' : item.id === 'concept' ? 'Conceito' : item.id === 'commercial' ? 'Comercial' : 'Ajuda com a DUUK'}</option>)}</select><Icon name="down" size={14} /></label>
              <span className="duuk-ai-keyboard-hint">{busy ? 'Preparar próxima mensagem' : <><kbd className="ds-kbd">⌘/Ctrl</kbd><kbd className="ds-kbd">Enter</kbd><span>para enviar</span></>}</span>
              {busy ? <button key="stop" type="button" className="duuk-ai-send duuk-ai-send--stop" onClick={event => { event.preventDefault(); stopGeneration() }} aria-label="Interromper geração" title="Interromper"><span /></button> : <button key="send" type="submit" className="duuk-ai-send" aria-label="Enviar" title="Enviar" disabled={!draft.trim() || !configured || loading || actionBusy}><Icon name="send" size={16} /></button>}
            </div>
          </form>
          <div className="duuk-ai-footnote"><button type="button" className={`duuk-ai-consent${consent ? ' is-accepted' : ''}`} disabled={busy} onClick={() => { setPrivacyAccepted(false); setConsentError(''); setPrivacy({ informationOnly: true }) }}><Icon name={consent ? 'shield' : 'lock'} size={14} />{consent ? 'Envio autorizado' : 'Sobre seus dados'}</button><span className="duuk-ai-footnote__hint">Revise antes de usar.</span>
            {requestsLimit && <details ref={usage} className="duuk-ai-usage"><summary aria-label={`Uso hoje: ${requestsUsed} de ${requestsLimit} solicitações`}><Icon name="activity" size={14} />Uso <span>{requestsUsed}/{requestsLimit}</span></summary><div className="duuk-ai-usage__panel"><strong>Cotas da DUUK AI</strong><p>{requestsUsed} de {requestsLimit} solicitações hoje.</p><span className={`ds-progress${percent(requestsUsed, requestsLimit) >= 90 ? ' is-high' : ''}`} aria-hidden="true"><span style={{ width: `${percent(requestsUsed, requestsLimit)}%` }} /></span>{tokensLimit && <><p>{Number(status.usage?.tokens_today || 0).toLocaleString('pt-BR')} de {Number(tokensLimit).toLocaleString('pt-BR')} tokens, incluindo reservas.</p><span className={`ds-progress${percent(status.usage?.tokens_today, tokensLimit) >= 90 ? ' is-high' : ''}`} aria-hidden="true"><span style={{ width: `${percent(status.usage?.tokens_today, tokensLimit)}%` }} /></span></>}<small>As cotas gratuitas do Google também se aplicam.</small></div></details>}
          </div>
        </div>
      </div>
    </div>
    {renaming && <Modal title="Renomear conversa" onClose={() => { if (!renameBusy) setRenaming(null) }}><form onSubmit={rename}><div className="admin-modal__body duuk-ai-rename"><div className="admin-field"><label className="admin-label" htmlFor={`${fieldId}-rename`}>Nome da conversa</label><input id={`${fieldId}-rename`} autoFocus required maxLength={160} value={renameTitle} disabled={renameBusy} onChange={e => { setRenameTitle(e.target.value); if (renaming.error) setRenaming(old => ({ ...old, error: '' })) }} /></div>{renaming.error && <p className="admin-error" role="alert"><Icon name="alertCircle" /><span>{renaming.error}</span></p>}</div><div className="admin-modal__foot"><button type="button" className="admin-button admin-button--secondary" onClick={() => setRenaming(null)} disabled={renameBusy}>Cancelar</button><button className="admin-button" disabled={!renameTitle.trim() || renameBusy} aria-busy={renameBusy}>{renameBusy ? 'Salvando…' : 'Salvar nome'}</button></div></form></Modal>}
    {deleting && <ConfirmModal title="Excluir conversa?" message="A conversa e suas mensagens serão excluídas. Os documentos já salvos serão preservados." action="Excluir conversa" onClose={() => setDeleting(null)} onConfirm={remove} />}
    {discardAsk && <ConfirmModal title="Descartar alterações?" message="Há um texto ainda não enviado ou uma ação em revisão nesta conversa." action="Descartar" onClose={() => setDiscardAsk(null)} onConfirm={async () => { if (!running.current && !actionBusy) discardAsk.run() }} />}
    {document && <DocumentEditor key={document.id || 'new'} document={document} conversationId={conversation?.id} onClose={() => setDocument(null)} onSaved={() => refreshList().catch(() => {})} notify={notify} />}
    {privacy && <Modal title={privacy.payload ? 'Antes de enviar' : 'Privacidade do DUUK AI'} subtitle="Seu conteúdo será processado pelo Google Gemini." onClose={closePrivacy}>
      <form onSubmit={acceptPrivacy} className="duuk-ai-privacy-dialog" aria-busy={consentBusy}>
        <div className="admin-modal__body duuk-ai-privacy-dialog__body">
          {!privacy.payload && <div className={`ds-alert ${consent ? 'ds-alert--success' : 'ds-alert--info'}`} role="status"><Icon name={consent ? 'checkCircle' : 'info'} /><p><strong>{consent ? 'Envio autorizado nesta conta.' : 'Envio ainda não autorizado.'}</strong> {consent ? 'Sua autorização está salva na sua conta, inclusive para outros aparelhos. Você pode revogá-la abaixo.' : 'Antes do primeiro envio, pediremos sua autorização uma única vez para estes termos. Nenhuma mensagem é enviada ao Google automaticamente.'}</p></div>}
          <p><strong>No plano gratuito, o Google pode usar as mensagens para melhorar seus produtos.</strong> Envie apenas informações fictícias ou anonimizadas. Não compartilhe dados pessoais, contratos, propostas privadas ou informações financeiras confidenciais.</p><p>A DUUK envia o texto que você escrever e o histórico desta conversa. O histórico fica privado no painel. Dados de clientes e campos de formulários não são enviados automaticamente.{context && ' Para ajuda nesta tela, enviamos somente o módulo e a rota.'}</p><p>Ações são preparadas em cartões. Somente sua confirmação salva no painel. Consultas e opções de responsáveis e clientes ficam na DUUK e não são enviados automaticamente ao Google.</p><a className="admin-text-button" href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noopener noreferrer">Ler os termos do Google Gemini<Icon name="external" size={14} /></a>
          {privacy.payload && <label className="admin-check duuk-ai-consent-check"><input type="checkbox" required checked={privacyAccepted} disabled={consentBusy} onChange={event => setPrivacyAccepted(event.target.checked)} /><span>Li e autorizo o envio das mensagens e do histórico das conversas que eu escolher. Meu aceite será salvo na minha conta até eu revogá-lo ou estes termos mudarem.</span></label>}
          {consentError && <p className="admin-error" role="alert"><Icon name="alertCircle" /><span>{consentError}</span></p>}
        </div>
        <div className="admin-modal__foot">{privacy.payload ? <><button type="button" className="admin-button admin-button--secondary" disabled={consentBusy} onClick={closePrivacy}>Cancelar</button><button className="admin-button" disabled={!privacyAccepted || consentBusy} aria-busy={consentBusy}>{consentBusy ? 'Salvando autorização…' : 'Autorizar e enviar'}</button></> : <>{consent && <button type="button" className="admin-button admin-button--secondary duuk-ai-revoke" disabled={consentBusy} aria-busy={consentBusy} onClick={revokePrivacy}>{consentBusy ? 'Revogando…' : 'Revogar autorização'}</button>}<button type="button" className="admin-button" disabled={consentBusy} onClick={closePrivacy}>Concluir</button></>}</div>
      </form>
    </Modal>}
    {configure && <Modal title="Configurar Google Gemini" subtitle="Somente super administradores podem conectar a API. A chave é validada e guardada criptografada no backend da DUUK." onClose={() => { if (!configuring) { setConfigure(false); setApiKey(''); setFreeTier(false) } }}><form onSubmit={saveConfiguration} noValidate aria-busy={configuring}><div className="admin-modal__body duuk-ai-configuration"><p>Crie uma chave no <a href="https://aistudio.google.com/api-keys" target="_blank" rel="noopener noreferrer">Google AI Studio</a> usando um projeto sem faturamento. A DUUK não ativa cobrança nem troca para um modelo pago quando a cota acaba.</p><div className="admin-field"><label className="admin-label" htmlFor={`${fieldId}-key`}>Chave da API Gemini</label><input id={`${fieldId}-key`} type="password" autoComplete="off" spellCheck={false} required minLength={20} value={apiKey} onChange={e => setApiKey(e.target.value)} disabled={configuring} placeholder="Cole a chave somente aqui" aria-invalid={keyError ? true : undefined} aria-describedby={`${fieldId}-key-hint${keyError ? ` ${fieldId}-key-error` : ''}`} /><small id={`${fieldId}-key-hint`}>A chave nunca é salva no navegador, no histórico de conversas ou no repositório.</small><FieldError id={`${fieldId}-key-error`}>{keyError}</FieldError></div><label className="admin-check"><input type="checkbox" required checked={freeTier} onChange={e => setFreeTier(e.target.checked)} disabled={configuring} /><span>Confirmo que este projeto Gemini não tem faturamento ativado e que a DUUK deve usar somente cotas gratuitas.</span></label>{configurationError && <p className="admin-error" role="alert"><Icon name="alertCircle" /><span>{configurationError}</span></p>}</div><div className="admin-modal__foot"><button type="button" className="admin-button admin-button--secondary" disabled={configuring} onClick={() => { setConfigure(false); setApiKey(''); setFreeTier(false) }}>Cancelar</button><button className="admin-button" disabled={configuring || !freeTier || !apiKey.trim()} aria-busy={configuring}>{configuring ? 'Validando modelos…' : 'Conectar Gemini'}</button></div></form></Modal>}
  </section>
}
