import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ConfirmModal, Icon } from '../admin/components'
import { EmptyState, FieldError } from '../admin/forms'
import { useUnsavedChanges } from '../admin/unsavedChanges'
import { publishNow, savePost } from './api'
import { brasiliaParts, captionLimits, captionStats, formatDateTime, formatDuration, formatIcons, formatLabels, fromBrasilia, socialFormats, validatePost } from './model'
import { AccountAvatar, NotConnected, StatusBadge, Thumb } from './parts'
import { previewPath, useSignedUrls } from './previews'
import { MediaPicker } from './SocialLibrary'
import { useSocial } from './context'

const formatHints = {
  image: 'Uma imagem JPEG no feed, de 4:5 a 1,91:1.',
  carousel: 'De 2 a 10 imagens ou vídeos, na ordem escolhida.',
  reel: 'Um vídeo vertical de 3 s a 15 min. Pode aparecer também no feed.',
  story: 'Uma imagem ou vídeo de até 60 s. Sem legenda; some em 24 horas.',
}
const editable = ['draft', 'scheduled', 'failed']
const nextHour = () => { const date = new Date(Date.now() + 2 * 3600000); date.setMinutes(0, 0, 0); return brasiliaParts(date) }

export default function Composer() {
  const { status, active, posts, library, postsQuery, notify } = useSocial()
  const [params] = useSearchParams()
  const existing = posts.find(post => post.id === params.get('post')) || null
  if (!status.configured || !active.length) return <NotConnected status={status} title="Conecte uma conta para publicar">{status.can_configure ? 'Publicar e agendar dependem de uma conta do Instagram conectada pelo Login do Instagram.' : 'A super administração precisa conectar a conta do Instagram antes das publicações.'}</NotConnected>
  if (params.get('post') && postsQuery.loading && !postsQuery.data) return null
  if (existing && !editable.includes(existing.status)) return <div className="admin-panel"><EmptyState icon="lock" title="Esta publicação não pode ser editada" action={<Link className="admin-button admin-button--secondary" to={`/admin/social/calendario?post=${existing.id}`}>Ver detalhes</Link>}>Publicações enviadas ou em envio ficam no histórico.</EmptyState></div>
  return <ComposerForm key={existing?.id || 'new'} existing={existing} active={active} library={library} status={status} postsQuery={postsQuery} notify={notify} />
}

