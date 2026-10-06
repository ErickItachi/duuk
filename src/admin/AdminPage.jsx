import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useContent } from '../content/useContent'
import { useAuth } from '../content/AuthContext'
import LoginPage from './LoginPage'
import { youtubeId } from '../content/youtube'
import { validMediaUrl, MEDIA_PREFIX } from '../content/model'
import { getImageSources } from '../media'
import { ConfirmModal, Icon, MediaField } from './components'
import ProjectEditor from './ProjectEditor'
import DashboardPage from '../office/DashboardPage'
import ContractsPage, { ContractEditor } from '../office/ContractsPage'
import ExpensesPage from '../office/ExpensesPage'
import InsightsPage from '../office/InsightsPage'
import AgendaPage from '../office/AgendaPage'
import './admin.css'
import '../office/office.css'
import '../office/calendar.css'

const statusLabels = { published: 'Visível', draft: 'Rascunho', archived: 'Arquivado' }
const sections = [
  { to: '/admin', label: 'Visão geral', icon: 'grid' },
  { to: '/admin/agenda', label: 'Agenda', icon: 'calendar' },
  { to: '/admin/contratos', label: 'Contratos', icon: 'document' },
  { to: '/admin/despesas', label: 'Despesas', icon: 'wallet' },
  { to: '/admin/insights', label: 'Insights', icon: 'chart' },
  { to: '/admin/portfolio', label: 'Portfólio', icon: 'film' },
  { to: '/admin/inicio', label: 'Página inicial', icon: 'home' },
  { to: '/admin/midias', label: 'Biblioteca', icon: 'media' },
]

function ProjectList({ notify }) {
  const { draft, saveDraft, urls, ready } = useContent()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [busy, setBusy] = useState(false)
  const all = draft.projects
  const filtered = all.filter((project) => (filter === 'all' || project.status === filter) && `${project.title} ${project.category?.pt || ''} ${project.client}`.toLowerCase().includes(query.toLowerCase()))
  const reorder = async (project, offset) => {
    const index = all.findIndex((item) => item.id === project.id)
    const nextIndex = index + offset
    if (nextIndex < 0 || nextIndex >= all.length) return
    const next = [...all]; [next[index], next[nextIndex]] = [next[nextIndex], next[index]]
    setBusy(true)
    try { await saveDraft({ ...draft, projects: next }); notify('Ordem salva no site.') } catch (cause) { notify(cause.message, true) }
    finally { setBusy(false) }
  }
  const remove = async () => {
    await saveDraft({ ...draft, projects: all.filter((item) => item.id !== deleting.id) })
    notify('Projeto removido do site.')
  }
  return <>
    <div className="admin-page-title"><div><p className="admin-eyebrow">CONTEÚDO / FILMES</p><h1>Portfólio<span>.</span></h1><p>Histórias que merecem estar em cena.</p></div><button className="admin-button" disabled={!ready} onClick={() => setEditing('new')}><Icon name="plus" />Novo projeto</button></div>
    <div className="admin-stats"><div><span>Total de projetos</span><strong>{String(all.length).padStart(2, '0')}</strong></div><div><span>Visíveis no portfólio</span><strong>{String(all.filter((item) => item.status === 'published').length).padStart(2, '0')}<i /></strong></div><div><span>Em destaque na home</span><strong>{String(all.filter((item) => item.status === 'published' && item.featured).length).padStart(2, '0')}</strong></div></div>
    <section className="admin-panel" aria-label="Lista de projetos">
      <div className="admin-list-toolbar"><div className="admin-filter-tabs" aria-label="Filtrar por visibilidade">{[['all', 'Todos'], ['published', 'Visíveis'], ['draft', 'Rascunhos'], ['archived', 'Arquivados']].map(([key, label]) => <button key={key} className={filter === key ? 'is-active' : ''} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>)}</div><label className="admin-search"><Icon name="search" /><input type="search" aria-label="Buscar projeto" placeholder="Buscar projeto…" value={query} onChange={(event) => setQuery(event.target.value)} /></label></div>
      <div className="admin-list-heading"><span>PROJETO</span><span>VISIBILIDADE</span><span>HOME</span><span>ORDEM / AÇÕES</span></div>
      <div className="admin-project-list">
        {filtered.map((project) => {
          const index = all.findIndex((item) => item.id === project.id)
          const poster = project.poster?.startsWith(MEDIA_PREFIX) ? urls[project.poster] : getImageSources(project.poster).src
          return <article className="admin-project-row" key={project.id}>
            <button className="admin-project-summary" onClick={() => setEditing(project)}><div className="admin-project-thumb">{poster ? <img src={poster} alt="" loading="lazy" /> : <Icon name="film" size={24} />}<span>{String(index + 1).padStart(2, '0')}</span></div><div><h2>{project.title}</h2><p>{project.category?.pt && project.category.pt !== 'A DEFINIR' ? project.category.pt : 'Categoria a definir'}<span>·</span>{project.year}</p></div></button>
            <span className={`admin-status admin-status--${project.status}`}><i />{statusLabels[project.status]}</span>
            <span className="admin-featured">{project.featured ? <><Icon name="check" size={15} />Destaque</> : '—'}</span>
            <div className="admin-row-actions"><button className="admin-icon-button" aria-label={`Mover ${project.title} para cima`} disabled={busy || index === 0} onClick={() => reorder(project, -1)}><Icon name="up" size={16} /></button><button className="admin-icon-button" aria-label={`Mover ${project.title} para baixo`} disabled={busy || index === all.length - 1} onClick={() => reorder(project, 1)}><Icon name="down" size={16} /></button><button className="admin-icon-button" aria-label={`Editar ${project.title}`} onClick={() => setEditing(project)}><Icon name="edit" size={16} /></button><button className="admin-icon-button admin-icon-button--danger" aria-label={`Remover ${project.title}`} onClick={() => setDeleting(project)}><Icon name="trash" size={16} /></button></div>
          </article>
        })}
        {!filtered.length && <div className="admin-empty"><Icon name="film" size={36} /><h2>{all.length ? 'Nenhum projeto encontrado' : 'Seu próximo filme começa aqui'}</h2><p>{all.length ? 'Tente outro nome ou filtro.' : 'Adicione o primeiro projeto ao portfólio.'}</p><button className="admin-button admin-button--secondary" onClick={() => { if (all.length) { setQuery(''); setFilter('all') } else setEditing('new') }}>{all.length ? 'Limpar filtros' : 'Novo projeto'}</button></div>}
      </div>
      <div className="admin-list-footer"><span>{filtered.length} {filtered.length === 1 ? 'projeto' : 'projetos'}</span><span>Use as setas para ordenar os filmes.</span></div>
    </section>
    <div className="admin-tip"><Icon name="edit" /><p>Ao clicar em <strong>Salvar no site</strong>, os projetos visíveis são atualizados no domínio público.</p></div>
    {editing && <ProjectEditor key={editing.id || 'new'} project={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => notify('Conteúdo salvo. O site foi atualizado.')} />}
    {deleting && <ConfirmModal title="Remover projeto?" message={`“${deleting.title}” será removido do painel e do site público ao confirmar.`} action="Remover projeto" onConfirm={remove} onClose={() => setDeleting(null)} />}
  </>
}

