import { createContext, useContext } from 'react'

export const NotificationContext = createContext(null)

export function useModuleNotifications() {
  const context = useContext(NotificationContext)
  return { modules: context?.modules || {}, refresh: context?.reload }
}
