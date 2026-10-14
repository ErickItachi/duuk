import { createContext, useContext } from 'react'

export const SocialContext = createContext(null)
export const useSocial = () => useContext(SocialContext)