function HomeEditor({ notify }) {
  const { draft, saveDraft, version } = useContent()
  const [baseVersion, setBaseVersion] = useState(version)
  const [baseDraft, setBaseDraft] = useState(draft)
  const [form, setForm] = useState(() => ({ ...draft.heroMedia }))
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(0)
  const [error, setError] = useState('')
  const [destination, setDestination] = useState(null)
  const navigate = useNavigate()
  const dirty = JSON.stringify(form) !== JSON.stringify(baseDraft.heroMedia)
  const update = (key, value) => setForm((previous) => ({ ...previous, [key]: value }))
  useEffect(() => {
    if (!dirty) return
    const prevent = (event) => { event.preventDefault(); event.returnValue = '' }
    const intercept = (event) => {
      const anchor = event.target.closest('a')
      if (!anchor || anchor.target === '_blank' || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0 || anchor.origin !== location.origin || anchor.pathname === location.pathname) return
      event.preventDefault()
      setDestination(`${anchor.pathname}${anchor.search}`)
    }
    window.addEventListener('beforeunload', prevent)
    document.addEventListener('click', intercept, true)
    return () => { window.removeEventListener('beforeunload', prevent); document.removeEventListener('click', intercept, true) }
  }, [dirty])
  const save = async (event) => {
    event.preventDefault(); setError('')
    const normalized = { ...form }
    for (const key of ['poster', 'posterMobile']) {
      if (!normalized[key] || !validMediaUrl(normalized[key])) { setError('Escolha capas válidas para desktop e celular.'); return }
    }
    for (const key of ['video', 'videoMobile']) {
      if (normalized[`${key}Provider`] === 'youtube') {
        normalized[`${key}Id`] = youtubeId(normalized[`${key}Id`])
        normalized[key] = ''
        if (!normalized[`${key}Id`]) { setError('Informe um link válido do YouTube para a abertura.'); return }
      } else if (!normalized[key] || !validMediaUrl(normalized[key])) { setError('Escolha um vídeo ou endereço HTTPS para cada abertura.'); return }
    }
    setBusy(true)
    try { const saved = await saveDraft({ ...baseDraft, heroMedia: normalized }, baseVersion); setBaseVersion(saved.version); setBaseDraft(saved.draft); setForm({ ...saved.draft.heroMedia }); notify('Abertura salva no site.') } catch (cause) { setError(cause.message) }
    finally { setBusy(false) }
  }
  return <>
    <div className="admin-page-title"><div><p className="admin-eyebrow">CONTEÚDO / ABERTURA</p><h1>Página inicial<span>.</span></h1><p>A primeira cena da sua marca.</p></div><Link className="admin-button admin-button--secondary" to="/" target="_blank">Ver site<Icon name="arrow" /></Link></div>
    <form className="admin-home-form" onSubmit={save}>
      <div className="admin-home-grid">{[['desktop', 'Desktop', 'video', 'poster', 'Para telas maiores.'], ['mobile', 'Celular', 'videoMobile', 'posterMobile', 'Uma abertura pensada para telas verticais.']].map(([key, title, video, poster, text]) => <section className="admin-panel admin-home-panel" key={key}><div className="admin-section-head"><span className="admin-device">{key === 'desktop' ? '16:9' : '9:16'}</span><div><h2>{title}</h2><p>{text}</p></div></div><label className="admin-field"><span>Origem do vídeo · {title}</span><select aria-label={`Origem do vídeo · ${title}`} value={form[`${video}Provider`] || 'mp4'} onChange={(event) => update(`${video}Provider`, event.target.value)} disabled={busy}><option value="mp4">Arquivo ou endereço HTTPS</option><option value="youtube">YouTube · vídeos grandes sem upload aqui</option></select></label>{form[`${video}Provider`] === 'youtube' ? <label className="admin-field"><span>Link do YouTube · {title}</span><input aria-label={`Link do YouTube · ${title}`} type="text" value={form[`${video}Id`] || ''} onChange={(event) => update(`${video}Id`, event.target.value.trim())} placeholder="https://youtu.be/…" disabled={busy} /><small>Use um vídeo não listado com incorporação permitida.</small></label> : <MediaField label={`Vídeo de abertura · ${title}`} kind="video" value={form[video]} onChange={(value) => update(video, value)} disabled={busy} onBusyChange={(value) => setUploading((count) => count + (value ? 1 : -1))} />}<MediaField label={`Capa de abertura · ${title}`} kind="image" value={form[poster]} onChange={(value) => update(poster, value)} disabled={busy} onBusyChange={(value) => setUploading((count) => count + (value ? 1 : -1))} /></section>)}</div>
      <div className="admin-save-bar"><p>{version !== baseVersion ? 'O conteúdo mudou. Descarte as alterações para carregar a versão atual.' : dirty ? 'Há alterações para salvar no site.' : 'As alterações estão salvas.'}</p><button type="button" className="admin-button admin-button--secondary" disabled={(!dirty && version === baseVersion) || busy || uploading > 0} onClick={() => { setBaseVersion(version); setBaseDraft(draft); setForm({ ...draft.heroMedia }) }}>Descartar alterações</button><button className="admin-button" disabled={!dirty || busy || uploading > 0}><Icon name="check" />{busy ? 'Salvando…' : 'Salvar no site'}</button></div>
      {error && <p className="admin-error" role="alert">{error}</p>}
    </form>
    <div className="admin-tip"><Icon name="film" /><p>Envie vídeos MP4 ou WebM de até 50 MB. Para arquivos maiores, use um endereço HTTPS ou use YouTube nos projetos ou na abertura.</p></div>
    {destination && <ConfirmModal title="Sair sem salvar?" message="As alterações da abertura ainda não foram salvas no site." action="Sair sem salvar" onConfirm={() => navigate(destination)} onClose={() => setDestination(null)} />}
  </>
}

