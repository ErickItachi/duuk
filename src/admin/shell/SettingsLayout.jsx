import { NavLink, Outlet } from 'react-router-dom'
import { Icon } from '../components'

// Settings share one frame: a section list beside the page on wide screens, scrollable tabs on phones.
export default function SettingsLayout({ items }) {
  return <div className="ds-settings">
    <nav className="ds-settings__nav" aria-label="Seções das configurações">
      <p className="ds-settings__title">Configurações</p>
      <ul>{items.map(item => <li key={item.to}><NavLink to={item.to} className="ds-settings__link"><Icon name={item.icon} size={16} /><span>{item.label}</span></NavLink></li>)}</ul>
    </nav>
    <div className="ds-settings__content"><Outlet /></div>
  </div>
}