function ComposerForm({ existing, active, library, status, postsQuery, notify }) {
  const navigate = useNavigate()
  const accounts = active.filter(account => account.owner_kind !== 'client' || status.access_level === 'advanced')
  const initialWhen = existing?.scheduled_at ? brasiliaParts(existing.scheduled_at) : nextHour()
  const initial = useMemo(() => ({
    account_id: existing?.account_id || accounts[0]?.id || '',
    format: existing?.format || 'image',
    caption: existing?.caption || '',
    share_to_feed: existing?.share_to_feed ?? true,
    media: (existing?.media || []).map(item => ({ ...item })),
    mode: existing?.status === 'scheduled' ? 'schedule' : 'draft',
    date: initialWhen.date, time: initialWhen.time,
  }), []) // eslint-disable-line react-hooks/exhaustive-deps
  const [form, setForm] = useState(initial)
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [showErrors, setShowErrors] = useState(false)
  const [confirmPublish, setConfirmPublish] = useState(false)
  const requestId = useRef(crypto.randomUUID())
  const saved = useRef(existing)
  const dirty = JSON.stringify(form) !== JSON.stringify(initial) && !busy
  useUnsavedChanges(dirty)

  const rules = socialFormats[form.format]
  const account = accounts.find(item => item.id === form.account_id)
  const canPublish = account && (account.permissions || []).includes('instagram_business_content_publish')
  const scheduledAt = form.mode === 'schedule' ? fromBrasilia(form.date, form.time) : null
  const problems = useMemo(() => validatePost({ format: form.format, caption: form.caption, media: form.media, schedule: form.mode === 'schedule', scheduledAt }), [form.format, form.caption, form.media, form.mode, scheduledAt])
  const fieldError = field => showErrors ? problems.filter(problem => problem.field === field || problem.field.startsWith(`${field}.`)).map(problem => problem.message) : []
  const stats = captionStats(form.caption)
  const urls = useSignedUrls(form.media.map(previewPath))
  const set = patch => setForm(current => ({ ...current, ...patch }))
  const move = (index, delta) => set({ media: form.media.map((item, position) => position === index ? form.media[index + delta] : position === index + delta ? form.media[index] : item) })

  const payload = intent => ({
    id: saved.current?.id, expected_version: saved.current?.version, client_request_id: saved.current ? undefined : requestId.current,
    intent, account_id: form.account_id, format: form.format, caption: rules.caption ? form.caption : '', share_to_feed: form.share_to_feed,
    scheduled_at: intent === 'schedule' ? scheduledAt : null,
    media: form.media.map(item => ({ media_id: item.media_id, alt_text: rules.altText && item.kind === 'image' ? item.alt_text || '' : '' })),
  })
  const persist = async intent => {
    const result = await savePost(payload(intent))
    saved.current = result
    return result
  }
  const submit = async event => {
    event.preventDefault()
    setShowErrors(true); setError('')
    if (problems.length) { document.querySelector('.social-composer [aria-invalid="true"], .social-composer .ds-field-error')?.scrollIntoView?.({ block: 'center', behavior: 'smooth' }); return }
    setBusy(form.mode)
    try {
      const result = await persist(form.mode)
      await postsQuery.reload()
      notify(form.mode === 'schedule' ? `Agendada para ${formatDateTime(result.scheduled_at)}.` : 'Rascunho salvo.')
      setBusy('')
      navigate(`/admin/social/calendario?post=${result.id}`)
    } catch (cause) { setError(cause.message); setBusy('') }
  }
  const publish = async () => {
    // Saved as a draft first, so the exact content the person confirmed is what the server sends.
    const draft = await persist('draft')
    const result = await publishNow(draft)
    await postsQuery.reload()
    const outcome = result?.outcome
    if (outcome === 'published') notify('Publicado no Instagram.')
    else if (outcome === 'waiting') notify('O Instagram está processando a mídia. O DUUK conclui o envio sozinho e avisa quando terminar.')
    else if (outcome === 'retry') notify(`Instagram instável: ${result.post?.last_error || 'nova tentativa automática em instantes.'}`, true)
    else notify(result?.post?.last_error || 'Não foi possível publicar. Revise e tente novamente.', true)
    navigate(`/admin/social/calendario?post=${draft.id}`)
  }
  const tryPublish = () => {
    setShowErrors(true); setError('')
    const blocking = validatePost({ format: form.format, caption: form.caption, media: form.media })
    if (blocking.length) return
    setConfirmPublish(true)
  }

  const captionErrors = fieldError('caption'), mediaErrors = fieldError('media'), whenErrors = fieldError('scheduled_at')
  return <form className="social-composer" onSubmit={submit} noValidate>
    <div className="social-composer__main">
      {existing && <div className="ds-alert ds-alert--info"><Icon name="info" /><span>Editando uma publicação {existing.status === 'scheduled' ? `agendada para ${formatDateTime(existing.scheduled_at)}` : existing.status === 'failed' ? 'que falhou' : 'em rascunho'}. Ao salvar, ela é revalidada.</span><StatusBadge status={existing.status} /></div>}
      <section className="ds-card">
        <h2 className="social-step">Conta e formato</h2>
        <div className="admin-form-grid">
          <label className="admin-field"><span>Conta do Instagram</span>
            <select value={form.account_id} onChange={event => set({ account_id: event.target.value })}>{accounts.map(item => <option key={item.id} value={item.id}>@{item.username}</option>)}</select>
          </label>
        </div>
        <div className="social-formats" role="radiogroup" aria-label="Formato">
          {Object.entries(socialFormats).map(([key, value]) => <button key={key} type="button" role="radio" aria-checked={form.format === key} className={form.format === key ? 'is-active' : ''} onClick={() => set({ format: key })}>
            <Icon name={formatIcons[key]} size={18} /><strong>{value.label}</strong><small>{formatHints[key]}</small>
          </button>)}
        </div>
        {form.format === 'story' && String(account?.account_type).toUpperCase() !== 'BUSINESS' && <p className="ds-alert ds-alert--warning"><Icon name="warning" /><span>A API do Instagram publica Stories somente em contas comerciais. Esta conta está como {account?.account_type === 'MEDIA_CREATOR' ? 'criador de conteúdo' : 'outro tipo'} e o envio pode ser recusado.</span></p>}
      </section>

      <section className="ds-card">
        <div className="ds-card__head"><h2 className="social-step">Mídia</h2><button type="button" className="admin-button admin-button--secondary admin-button--sm" onClick={() => setPicking(true)}><Icon name="imagePlus" />{form.media.length ? 'Trocar ou adicionar' : 'Escolher da biblioteca'}</button></div>
        {form.media.length ? <ol className="social-chosen">{form.media.map((item, index) => {
          const itemErrors = fieldError(`media.${index}`)
          return <li key={`${item.media_id}-${index}`} className={itemErrors.length ? 'is-invalid' : ''}>
            <Thumb item={item} url={urls[previewPath(item)]} label={item.alt_text} />
            <div className="social-chosen__body">
              <strong>{form.media.length > 1 ? `${index + 1}. ` : ''}{item.title || (item.kind === 'video' ? 'Vídeo' : 'Imagem')}</strong>
              <small>{[item.width && item.height ? `${item.width}×${item.height}` : null, item.kind === 'video' && item.duration_ms ? formatDuration(item.duration_ms) : null].filter(Boolean).join(' · ')}</small>
              {rules.altText && item.kind === 'image' && <label className="admin-field social-alt"><span>Texto alternativo</span><input value={item.alt_text || ''} maxLength={1000} placeholder="Descreva a imagem para leitores de tela" onChange={event => set({ media: form.media.map((entry, position) => position === index ? { ...entry, alt_text: event.target.value } : entry) })} /></label>}
              {itemErrors.map(message => <FieldError key={message}>{message}</FieldError>)}
            </div>
            <div className="social-chosen__actions">
              {form.media.length > 1 && <><button type="button" className="admin-icon-button" aria-label="Mover para cima" disabled={index === 0} onClick={() => move(index, -1)}><Icon name="up" /></button><button type="button" className="admin-icon-button" aria-label="Mover para baixo" disabled={index === form.media.length - 1} onClick={() => move(index, 1)}><Icon name="down" /></button></>}
              <button type="button" className="admin-icon-button" aria-label="Retirar da publicação" onClick={() => set({ media: form.media.filter((_, position) => position !== index) })}><Icon name="close" /></button>
            </div>
          </li>
        })}</ol> : <button type="button" className="social-dropzone social-dropzone--button" onClick={() => setPicking(true)} aria-invalid={mediaErrors.length > 0}><Icon name="imagePlus" size={26} /><span>Escolha {rules.max === 1 ? 'o arquivo' : 'os arquivos'} na biblioteca ou envie novos</span></button>}
        {problems.filter(problem => problem.field === 'media' && showErrors).map(problem => <FieldError key={problem.message}>{problem.message}</FieldError>)}
      </section>

      <section className="ds-card">
        <h2 className="social-step">Legenda</h2>
        {rules.caption ? <label className="admin-field"><span className="ds-visually-hidden">Legenda</span>
          <textarea rows={7} value={form.caption} aria-invalid={captionErrors.length > 0} aria-describedby="social-caption-count" placeholder="Escreva a legenda. Hashtags e menções contam no limite do Instagram." onChange={event => set({ caption: event.target.value })} />
          <small id="social-caption-count" className="social-counters"><span className={stats.length > captionLimits.length ? 'is-over' : ''}>{stats.length}/{captionLimits.length} caracteres</span><span className={stats.hashtags > captionLimits.hashtags ? 'is-over' : ''}>{stats.hashtags}/{captionLimits.hashtags} hashtags</span><span className={stats.mentions > captionLimits.mentions ? 'is-over' : ''}>{stats.mentions}/{captionLimits.mentions} menções</span></small>
          {captionErrors.map(message => <FieldError key={message}>{message}</FieldError>)}
        </label> : <p className="social-muted">Stories publicados pela API não aceitam legenda, figurinhas nem links.</p>}
        {form.format === 'reel' && <label className="admin-check"><input type="checkbox" checked={form.share_to_feed} onChange={event => set({ share_to_feed: event.target.checked })} /><span>Mostrar o Reel também no feed do perfil</span></label>}
      </section>

      <section className="ds-card">
        <h2 className="social-step">Quando publicar</h2>
        <div className="ds-segmented" role="radiogroup" aria-label="Quando publicar">
          <button type="button" role="radio" aria-checked={form.mode === 'draft'} onClick={() => set({ mode: 'draft' })}>Guardar como rascunho</button>
          <button type="button" role="radio" aria-checked={form.mode === 'schedule'} onClick={() => set({ mode: 'schedule' })}>Agendar</button>
        </div>
        {form.mode === 'schedule' && <div className="admin-form-grid social-when">
          <label className="admin-field"><span>Data</span><input type="date" value={form.date} aria-invalid={whenErrors.length > 0} onChange={event => set({ date: event.target.value })} /></label>
          <label className="admin-field"><span>Horário de Brasília</span><input type="time" value={form.time} aria-invalid={whenErrors.length > 0} onChange={event => set({ time: event.target.value })} /></label>
          {whenErrors.map(message => <FieldError key={message}>{message}</FieldError>)}
          <p className="social-muted social-when__note">O servidor da DUUK envia no horário, mesmo com o painel fechado. Pode haver até 1 minuto de diferença; vídeos levam alguns minutos para o Instagram processar.</p>
        </div>}
      </section>
      {error && <p className="admin-error" role="alert">{error}</p>}
      <div className="social-composer__actions">
        <button type="button" className="admin-button admin-button--ghost" onClick={() => navigate(-1)} disabled={Boolean(busy)}>Voltar</button>
        <button type="button" className="admin-button admin-button--secondary" onClick={tryPublish} disabled={Boolean(busy) || !canPublish} title={!canPublish ? 'A conta não concedeu a permissão de publicar' : undefined}><Icon name="send" />Publicar agora</button>
        <button type="submit" className="admin-button" disabled={Boolean(busy)} aria-busy={Boolean(busy)}><Icon name={form.mode === 'schedule' ? 'calendarClock' : 'check'} />{busy ? 'Salvando…' : form.mode === 'schedule' ? 'Agendar' : 'Salvar rascunho'}</button>
      </div>
    </div>
    <aside className="social-composer__preview" aria-label="Prévia aproximada">
      <Preview account={account} form={form} urls={urls} />
    </aside>
    {picking && <MediaPicker library={library} allowed={rules.kinds} max={rules.max} selected={form.media.map(item => item.media_id)} onClose={() => setPicking(false)} onChoose={chosen => { set({ media: chosen.map(item => ({ media_id: item.id, kind: item.kind, mime_type: item.mime_type, storage_path: item.storage_path, poster_path: item.poster_path, width: item.width, height: item.height, duration_ms: item.duration_ms, size_bytes: item.size_bytes, title: item.title, alt_text: form.media.find(entry => entry.media_id === item.id)?.alt_text ?? item.alt_text ?? '' })) }); setPicking(false) }} />}
    {confirmPublish && <ConfirmModal tone="default" title="Publicar agora no Instagram?" message={`A publicação vai para @${account?.username} de verdade, visível para os seguidores. Esta ação não pode ser desfeita pelo DUUK; para remover, será preciso apagar no próprio Instagram.`} action="Publicar agora" onClose={() => setConfirmPublish(false)} onConfirm={publish} />}
  </form>
}

function Preview({ account, form, urls }) {
  const first = form.media[0]
  const vertical = form.format === 'reel' || form.format === 'story'
  return <div className={`social-preview${vertical ? ' is-vertical' : ''}`}>
    <p className="social-preview__label">Prévia aproximada · {formatLabels[form.format]}</p>
    <div className="social-preview__phone">
      <div className="social-preview__head"><AccountAvatar account={account} size={28} /><strong>{account ? account.username : 'conta'}</strong></div>
      <div className="social-preview__media">{first ? <Thumb item={first} url={urls[previewPath(first)]} label={first.alt_text} /> : <span className="social-preview__placeholder"><Icon name={formatIcons[form.format]} size={28} /></span>}
        {form.media.length > 1 && <span className="social-preview__count">1/{form.media.length}</span>}
      </div>
      {form.format !== 'story' && <p className="social-preview__caption">{form.caption ? <><strong>{account?.username || 'conta'}</strong> {form.caption.length > 180 ? `${form.caption.slice(0, 180)}… mais` : form.caption}</> : <span className="social-muted">Sem legenda</span>}</p>}
    </div>
  </div>
}