function MediaLibrary({ notify }) {
  const { media, urls, draft, published, upload, removeMedia } = useContent()
  const input = useRef(null)
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState('all')
  const [deleting, setDeleting] = useState(null)
  const files = media.filter((file) => filter === 'all' || file.type.startsWith(filter))
  const uploadFile = async (file) => {
    if (!file) return
    setBusy(true)
    try { await upload(file, file.type.startsWith('image/') ? 'image' : 'video'); notify('Arquivo salvo na biblioteca.') } catch (cause) { notify(cause.message, true) }
    finally { setBusy(false); input.current.value = '' }
  }
  return <>
    <div className="admin-page-title"><div><p className="admin-eyebrow">CONTEÚDO / ARQUIVOS</p><h1>Biblioteca<span>.</span></h1><p>Capas e vídeos para suas próximas histórias.</p></div><button className="admin-button" onClick={() => input.current.click()} disabled={busy}><Icon name="upload" />{busy ? 'Enviando…' : 'Enviar arquivo'}</button><input ref={input} type="file" hidden accept="image/jpeg,image/png,image/webp,image/avif,video/mp4,video/webm" aria-label="Enviar arquivo para biblioteca" onChange={(event) => uploadFile(event.target.files[0])} /></div>
    <div className="admin-library-note"><Icon name="media" /><p>Os arquivos ficam salvos na nuvem. Uploads diretos têm até 50 MB por arquivo e 1 GB de espaço gratuito. Para vídeos grandes, use YouTube. Escolha os arquivos pelo botão <strong>Biblioteca</strong> ao editar um projeto ou a abertura.</p></div>
    <div className="admin-filter-tabs admin-library-filters">{[['all', 'Todos os arquivos'], ['image/', 'Imagens'], ['video/', 'Vídeos']].map(([key, label]) => <button key={key} aria-pressed={filter === key} className={filter === key ? 'is-active' : ''} onClick={() => setFilter(key)}>{label}</button>)}</div>
    {files.length ? <div className="admin-library-grid">{files.map((file) => {
      const used = JSON.stringify([draft, published]).includes(file.id)
      return <article className="admin-library-card" key={file.id}><div className="admin-library-card__image">{file.type.startsWith('image/') ? <img src={urls[file.id]} alt={file.name} /> : <video src={urls[file.id]} controls playsInline preload="metadata" />}</div><div className="admin-library-card__body"><h2 title={file.name}>{file.name}</h2><p>{(file.size / 1024 / 1024).toFixed(1)} MB · {file.type.split('/')[1].toUpperCase()}</p><div><span className={used ? 'admin-used' : ''}>{used ? 'Em uso' : 'Disponível'}</span><button className="admin-icon-button admin-icon-button--danger" disabled={used} aria-label={`Remover arquivo ${file.name}`} title={used ? 'Troque o arquivo nos projetos e publique antes de removê-lo.' : 'Remover arquivo'} onClick={() => setDeleting(file)}><Icon name="trash" /></button></div></div></article>
    })}</div> : <div className="admin-panel admin-empty admin-library-empty"><Icon name="upload" size={40} /><h2>{media.length ? 'Nenhum arquivo desse tipo' : 'Espaço para novas cenas'}</h2><p>{media.length ? 'Selecione outro filtro ou envie um arquivo.' : 'Envie uma capa ou um vídeo de até 50 MB.'}</p><button className="admin-button admin-button--secondary" onClick={() => input.current.click()} disabled={busy}>Enviar primeiro arquivo</button></div>}
    {deleting && <ConfirmModal title="Remover arquivo?" message={`“${deleting.name}” será excluído da biblioteca.`} action="Remover arquivo" onConfirm={async () => { await removeMedia(deleting.id); notify('Arquivo removido.') }} onClose={() => setDeleting(null)} />}
  </>
}

