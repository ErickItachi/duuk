import { useEffect, useState } from 'react'
import { useContent } from '../content/useContent'
import { slugify, validateProject } from '../content/model'
import { ConfirmModal, Icon, MediaField, Modal } from './components'

function newProject() {
  return { id: crypto.randomUUID(), title: '', slug: '', description: { pt: '', en: '' }, headline: { pt: '', en: '' }, category: { pt: '', en: '' }, alt: { pt: '', en: '' }, client: '', agency: '', director: '', year: String(new Date().getFullYear()), poster: '', video: '', provider: 'mp4', featured: false, coverLabel: true, objectPosition: 'center center', status: 'draft', credits: [] }
}

export default function ProjectEditor({ project, onClose, onSaved }) {
  const { draft, saveDraft } = useContent()
  const [original] = useState(() => project || newProject())
  const [form, setForm] = useState(() => structuredClone(original))
  const [language, setLanguage] = useState('pt')
  const [slugEdited, setSlugEdited] = useState(Boolean(project))
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(0)
  const [error, setError] = useState('')
  const [confirmClose, setConfirmClose] = useState(false)
  const dirty = JSON.stringify(form) !== JSON.stringify(original)
  useEffect(() => {
    if (!dirty) return
    const prevent = (event) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', prevent)
    return () => window.removeEventListener('beforeunload', prevent)
  }, [dirty])
  const update = (key, value) => setForm((previous) => ({ ...previous, [key]: value }))
  const translate = (key, value) => setForm((previous) => ({ ...previous, [key]: { ...previous[key], [language]: value } }))
  const uploadStatus = (value) => setUploading((count) => count + (value ? 1 : -1))
  const close = () => { if (busy || uploading > 0) return; if (dirty) setConfirmClose(true); else onClose() }
  const save = async (event) => {
    event.preventDefault(); setError(''); setBusy(true)
    try {
      const next = { ...form, title: form.title.trim(), slug: form.slug.trim() }
      validateProject(next, draft.projects)
      await saveDraft({ ...draft, projects: project ? draft.projects.map((item) => item.id === next.id ? next : item) : [...draft.projects, next] })
      onSaved(); onClose()
    } catch (cause) { setError(cause.message); setBusy(false) }
  }
  return <>
    <Modal title={project ? 'Editar projeto' : 'Novo projeto'} subtitle="Prepare o conteúdo e salve como rascunho antes de publicar no preview." onClose={close} wide>
      <form onSubmit={save}>
        <fieldset disabled={busy} className="admin-editor">
          <div className="admin-editor__content">
            <label className="admin-field"><span>Título do projeto</span><input required autoFocus value={form.title} onChange={(event) => { const title = event.target.value; setForm((previous) => ({ ...previous, title, slug: slugEdited ? previous.slug : slugify(title) })) }} placeholder="Nome do filme ou projeto" /></label>
            <label className="admin-field"><span>Endereço do projeto</span><div className="admin-input-prefix"><span>/projeto/</span><input required aria-label="Endereço do projeto" value={form.slug} onChange={(event) => { setSlugEdited(true); update('slug', event.target.value) }} placeholder="nome-do-projeto" /></div></label>
            <div className="admin-language-tabs" aria-label="Idioma do conteúdo">{['pt', 'en'].map((lang) => <button type="button" key={lang} aria-pressed={language === lang} className={language === lang ? 'is-active' : ''} onClick={() => setLanguage(lang)}>{lang === 'pt' ? 'Português' : 'English'}</button>)}</div>
            <label className="admin-field"><span>Descrição · {language.toUpperCase()}</span><textarea aria-label={`Descrição · ${language.toUpperCase()}`} rows={4} value={form.description?.[language] || ''} onChange={(event) => translate('description', event.target.value)} placeholder="Conte um pouco sobre esse projeto…" /></label>
            <label className="admin-field"><span>Frase de abertura · {language.toUpperCase()}</span><textarea aria-label={`Frase de abertura · ${language.toUpperCase()}`} rows={2} value={form.headline?.[language] || ''} onChange={(event) => translate('headline', event.target.value)} placeholder="Uma frase para apresentar o filme" /></label>
            <div className="admin-field-row"><label className="admin-field"><span>Categoria · {language.toUpperCase()}</span><input value={form.category?.[language] || ''} onChange={(event) => translate('category', event.target.value)} placeholder="Institucional, evento, casamento…" /></label><label className="admin-field admin-field--year"><span>Ano</span><input inputMode="numeric" maxLength={4} value={form.year} onChange={(event) => update('year', event.target.value)} /></label></div>
            <div className="admin-field-row"><label className="admin-field"><span>Cliente</span><input value={form.client} onChange={(event) => update('client', event.target.value)} /></label><label className="admin-field"><span>Direção</span><input value={form.director} onChange={(event) => update('director', event.target.value)} /></label></div>
            <label className="admin-field"><span>Agência</span><input value={form.agency} onChange={(event) => update('agency', event.target.value)} /></label>
            <label className="admin-field"><span>Visibilidade ao publicar no preview</span><select aria-label="Visibilidade ao publicar no preview" value={form.status} onChange={(event) => update('status', event.target.value)}><option value="published">Visível no portfólio</option><option value="draft">Rascunho</option><option value="archived">Arquivado</option></select></label>
            <label className="admin-checkbox"><input type="checkbox" checked={form.featured} onChange={(event) => update('featured', event.target.checked)} /><span>Destacar na página inicial</span></label>
            <label className="admin-checkbox"><input type="checkbox" checked={form.coverLabel} onChange={(event) => update('coverLabel', event.target.checked)} /><span>Exibir categoria sobre a capa</span></label>
          </div>
          <div className="admin-editor__media">
            <MediaField label="Capa do projeto" kind="image" value={form.poster} onChange={(value) => update('poster', value)} onBusyChange={uploadStatus} />
            <label className="admin-field"><span>Descrição da imagem · {language.toUpperCase()}</span><input value={form.alt?.[language] || ''} onChange={(event) => translate('alt', event.target.value)} placeholder="Descreva a imagem para quem usa leitor de tela" /></label>
            <label className="admin-field"><span>Enquadramento da capa</span><select aria-label="Enquadramento da capa" value={form.objectPosition} onChange={(event) => update('objectPosition', event.target.value)}><option value="center center">Centro</option><option value="center top">Topo</option><option value="center bottom">Base</option>{!['center center', 'center top', 'center bottom'].includes(form.objectPosition) && <option value={form.objectPosition}>Atual ({form.objectPosition})</option>}</select></label>
            <label className="admin-field"><span>Origem do vídeo</span><select aria-label="Origem do vídeo" value={form.provider} onChange={(event) => update('provider', event.target.value)}><option value="mp4">Arquivo de vídeo</option><option value="youtube">YouTube</option></select></label>
            {form.provider === 'youtube' ? <label className="admin-field"><span>ID do vídeo no YouTube</span><input value={form.videoId || ''} onChange={(event) => update('videoId', event.target.value.trim())} placeholder="11 caracteres do endereço do vídeo" /></label> : <MediaField label="Vídeo do projeto" kind="video" value={form.video} onChange={(value) => update('video', value)} onBusyChange={uploadStatus} />}
          </div>
        </fieldset>
        {error && <p className="admin-error admin-editor__error" role="alert">{error}</p>}
        <div className="admin-modal__foot"><span>As alterações ficam na demonstração.</span><button type="button" className="admin-button admin-button--secondary" onClick={close} disabled={busy || uploading > 0}>Cancelar</button><button className="admin-button" disabled={busy || uploading > 0}><Icon name="check" />{busy ? 'Salvando…' : 'Salvar rascunho'}</button></div>
      </form>
    </Modal>
    {confirmClose && <ConfirmModal title="Descartar alterações?" message="As mudanças desse formulário ainda não foram salvas." action="Descartar alterações" onConfirm={onClose} onClose={() => setConfirmClose(false)} />}
  </>
}
