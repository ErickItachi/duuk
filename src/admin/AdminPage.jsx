// Design system first, so module styles refine it and the shell styles (imported last) keep the frame consistent.
import './ds/tokens.css'
import './ds/base.css'
import './ds/components.css'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { dirtyForms } from './unsavedChanges'
import { useContent } from '../content/useContent'
import { useAuth } from '../content/AuthContext'
import LoginPage from './LoginPage'
import { ConfirmModal, Icon } from './components'
import { LoadingPanel } from './forms'
import { PwaProvider, AboutAdminPage, UpdateNotice } from './Pwa'
import { currentRelease } from './pwaState'
import { NotificationProvider, NotificationsPage, NotificationSettingsPage } from './Notifications'
import { UsersPage, PermissionsPage, ProfilePage, AuditPage } from './TeamPages'
import IntegrationsPage from './IntegrationsPage'
import DrivePage from './DrivePage'
import { AdminThemeProvider } from './AdminTheme'
import { useAdminTheme } from './themeContext.mjs'
import { AiFloatingDialog, AiFloatingLauncher } from './AiFloating'
import CommercialPage from '../crm/CommercialPages'
import MessageTemplatesPage from '../crm/WhatsAppMessages'
import MailPage from '../mail/MailPage'
import DashboardPage from '../office/DashboardPage'
import ContractsPage, { ContractEditor } from '../office/ContractsPage'
import ExpensesPage from '../office/ExpensesPage'
import FinancePage from '../finance/FinancePage'
import InsightsPage from '../office/InsightsPage'
import AgendaPage from '../office/AgendaPage'
import { HomeEditor, MediaLibrary, ProjectList } from './SitePages'
import AdminLoader from './shell/AdminLoader'
import Sidebar from './shell/Sidebar'
import Topbar from './shell/Topbar'
import { BottomNav, NavDrawer } from './shell/MobileNav'
import CommandPalette, { ShortcutsDialog } from './shell/CommandPalette'
import SettingsLayout from './shell/SettingsLayout'
import { ToastRegion } from './shell/Toasts'
import { useMediaQuery, useShortcuts, useToasts } from './shell/hooks'
import { locate, mobileDestinations, visibleGroups, visibleSettings } from './shell/navigation'
import './admin.css'
import '../office/office.css'
import '../office/calendar.css'
import './settings.css'
import './ai-entry.css'
import './shell/shell.css'
const AiPage = lazy(() => import('../ai/AiPage'))
const aiLoading = <LoadingPanel label="Abrindo DUUK AI…" />

const sitePages = ['/admin/portfolio', '/admin/inicio', '/admin/midias']
const storage = {
  read(key, fallback) { try { const value = localStorage.getItem(key); return value === null ? fallback : JSON.parse(value) } catch { return fallback } },
  write(key, value) { try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* The preference only lasts for this visit. */ } },
}

// Shortcuts and actions in the command palette open the module's own forms, so nothing here writes data.
const createActions = [
  { id: 'new-event', label: 'Novo compromisso', icon: 'calendarClock', to: '/admin/agenda?novo=compromisso', permission: 'agenda', keywords: 'agenda evento reuniao' },
  { id: 'new-lead', label: 'Novo cliente ou lead', icon: 'userPlus', to: '/admin/comercial/clientes?novo=lead', permission: 'crm.clients', keywords: 'crm comercial contato' },
  { id: 'new-mail', label: 'Escrever e-mail', icon: 'compose', to: '/admin/comercial/emails?compor=1', permission: 'mail', keywords: 'email mensagem titan' },
  { id: 'new-contract', label: 'Novo contrato', icon: 'document', to: '/admin/contratos?novo=contrato', permission: 'contracts', keywords: 'pdf assinatura' },
  { id: 'new-income', label: 'Nova receita', icon: 'incoming', to: '/admin/financeiro?aba=contas&novo=receita', permission: 'finance', keywords: 'financeiro entrada recebimento' },
  { id: 'new-expense', label: 'Nova despesa', icon: 'outgoing', to: '/admin/financeiro?aba=contas&novo=despesa', permission: 'finance', keywords: 'financeiro saida pagamento conta' },
  { id: 'new-project', label: 'Novo projeto no portfólio', icon: 'film', to: '/admin/portfolio?novo=projeto', permission: 'site', keywords: 'site filme' },
  { id: 'ask-ai', label: 'Perguntar ao DUUK AI', icon: 'spark', to: '/admin/ai', permission: 'ai', keywords: 'ia assistente gemini' },
]

