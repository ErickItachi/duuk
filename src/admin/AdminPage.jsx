import { dirtyForms, useUnsavedChanges } from './unsavedChanges'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useContent } from '../content/useContent'
import { useAuth } from '../content/AuthContext'
import LoginPage from './LoginPage'
import BrandLoader from '../components/BrandLoader'
import { youtubeId } from '../content/youtube'
import { validMediaUrl, MEDIA_PREFIX } from '../content/model'
import { getImageSources } from '../media'
import { ConfirmModal, Icon, MediaField, Modal } from './components'
import { Avatar } from './forms'
import { PwaProvider, AboutAdminPage, UpdateNotice } from './Pwa'
import { currentRelease } from './pwaState'
import { NotificationProvider, NotificationBell, NotificationsPage, NotificationSettingsPage } from './Notifications'
import { UsersPage, PermissionsPage, ProfilePage, AuditPage } from './TeamPages'
import IntegrationsPage from './IntegrationsPage'
import DrivePage from './DrivePage'
import AppLogo from './AppLogo'
import TeamPresence from './TeamPresence'
import { AdminThemeProvider, ThemeToggle } from './AdminTheme'
import { useAdminTheme } from './themeContext.mjs'
import CommercialPage from '../crm/CommercialPages'
import MessageTemplatesPage from '../crm/WhatsAppMessages'
import MailPage from '../mail/MailPage'
import ProjectEditor from './ProjectEditor'
import DashboardPage from '../office/DashboardPage'
import ContractsPage, { ContractEditor } from '../office/ContractsPage'
import ExpensesPage from '../office/ExpensesPage'
import InsightsPage from '../office/InsightsPage'
import AgendaPage from '../office/AgendaPage'
import './admin.css'
import '../office/office.css'
import '../office/calendar.css'
import './platform.css'
import './ai-entry.css'
import './theme.css'
const AiPage = lazy(() => import('../ai/AiPage'))
const aiLoading = <p className="platform-muted" role="status">Abrindo DUUK AI…</p>

const statusLabels = { published: 'Visível', draft: 'Rascunho', archived: 'Arquivado' }
const sections = [
  { to: '/admin', label: 'Visão geral', icon: 'grid' },
  { to: '/admin/comercial', label: 'Dashboard comercial', icon: 'chart', permission: 'crm.dashboard', group: 'Comercial' },
  { to: '/admin/comercial/clientes', label: 'Clientes e leads', icon: 'users', permission: 'crm.clients', group: 'Comercial' },
  { to: '/admin/comercial/pipeline', label: 'Pipeline', icon: 'pipeline', permission: 'crm.pipeline', group: 'Comercial' },
  { to: '/admin/comercial/contatos', label: 'Contatos e atividades', icon: 'activity', permission: 'crm.activities', group: 'Comercial' },
  { to: '/admin/comercial/modelos', label: 'Modelos de mensagens', icon: 'message', permission: 'crm.activities', group: 'Comercial' },
  { to: '/admin/comercial/follow-ups', label: 'Follow-ups', icon: 'clock', permission: 'crm.followups', group: 'Comercial' },
  { to: '/admin/comercial/emails', label: 'E-mails', icon: 'mail', permission: 'mail', group: 'Comercial' },
  { to: '/admin/comercial/relatorios', label: 'Relatórios', icon: 'chart', permission: 'crm.reports', group: 'Comercial' },
  { to: '/admin/contratos', label: 'Contratos', icon: 'document', permission: 'contracts' },
  { to: '/admin/agenda', label: 'Agenda', icon: 'calendar', permission: 'agenda' },
  { to: '/admin/financeiro', label: 'Financeiro', icon: 'wallet', permission: 'finance' },
  { to: '/admin/insights', label: 'Insights', icon: 'chart', permission: 'insights' },
  { to: '/admin/portfolio', label: 'Portfólio', icon: 'film', permission: 'site', group: 'Site DUUK' },
  { to: '/admin/inicio', label: 'Página inicial', icon: 'home', permission: 'site', group: 'Site DUUK' },
  { to: '/admin/midias', label: 'Biblioteca', icon: 'media', permission: 'site', group: 'Site DUUK' },
  { to: '/admin/configuracoes/usuarios', label: 'Usuários', icon: 'users', permission: 'team', group: 'Configurações' },
  { to: '/admin/configuracoes/grupos', label: 'Grupos de acesso', icon: 'shield', permission: 'permissions', group: 'Configurações' },
  { to: '/admin/configuracoes/permissoes', label: 'Permissões individuais', icon: 'lock', permission: 'permissions', group: 'Configurações' },
  { to: '/admin/configuracoes/notificacoes', label: 'Preferências de notificações', icon: 'bell', group: 'Configurações' },
  { to: '/admin/configuracoes/integracoes', label: 'Integrações', icon: 'link', group: 'Configurações' },
  { to: '/admin/configuracoes/historico', label: 'Histórico de alterações', icon: 'activity', permission: 'audit', group: 'Configurações' },
  { to: '/admin/configuracoes/sobre', label: 'Sobre o DUUK Admin', icon: 'info', group: 'Configurações' },
  { to: '/admin/configuracoes/perfil', label: 'Meu perfil', icon: 'user', group: 'Configurações' },
  { to: '/admin/ai', label: 'DUUK AI', icon: 'spark', permission: 'ai' },
  { to: '/admin/drive', label: 'Google Drive', icon: 'drive', permission: 'drive', last: true },
]

