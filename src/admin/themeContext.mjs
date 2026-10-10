import { createContext, useContext } from 'react'

export const AdminThemeContext = createContext(null)

export function useAdminTheme() {
  const theme = useContext(AdminThemeContext)
  if (!theme) throw new Error('O tema do Admin precisa do AdminThemeProvider.')
  return theme
}