function Allowed({ permission, children }) {
  const auth = useAuth()
  return auth.hasPermission(permission) ? children : <section className="admin-panel admin-empty ds-restricted"><Icon name="lock" size={20} /><h1>Acesso restrito</h1><p>Sua conta não tem permissão para abrir este módulo. Peça acesso a um administrador.</p><Link className="admin-button admin-button--secondary" to="/admin">Voltar à visão geral</Link></section>
}

function AdminWorkspace() {
  const { pathname } = useLocation(), auth = useAuth(), navigate = useNavigate(), themeState = useAdminTheme()
  const { toasts, notify, remove, hold, resume } = useToasts()
  const desktop = useMediaQuery('(min-width: 1200px)'), phone = useMediaQuery('(max-width: 767px)')
  const collapseKey = `duuk-sidebar-collapsed:${auth.user.id}`, foldKey = `duuk-nav-folded:${auth.user.id}`
  const [collapsed, setCollapsed] = useState(() => storage.read(collapseKey, storage.read('duuk-sidebar-collapsed', false)) === true)
  const [folded, setFolded] = useState(() => { const value = storage.read(foldKey, {}); return value && typeof value === 'object' ? value : {} })
  const [menuOpen, setMenuOpen] = useState(false), [palette, setPalette] = useState(false), [help, setHelp] = useState(false)
  const [destination, setDestination] = useState(null)
  const [aiOpen, setAiOpen] = useState(false), [aiDirty, setAiDirty] = useState(false), [aiDiscard, setAiDiscard] = useState(false)
  const main = useRef(null), focusMain = useRef(false), firstPath = useRef(pathname)
  const rail = !phone && (!desktop || collapsed)
  const { ready, error, refresh } = useContent()
  const editingSite = sitePages.includes(pathname)
  const place = locate(pathname)

  const groups = useMemo(() => visibleGroups(auth.hasPermission), [auth.hasPermission])
  const settings = useMemo(() => visibleSettings(auth.hasPermission), [auth.hasPermission])
  const destinations = useMemo(() => mobileDestinations(auth.hasPermission), [auth.hasPermission])
  const shortcutItems = useMemo(() => groups.flatMap(group => group.items).filter(item => item.shortcut), [groups])

  // Every programmatic navigation respects forms with unsaved changes, like links do.
  const go = useCallback(to => {
    if (`${window.location.pathname}${window.location.search}` === to) return
    if (dirtyForms.size) setDestination(to)
    else { focusMain.current = true; navigate(to) }
  }, [navigate])
  const toggleCollapse = useCallback(() => setCollapsed(previous => { storage.write(collapseKey, !previous); return !previous }), [collapseKey])
  const toggleGroup = useCallback(id => setFolded(previous => { const next = { ...previous, [id]: !previous[id] }; storage.write(foldKey, next); return next }), [foldKey])
  const closeAi = () => { if (aiDirty) setAiDiscard(true); else setAiOpen(false) }

  const sequences = useMemo(() => Object.fromEntries(shortcutItems.map(item => [item.shortcut, () => go(item.to)])), [shortcutItems, go])
  useShortcuts({ sequences, onPalette: () => { setMenuOpen(false); setPalette(open => !open) }, onHelp: () => setHelp(true), onToggleSidebar: desktop ? toggleCollapse : null })

  useEffect(() => { document.title = `${place.label} · DUUK Admin` }, [place.label])
  useEffect(() => {
    if (pathname === firstPath.current) return
    firstPath.current = pathname
    window.scrollTo({ top: 0 })
    if (focusMain.current) { focusMain.current = false; main.current?.focus({ preventScroll: true }) }
  }, [pathname])
  useEffect(() => {
    const wide = window.matchMedia('(min-width: 1200px)')
    const close = () => { if (wide.matches) setMenuOpen(false) }
    wide.addEventListener('change', close)
    return () => wide.removeEventListener('change', close)
  }, [])

  const paletteSections = useMemo(() => {
    const pages = [...groups.flatMap(group => group.items.map(item => ({ id: item.to, label: item.label, hint: group.id === 'main' ? '' : group.label, nav: item, to: item.to, shortcut: item.shortcut }))), ...settings.map(item => ({ id: item.to, label: item.label, hint: 'Configurações', icon: item.icon, to: item.to, searchOnly: true })), { id: '/admin/notificacoes', label: 'Central de notificações', hint: 'Notificações', icon: 'bell', to: '/admin/notificacoes', searchOnly: true }]
    if (auth.hasPermission('finance')) pages.push({ id: '/admin/despesas', label: 'Despesas (tela anterior)', hint: 'Gestão', icon: 'wallet', to: '/admin/despesas', searchOnly: true })
    const actions = createActions.filter(item => auth.hasPermission(item.permission))
    const preferences = [
      ...[['light', 'Usar modo claro', 'sun'], ['dark', 'Usar modo escuro', 'moon'], ['system', 'Seguir o tema do aparelho', 'monitor']].filter(([value]) => value !== themeState.preference).map(([value, label, icon]) => ({ id: `theme-${value}`, label, icon, hint: 'Aparência', keywords: 'tema aparencia cor', run: () => themeState.change(value) })),
      ...(desktop ? [{ id: 'sidebar', label: collapsed ? 'Expandir o menu lateral' : 'Minimizar o menu lateral', icon: collapsed ? 'sidebarOpen' : 'sidebar', hint: 'Menu', shortcut: '[', run: toggleCollapse }] : []),
      { id: 'shortcuts', label: 'Atalhos de teclado', icon: 'keyboard', hint: 'Ajuda', shortcut: '?', run: () => setHelp(true) },
      { id: 'site', label: 'Abrir o site da DUUK', icon: 'external', hint: 'Nova aba', keywords: 'publico', run: () => window.open('/', '_blank', 'noopener') },
      { id: 'logout', label: 'Sair da conta', icon: 'logout', hint: 'Conta', searchOnly: true, run: () => auth.signOut().catch(cause => notify(cause.message, true)) },
    ]
    return [{ id: 'actions', label: 'Ações rápidas', items: actions }, { id: 'pages', label: 'Ir para', items: pages }, { id: 'preferences', label: 'Preferências', items: preferences }]
  }, [groups, settings, auth, themeState, desktop, collapsed, toggleCollapse, notify])
  const runCommand = item => { setPalette(false); if (item.to) go(item.to); else item.run?.() }

  const guarded = (key, element) => <Allowed permission={key}>{element}</Allowed>
  const guardNavigation = event => {
    const anchor = event.target.closest('a[href]')
    if (event.defaultPrevented || !dirtyForms.size || !anchor || anchor.target === '_blank' || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
    const url = new URL(anchor.href, window.location.origin)
    if (url.origin === window.location.origin && url.pathname + url.search !== window.location.pathname + window.location.search) { event.preventDefault(); setDestination(url.pathname + url.search) }
  }
  const navigated = () => { focusMain.current = true; setMenuOpen(false) }
  const contentKey = pathname.startsWith('/admin/configuracoes') ? '/admin/configuracoes' : pathname

  return <div className={`admin-shell ds-app${rail ? ' is-rail' : ''}${collapsed && desktop ? ' is-collapsed' : ''}`} onClickCapture={guardNavigation}>
    <a className="ds-skip-link" href="#admin-main">Pular para o conteúdo</a>
    <Sidebar groups={groups} rail={rail} canCollapse={desktop} onToggleCollapse={toggleCollapse} folded={folded} onToggleGroup={toggleGroup} onSearch={() => setPalette(true)} onNavigate={navigated} />
    <div className="ds-frame">
      <Topbar location={place} onMenu={() => setMenuOpen(true)} onSearch={() => setPalette(true)} onShortcuts={phone ? null : () => setHelp(true)} notify={notify} />
      <main id="admin-main" ref={main} tabIndex={-1} className="admin-main">
        <UpdateNotice />
        {editingSite && <div className="ds-alert ds-alert--info ds-live-banner" role="note"><Icon name="globe" /><p><strong>Site ao vivo.</strong> Ao salvar, as alterações vão para o site público. Projetos em rascunho continuam privados.</p></div>}
        <div className="admin-content-enter" key={contentKey}>
          {error && editingSite && <div className="admin-error" role="alert">{error} <button className="admin-text-button" onClick={() => refresh().catch(() => {})}>Tentar novamente</button></div>}
          {!ready && editingSite ? <LoadingPanel label="Carregando o conteúdo do site…" /> : <Routes>
            <Route index element={<DashboardPage />} />
            <Route path="ai" element={guarded('ai', <Suspense fallback={aiLoading}><AiPage notify={notify} /></Suspense>)} />
            <Route path="drive" element={guarded('drive', <DrivePage notify={notify} />)} />
            <Route path="portfolio" element={guarded('site', <ProjectList notify={notify} />)} />
            <Route path="inicio" element={guarded('site', <HomeEditor notify={notify} />)} />
            <Route path="midias" element={guarded('site', <MediaLibrary notify={notify} />)} />
            <Route path="contratos" element={guarded('contracts', <ContractsPage notify={notify} />)} />
            <Route path="contratos/:id" element={guarded('contracts', <ContractEditor notify={notify} />)} />
            <Route path="agenda" element={guarded('agenda', <AgendaPage notify={notify} />)} />
            <Route path="financeiro" element={guarded('finance', <FinancePage notify={notify} />)} />
            <Route path="despesas" element={guarded('finance', <ExpensesPage notify={notify} />)} />
            <Route path="insights" element={guarded('insights', <InsightsPage />)} />
            {[[undefined, 'dashboard'], ['clientes', 'clients'], ['pipeline', 'pipeline'], ['contatos', 'activities'], ['follow-ups', 'followups'], ['relatorios', 'reports']].map(([path, mode]) => <Route key={mode} path={path ? `comercial/${path}` : 'comercial'} element={guarded(({ dashboard: 'crm.dashboard', clients: 'crm.clients', pipeline: 'crm.pipeline', activities: 'crm.activities', followups: 'crm.followups', reports: 'crm.reports' })[mode], <CommercialPage mode={mode} notify={notify} />)} />)}
            <Route path="comercial/emails" element={guarded('mail', <MailPage notify={notify} />)} />
            <Route path="comercial/modelos" element={guarded('crm.activities', <MessageTemplatesPage notify={notify} />)} />
            <Route path="configuracoes" element={<SettingsLayout items={settings} />}>
              <Route index element={<Navigate to="perfil" replace />} />
              <Route path="usuarios" element={guarded('team', <UsersPage notify={notify} />)} />
              <Route path="grupos" element={guarded('permissions', <PermissionsPage notify={notify} />)} />
              <Route path="permissoes" element={guarded('permissions', <PermissionsPage mode="users" notify={notify} />)} />
              <Route path="perfil" element={<ProfilePage notify={notify} />} />
              <Route path="integracoes" element={<IntegrationsPage notify={notify} />} />
              <Route path="historico" element={guarded('audit', <AuditPage />)} />
              <Route path="notificacoes" element={<NotificationSettingsPage notify={notify} />} />
              <Route path="sobre" element={<AboutAdminPage />} />
              <Route path="*" element={<Navigate to="perfil" replace />} />
            </Route>
            <Route path="notificacoes" element={<NotificationsPage notify={notify} />} />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Routes>}
        </div>
      </main>
      <footer className="admin-footer ds-footer"><span>DUUK Admin</span><Link to="/admin/configuracoes/sobre">Versão {currentRelease.version}</Link></footer>
    </div>
    <BottomNav items={destinations} menuOpen={menuOpen} onMenu={() => setMenuOpen(true)} />
    <NavDrawer open={menuOpen} onClose={() => setMenuOpen(false)} groups={groups} folded={folded} onToggleGroup={toggleGroup} notify={notify} />
    {palette && <CommandPalette sections={paletteSections} canSearchClients={auth.hasPermission('crm.clients')} onRun={runCommand} onClose={() => setPalette(false)} />}
    {help && <ShortcutsDialog navigation={shortcutItems} canCollapse={desktop} onClose={() => setHelp(false)} />}
    {auth.hasPermission('ai') && pathname !== '/admin/ai' && <AiFloatingLauncher userId={auth.user.id} onOpen={() => setAiOpen(true)} />}
    {aiOpen && auth.hasPermission('ai') && <AiFloatingDialog userId={auth.user.id} onClose={closeAi}><Suspense fallback={aiLoading}><AiPage embedded context={pathname} notify={notify} onDirtyChange={setAiDirty} onClose={closeAi} /></Suspense></AiFloatingDialog>}
    {aiDiscard && <ConfirmModal title="Fechar DUUK AI?" message="Há um texto ainda não enviado ou uma resposta em andamento. O histórico já salvo será preservado." action="Fechar" onConfirm={async () => { setAiOpen(false); setAiDiscard(false); setAiDirty(false) }} onClose={() => setAiDiscard(false)} />}
    {destination && <ConfirmModal title="Sair sem salvar?" message="Existem alterações pendentes nesta página. Salve antes de continuar ou descarte ao sair." action="Sair sem salvar" tone="danger" onClose={() => setDestination(null)} onConfirm={() => { focusMain.current = true; navigate(destination) }} />}
    <ToastRegion toasts={toasts} remove={remove} hold={hold} resume={resume} />
  </div>
}

const reducedMotion = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return true } }

