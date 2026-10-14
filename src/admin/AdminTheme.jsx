import { useEffect, useLayoutEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import { useAuth } from '../content/AuthContext'
import { adminThemeKey, readAdminTheme, resolveAdminTheme, writeAdminTheme } from './themeStorage.mjs'
import { AdminThemeContext, useAdminTheme } from './themeContext.mjs'
import { Icon } from './components'

const storage = () => { try { return window.localStorage } catch { return null } }
const lightQuery = () => { try { return window.matchMedia('(prefers-color-scheme: light)') } catch { return null } }
const reducedMotion = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return true } }

export function AdminThemeProvider({ children }) {
  const { user } = useAuth()
  const userId = user?.id || null
  const key = adminThemeKey(userId)
  const [selection, setSelection] = useState(() => ({ key, preference: readAdminTheme(storage(), userId) }))
  const [prefersLight, setPrefersLight] = useState(() => !!lightQuery()?.matches)
  // A session change uses that account's preference immediately, before effects run.
  const preference = selection.key === key ? selection.preference : readAdminTheme(storage(), userId)
  const theme = resolveAdminTheme(preference, prefersLight)

  const change = next => {
    const root = document.documentElement
    const apply = () => flushSync(() => setSelection({ key, preference: writeAdminTheme(storage(), userId, next) }))
    // Transitions pause for one frame so cards, menus and charts switch together.
    root.classList.add('ds-theme-switching')
    if (document.startViewTransition && !reducedMotion()) document.startViewTransition(apply)
    else apply()
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('ds-theme-switching')))
  }

  useEffect(() => {
    const sync = event => {
      if (event.key === key || event.key === null) setSelection({ key, preference: readAdminTheme(storage(), userId) })
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [key, userId])

  useEffect(() => {
    const query = lightQuery()
    if (!query) return
    const update = () => setPrefersLight(query.matches)
    query.addEventListener?.('change', update)
    return () => query.removeEventListener?.('change', update)
  }, [])

  useLayoutEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-duuk-admin-theme', theme)
    // Leaving the admin (for the public site) removes the scope entirely.
    return () => root.removeAttribute('data-duuk-admin-theme')
  }, [theme])

  // The start screen script reads this before React loads, so the next visit opens in the right theme.
  useEffect(() => {
    if (!userId) return
    try { window.localStorage.setItem('duuk-admin-theme:last', preference) } catch { /* Optional. */ }
  }, [preference, userId])

  return <AdminThemeContext value={{ theme, preference, change }}>{children}</AdminThemeContext>
}

// Icon-only switch: the sun and moon trade places; the accessible name carries the meaning.
export function ThemeToggle({ className = '' }) {
  const { theme, change } = useAdminTheme()
  const light = theme === 'light'
  return <button type="button" role="switch" aria-checked={light} className={`ds-theme-toggle admin-icon-button ${className}`.trim()} onClick={() => change(light ? 'dark' : 'light')} aria-label="Modo claro" title={light ? 'Ativar modo escuro' : 'Ativar modo claro'}>
    <span className="ds-theme-toggle__icon ds-theme-toggle__sun" aria-hidden="true"><Icon name="sun" size={18} /></span>
    <span className="ds-theme-toggle__icon ds-theme-toggle__moon" aria-hidden="true"><Icon name="moon" size={17} /></span>
  </button>
}

const options = [['light', 'Claro', 'sun'], ['dark', 'Escuro', 'moon'], ['system', 'Sistema', 'monitor']]
export function ThemeSelector({ compact = false }) {
  const { preference, change } = useAdminTheme()
  return <div className={`ds-segmented ds-theme-selector${compact ? ' is-compact' : ''}`} role="radiogroup" aria-label="Aparência">
    {options.map(([value, label, icon]) => <button key={value} type="button" role="radio" aria-checked={preference === value} onClick={() => change(value)} title={value === 'system' ? 'Seguir o tema do aparelho' : `Modo ${label.toLowerCase()}`}><Icon name={icon} size={15} /><span>{label}</span></button>)}
  </div>
}
