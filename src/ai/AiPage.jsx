import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { useAuth } from '../content/AuthContext'
import { ConfirmModal, Icon, Modal } from '../admin/components'
import { useUnsavedChanges } from '../admin/unsavedChanges'
import { aiRequest, streamAiRequest } from './api'
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
  const dirty = !readOnly && JSON.stringify(form) !== original
  useUnsavedChanges(dirty || busy)
  useEffect(() => { let alive = true; aiRequest({ action: 'projects' }).then(result => { if (alive) setProjects(result.projects || []) }).catch(() => {}); return () => { alive = false } }, [])
  const close = () => { if (!busy && (!dirty || window.confirm('Descartar as alterações não salvas deste documento?'))) onClose() }
  const field = (name, value) => { setForm(old => ({ ...old, [name]: value })); setError('') }
  const save = async event => {
    event.preventDefault(); if (readOnly) return; setBusy(true); setError('')
    try { const result = await aiRequest({ action: 'save_document', ...(document.id ? { id: document.id, expected_version: version } : {}), conversation_id: document.conversation_id || conversationId || null, ...form, project_id: form.project_id || null }); const saved = result.document || result; setVersion(saved.version || saved.current_version || version + 1); setOriginal(JSON.stringify(form)); onSaved(saved); notify('Documento salvo na DUUK.'); onClose() }
    catch (cause) { setError(cause.message) } finally { setBusy(false) }
  }
  const history = async () => { setShowVersions(!showVersions); if (showVersions || !document.id) return; try { const result = await aiRequest({ action: 'versions', id: document.id }); setVersions(result.versions || []) } catch (cause) { setError(cause.message) } }
  const pdf = async () => { setBusy(true); setError(''); try { await exportPdf(form) } catch (cause) { setError(cause.message) } finally { setBusy(false) } }
  return <Modal title={readOnly ? 'Visualizar documento' : document.id ? 'Editar documento' : 'Salvar documento'} subtitle={readOnly ? 'Documento compartilhado. Você pode consultar o conteúdo e exportar o PDF.' : 'Salve o texto e vincule a um projeto quando fizer sentido.'} onClose={close} wide>
    <form className="duuk-ai-document" onSubmit={save}>
      <div className="duuk-ai-document__fields">
        <label className="admin-field"><span>Título</span><input autoFocus required maxLength={160} value={form.title} onChange={e => field('title', e.target.value)} disabled={busy} readOnly={readOnly} /></label>
        <div className="duuk-ai-document__selects"><label className="admin-field"><span>Tipo</span><select aria-label="Tipo" value={form.document_type} onChange={e => field('document_type', e.target.value)} disabled={busy || readOnly}>{documentTypes.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label className="admin-field"><span>Projeto</span><select aria-label="Projeto" value={form.project_id} onChange={e => { field('project_id', e.target.value); if (!e.target.value) field('shared', false) }} disabled={busy || readOnly}><option value="">Pessoal, sem projeto</option>{projects.map(project => <option key={project.id} value={project.id}>{project.title}</option>)}</select>{!readOnly && <small>O documento continua privado até você autorizar o compartilhamento abaixo.</small>}</label></div>
        {form.project_id && <label className="admin-checkbox duuk-ai-document__sharing"><input type="checkbox" checked={form.shared} onChange={e => field('shared', e.target.checked)} disabled={busy || readOnly} /><span>Compartilhar este documento com os membros que têm acesso ao projeto. O histórico da conversa permanece privado.</span></label>}
        <label className="admin-field"><span>Conteúdo</span><textarea aria-label="Conteúdo" required maxLength={60000} rows={16} value={form.content} onChange={e => field('content', e.target.value)} disabled={busy} readOnly={readOnly} /></label>
        {document.id && <button type="button" className="admin-text-button" onClick={history} disabled={busy}><Icon name="clock" size={15} />{showVersions ? 'Ocultar versões' : 'Histórico de versões'}</button>}
        {showVersions && <div className="duuk-ai-versions">{versions.length ? versions.map(item => <button type="button" key={item.id || item.version} disabled={busy} onClick={() => { field('content', item.content); if (item.title) field('title', item.title); setShowVersions(false) }}><span>Versão {item.version}</span><small>{dateLabel(item.created_at)}</small><span>{readOnly ? 'Ver texto' : 'Usar texto'}</span></button>) : <p>Nenhuma versão anterior disponível.</p>}<small>{readOnly ? 'Selecione uma versão para consultar ou exportar o texto.' : 'Usar uma versão preenche o editor. Salve para criar uma nova versão.'}</small></div>}
        {error && <p className="admin-error" role="alert">{error}</p>}
      </div>
      <div className="admin-modal__foot"><button type="button" className="admin-button admin-button--secondary" disabled={busy || !form.content.trim()} onClick={pdf}><Icon name="download" />PDF</button><button type="button" className="admin-button admin-button--secondary" onClick={close} disabled={busy}>{readOnly ? 'Fechar' : 'Cancelar'}</button>{!readOnly && <button className="admin-button" disabled={busy}>{busy ? 'Aguarde…' : document.id ? 'Salvar nova versão' : 'Salvar documento'}</button>}</div>
    </form>
  </Modal>
}

