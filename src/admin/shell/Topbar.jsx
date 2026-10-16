import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../content/AuthContext'
import { Icon } from '../components'
import { Avatar } from '../forms'
import { NotificationBell } from '../Notifications'
import TeamPresence from '../TeamPresence'
import { ThemeSelector, ThemeToggle } from '../AdminTheme'
import { currentRelease } from '../pwaState'
import { roleLabel } from './hooks'

export function ProfileMenu({ onShortcuts, notify }) {
  const auth = useAuth()
  const [open, setOpen] = useState(false)
  const box = useRef(null), trigger = useRef(null)
  useEffect(() => {
    if (!open) return
    const panel = box.current?.querySelector('.ds-profile__panel')
    panel?.querySelector('a, button')?.focus()
    const pointer = event => { if (!box.current?.contains(event.target)) setOpen(false) }
    const key = event => {
      if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); trigger.current?.focus() }
      if (event.key === 'Tab' && panel) {
        const items = [...panel.querySelectorAll('a[href], button:not([disabled])')]
        if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1)?.focus() }
        else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0]?.focus() }
      }
    }
    document.addEventListener('pointerdown', pointer)
    panel?.addEventListener('keydown', key)
    return () => { document.removeEventListener('pointerdown', pointer); panel?.removeEventListener('keydown', key) }
  }, [open])
  const close = () => setOpen(false)
  const signOut = () => { close(); auth.signOut().catch(cause => notify(cause.message, true)) }
  return <div className="ds-profile" ref={box}>
    <button ref={trigger} type="button" className="ds-profile__trigger" aria-haspopup="dialog" aria-expanded={open} aria-label={`Sua conta: ${auth.profile.name}`} onClick={() => setOpen(value => !value)}>
      <Avatar profile={auth.profile} size={30} online={auth.isOnline(auth.user.id)} />
    </button>
    {open && <div className="ds-profile__panel ds-menu admin-popover" role="dialog" aria-label="Sua conta">
      <div className="ds-profile__who"><Avatar profile={auth.profile} size={36} /><div><strong>{auth.profile.name}</strong><small>{roleLabel(auth.profile)}</small></div></div>
      <div className="ds-menu__separator" />
      <Link className="ds-menu__item" to="/admin/configuracoes/perfil" onClick={close}><Icon name="user" />Meu perfil</Link>
      <Link className="ds-menu__item" to="/admin/configuracoes/notificacoes" onClick={close}><Icon name="bell" />Preferências de notificação</Link>
      <Link className="ds-menu__item" to="/admin/configuracoes/integracoes" onClick={close}><Icon name="link" />Integrações</Link>
      <div className="ds-menu__separator" />
      <div className="ds-profile__theme"><span>Aparência</span><ThemeSelector compact /></div>
      <div className="ds-menu__separator" />
      {onShortcuts && <button type="button" className="ds-menu__item ds-profile__shortcuts" onClick={() => { close(); onShortcuts() }}><Icon name="keyboard" />Atalhos de teclado<small><kbd className="ds-kbd">?</kbd></small></button>}
      <Link className="ds-menu__item" to="/admin/configuracoes/sobre" onClick={close}><Icon name="info" />Sobre o DUUK PAINEL ADMINISTRATIVO<small>{currentRelease.version}</small></Link>
      <a className="ds-menu__item ds-profile__site" href="/" target="_blank" rel="noopener" onClick={close}><Icon name="external" />Ver site da DUUK</a>
      <div className="ds-menu__separator" />
      <button type="button" className="ds-menu__item ds-menu__item--danger" onClick={signOut}><Icon name="logout" />Sair da conta</button>
    </div>}
  </div>
}

export default function Topbar({ location, onMenu, onSearch, onShortcuts, notify }) {
  return <header className="ds-topbar admin-topbar">
    <button type="button" className="admin-icon-button ds-topbar__menu" onClick={onMenu} aria-label="Abrir menu" aria-haspopup="dialog"><Icon name="menu" size={20} /></button>
    <Link className="ds-topbar__brand" to="/admin" aria-label="DUUK PAINEL ADMINISTRATIVO, visão geral"><img src="/media/duuk-logo-white.png" width="718" height="886" alt="" /></Link>
    <nav className="ds-breadcrumb" aria-label="Você está em">
      <ol>
        {location.groupLabel && <li className="ds-breadcrumb__group">{location.parent ? <Link to={location.parent}>{location.groupLabel}</Link> : <span>{location.groupLabel}</span>}<Icon name="right" size={14} aria-hidden="true" /></li>}
        <li aria-current="page"><span>{location.label}</span></li>
      </ol>
    </nav>
    <div className="ds-topbar__actions">
      <button type="button" className="admin-icon-button ds-topbar__search" onClick={onSearch} aria-label="Buscar"><Icon name="search" /></button>
      <TeamPresence />
      <a className="ds-topbar__site" href="/" target="_blank" rel="noopener">Ver site<Icon name="external" size={14} /></a>
      <NotificationBell />
      <ThemeToggle className="ds-topbar__theme" />
      <ProfileMenu onShortcuts={onShortcuts} notify={notify} />
    </div>
  </header>
}
