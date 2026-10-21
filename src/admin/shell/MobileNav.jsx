import { useEffect, useRef } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../../content/AuthContext'
import { Icon } from '../components'
import { Avatar } from '../forms'
import { ThemeSelector } from '../AdminTheme'
import { currentRelease } from '../pwaState'
import { Brand, NavGroups, NavIcon } from './Sidebar'
import { isActive } from './navigation'
import { roleLabel, useVirtualKeyboard } from './hooks'
import { useModuleNotifications } from '../notificationContext.mjs'

// Phone tab bar: the four most used modules the account can open, plus the full menu.
export function BottomNav({ items, menuOpen, onMenu }) {
  const { modules } = useModuleNotifications()
  const moreUnread = Object.keys(modules).some(route => modules[route] > 0 && !items.some(item => item.to === route))
  const { pathname } = useLocation()
  const keyboard = useVirtualKeyboard()
  return <nav className={`ds-bottom-nav${keyboard ? ' is-hidden' : ''}`} aria-label="Atalhos principais" inert={keyboard || undefined}>
    {items.map(item => {
      const active = isActive(pathname, { ...item, end: item.to === '/admin' })
      return <Link key={item.to} to={item.to} className={`ds-bottom-nav__item${active ? ' active' : ''}`} aria-current={active ? 'page' : undefined} aria-label={`${item.label}${modules[item.to] > 0 ? ', há notificações não lidas' : ''}`}>
        <span className="ds-bottom-nav__icon"><NavIcon item={item} size={21} /></span><span className="ds-bottom-nav__label">{item.short || item.label}</span>
      </Link>
    })}
    <button type="button" className="ds-bottom-nav__item" aria-haspopup="dialog" aria-expanded={menuOpen} aria-label={`Menu${moreUnread ? ', há notificações em outros módulos' : ''}`} onClick={onMenu}>
      <span className="ds-bottom-nav__icon"><Icon name="menu" size={21} />{moreUnread && <b className="ds-module-dot" />}</span><span className="ds-bottom-nav__label">Menu</span>
    </button>
  </nav>
}

// Full menu for tablets and phones. A native modal dialog keeps focus inside and closes with Escape.
export function NavDrawer({ open, onClose, groups, folded, onToggleGroup, notify }) {
  const auth = useAuth()
  const { pathname } = useLocation()
  const dialog = useRef(null)
  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (open && !element.open) element.showModal()
    if (!open && element.open) element.close()
  }, [open])
  const settings = pathname.startsWith('/admin/configuracoes')
  return <dialog ref={dialog} className="ds-drawer admin-popover" aria-label="Menu do DUUK PAINEL ADMINISTRATIVO" onCancel={event => { event.preventDefault(); onClose() }} onClose={() => { if (open) onClose() }} onClick={event => { if (event.target === dialog.current) onClose() }}>
    {open && <div className="ds-drawer__panel">
      <div className="ds-drawer__head">
        <Brand onNavigate={onClose} />
        <button type="button" className="admin-icon-button" onClick={onClose} aria-label="Fechar menu"><Icon name="close" /></button>
      </div>
      <Link className="ds-drawer__profile" to="/admin/configuracoes/perfil" onClick={onClose}>
        <Avatar profile={auth.profile} size={36} online={auth.isOnline(auth.user.id)} />
        <span><strong>{auth.profile.name}</strong><small>{roleLabel(auth.profile)}</small></span>
        <Icon name="right" size={16} />
      </Link>
      <nav className="ds-nav ds-drawer__nav" aria-label="Módulos"><NavGroups groups={groups} folded={folded} onToggleGroup={onToggleGroup} onNavigate={onClose} /></nav>
      <div className="ds-drawer__foot">
        <NavLink to="/admin/configuracoes/perfil" className={`ds-nav__item${settings ? ' active' : ''}`} onClick={onClose}><NavIcon item={{ to: '/admin/configuracoes', icon: 'settings' }} /><span>Configurações</span></NavLink>
        <div className="ds-drawer__theme"><span>Aparência</span><ThemeSelector compact /></div>
        <div className="ds-drawer__meta">
          <a href="/" target="_blank" rel="noopener" className="ds-drawer__link"><Icon name="external" size={15} />Ver site</a>
          <button type="button" className="ds-drawer__link ds-drawer__link--danger" onClick={() => { onClose(); auth.signOut().catch(cause => notify(cause.message, true)) }}><Icon name="logout" size={15} />Sair</button>
          <Link to="/admin/configuracoes/sobre" className="ds-drawer__version" onClick={onClose}>v{currentRelease.version}</Link>
        </div>
      </div>
    </div>}
  </dialog>
}
