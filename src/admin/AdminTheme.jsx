import { useEffect, useLayoutEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { useAuth } from '../content/AuthContext'
import { adminThemeKey, readAdminTheme, writeAdminTheme } from './themeStorage.mjs'
import { AdminThemeContext, useAdminTheme } from './themeContext.mjs'

const storage = () => { try { return window.localStorage } catch { return null } }

export function AdminThemeProvider({ children }) {
  const { user } = useAuth()
  const userId = user?.id || null
  const key = adminThemeKey(userId)
  const [selection, setSelection] = useState(() => ({ key, theme: readAdminTheme(storage(), userId) }))
  // A session change uses that account's preference immediately, before effects run.
  const theme = selection.key === key ? selection.theme : readAdminTheme(storage(), userId)
  const change = next => setSelection({ key, theme: writeAdminTheme(storage(), userId, next) })

  useEffect(() => {
    const sync = event => {
      if (event.key === key || event.key === null) setSelection({ key, theme: readAdminTheme(storage(), userId) })
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [key, userId])

  useLayoutEffect(() => {
    const root = document.documentElement
    const previous = root.getAttribute('data-duuk-admin-theme')
    root.setAttribute('data-duuk-admin-theme', theme)
    return () => {
      if (previous === null) root.removeAttribute('data-duuk-admin-theme')
      else root.setAttribute('data-duuk-admin-theme', previous)
    }
  }, [theme])

  return <AdminThemeContext value={{ theme, change }}>{children}</AdminThemeContext>
}

export function ThemeToggle({ label = false }) {
  const { theme, change } = useAdminTheme()
  const light = theme === 'light'
  const title = light ? 'Ativar modo escuro' : 'Ativar modo claro'
  const ThemeIcon = light ? Moon : Sun
  return <button type="button" className={`admin-theme-toggle${label ? ' admin-theme-toggle--label' : ''}`} onClick={() => change(light ? 'dark' : 'light')} aria-label={title} title={title}>
    <ThemeIcon size={18} strokeWidth={1.6} aria-hidden="true" />
    {label && <span>{light ? 'Modo escuro' : 'Modo claro'}</span>}
  </button>
}
