import { createContext, useContext } from 'react'
export const SpotifyContext=createContext(null)
export const useSpotify=()=>useContext(SpotifyContext)
