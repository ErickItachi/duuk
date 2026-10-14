import { useId, useMemo, useRef, useState } from 'react'
import { ConfirmModal, Icon, Modal } from '../admin/components'
import { EmptyState, ErrorState, FieldError, LoadingPanel, Pagination, SearchField } from '../admin/forms'
import { matchesQuery, usePagination } from '../admin/ds/list'
import { deleteMedia, updateMedia, uploadPrepared } from './api'
import { acceptedFiles, isVideo, prepareImage, prepareVideo } from './media'
import { cropRatios, formatBytes, formatDateTime, formatDuration } from './model'
import { NotConnected, Thumb } from './parts'
import { previewPath, useSignedUrls } from './previews'
import { useSocial } from './context'

const kinds = [['all', 'Tudo'], ['image', 'Imagens'], ['video', 'Vídeos']]

export default function SocialLibrary() {
  const { status, accounts, library, posts, postsQuery, notify } = useSocial()
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState('all')
  const [editing, setEditing] = useState(null)
  const [removing, setRemoving] = useState(null)
  const [uploading, setUploading] = useState(false)
  const inUse = useMemo(() => {
    const ids = new Set()
    for (const post of posts) if (['draft', 'scheduled', 'publishing', 'failed'].includes(post.status)) for (const item of post.media || []) ids.add(item.media_id)
    return ids
  }, [posts])
  const filtered = useMemo(() => library.filter(item => (kind === 'all' || item.kind === kind) && matchesQuery(query, item.title, ...(item.tags || []), item.alt_text)), [library, kind, query])
  const pager = usePagination(filtered, { pageSize: 24, resetKey: `${kind}|${query}` })
  const urls = useSignedUrls(pager.items.map(previewPath))
  if (!status.configured && !accounts.length && !library.length) return <NotConnected status={status} />
  if (postsQuery.loading && !postsQuery.data) return <LoadingPanel label="Carregando a biblioteca…" />
  return <div className="social-library">
    {postsQuery.error && <ErrorState onRetry={postsQuery.reload}>{postsQuery.error}</ErrorState>}
    <div className="ds-toolbar social-toolbar">
      <div className="ds-toolbar__filters">
        <SearchField value={query} onChange={setQuery} label="Buscar na biblioteca" placeholder="Título, tag ou descrição" />
        <div className="ds-segmented" role="group" aria-label="Tipo de arquivo">{kinds.map(([key, label]) => <button key={key} type="button" aria-pressed={kind === key} onClick={() => setKind(key)}>{label}</button>)}</div>
      </div>
      <button type="button" className="admin-button" onClick={() => setUploading(true)}><Icon name="upload" />Enviar arquivos</button>
    </div>
    <p className="social-muted">Arquivos privados da DUUK, guardados no armazenamento do painel. Imagens viram JPEG (formato aceito pelo Instagram); vídeos MP4 ou MOV até 50 MB.</p>
    {filtered.length ? <>
      <ul className="social-media-grid">{pager.items.map(item => <li key={item.id} className="social-media-card">
        <Thumb item={item} url={urls[previewPath(item)]} label={item.alt_text || item.title} />
        <div className="social-media-card__body">
          <strong>{item.title || (item.kind === 'video' ? 'Vídeo sem título' : 'Imagem sem título')}</strong>
          <small>{[item.width && item.height ? `${item.width}×${item.height}` : null, item.kind === 'video' && item.duration_ms ? formatDuration(item.duration_ms) : null, formatBytes(item.size_bytes)].filter(Boolean).join(' · ')}</small>
          {(item.tags || []).length > 0 && <span className="social-tags">{item.tags.slice(0, 4).map(tag => <span key={tag}>#{tag}</span>)}</span>}
          {inUse.has(item.id) && <span className="ds-badge ds-badge--info">Em publicação pendente</span>}
        </div>
        <div className="social-media-card__actions">
          <button type="button" className="admin-icon-button" aria-label={`Editar ${item.title || 'arquivo'}`} onClick={() => setEditing(item)}><Icon name="edit" /></button>
          <button type="button" className="admin-icon-button admin-icon-button--danger" aria-label={`Excluir ${item.title || 'arquivo'}`} disabled={inUse.has(item.id)} title={inUse.has(item.id) ? 'Retire das publicações pendentes antes de excluir' : undefined} onClick={() => setRemoving(item)}><Icon name="trash" /></button>
        </div>
      </li>)}</ul>
      <Pagination pager={pager} noun="arquivos" />
    </> : <div className="admin-panel"><EmptyState icon="media" title={library.length ? 'Nada encontrado' : 'Biblioteca vazia'} action={library.length ? <button type="button" className="admin-button admin-button--secondary" onClick={() => { setQuery(''); setKind('all') }}>Limpar filtros</button> : <button type="button" className="admin-button" onClick={() => setUploading(true)}><Icon name="upload" />Enviar arquivos</button>}>{library.length ? 'Nenhum arquivo corresponde à busca e aos filtros.' : 'Envie fotos e vídeos para usar nas publicações.'}</EmptyState></div>}
    {uploading && <UploadDialog onClose={() => setUploading(false)} onDone={count => { postsQuery.reload(); notify(count === 1 ? 'Arquivo adicionado à biblioteca.' : `${count} arquivos adicionados à biblioteca.`) }} />}
    {editing && <MediaEditor item={editing} onClose={() => setEditing(null)} onSaved={() => { postsQuery.reload(); notify('Arquivo atualizado.') }} />}
    {removing && <ConfirmModal title="Excluir arquivo" message={`O arquivo sai da biblioteca e do armazenamento. Publicações já enviadas ao Instagram não mudam.`} action="Excluir arquivo" onClose={() => setRemoving(null)} onConfirm={async () => { await deleteMedia(removing); postsQuery.reload(); notify('Arquivo excluído.') }} />}
  </div>
}

// Upload queue shared by the library and the composer.
export function UploadDialog({ onClose, onDone, onUploaded, accept = acceptedFiles, multiple = true, defaultRatio = 'original' }) {
  const input = useRef(null), ratioId = useId()
  const [ratio, setRatio] = useState(defaultRatio)
  const [queue, setQueue] = useState([])
  const [busy, setBusy] = useState(false)
  const pick = files => { if (!busy) setQueue(Array.from(files || []).slice(0, 10).map(file => ({ file, state: 'ready', message: '' }))) }
  const run = async () => {
    setBusy(true)
    const done = []
    for (let index = 0; index < queue.length; index++) {
      const update = patch => setQueue(list => list.map((entry, position) => position === index ? { ...entry, ...patch } : entry))
      const { file } = queue[index]
      try {
        update({ state: 'working', message: 'Preparando…' })
        const prepared = isVideo(file) ? await prepareVideo(file) : await prepareImage(file, cropRatios.find(item => item.id === ratio)?.value || null)
        const saved = await uploadPrepared({ ...prepared, meta: { ...prepared.meta, title: file.name.replace(/\.[^.]+$/, '').slice(0, 160) }, onProgress: message => update({ message }) })
        done.push(saved); update({ state: 'done', message: 'Na biblioteca' })
        onUploaded?.(saved)
      } catch (error) { update({ state: 'error', message: error.message }) }
    }
    setBusy(false)
    if (done.length) onDone?.(done.length, done)
  }
  const finished = queue.length > 0 && queue.every(entry => ['done', 'error'].includes(entry.state))
  return <Modal title="Enviar para a biblioteca" subtitle="Até 10 arquivos por vez." onClose={() => { if (!busy) onClose() }}>
    <div className="admin-modal__body social-upload">
      <div className={`social-dropzone${busy ? ' is-busy' : ''}`} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); pick(event.dataTransfer.files) }}>
        <Icon name="cloudUpload" size={28} />
        <p>Arraste fotos e vídeos ou</p>
        <button type="button" className="admin-button admin-button--secondary" onClick={() => input.current.click()} disabled={busy}>Escolher arquivos</button>
        <input ref={input} type="file" accept={accept} multiple={multiple} hidden onChange={event => { pick(event.target.files); event.target.value = '' }} />
        <small>JPEG, PNG, WebP ou AVIF (convertidos para JPEG) · MP4 ou MOV até 50 MB</small>
      </div>
      <label className="admin-field" htmlFor={ratioId}><span>Recorte das imagens</span>
        <select id={ratioId} value={ratio} onChange={event => setRatio(event.target.value)} disabled={busy}>
          <option value="original">Manter a proporção original</option>
          {cropRatios.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
        <small>O feed aceita de 4:5 (vertical) a 1,91:1 (horizontal). Stories usam 9:16.</small>
      </label>
      {queue.length > 0 && <ul className="social-queue">{queue.map((entry, index) => <li key={`${entry.file.name}-${index}`} className={`is-${entry.state}`}>
        <Icon name={entry.state === 'done' ? 'checkCircle' : entry.state === 'error' ? 'alertCircle' : isVideo(entry.file) ? 'film' : 'media'} size={16} />
        <span><strong>{entry.file.name}</strong><small role={entry.state === 'error' ? 'alert' : undefined}>{entry.message || formatBytes(entry.file.size)}</small></span>
      </li>)}</ul>}
    </div>
    <div className="admin-modal__foot">
      <button type="button" className="admin-button admin-button--secondary" onClick={onClose} disabled={busy}>{finished ? 'Fechar' : 'Cancelar'}</button>
      {!finished && <button type="button" className="admin-button" onClick={run} disabled={busy || !queue.length} aria-busy={busy}><Icon name="upload" />{busy ? 'Enviando…' : queue.length > 1 ? `Enviar ${queue.length} arquivos` : 'Enviar'}</button>}
    </div>
  </Modal>
}

function MediaEditor({ item, onClose, onSaved }) {
  const [form, setForm] = useState({ title: item.title || '', alt_text: item.alt_text || '', tags: (item.tags || []).join(', ') })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const tags = form.tags.split(/[,\n]/).map(tag => tag.trim().replace(/^#/, '')).filter(Boolean)
  const invalid = form.alt_text.length > 1000 ? 'alt' : tags.length > 20 ? 'tags' : null
  const save = async event => {
    event.preventDefault()
    if (invalid) return
    setBusy(true); setError('')
    try { await updateMedia({ id: item.id, expected_version: item.version, title: form.title, alt_text: form.alt_text, tags }); onSaved(); onClose() }
    catch (cause) { setError(cause.message); setBusy(false) }
  }
  return <Modal title="Editar arquivo" subtitle={`Enviado em ${formatDateTime(item.created_at)}`} onClose={() => { if (!busy) onClose() }}>
    <form onSubmit={save} noValidate>
      <div className="admin-modal__body admin-form-grid social-form-single">
        <label className="admin-field"><span>Título</span><input value={form.title} maxLength={160} onChange={event => setForm({ ...form, title: event.target.value })} /></label>
        {item.kind === 'image' && <label className="admin-field"><span>Texto alternativo padrão</span><textarea rows={3} value={form.alt_text} aria-invalid={invalid === 'alt'} aria-describedby="social-alt-error" onChange={event => setForm({ ...form, alt_text: event.target.value })} /><small>Descreve a imagem para quem usa leitor de tela. Pode ser ajustado em cada publicação.</small>{invalid === 'alt' && <FieldError id="social-alt-error">Use até 1.000 caracteres.</FieldError>}</label>}
        <label className="admin-field"><span>Tags</span><input value={form.tags} aria-invalid={invalid === 'tags'} aria-describedby="social-tags-error" placeholder="bastidores, campanha" onChange={event => setForm({ ...form, tags: event.target.value })} /><small>Separe por vírgula. Servem só para buscar na biblioteca.</small>{invalid === 'tags' && <FieldError id="social-tags-error">Use até 20 tags.</FieldError>}</label>
        {error && <p className="admin-error" role="alert">{error}</p>}
      </div>
      <div className="admin-modal__foot"><button type="button" className="admin-button admin-button--secondary" onClick={onClose} disabled={busy}>Cancelar</button><button type="submit" className="admin-button" disabled={busy || Boolean(invalid)} aria-busy={busy}>{busy ? 'Salvando…' : 'Salvar'}</button></div>
    </form>
  </Modal>
}

// Picker used by the composer: choose items from the library, keeping the order of selection.
export function MediaPicker({ library, allowed, max, selected, onClose, onChoose }) {
  const [chosen, setChosen] = useState(selected)
  const [query, setQuery] = useState('')
  const [uploading, setUploading] = useState(false)
  const [extra, setExtra] = useState([])
  const items = useMemo(() => [...extra, ...library.filter(item => !extra.some(added => added.id === item.id))].filter(item => allowed.includes(item.kind) && matchesQuery(query, item.title, ...(item.tags || []))), [library, extra, allowed, query])
  const pager = usePagination(items, { pageSize: 18, resetKey: query })
  const urls = useSignedUrls(pager.items.map(previewPath))
  const toggle = item => setChosen(list => list.includes(item.id) ? list.filter(id => id !== item.id) : max === 1 ? [item.id] : list.length >= max ? list : [...list, item.id])
  const everything = [...extra, ...library]
  return <Modal wide title="Escolher da biblioteca" subtitle={max === 1 ? 'Escolha 1 arquivo.' : `Escolha até ${max} arquivos, na ordem em que devem aparecer.`} onClose={onClose}>
    <div className="admin-modal__body social-picker">
      <div className="social-picker__bar"><SearchField value={query} onChange={setQuery} label="Buscar arquivos" /><button type="button" className="admin-button admin-button--secondary" onClick={() => setUploading(true)}><Icon name="upload" />Enviar novo</button></div>
      {pager.items.length ? <ul className="social-media-grid social-media-grid--pick">{pager.items.map(item => {
        const order = chosen.indexOf(item.id)
        return <li key={item.id}><button type="button" className={`social-pick${order >= 0 ? ' is-selected' : ''}`} aria-pressed={order >= 0} onClick={() => toggle(item)}>
          <Thumb item={item} url={urls[previewPath(item)]} />
          <span className="social-pick__label">{item.title || (item.kind === 'video' ? 'Vídeo' : 'Imagem')}</span>
          {order >= 0 && <span className="social-pick__order" aria-label={`Posição ${order + 1}`}>{max === 1 ? <Icon name="check" size={14} /> : order + 1}</span>}
        </button></li>
      })}</ul> : <EmptyState icon="media" title="Nenhum arquivo disponível">{allowed.length === 1 ? (allowed[0] === 'video' ? 'Este formato aceita somente vídeo.' : 'Este formato aceita somente imagem.') : 'Envie arquivos para a biblioteca.'}</EmptyState>}
      <Pagination pager={pager} noun="arquivos" />
    </div>
    <div className="admin-modal__foot"><span className="social-muted">{chosen.length} selecionado(s)</span><button type="button" className="admin-button admin-button--secondary" onClick={onClose}>Cancelar</button><button type="button" className="admin-button" disabled={!chosen.length} onClick={() => onChoose(chosen.map(id => everything.find(item => item.id === id)).filter(Boolean))}>Usar selecionados</button></div>
    {uploading && <UploadDialog accept={allowed.includes('video') && !allowed.includes('image') ? 'video/mp4,video/quicktime' : allowed.includes('image') && !allowed.includes('video') ? 'image/jpeg,image/png,image/webp,image/avif' : acceptedFiles} onClose={() => setUploading(false)} onUploaded={saved => { setExtra(list => [saved, ...list]); if (allowed.includes(saved.kind)) setChosen(list => max === 1 ? [saved.id] : list.length >= max ? list : [...list, saved.id]) }} />}
  </Modal>
}