function ProjectList({ notify }) {
  const [params]=useSearchParams(),requestedProject=params.get('projeto'),openedProject=useRef('')
  const { draft, saveDraft, urls, ready } = useContent()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [busy, setBusy] = useState(false)
  const all = draft.projects
  useEffect(()=>{const project=all.find(item=>item.id===requestedProject);if(!project||openedProject.current===requestedProject)return;const timer=setTimeout(()=>{openedProject.current=requestedProject;setEditing(project)},0);return()=>clearTimeout(timer)},[all,requestedProject])
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
  useUnsavedChanges(dirty || busy || uploading > 0)
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

function Allowed({ permission, children }) {
 const auth=useAuth()
 return auth.hasPermission(permission)?children:<section className="admin-panel admin-empty"><Icon name="lock" size={32}/><h1>Acesso restrito.</h1><p>Sua conta não tem permissão para abrir este módulo.</p><Link className="admin-button admin-button--secondary" to="/admin">Voltar à visão geral</Link></section>
}

function AdminWorkspace() {
 const {pathname}=useLocation(),auth=useAuth(),navigate=useNavigate()
 const [destination,setDestination]=useState(null)
 const [aiOpen,setAiOpen]=useState(false),[aiDirty,setAiDirty]=useState(false),[aiDiscard,setAiDiscard]=useState(false)
 const closeAi=()=>{if(aiDirty)setAiDiscard(true);else setAiOpen(false)}
 const [menuOpen,setMenuOpen]=useState(false),[narrow,setNarrow]=useState(()=>matchMedia('(max-width: 1023px)').matches)
 const sidebarKey=`duuk-sidebar-collapsed:${auth.user.id}`
 const [collapsed,setCollapsed]=useState(()=>{try{return localStorage.getItem(sidebarKey)==='true'||localStorage.getItem(sidebarKey)===null&&localStorage.getItem('duuk-sidebar-collapsed')==='true'}catch{return false}})
 const [groups,setGroups]=useState({'Comercial':true})
 const sidebar=useRef(null),menuButton=useRef(null)
 const toggleSidebar=()=>setCollapsed(previous=>{const next=!previous;try{localStorage.setItem(sidebarKey,String(next))}catch{}return next})
 const section=[...sections].reverse().find(item=>pathname===item.to||item.to!=='/admin'&&pathname.startsWith(item.to+'/'))||sections[0]
 const editingSite=['/admin/portfolio','/admin/inicio','/admin/midias'].includes(pathname)
 const {ready,error,refresh}=useContent()
 const [toast,setToast]=useState(null)
 const notify=(message,failed=false)=>setToast({message,failed})
 useEffect(()=>{if(!toast)return;const timer=setTimeout(()=>setToast(null),7000);return()=>clearTimeout(timer)},[toast])
 useEffect(()=>{const media=matchMedia('(max-width: 1023px)');const resize=()=>{setNarrow(media.matches);if(!media.matches)setMenuOpen(false)};media.addEventListener('change',resize);return()=>media.removeEventListener('change',resize)},[])
 useEffect(()=>{if(!menuOpen||!narrow)return;const previous=document.body.style.overflow,opener=menuButton.current;document.body.style.overflow='hidden';const target=sidebar.current;target.querySelector('button')?.focus();const trap=e=>{if(e.key==='Escape'){e.preventDefault();setMenuOpen(false)}if(e.key==='Tab'){const focusable=Array.from(target.querySelectorAll('a[href],button:not([disabled]),input,select')).filter(el=>el.getClientRects().length);const first=focusable[0],last=focusable.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}};target.addEventListener('keydown',trap);return()=>{document.body.style.overflow=previous;target.removeEventListener('keydown',trap);opener?.focus()}},[menuOpen,narrow])
 const navItem=item=><NavLink key={item.to} to={item.to} end={item.to==='/admin'||item.to==='/admin/comercial'} title={item.label} aria-label={item.label} onClick={()=>setMenuOpen(false)}>{item.icon==='drive'?<AppLogo app="drive" size={18}/>:<Icon name={item.icon}/>}<span>{item.label}</span></NavLink>
 const visible=sections.filter(item=>auth.hasPermission(item.permission))
 const navGroup=(name,icon)=>{const items=visible.filter(i=>i.group===name);if(!items.length)return null;const active=items.some(i=>pathname===i.to||pathname.startsWith(i.to+'/'));const open=(groups[name]??active)||collapsed&&!narrow;return <div className="admin-nav-group" key={name}><button className={active?'is-active':''} aria-expanded={open} title={name} onClick={()=>setGroups(old=>({...old,[name]:!open}))}><Icon name={icon}/><span>{name}</span><Icon name={open?'up':'down'} size={14}/></button>{open&&<div className="admin-nav-group__items">{items.map(navItem)}</div>}</div>}
 const guarded=(key,element)=><Allowed permission={key}>{element}</Allowed>
 const guardNavigation=event=>{const anchor=event.target.closest('a[href]');if(event.defaultPrevented||!dirtyForms.size||!anchor||anchor.target==='_blank'||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||event.button!==0)return;const url=new URL(anchor.href,location.origin);if(url.origin===location.origin&&url.pathname+url.search!==location.pathname+location.search){event.preventDefault();setDestination(url.pathname+url.search)}}
 return <div className={`admin-shell${collapsed?' is-collapsed':''}`} onClickCapture={guardNavigation}>
  {menuOpen&&narrow&&<button type="button" className="admin-menu-overlay" onClick={()=>setMenuOpen(false)} aria-label="Fechar menu" tabIndex={-1}/>}
  <aside ref={sidebar} className={`admin-sidebar${menuOpen?' is-open':''}`} role={narrow?'dialog':undefined} aria-modal={narrow&&menuOpen?true:undefined} aria-label="Menu DUUK Admin" aria-hidden={narrow&&!menuOpen?true:undefined} inert={narrow&&!menuOpen?true:undefined}>
   <div className="admin-sidebar__drawer-head"><button className="admin-icon-button" aria-label="Fechar menu" onClick={()=>setMenuOpen(false)}><Icon name="close"/></button></div>
   <div className="admin-sidebar__head"><Link className="admin-brand" to="/admin" onClick={()=>setMenuOpen(false)} aria-label="DUUK — visão geral"><img src="/media/duuk-logo-white.png" width="52" height="64" alt="DUUK"/><span>ADMIN<small>O espaço da equipe.</small></span></Link></div>
   <div className="admin-sidebar__control"><span>NAVEGAÇÃO</span><ThemeToggle label/><button className="admin-collapse-toggle" aria-expanded={!collapsed} aria-controls="admin-navigation" aria-label={collapsed?'Expandir menu':'Minimizar menu'} title={collapsed?'Expandir menu':'Minimizar menu'} onClick={toggleSidebar}><Icon name={collapsed?"sidebarOpen":"sidebar"} size={17}/></button></div>
   <div id="admin-navigation" className="admin-sidebar__menu"><nav aria-label="Painel administrativo">{visible.filter(i=>!i.group&&!i.last).map(navItem)}{navGroup('Comercial','briefcase')}{navGroup('Site DUUK','film')}{navGroup('Configurações','settings')}{visible.filter(i=>i.last).map(navItem)}</nav><div className="admin-sidebar__bottom"><Link className="admin-sidebar-profile" to="/admin/configuracoes/perfil" onClick={()=>setMenuOpen(false)}><Avatar profile={auth.profile} online={auth.isOnline(auth.user.id)}/><span><strong>{auth.profile.name}</strong><small>{auth.profile.is_super_admin?'Super administrador':auth.profile.role_name}</small></span></Link><button className="admin-reset" aria-label="Sair da conta" title="Sair da conta" onClick={()=>auth.signOut().catch(cause=>notify(cause.message,true))}><Icon name="logout"/><span>Sair da conta</span></button><span className="admin-sidebar__signature">DUUK® / {currentRelease.version}</span></div></div>
  </aside>
  <div className="admin-workspace" inert={narrow&&menuOpen?true:undefined}>
   <header className="admin-topbar"><div className="admin-topbar__identity"><button ref={menuButton} className="admin-mobile-toggle admin-icon-button" aria-label="Abrir menu" aria-controls="admin-navigation" aria-expanded={menuOpen} onClick={()=>setMenuOpen(true)}><Icon name="menu" size={22}/></button><img className="admin-header-logo" src="/media/duuk-logo-white.png" width="24" height="30" alt="DUUK"/><div className="admin-environment"><span className="admin-topbar-label">DUUK ADMIN</span><span className="admin-topbar-divider">/</span><span className="admin-topbar-note">{pathname==='/admin/notificacoes'?'Notificações':section.label}</span></div></div><div className="admin-topbar__actions"><ThemeToggle/><TeamPresence/><Link to="/" target="_blank" className="admin-view-site">Ver site<Icon name="arrow" size={16}/></Link><NotificationBell/><Link to="/admin/configuracoes/perfil" aria-label="Meu perfil" title={auth.profile.name}><Avatar profile={auth.profile} size={34} online={auth.isOnline(auth.user.id)}/></Link></div></header>
   <UpdateNotice/>
   {editingSite&&<div className="admin-demo-banner"><span className="admin-demo-tag"><Icon name="check" size={12}/>AO VIVO</span><p>Ao salvar, as alterações são aplicadas ao site público. Projetos em rascunho continuam privados.</p></div>}
   <main className="admin-main"><div className="admin-content-enter" key={pathname}>
    {error&&editingSite&&<div className="admin-error" role="alert">{error} <button className="admin-text-button" onClick={()=>refresh().catch(()=>{})}>Tentar novamente</button></div>}
    {!ready&&editingSite?<div className="admin-empty"><p>Carregando seu conteúdo…</p></div>:<Routes>
     <Route index element={<DashboardPage/>}/>
     <Route path="ai" element={guarded('ai',<Suspense fallback={aiLoading}><AiPage notify={notify}/></Suspense>)}/>
     <Route path="drive" element={guarded('drive',<DrivePage notify={notify}/>)}/>
     <Route path="portfolio" element={guarded('site',<ProjectList notify={notify}/>)}/><Route path="inicio" element={guarded('site',<HomeEditor notify={notify}/>)}/><Route path="midias" element={guarded('site',<MediaLibrary notify={notify}/>)}/>
     <Route path="contratos" element={guarded('contracts',<ContractsPage notify={notify}/>)}/><Route path="contratos/:id" element={guarded('contracts',<ContractEditor notify={notify}/>)}/><Route path="agenda" element={guarded('agenda',<AgendaPage notify={notify}/>)}/><Route path="financeiro" element={guarded('finance',<ExpensesPage notify={notify}/>)}/><Route path="despesas" element={guarded('finance',<ExpensesPage notify={notify}/>)}/><Route path="insights" element={guarded('insights',<InsightsPage/>)}/>
     {[[undefined,'dashboard'],['clientes','clients'],['pipeline','pipeline'],['contatos','activities'],['follow-ups','followups'],['relatorios','reports']].map(([path,mode])=><Route key={mode} path={path?`comercial/${path}`:'comercial'} element={guarded(({dashboard:'crm.dashboard',clients:'crm.clients',pipeline:'crm.pipeline',activities:'crm.activities',followups:'crm.followups',reports:'crm.reports'})[mode],<CommercialPage mode={mode} notify={notify}/>)}/>)}
     <Route path="comercial/emails" element={guarded('mail',<MailPage notify={notify}/>)}/>
     <Route path="comercial/modelos" element={guarded('crm.activities',<MessageTemplatesPage notify={notify}/>)}/>
     <Route path="configuracoes/usuarios" element={guarded('team',<UsersPage notify={notify}/>)}/><Route path="configuracoes/grupos" element={guarded('permissions',<PermissionsPage notify={notify}/>)}/><Route path="configuracoes/permissoes" element={guarded('permissions',<PermissionsPage mode="users" notify={notify}/>)}/><Route path="configuracoes/perfil" element={<ProfilePage notify={notify}/>}/><Route path="configuracoes/integracoes" element={<IntegrationsPage notify={notify}/>}/><Route path="configuracoes/historico" element={guarded('audit',<AuditPage/>)}/><Route path="configuracoes/notificacoes" element={<NotificationSettingsPage notify={notify}/>}/><Route path="configuracoes/sobre" element={<AboutAdminPage/>}/><Route path="notificacoes" element={<NotificationsPage notify={notify}/>}/><Route path="*" element={<Navigate to="/admin" replace/>}/>
    </Routes>}
   </div></main><footer className="admin-footer"><span>DUUK / SÃO PAULO</span><span>Seu estúdio. Seu ritmo.</span><Link to="/admin/configuracoes/sobre">v{currentRelease.version}</Link></footer>
  </div>
  {auth.hasPermission('ai')&&pathname!=='/admin/ai'&&<button type="button" className="duuk-ai-help admin-button admin-button--secondary" aria-label="Ajuda com DUUK AI" title="Ajuda com DUUK AI" onClick={()=>setAiOpen(true)}><Icon name="spark"/><span>DUUK AI</span></button>}
  {aiOpen&&auth.hasPermission('ai')&&<Modal title="DUUK AI" subtitle="AJUDA / CRIAÇÃO" wide onClose={closeAi}><Suspense fallback={aiLoading}><AiPage embedded context={pathname} notify={notify} onDirtyChange={setAiDirty} onClose={closeAi}/></Suspense></Modal>}
  {aiDiscard&&<ConfirmModal title="Fechar DUUK AI?" message="Há um texto ainda não enviado ou uma resposta em andamento. O histórico já salvo será preservado." action="Fechar" onConfirm={async()=>{setAiOpen(false);setAiDiscard(false);setAiDirty(false)}} onClose={()=>setAiDiscard(false)}/>}
  {destination&&<ConfirmModal title="Sair sem salvar?" message="Existem alterações pendentes nesta página. Salve antes de continuar ou descarte ao sair." action="Sair sem salvar" onClose={()=>setDestination(null)} onConfirm={()=>navigate(destination)}/>}
  {toast&&<div className={`admin-toast${toast.failed?' admin-toast--error':''}`} role={toast.failed?'alert':'status'}><Icon name={toast.failed?'close':'check'}/><span>{toast.message}</span><button className="admin-icon-button" aria-label="Fechar aviso" onClick={()=>setToast(null)}><Icon name="close" size={16}/></button></div>}
 </div>
}
function AdminExperience() {
 const {theme:colorTheme}=useAdminTheme()
 const auth=useAuth(),[minimum,setMinimum]=useState(false),[covered,setCovered]=useState(true)
 useEffect(()=>{const timer=setTimeout(()=>setMinimum(true),900);return()=>clearTimeout(timer)},[])
 const leaving=minimum&&auth.ready
 useEffect(()=>{if(!leaving)return;const timer=setTimeout(()=>setCovered(false),matchMedia('(prefers-reduced-motion: reduce)').matches?0:360);return()=>clearTimeout(timer)},[leaving])
 useEffect(()=>{
  document.title='DUUK Admin'
  const existing=Array.from(document.querySelectorAll('link[rel="icon"],link[rel="apple-touch-icon"],link[rel="manifest"]'))
  const publicIcons=existing.filter(node=>!node.href.includes('/admin-assets/'))
  existing.forEach(node=>node.remove())
  const tags=[['icon','/admin-assets/favicon.ico'],['icon','/admin-assets/icon-32.png'],['apple-touch-icon','/admin-assets/icon-180.png'],['manifest','/admin-assets/manifest.webmanifest']].map(([rel,href])=>{const link=document.createElement('link');link.rel=rel;link.href=href;if(href.endsWith('.png'))link.type='image/png';document.head.append(link);return link})
  const publicTheme=Array.from(document.querySelectorAll('meta[name="theme-color"]'));publicTheme.forEach(node=>node.remove())
  const theme=document.createElement('meta');theme.name='theme-color';theme.content='#080808';theme.dataset.duukAdminThemeMeta='';document.head.append(theme)
  return()=>{tags.forEach(tag=>tag.remove());theme.remove();publicTheme.forEach(node=>document.head.append(node));if(publicIcons.length)publicIcons.forEach(node=>document.head.append(node));else{const link=document.createElement('link');link.rel='icon';link.type='image/png';link.href='/favicon.png';document.head.append(link)}}
 },[])
 useEffect(()=>{const meta=document.querySelector('meta[data-duuk-admin-theme-meta]');if(meta)meta.content=colorTheme==='light'?'#f6f3ef':'#080808'},[colorTheme])
 return <>
  {auth.ready&&<div className="admin-experience" inert={covered} aria-hidden={covered||undefined}>{auth.isAdmin?<NotificationProvider><AdminWorkspace/></NotificationProvider>:<><div className="admin-theme-login"><ThemeToggle/></div><LoginPage/></>}</div>}
  {covered&&<BrandLoader leaving={leaving}/>}
 </>
}
export default function AdminPage() {return <AdminThemeProvider><PwaProvider><AdminExperience/></PwaProvider></AdminThemeProvider>}
