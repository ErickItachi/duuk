// Single source for the admin navigation: sidebar, mobile bar, breadcrumbs and command palette.
// Every module keeps its route and permission; groups only organize them.
export const navGroups = [
  { id: 'main', label: 'Principal', items: [
    { to: '/admin', label: 'Visão geral', icon: 'grid', end: true, shortcut: 'g d' },
    { to: '/admin/agenda', label: 'Agenda', icon: 'calendar', permission: 'agenda', shortcut: 'g a' },
    { to: '/admin/ai', label: 'DUUK AI', icon: 'spark', permission: 'ai', shortcut: 'g i' },
  ] },
  { id: 'commercial', label: 'Comercial', items: [
    { to: '/admin/comercial', label: 'Painel comercial', short: 'Comercial', icon: 'chart', permission: 'crm.dashboard', end: true, shortcut: 'g c' },
    { to: '/admin/comercial/clientes', label: 'Clientes e leads', short: 'Clientes', icon: 'users', permission: 'crm.clients' },
    { to: '/admin/comercial/pipeline', label: 'Pipeline', icon: 'pipeline', permission: 'crm.pipeline' },
    { to: '/admin/comercial/contatos', label: 'Contatos e atividades', short: 'Contatos', icon: 'activity', permission: 'crm.activities' },
    { to: '/admin/comercial/follow-ups', label: 'Follow-ups', icon: 'clock', permission: 'crm.followups' },
    { to: '/admin/comercial/emails', label: 'E-mails', icon: 'mail', permission: 'mail', shortcut: 'g e' },
    { to: '/admin/comercial/modelos', label: 'Modelos de mensagens', short: 'Modelos', icon: 'message', permission: 'crm.activities' },
    { to: '/admin/comercial/relatorios', label: 'Relatórios', icon: 'report', permission: 'crm.reports' },
  ] },
  { id: 'management', label: 'Gestão', items: [
    { to: '/admin/contratos', label: 'Contratos', icon: 'document', permission: 'contracts', shortcut: 'g k' },
    { to: '/admin/financeiro', label: 'Financeiro', icon: 'wallet', permission: 'finance', shortcut: 'g f' },
  ] },
  { id: 'content', label: 'Conteúdo', items: [
    { to: '/admin/social', label: 'Social Media', short: 'Social', icon: 'instagram', permission: 'social', shortcut: 'g s' },
    { to: '/admin/portfolio', label: 'Portfólio', icon: 'film', permission: 'site' },
    { to: '/admin/inicio', label: 'Página inicial', icon: 'home', permission: 'site' },
    { to: '/admin/midias', label: 'Mídias do site', icon: 'media', permission: 'site' },
    { to: '/admin/insights', label: 'Insights do site', short: 'Insights', icon: 'trend', permission: 'insights' },
  ] },
  { id: 'music', label: 'Seu espaço', items: [
    { to: '/admin/spotify', label: 'Spotify', icon: 'music' },
  ] },
  // Google Drive stays the last item of the main navigation.
  { id: 'files', label: 'Arquivos', items: [
    { to: '/admin/drive', label: 'Google Drive', icon: 'drive', permission: 'drive', app: 'drive' },
  ] },
]

export const settingsItems = [
  { to: '/admin/configuracoes/perfil', label: 'Meu perfil', icon: 'user' },
  { to: '/admin/configuracoes/seguranca', label: 'Segurança', icon: 'shield' },
  { to: '/admin/configuracoes/notificacoes', label: 'Notificações', icon: 'bell' },
  { to: '/admin/configuracoes/integracoes', label: 'Integrações', icon: 'link' },
  { to: '/admin/configuracoes/usuarios', label: 'Usuários', icon: 'users', permission: 'team' },
  { to: '/admin/configuracoes/grupos', label: 'Grupos de acesso', icon: 'shield', permission: 'permissions' },
  { to: '/admin/configuracoes/permissoes', label: 'Permissões individuais', icon: 'lock', permission: 'permissions' },
  { to: '/admin/configuracoes/historico', label: 'Histórico de alterações', icon: 'history', permission: 'audit' },
  { to: '/admin/configuracoes/sobre', label: 'Sobre o DUUK PAINEL ADMINISTRATIVO', icon: 'info' },
]

const extraRoutes = [
  { to: '/admin/notificacoes', label: 'Notificações', group: 'Central' },
  { to: '/admin/despesas', label: 'Despesas', group: 'Gestão' },
  { to: '/admin/social/publicar', label: 'Publicar', group: 'Social Media' },
  { to: '/admin/social/calendario', label: 'Calendário editorial', group: 'Social Media' },
  { to: '/admin/social/biblioteca', label: 'Biblioteca de conteúdo', group: 'Social Media' },
  { to: '/admin/social/insights', label: 'Insights', group: 'Social Media' },
  { to: '/admin/social/conexao', label: 'Conexão', group: 'Social Media' },
]

export function visibleGroups(hasPermission) {
  return navGroups.map(group => ({ ...group, items: group.items.filter(item => hasPermission(item.permission)) })).filter(group => group.items.length)
}
export const visibleSettings = hasPermission => settingsItems.filter(item => hasPermission(item.permission))

const matches = (pathname, to, end) => pathname === to || (!end && to !== '/admin' && pathname.startsWith(`${to}/`))
export function isActive(pathname, item) { return matches(pathname, item.to, item.end) }

// The deepest matching route names the page in the header and breadcrumb.
export function locate(pathname) {
  const candidates = [
    ...extraRoutes.map(item => ({ ...item, groupLabel: item.group })),
    ...navGroups.flatMap(group => group.items.map(item => ({ ...item, groupLabel: group.id === 'main' ? null : group.label }))),
    ...settingsItems.map(item => ({ ...item, groupLabel: 'Configurações' })),
  ]
  const found = candidates.filter(item => matches(pathname, item.to, false) || pathname === item.to).sort((a, b) => b.to.length - a.to.length)[0]
  if (pathname.startsWith('/admin/contratos/')) return { label: 'Contrato', groupLabel: 'Contratos', parent: '/admin/contratos' }
  return found ? { label: found.label, groupLabel: found.groupLabel } : { label: 'Visão geral', groupLabel: null }
}

// Primary destinations for the phone tab bar, in priority order.
const mobilePriority = ['/admin', '/admin/agenda', '/admin/comercial', '/admin/social', '/admin/financeiro', '/admin/ai', '/admin/contratos', '/admin/comercial/clientes']
export function mobileDestinations(hasPermission, limit = 4) {
  const all = navGroups.flatMap(group => group.items)
  return mobilePriority.map(to => all.find(item => item.to === to)).filter(item => item && hasPermission(item.permission)).slice(0, limit)
}
