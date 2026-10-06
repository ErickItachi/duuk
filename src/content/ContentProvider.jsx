import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { initialContent, resolveContent, visibleProjects } from './model'
import { adminEnabled } from './config'
import { ContentContext } from './ContentContext'
import { useAuth } from './AuthContext'
import { supabase } from './supabase'
import { readCloud, saveCloudSite, publishCloud, uploadCloud, removeCloudMedia } from './cloudStore'

export function ContentProvider({ children }) {
  const auth = useAuth()
  const [data, setData] = useState(() => ({ draft: initialContent(), published: initialContent(), media: [], urls: {}, version: 1, publishedVersion: 1, scope: 'public' }))
  const [ready, setReady] = useState(!adminEnabled)
  const [error, setError] = useState('')
  const epoch = useRef(0)
  const scope = auth.isAdmin ? auth.user.id : 'public'
  const invalidateRequests = useCallback(() => { epoch.current++ }, [])
  const location = useLocation()
  const queryMode = new URLSearchParams(location.search).get('preview')
  const viewMode = queryMode === 'draft' && auth.isAdmin ? 'draft' : 'published'

  const refresh = useCallback(async () => {
    if (!adminEnabled || !auth.ready) return
    const request = ++epoch.current
    try {
      const result = await readCloud(auth.isAdmin)
      if (request !== epoch.current) return result
      setData({ ...result, scope }); setReady(true); setError(''); return result
    } catch (cause) {
      if (request === epoch.current) { setError(cause.message); setReady(false) }
      throw cause
    }
  }, [auth.ready, auth.isAdmin, scope])

  useEffect(() => {
    if (!adminEnabled || !auth.ready) return
    const sync = () => { refresh().catch(() => {}) }
    sync()
    const subscription = supabase.channel(`duuk-site-${scope}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'duuk_content', filter: 'key=eq.published' }, sync)
      .subscribe((status) => { if (status === 'SUBSCRIBED') sync() })
    const interval = window.setInterval(() => { if (document.visibilityState === 'visible') sync() }, 30000)
    window.addEventListener('focus', sync)
    window.addEventListener('online', sync)
    return () => { invalidateRequests(); supabase.removeChannel(subscription); window.clearInterval(interval); window.removeEventListener('focus', sync); window.removeEventListener('online', sync) }
  }, [refresh, auth.ready, invalidateRequests, scope])

  const checkAdmin = () => { if (!adminEnabled || !auth.isAdmin) throw new Error('Entre no painel para editar o conteúdo.') }
  const saveDraft = async (content, version = data.version) => {
    checkAdmin()
    try { await saveCloudSite(content, version) } catch (cause) { await refresh().catch(() => {}); throw cause }
    return refresh()
  }
  const publish = async () => {
    checkAdmin()
    try { await publishCloud(data.version) } catch (cause) { await refresh().catch(() => {}); throw cause }
    return refresh()
  }
  const upload = async (file, kind, progress) => { checkAdmin(); const ref = await uploadCloud(file, kind, progress); await refresh(); return ref }
  const removeMedia = async (id) => { checkAdmin(); await removeCloudMedia(id); await refresh() }
  const scopedData = data.scope === scope ? data : { ...data, draft: data.published, media: [], urls: {} }
  const selected = viewMode === 'draft' ? scopedData.draft : scopedData.published
  const resolved = useMemo(() => resolveContent(selected, scopedData.urls), [selected, scopedData.urls])
  const value = { ...scopedData, ready: ready && auth.ready && data.scope === scope, error, viewMode, saveDraft, publish, upload, removeMedia, refresh,
    siteProjects: visibleProjects(resolved, viewMode === 'draft'), siteHero: resolved.heroMedia,
    hasChanges: data.version !== data.publishedVersion }
  return <ContentContext.Provider value={value}>{children}</ContentContext.Provider>
}