function AdminExperience() {
  const { theme } = useAdminTheme()
  const auth = useAuth()
  // The start screen only covers real work (module, session and permission checks); it fades as soon as access is known.
  const [covered, setCovered] = useState(true)
  useEffect(() => {
    if (!auth.ready) return
    const timer = setTimeout(() => setCovered(false), reducedMotion() ? 0 : 280)
    return () => clearTimeout(timer)
  }, [auth.ready])
  useEffect(() => {
    document.title = 'DUUK Admin'
    const existing = Array.from(document.querySelectorAll('link[rel="icon"],link[rel="apple-touch-icon"],link[rel="manifest"]'))
    const publicIcons = existing.filter(node => !node.href.includes('/admin-assets/'))
    existing.forEach(node => node.remove())
    const tags = [['icon', '/admin-assets/favicon.ico'], ['icon', '/admin-assets/icon-32.png'], ['apple-touch-icon', '/admin-assets/icon-180.png'], ['manifest', '/admin-assets/manifest.webmanifest']].map(([rel, href]) => { const link = document.createElement('link'); link.rel = rel; link.href = href; if (href.endsWith('.png')) link.type = 'image/png'; document.head.append(link); return link })
    const publicTheme = Array.from(document.querySelectorAll('meta[name="theme-color"]')); publicTheme.forEach(node => node.remove())
    const meta = document.createElement('meta'); meta.name = 'theme-color'; meta.content = '#0a0a0a'; meta.dataset.duukAdminThemeMeta = ''; document.head.append(meta)
    return () => { tags.forEach(tag => tag.remove()); meta.remove(); publicTheme.forEach(node => document.head.append(node)); if (publicIcons.length) publicIcons.forEach(node => document.head.append(node)); else { const link = document.createElement('link'); link.rel = 'icon'; link.type = 'image/png'; link.href = '/favicon.png'; document.head.append(link) } }
  }, [])
  useEffect(() => { const meta = document.querySelector('meta[data-duuk-admin-theme-meta]'); if (meta) meta.content = theme === 'light' ? '#fafafa' : '#0a0a0a' }, [theme])
  return <>
    {auth.ready && <div className="admin-experience">{auth.isAdmin ? <NotificationProvider><AdminWorkspace /></NotificationProvider> : <LoginPage />}</div>}
    {covered && <AdminLoader step={auth.ready ? 'ready' : auth.stage || 'session'} leaving={auth.ready} />}
  </>
}

export default function AdminPage() { return <AdminThemeProvider><PwaProvider><AdminExperience /></PwaProvider></AdminThemeProvider> }
