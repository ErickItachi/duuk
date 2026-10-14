import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../admin/components'
import { EmptyState } from '../admin/forms'
import { accountStates, formatIcons, formatLabels, statusIcons, statusLabels, statusTones } from './model'

export function StatusBadge({ status }) {
  return <span className={`ds-badge ds-badge--${statusTones[status] || 'neutral'}`}><Icon name={statusIcons[status] || 'info'} size={13} />{statusLabels[status] || status}</span>
}

export function FormatTag({ format }) {
  return <span className="social-format"><Icon name={formatIcons[format] || 'media'} size={14} />{formatLabels[format] || format}</span>
}

export function AccountState({ account }) {
  const state = accountStates[account.status] || accountStates.error
  return <span className={`ds-badge ds-badge--${state.tone}`}><Icon name={state.icon} size={13} />{state.label}</span>
}

export function AccountAvatar({ account, size = 40 }) {
  const [broken, setBroken] = useState(false)
  const initial = String(account?.username || '?').charAt(0).toUpperCase()
  return <span className="social-avatar" style={{ width: size, height: size }} aria-hidden="true">
    {account?.profile_picture_url && !broken ? <img src={account.profile_picture_url} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} /> : <span>{initial}</span>}
  </span>
}

export function Thumb({ item, url, label = '', className = '' }) {
  return <span className={`social-thumb${className ? ` ${className}` : ''}`}>
    {url ? <img src={url} alt={label} loading="lazy" decoding="async" /> : <Icon name={item?.kind === 'video' ? 'film' : 'media'} size={22} />}
    {item?.kind === 'video' && <span className="social-thumb__badge"><Icon name="play" size={12} />Vídeo</span>}
  </span>
}

export function NotConnected({ status, title = 'Conecte o Instagram da DUUK', children }) {
  return <div className="admin-panel">
    <EmptyState icon="instagram" title={title} action={<Link className="admin-button" to="/admin/social/conexao"><Icon name="plug" />{status?.can_configure ? 'Configurar conexão' : 'Ver conexão'}</Link>}>
      {children || (status?.can_configure ? 'Cadastre o app do Instagram e autorize a conta pelo Login do Instagram. Nenhum dado é exibido antes disso.' : 'A super administração precisa conectar a conta do Instagram. Nenhum dado é exibido antes disso.')}
    </EmptyState>
  </div>
}

export function Metric({ label, value, note, icon }) {
  const unavailable = value === null || value === undefined
  return <div className="ds-kpi social-metric">
    <span className="ds-kpi__label">{icon && <Icon name={icon} size={14} />}{label}</span>
    <strong className={`ds-kpi__value${unavailable ? ' is-unavailable' : ''}`}>{unavailable ? 'Indisponível' : value}</strong>
    {note && <small className="ds-kpi__note">{note}</small>}
  </div>
}
