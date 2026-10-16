import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { Icon } from '../components'
import AppLogo from '../AppLogo'
import { currentRelease } from '../pwaState'
import { commandKey } from './hooks'

export function NavIcon({ item, size = 18 }) {
  return item.app ? <AppLogo app={item.app} size={size} /> : <Icon name={item.icon} size={size} />
}

export function Brand({ rail = false, onNavigate }) {
  return <Link className="ds-brand" to="/admin" onClick={onNavigate} aria-label="DUUK PAINEL ADMINISTRATIVO, visão geral" data-ds-tooltip={rail ? 'Visão geral' : undefined}>
    <img src="/media/duuk-logo-white.png" width="718" height="886" alt="" />
    <span>PAINEL<br />ADMINISTRATIVO</span>
  </Link>
}

// Groups can be folded in the full menu; the rail always shows every module the account can open.
export function NavGroups({ groups, rail = false, folded = {}, onToggleGroup, onNavigate }) {
  return groups.map(group => {
    const labelled = group.id !== 'main'
    const open = rail || !labelled || !folded[group.id]
    const listId = `ds-nav-${group.id}${rail ? '-rail' : ''}`
    return <div className="ds-nav__group" key={group.id}>
      {labelled && (rail
        ? <hr className="ds-nav__rule" />
        : <button type="button" className="ds-nav__label" aria-expanded={open} aria-controls={listId} onClick={() => onToggleGroup?.(group.id)}><span>{group.label}</span><Icon name="down" size={14} /></button>)}
      <ul className="ds-nav__items" id={listId} hidden={!open}>
        {group.items.map(item => <li key={item.to}>
          <NavLink to={item.to} end={item.end} className="ds-nav__item" onClick={onNavigate} aria-label={rail ? item.label : undefined} data-ds-tooltip={rail ? item.label : undefined}>
            <NavIcon item={item} /><span>{item.label}</span>
          </NavLink>
        </li>)}
      </ul>
    </div>
  })
}

// One floating label for the icon rail; it follows hover and keyboard focus and never gets clipped by scrolling.
function useRailTooltip(enabled) {
  const aside = useRef(null)
  const [tip, setTip] = useState(null)
  useEffect(() => {
    const element = aside.current
    if (!enabled || !element) return
    let timer = 0
    const show = event => {
      const target = event.target.closest?.('[data-ds-tooltip]')
      clearTimeout(timer)
      if (!target || !element.contains(target)) { setTip(null); return }
      const place = () => { const box = target.getBoundingClientRect(); setTip({ label: target.dataset.dsTooltip, top: box.top + box.height / 2, left: box.right + 10 }) }
      if (event.type === 'focusin') place(); else timer = setTimeout(place, 180)
    }
    const hide = () => { clearTimeout(timer); setTip(null) }
    element.addEventListener('pointerover', show)
    element.addEventListener('focusin', show)
    element.addEventListener('pointerleave', hide)
    element.addEventListener('focusout', hide)
    element.addEventListener('scroll', hide, true)
    element.addEventListener('click', hide)
    return () => { hide(); element.removeEventListener('pointerover', show); element.removeEventListener('focusin', show); element.removeEventListener('pointerleave', hide); element.removeEventListener('focusout', hide); element.removeEventListener('scroll', hide, true); element.removeEventListener('click', hide) }
  }, [enabled])
  return [aside, enabled ? tip : null]
}

export default function Sidebar({ groups, rail, canCollapse, onToggleCollapse, folded, onToggleGroup, onSearch, onNavigate }) {
  const { pathname } = useLocation()
  const settings = pathname.startsWith('/admin/configuracoes')
  const [aside, tip] = useRailTooltip(rail)
  return <aside ref={aside} className={`ds-sidebar${rail ? ' is-rail' : ''}`} aria-label="Menu do DUUK PAINEL ADMINISTRATIVO">
    {tip && <span className="ds-rail-tooltip" role="presentation" style={{ top: tip.top, left: tip.left }}>{tip.label}</span>}
    <div className="ds-sidebar__head">
      <Brand rail={rail} onNavigate={onNavigate} />
      {canCollapse && !rail && <button type="button" className="admin-icon-button ds-sidebar__collapse" onClick={onToggleCollapse} aria-label="Minimizar menu" title="Minimizar menu  [" aria-expanded="true"><Icon name="sidebar" size={17} /></button>}
    </div>
    {canCollapse && rail && <button type="button" className="ds-nav__item ds-sidebar__expand" onClick={onToggleCollapse} aria-label="Expandir menu" aria-expanded="false" data-ds-tooltip="Expandir menu"><Icon name="sidebarOpen" /></button>}
    <button type="button" className="ds-sidebar__search" onClick={onSearch} aria-label={`Buscar, atalho ${commandKey()}`} data-ds-tooltip={rail ? `Buscar  ${commandKey()}` : undefined}>
      <Icon name="search" size={16} /><span>Buscar</span><kbd className="ds-kbd" aria-hidden="true">{commandKey()}</kbd>
    </button>
    <nav className="ds-nav" aria-label="Módulos"><NavGroups groups={groups} rail={rail} folded={folded} onToggleGroup={onToggleGroup} onNavigate={onNavigate} /></nav>
    <div className="ds-sidebar__foot">
      <NavLink to="/admin/configuracoes/perfil" className={`ds-nav__item${settings ? ' active' : ''}`} aria-current={settings ? 'page' : undefined} onClick={onNavigate} aria-label={rail ? 'Configurações' : undefined} data-ds-tooltip={rail ? 'Configurações' : undefined}><Icon name="settings" /><span>Configurações</span></NavLink>
      <Link className="ds-sidebar__version" to="/admin/configuracoes/sobre" onClick={onNavigate} title="Sobre o DUUK PAINEL ADMINISTRATIVO">v{currentRelease.version}</Link>
    </div>
  </aside>
}
