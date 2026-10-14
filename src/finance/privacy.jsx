import { useState } from 'react'
import { Icon } from '../admin/components'
import { money, Privacy, signedMoney, useFinancePrivacy } from './privacy-state'

// Hiding values is a per-device convenience: it never changes what the server returns.
const key = 'duuk-admin-finance-hidden'
const read = () => { try { return localStorage.getItem(key) === '1' } catch { return false } }

export function FinancePrivacy({ children }) {
 const [hidden, setHidden] = useState(read)
 const toggle = () => setHidden(old => { const next = !old; try { localStorage.setItem(key, next ? '1' : '0') } catch { /* private mode */ } return next })
 return <Privacy.Provider value={{ hidden, toggle }}>{children}</Privacy.Provider>
}

export function Money({ cents, signed = false, tone = false, className = '' }) {
 const { hidden } = useFinancePrivacy()
 const kind = tone && cents ? cents > 0 ? ' is-positive' : ' is-negative' : ''
 if (cents == null) return <span className={`finance-money${className ? ` ${className}` : ''}`}>—</span>
 return <span className={`finance-money${kind}${className ? ` ${className}` : ''}`}>{hidden ? <><span aria-hidden="true">R$ •••••</span><span className="finance-sr-only">Valor oculto</span></> : signed ? signedMoney(cents) : money(cents)}</span>
}

export function PrivacyToggle() {
 const { hidden, toggle } = useFinancePrivacy()
 return <button type="button" className="admin-icon-button finance-eye" aria-pressed={hidden} aria-label={hidden ? 'Mostrar valores' : 'Ocultar valores'} title={hidden ? 'Mostrar valores' : 'Ocultar valores'} onClick={toggle}><Icon name={hidden ? 'eyeOff' : 'eye'} /></button>
}