function AdminWorkspace() {
  const { pathname } = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [collapsed,setCollapsed] = useState(()=>{try{return localStorage.getItem('duuk-sidebar-collapsed')==='true'}catch{return false}})
  const toggleSidebar=()=>setCollapsed(previous=>{const next=!previous;try{localStorage.setItem('duuk-sidebar-collapsed',String(next))}catch{}return next})
  const section = sections.find(item => item.to !== '/admin' && (pathname === item.to || pathname.startsWith(`${item.to}/`))) || sections[0]
  const editingSite = ['/admin/portfolio','/admin/inicio','/admin/midias'].includes(pathname)
  const { user, signOut } = useAuth()
  const { ready, error, refresh } = useContent()
  const [toast, setToast] = useState(null)
  const notify = (message, failed = false) => setToast({ message, failed })
  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(null), 7000)
    return () => window.clearTimeout(timeout)
  }, [toast])
  useEffect(() => {
    document.title = 'Painel DUUK'
    const robots = document.querySelector('meta[name="robots"]')
    robots?.setAttribute('content', 'noindex, nofollow')
  }, [])
  return <div className={`admin-shell${collapsed?' is-collapsed':''}`}>
    <aside className="admin-sidebar" onKeyDown={event => { if (event.key === 'Escape' && menuOpen) { setMenuOpen(false); event.currentTarget.querySelector('.admin-menu-toggle')?.focus() } }}>
      <div className="admin-sidebar__head"><button type="button" className="admin-collapse-toggle" aria-expanded={!collapsed} aria-controls="admin-navigation" aria-label={collapsed?'Expandir menu':'Minimizar menu'} title={collapsed?'Expandir menu':'Minimizar menu'} onClick={toggleSidebar}><Icon name="sidebar" size={18} /></button>
        <Link className="admin-brand" to="/admin" aria-label="DUUK — visão geral" onClick={() => setMenuOpen(false)}><img src="/media/duuk-logo-white.png" width="52" height="64" alt="DUUK" /><span>ADMINISTRATIVO<small>Seu estúdio, em um só lugar.</small></span></Link>
        <button type="button" className="admin-menu-toggle" aria-expanded={menuOpen} aria-controls="admin-navigation" aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'} onClick={() => setMenuOpen(open => !open)}><Icon name={menuOpen ? 'close' : 'menu'} /><span>Menu</span></button>
      </div>
      <div id="admin-navigation" className={`admin-sidebar__menu${menuOpen ? ' is-open' : ''}`}>
      <p className="admin-sidebar__label">GERENCIAR</p>
      <nav aria-label="Painel administrativo">{sections.map(item => <NavLink key={item.to} to={item.to} end={item.to === '/admin'} title={item.label} aria-label={item.label} onClick={() => setMenuOpen(false)}><Icon name={item.icon} /><span>{item.label}</span></NavLink>)}</nav>
      <div className="admin-sidebar__bottom"><div className="admin-demo-card"><span className="admin-demo-dot" /><div><strong>Conectado à nuvem</strong><p>{user.email}</p></div></div><button className="admin-reset" aria-label="Sair da conta" title="Sair da conta" onClick={() => signOut().catch((cause) => notify(cause.message, true))}><Icon name="logout" size={17} /><span>Sair da conta</span></button><span className="admin-sidebar__signature">DUUK® / FEITO PARA CRIAR</span></div>
      </div>
    </aside>
    <div className="admin-workspace">
      <header className="admin-topbar"><div className="admin-environment">ADMINISTRATIVO<span className="admin-topbar-divider">/</span><span className="admin-topbar-note">{section.label}</span></div><div className="admin-topbar__actions"><Link to="/" target="_blank" className="admin-view-site">Ver site<Icon name="arrow" size={16} /></Link></div></header>
      <div className="admin-demo-banner"><span className="admin-demo-tag"><Icon name={editingSite ? 'check' : 'lock'} size={12} />{editingSite?'AO VIVO':'PRIVADO'}</span><p>{editingSite?'Ao salvar, as alterações são aplicadas ao site público. Projetos em rascunho continuam privados.':'Sua agenda, contratos, despesas e relatórios ficam restritos à equipe autorizada.'}</p></div>
      <main className="admin-main">
        {error && <div className="admin-error" role="alert">{error} <button className="admin-text-button" onClick={() => refresh().catch(() => {})}>Tentar novamente</button></div>}
        {!ready && editingSite ? <div className="admin-empty"><p>Carregando seu conteúdo…</p></div> : <Routes><Route index element={<DashboardPage />} /><Route path="portfolio" element={<ProjectList notify={notify} />} /><Route path="inicio" element={<HomeEditor notify={notify} />} /><Route path="midias" element={<MediaLibrary notify={notify} />} /><Route path="contratos" element={<ContractsPage notify={notify} />} /><Route path="contratos/:id" element={<ContractEditor notify={notify} />} /><Route path="agenda" element={<AgendaPage notify={notify} />} /><Route path="despesas" element={<ExpensesPage notify={notify} />} /><Route path="insights" element={<InsightsPage />} /><Route path="*" element={<Navigate to="/admin" replace />} /></Routes>}
      </main>
      <footer className="admin-footer"><span>DUUK / SÃO PAULO</span><button className="admin-mobile-reset" onClick={() => signOut().catch((cause) => notify(cause.message, true))}>Sair da conta</button><span>Seu conteúdo. Seu ritmo.</span></footer>
    </div>
    {toast && <div className={`admin-toast${toast.failed ? ' admin-toast--error' : ''}`} role={toast.failed ? 'alert' : 'status'}><Icon name={toast.failed ? 'close' : 'check'} /><span>{toast.message}</span><button className="admin-icon-button" aria-label="Fechar aviso" onClick={() => setToast(null)}><Icon name="close" size={16} /></button></div>}
  </div>
}

export default function AdminPage() {
  const auth = useAuth()
  return auth.ready && auth.isAdmin ? <AdminWorkspace /> : <LoginPage />
}