export default function AiPage({ embedded = false, context = '', notify = () => {}, onDirtyChange, onClose }) {
  const auth = useAuth()
  const memberId = auth?.user?.id || auth?.profile?.id
  const [history, setHistory] = useState([]), [documents, setDocuments] = useState([]), [conversation, setConversation] = useState(null), [messages, setMessages] = useState([])
  const [mode, setMode] = useState(embedded && context ? 'help' : 'free'), [draft, setDraft] = useState(''), [consent, setConsent] = useState(false), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [status, setStatus] = useState(null), [sidebar, setSidebar] = useState(false), [tab, setTab] = useState('conversations'), [renaming, setRenaming] = useState(null), [renameTitle, setRenameTitle] = useState(''), [deleting, setDeleting] = useState(null), [editing, setEditing] = useState(null), [document, setDocument] = useState(null), [copied, setCopied] = useState(''), [retry, setRetry] = useState(null)
  const [configure, setConfigure] = useState(false), [apiKey, setApiKey] = useState(''), [freeTier, setFreeTier] = useState(false), [configuring, setConfiguring] = useState(false), [configurationError, setConfigurationError] = useState('')
  const [privacy, setPrivacy] = useState(null), [privacyAccepted, setPrivacyAccepted] = useState(false), [compact, setCompact] = useState(() => matchMedia('(max-width: 760px)').matches)
  const [consentBusy, setConsentBusy] = useState(false), [consentError, setConsentError] = useState('')
  const controller = useRef(null), running = useRef(false), revision = useRef(0), scroll = useRef(null), input = useRef(null), nearBottom = useRef(true), alive = useRef(true), consentRef = useRef(false), menu = useRef(null), usage = useRef(null), shell = useRef(null)
  const consentEpoch = useRef(0), accountEpoch = useRef(0)
  const dirty = Boolean(draft.trim()) || busy || Boolean(apiKey) || configuring || consentBusy
  useUnsavedChanges(dirty)
  useEffect(() => { onDirtyChange?.(dirty); return () => onDirtyChange?.(false) }, [dirty, onDirtyChange])
  useEffect(() => { const media = matchMedia('(max-width: 760px)'), change = event => setCompact(event.matches); media.addEventListener('change', change); return () => media.removeEventListener('change', change) }, [])
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
      setHistory([]); setDocuments([]); setConversation(null); setMessages([]); setDraft(''); setMode(embedded && context ? 'help' : 'free'); setSidebar(false); setTab('conversations'); setRenaming(null); setRenameTitle(''); setDeleting(null); setEditing(null); setDocument(null); setCopied(''); setRetry(null)
      setConfigure(false); setApiKey(''); setFreeTier(false); setConfiguring(false); setConfigurationError(''); setBusy(false); setError('')
      setConsent(false); setStatus(null); setPrivacy(null); setPrivacyAccepted(false); setConsentBusy(false); setConsentError(''); setLoading(true)
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
  useEffect(() => { const element = scroll.current; if (nearBottom.current && element) element.scrollTo({ top: element.scrollHeight, behavior: busy ? 'instant' : 'smooth' }) }, [messages, busy])
  const open = async item => {
    if (running.current || draft.trim() && !window.confirm('Descartar a mensagem ainda não enviada?')) return
    const current = ++revision.current; setLoading(true); setSidebar(false); setError(''); setRetry(null); setEditing(null)
    try { const result = await aiRequest({ action: 'conversation', id: item.id }); if (current !== revision.current) return; setConversation(result.conversation); setMessages(result.messages || []); setMode(result.conversation?.mode || 'free'); setDraft(''); nearBottom.current = true } catch (cause) { if (current === revision.current) setError(cause.message) } finally { if (current === revision.current) setLoading(false) }
  }
  const fresh = () => { if (running.current || draft.trim() && !window.confirm('Descartar a mensagem ainda não enviada?')) return; revision.current++; setLoading(false); setConversation(null); setMessages([]); setDraft(''); setEditing(null); setMode(embedded && context ? 'help' : 'free'); setError(''); setRetry(null); setSidebar(false); input.current?.focus() }
  const copy = async (text, id) => { try { await navigator.clipboard.writeText(text); setCopied(id); setTimeout(() => setCopied(''), 2400) } catch { notify('Não foi possível copiar. Selecione o texto e copie.', true) } }
  const generate = async (payload, baseMessages) => {
    if (running.current || !consentRef.current || status?.configured !== true) return
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
        if (event.type === 'done') { completed = true; conversationId = event.conversation_id || conversationId; setMessages(old => old.map(item => item.id === pending ? { ...item, ...(typeof event.message === 'object' ? event.message : {}), content: event.message?.content || accumulated, pending: false } : item)) }
      } })
      if (!isActiveAccount(account)) return
      if (requestController.signal.aborted) throw new DOMException('Geração interrompida.', 'AbortError')
      if (conversationId) { const result = await aiRequest({ action: 'conversation', id: conversationId }); if (!isActiveAccount(account)) return; setConversation(result.conversation); setMessages(result.messages || []) }
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
    if (running.current || !status?.configured) return
    if (!consentRef.current) { setPrivacyAccepted(false); setConsentError(''); setPrivacy({ payload, baseMessages }); return }
    generate(payload, baseMessages)
  }
  const submit = event => {
    event.preventDefault(); if (!draft.trim()) return
    if (retry && !editing && draft.trim() === retry.payload.message) { requestGeneration(retry.payload, retry.baseMessages); return }
    const index = editing ? messages.findIndex(item => item.id === editing.id) : -1
    const payload = { message: draft.trim(), mode, context, consent: true, consent_version: consentVersion, client_request_id: crypto.randomUUID(), ...(conversation?.id ? { conversation_id: conversation.id } : {}), ...(editing ? { edit_message_id: editing.id } : {}) }
    requestGeneration(payload, index >= 0 ? messages.slice(0, index) : undefined)
  }
  const regenerate = index => {
    const previous = messages.slice(0, index).findLast(item => item.role === 'user')
    if (!previous || String(previous.id).startsWith('user:')) return
    const userIndex = messages.findIndex(item => item.id === previous.id)
    requestGeneration({ message: previous.content, mode, context, consent: true, consent_version: consentVersion, conversation_id: conversation.id, client_request_id: crypto.randomUUID(), regenerate: true }, messages.slice(0, userIndex))
  }
  const rename = async event => { event.preventDefault(); const account = accountEpoch.current; try { await aiRequest({ action: 'rename', id: renaming.id, title: renameTitle.trim() }); if (!isActiveAccount(account)) return; setHistory(old => old.map(item => item.id === renaming.id ? { ...item, title: renameTitle.trim() } : item)); if (conversation?.id === renaming.id) setConversation(old => ({ ...old, title: renameTitle.trim() })); setRenaming(null) } catch (cause) { if (isActiveAccount(account)) setRenaming(old => old ? { ...old, error: cause.message } : old) } }
  const remove = async () => { const account = accountEpoch.current; await aiRequest({ action: 'delete', id: deleting.id }); if (!isActiveAccount(account)) return; setHistory(old => old.filter(item => item.id !== deleting.id)); if (conversation?.id === deleting.id) { setConversation(null); setMessages([]); setDraft(''); setEditing(null); setRetry(null); setError('') } }
  const openDocument = async item => { const account = accountEpoch.current; try { const result = await aiRequest({ action: 'document', id: item.id }); if (!isActiveAccount(account)) return; setDocument({ ...(result.document || result), can_edit: result.can_edit ?? result.document?.can_edit }); setSidebar(false) } catch (cause) { if (isActiveAccount(account)) { setSidebar(false); setError(cause.message) } } }
  const selectMode = item => { setMode(item.id); if (!draft.trim()) setDraft(item.prompt); input.current?.focus() }
  const showConfiguration = () => { menu.current?.removeAttribute('open'); setConfigure(true); setConfigurationError('') }
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
    const account = accountEpoch.current; setConfiguring(true); setConfigurationError('')
    const key = apiKey.trim(); setApiKey('')
    try { await aiRequest({ action: 'configure', api_key: key, free_tier_confirmed: true }); if (!isActiveAccount(account)) return; const epoch = consentEpoch.current, result = await aiRequest({ action: 'status' }); if (!isActiveAccount(account)) return; applyStatus(result, epoch, account); setConfigure(false); setFreeTier(false); setError(''); notify('Gemini configurado com segurança.') }
    catch (cause) { if (isActiveAccount(account)) setConfigurationError(cause.message) } finally { if (isActiveAccount(account)) setConfiguring(false) }
  }
  const configured = status?.configured === true, lastAssistant = messages.findLastIndex(item => item.role === 'assistant')
  const suggestions = embedded ? [
    { ...modes[3], label: 'Usar esta tela', prompt: 'Explique como usar esta tela do DUUK Admin e as principais ações disponíveis.' },
    { id: 'free', icon: 'edit', label: 'Melhorar um texto', prompt: 'Melhore este texto mantendo uma linguagem simples e humana: ' },
  ] : [modes[0], modes[1]]
  const Heading = embedded ? 'h2' : 'h1'
  return <section ref={shell} className={`duuk-ai${embedded ? ' duuk-ai--embedded' : ''}${sidebar ? ' has-sidebar' : ''}`} aria-label="DUUK AI" onKeyDown={event => { if (event.key === 'Escape' && sidebar && !renaming && !deleting && !document && !privacy && !configure) { event.preventDefault(); event.stopPropagation(); setSidebar(false) } }}>
    <header className="duuk-ai-header">
      <div className="duuk-ai-header__identity">
        <button type="button" className="admin-icon-button duuk-ai-history-toggle" aria-label="Abrir histórico e documentos" title={sidebar ? 'Recolher histórico' : 'Histórico e documentos'} aria-expanded={sidebar} onClick={() => setSidebar(!sidebar)}><Icon name={sidebar ? 'sidebar' : 'sidebarOpen'} size={19} /></button>
        <Heading className="duuk-ai-title">DUUK <span>AI</span></Heading>
        {conversation?.id && <span className="duuk-ai-conversation-name" title={conversation.title}>{conversation.title || 'Nova conversa'}</span>}
      </div>
      <div className="duuk-ai-header__actions">
        <button type="button" className="admin-icon-button" aria-label="Nova conversa" title="Nova conversa" onClick={fresh} disabled={busy}><Icon name="plus" size={20} /></button>
        {(auth?.profile?.is_super_admin || conversation?.id) && <details ref={menu} className="duuk-ai-menu"><summary aria-label="Mais opções" title="Mais opções"><MoreHorizontal size={19} strokeWidth={1.6} aria-hidden="true" /></summary><div>
          {conversation?.id && <button type="button" aria-label="Renomear conversa atual" onClick={showRename} disabled={busy}><Icon name="edit" size={15} />Renomear conversa</button>}
          {auth?.profile?.is_super_admin && <button type="button" onClick={showConfiguration} disabled={busy}><Icon name="settings" size={15} />Configurar Gemini</button>}
        </div></details>}
        {embedded && onClose && <button type="button" className="admin-icon-button duuk-ai-close" aria-label="Fechar DUUK AI" onClick={onClose}><Icon name="close" size={20} /></button>}
      </div>
    </header>
    <div className="duuk-ai-workspace">
      {sidebar && <aside className="duuk-ai-sidebar is-open" aria-label="Histórico do DUUK AI">
        <div className="duuk-ai-sidebar__tabs" role="tablist" aria-label="Biblioteca AI"><button type="button" role="tab" aria-selected={tab === 'conversations'} onClick={() => setTab('conversations')}>Conversas</button><button type="button" role="tab" aria-selected={tab === 'documents'} onClick={() => setTab('documents')}>Documentos</button></div>
        <div className="duuk-ai-sidebar__list">
          {tab === 'conversations' ? history.length ? history.map(item => <div key={item.id} className={`duuk-ai-history-item${conversation?.id === item.id ? ' is-active' : ''}`}>
            <button type="button" onClick={() => open(item)} disabled={busy}><span>{item.title || 'Nova conversa'}</span><small>{dateLabel(item.updated_at || item.created_at)}</small></button>
            <div><button type="button" aria-label={`Renomear ${item.title}`} onClick={() => { setRenaming(item); setRenameTitle(item.title || '') }} disabled={busy}><Icon name="edit" size={14} /></button><button type="button" aria-label={`Excluir ${item.title}`} onClick={() => setDeleting(item)} disabled={busy}><Icon name="trash" size={14} /></button></div>
          </div>) : <p className="duuk-ai-sidebar__empty">Suas conversas aparecerão aqui.</p> : <>
            <button className="duuk-ai-create-document" type="button" onClick={() => setDocument({ title: '', content: '' })}><Icon name="plus" size={15} />Novo documento</button>
            {documents.length ? documents.map(item => <button className="duuk-ai-document-item" key={item.id} type="button" onClick={() => openDocument(item)}><Icon name="document" size={16} /><span>{item.title}<small>{item.shared ? 'Compartilhado no projeto' : 'Privado'} · {dateLabel(item.updated_at || item.created_at)}</small></span></button>) : <p className="duuk-ai-sidebar__empty">Salve uma resposta ou crie seu primeiro documento.</p>}
          </>}
        </div>
      </aside>}
      <div className="duuk-ai-chat" inert={sidebar && (embedded || compact) ? true : undefined}>
        <div className={`duuk-ai-messages${!messages.length ? ' is-empty' : ''}`} ref={scroll} role="log" aria-label="Mensagens da conversa" aria-busy={busy || loading} onScroll={() => { const el = scroll.current; nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100 }}>
          {loading ? <div className="duuk-ai-loading" role="status"><span /><span /><span /><p>Abrindo sua conversa.</p></div> : !messages.length ? <div className="duuk-ai-welcome">
            <h2>{embedded ? 'Como posso ajudar?' : 'O que vamos criar?'}</h2>
            <p>{embedded ? 'Apoio para esta tela e para sua próxima ideia.' : 'Roteiros, conceitos e apoio para a rotina da DUUK.'}</p>
            <div className="duuk-ai-suggestions">{suggestions.map(item => <button key={item.id} type="button" onClick={() => selectMode(item)}><Icon name={item.icon} size={16} /><span>{item.label}</span><Icon name="right" size={14} /></button>)}</div>
          </div> : messages.map((item, index) => <article key={item.id || index} className={`duuk-ai-message duuk-ai-message--${item.role}`}>
            <div className="duuk-ai-message__who"><span>{item.role === 'user' ? 'Você' : 'DUUK AI'}</span>{item.pending && <small>Escrevendo<span className="duuk-ai-writing">…</span></small>}{item.interrupted && <small>Interrompida</small>}</div>
            {item.content ? <Markdown content={item.content} /> : item.pending ? <div className="duuk-ai-thinking" aria-label="Preparando resposta"><i /><i /><i /></div> : <p className="duuk-ai-message__empty">A resposta não foi concluída.</p>}
            {!item.pending && item.content && <div className="duuk-ai-message__actions">
              <button type="button" onClick={() => copy(item.content, item.id)} aria-label="Copiar mensagem" title="Copiar"><Icon name={copied === item.id ? 'check' : 'copy'} size={14} /><span>{copied === item.id ? 'Copiado' : 'Copiar'}</span></button>
              {item.role === 'user' ? <button type="button" disabled={busy || String(item.id).startsWith('user:')} onClick={() => { setEditing(item); setDraft(item.content); setRetry(null); input.current?.focus() }}><Icon name="edit" size={14} /><span>Editar</span></button> : <>
                <button type="button" aria-label="Salvar documento" onClick={() => setDocument({ title: conversation?.title || 'Documento DUUK', content: item.content, document_type: mode === 'commercial' ? 'proposal' : mode === 'concept' ? 'concept' : mode === 'script' ? 'script' : 'other' })}><Icon name="document" size={14} /><span>Salvar</span></button>
                {index === lastAssistant && <button type="button" disabled={busy || !configured || !conversation?.id} onClick={() => regenerate(index)} title="Regenerar"><Icon name="refresh" size={14} /><span>Regenerar</span></button>}
              </>}
            </div>}
          </article>)}
        </div>
        <div className="duuk-ai-compose-area">
          {status?.configured === false && <div className="duuk-ai-unavailable" role="status"><Icon name="info" size={16} /><p>{status.status_unavailable ? 'Não foi possível consultar o Gemini. Atualize a página.' : 'A conexão com o Gemini ainda não foi configurada.'}</p>{auth?.profile?.is_super_admin && !status.status_unavailable && <button type="button" onClick={showConfiguration}>Conectar</button>}</div>}
          {error && <div className="duuk-ai-error" role="alert"><p>{error}</p>{retry && <button type="button" disabled={busy || !configured} onClick={() => requestGeneration(retry.payload, retry.baseMessages)}><Icon name="refresh" size={14} />Tentar novamente</button>}<button type="button" className="admin-icon-button" aria-label="Fechar aviso" onClick={() => setError('')}><Icon name="close" size={15} /></button></div>}
          {editing && <div className="duuk-ai-editing"><Icon name="edit" size={14} /><span>Editando mensagem</span><button type="button" onClick={() => { setEditing(null); setDraft('') }} aria-label="Cancelar edição"><Icon name="close" size={15} /></button></div>}
          <form className="duuk-ai-composer" onSubmit={submit}>
            <label className="duuk-ai-sr-only" htmlFor={embedded ? 'duuk-ai-message-panel' : 'duuk-ai-message'}>Mensagem para o DUUK AI</label>
            <textarea ref={input} id={embedded ? 'duuk-ai-message-panel' : 'duuk-ai-message'} rows={2} maxLength={12000} value={draft} placeholder={mode === 'help' ? 'O que você precisa fazer?' : 'Escreva uma mensagem…'} onChange={e => { setDraft(e.target.value); if (retry && e.target.value.trim() !== retry.payload.message) setRetry(null) }} onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(e) } }} />
            <div className="duuk-ai-composer__bottom">
              <label className="duuk-ai-mode"><span className="duuk-ai-sr-only">Modo da conversa</span><select aria-label="Modo da conversa" value={mode} onChange={event => setMode(event.target.value)}><option value="free">Livre</option>{modes.map(item => <option key={item.id} value={item.id}>{item.id === 'script' ? 'Roteiro' : item.id === 'concept' ? 'Conceito' : item.id === 'commercial' ? 'Comercial' : 'Ajuda com a DUUK'}</option>)}</select><Icon name="down" size={13} /></label>
              <span className="duuk-ai-keyboard-hint">{busy ? 'Preparar próxima mensagem' : '⌘ / Ctrl + Enter'}</span>
              {busy ? <button key="stop" type="button" className="duuk-ai-send duuk-ai-send--stop" onClick={event => { event.preventDefault(); stopGeneration() }} aria-label="Interromper geração" title="Interromper"><span /></button> : <button key="send" type="submit" className="duuk-ai-send" aria-label="Enviar" title="Enviar" disabled={!draft.trim() || !configured || loading}><Icon name="send" size={17} /></button>}
            </div>
          </form>
          <div className="duuk-ai-footnote"><button type="button" disabled={busy} onClick={() => { setPrivacyAccepted(false); setConsentError(''); setPrivacy({ informationOnly: true }) }}><Icon name="lock" size={11} />{consent ? 'Privacidade' : 'Sobre seus dados'}</button><span>Revise antes de usar.</span>
            {status?.limits?.requests_per_day && <details ref={usage} className="duuk-ai-usage"><summary>Uso <span>{status.usage?.requests_today || 0}/{status.limits.requests_per_day}</span></summary><div><strong>Cotas da DUUK AI</strong><p>{status.usage?.requests_today || 0} de {status.limits.requests_per_day} solicitações hoje.</p>{status.limits.tokens_per_day && <p>{Number(status.usage?.tokens_today || 0).toLocaleString('pt-BR')} de {Number(status.limits.tokens_per_day).toLocaleString('pt-BR')} tokens, incluindo reservas.</p>}<small>As cotas gratuitas do Google também se aplicam.</small></div></details>}
          </div>
        </div>
      </div>
    </div>
    {renaming && <Modal title="Renomear conversa" onClose={() => setRenaming(null)}><form onSubmit={rename}><div className="duuk-ai-rename"><label className="admin-field"><span>Nome da conversa</span><input autoFocus required maxLength={160} value={renameTitle} onChange={e => { setRenameTitle(e.target.value); if (renaming.error) setRenaming(old => ({ ...old, error: '' })) }} /></label>{renaming.error && <p className="admin-error" role="alert">{renaming.error}</p>}</div><div className="admin-modal__foot"><button type="button" className="admin-button admin-button--secondary" onClick={() => setRenaming(null)}>Cancelar</button><button className="admin-button" disabled={!renameTitle.trim()}>Salvar nome</button></div></form></Modal>}
    {deleting && <ConfirmModal title="Excluir conversa?" message="A conversa e suas mensagens serão excluídas. Os documentos já salvos serão preservados." action="Excluir conversa" onClose={() => setDeleting(null)} onConfirm={remove} />}
    {document && <DocumentEditor key={document.id || 'new'} document={document} conversationId={conversation?.id} onClose={() => setDocument(null)} onSaved={() => refreshList().catch(() => {})} notify={notify} />}
    {privacy && <Modal title={privacy.payload ? 'Antes de enviar' : 'Privacidade do DUUK AI'} subtitle="Seu conteúdo será processado pelo Google Gemini." onClose={closePrivacy}>
      <form onSubmit={acceptPrivacy} className="duuk-ai-privacy-dialog">
        <div className="duuk-ai-privacy-dialog__body"><p><strong>No plano gratuito, o Google pode usar as mensagens para melhorar seus produtos.</strong> Envie apenas informações fictícias ou anonimizadas. Não compartilhe dados pessoais, contratos, propostas privadas ou informações financeiras confidenciais.</p><p>A DUUK envia o texto que você escrever e o histórico desta conversa. O histórico fica privado no painel. Dados de clientes e campos de formulários não são enviados automaticamente.{context && ' Para ajuda nesta tela, enviamos somente o módulo e a rota.'}</p><a href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noopener noreferrer">Ler os termos do Google Gemini<Icon name="arrow" size={14} /></a>
          {privacy.payload && <label className="admin-checkbox"><input type="checkbox" required checked={privacyAccepted} disabled={consentBusy} onChange={event => setPrivacyAccepted(event.target.checked)} /><span>Li e autorizo o envio das mensagens e do histórico das conversas que eu escolher. Meu aceite será salvo na minha conta até eu revogá-lo ou estes termos mudarem.</span></label>}
          {!privacy.payload && <small>{consent ? 'Sua autorização está salva na sua conta, inclusive para outros aparelhos. Você pode revogá-la abaixo.' : 'Antes do primeiro envio, pediremos sua autorização uma única vez para estes termos. Nenhuma mensagem é enviada ao Google automaticamente.'}</small>}
          {consentError && <p className="admin-error" role="alert">{consentError}</p>}
        </div>
        <div className="admin-modal__foot">{privacy.payload ? <><button type="button" className="admin-button admin-button--secondary" disabled={consentBusy} onClick={closePrivacy}>Cancelar</button><button className="admin-button" disabled={!privacyAccepted || consentBusy}>{consentBusy ? 'Salvando autorização…' : 'Autorizar e enviar'}</button></> : <>{consent && <button type="button" className="admin-button admin-button--secondary" disabled={consentBusy} onClick={revokePrivacy}>{consentBusy ? 'Revogando…' : 'Revogar autorização'}</button>}<button type="button" className="admin-button" disabled={consentBusy} onClick={closePrivacy}>Concluir</button></>}</div>
      </form>
    </Modal>}
    {configure && <Modal title="Configurar Google Gemini" subtitle="Somente super administradores podem conectar a API. A chave é validada e guardada criptografada no backend da DUUK." onClose={() => { if (!configuring) { setConfigure(false); setApiKey(''); setFreeTier(false) } }}><form onSubmit={saveConfiguration}><div className="duuk-ai-configuration"><p>Crie uma chave no <a href="https://aistudio.google.com/api-keys" target="_blank" rel="noopener noreferrer">Google AI Studio</a> usando um projeto sem faturamento. A DUUK não ativa cobrança nem troca para um modelo pago quando a cota acaba.</p><label className="admin-field"><span>Chave da API Gemini</span><input type="password" autoComplete="off" spellCheck={false} required minLength={20} value={apiKey} onChange={e => setApiKey(e.target.value)} disabled={configuring} placeholder="Cole a chave somente aqui" /><small>A chave nunca é salva no navegador, no histórico de conversas ou no repositório.</small></label><label className="admin-checkbox"><input type="checkbox" required checked={freeTier} onChange={e => setFreeTier(e.target.checked)} disabled={configuring} /><span>Confirmo que este projeto Gemini não tem faturamento ativado e que a DUUK deve usar somente cotas gratuitas.</span></label>{configurationError && <p className="admin-error" role="alert">{configurationError}</p>}</div><div className="admin-modal__foot"><button type="button" className="admin-button admin-button--secondary" disabled={configuring} onClick={() => { setConfigure(false); setApiKey(''); setFreeTier(false) }}>Cancelar</button><button className="admin-button" disabled={configuring || !freeTier || !apiKey.trim()}>{configuring ? 'Validando modelos…' : 'Conectar Gemini'}</button></div></form></Modal>}
  </section>
}
