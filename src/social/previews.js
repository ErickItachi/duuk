import { useEffect, useState } from 'react'
import { signedUrls } from './api'

// Signed previews for library files. Videos show their poster frame.
export function useSignedUrls(paths) {
  const key = [...new Set(paths.filter(Boolean))].sort().join('|')
  const [state, setState] = useState({ key: '', urls: {} })
  useEffect(() => {
    if (!key) return undefined
    let alive = true
    signedUrls(key.split('|')).then(urls => { if (alive) setState({ key, urls }) }).catch(() => { if (alive) setState({ key, urls: {} }) })
    return () => { alive = false }
  }, [key])
  return state.urls
}
export const previewPath = item => item ? item.kind === 'video' ? item.poster_path : item.storage_path : null
