import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { initialContent, MEDIA_PREFIX, resolveContent, visibleProjects } from './model'
import { previewEnabled } from './config'
import { ContentContext } from './ContentContext'
import { clearPreview, deleteMedia, readPreview, writeContent, writeMedia } from './previewStore'

const channelName = 'duuk-admin-preview'

function rememberedMode() {
  try { return sessionStorage.getItem('duuk-preview-mode') || 'published' } catch { return 'published' }
}

export function ContentProvider({ children }) {
  const [data, setData] = useState(() => ({ draft: initialContent(), published: initialContent(), media: [], urls: {} }))
  const [ready, setReady] = useState(!previewEnabled)
  const [error, setError] = useState('')
  const mediaUrls = useRef({})
  const channel = useRef(null)
  const location = useLocation()
  const queryMode = new URLSearchParams(location.search).get('preview')
  const viewMode = queryMode === 'draft' || queryMode === 'published' ? queryMode : rememberedMode()

  useEffect(() => {
    if (previewEnabled && (queryMode === 'draft' || queryMode === 'published')) {
      try { sessionStorage.setItem('duuk-preview-mode', queryMode) } catch { /* The URL still selects the preview. */ }
    }
  }, [queryMode])

  const refresh = useCallback(async () => {
    const result = await readPreview()
    const ids = new Set(result.media.map((file) => file.id))
    for (const [id, url] of Object.entries(mediaUrls.current)) {
      if (!ids.has(id)) { URL.revokeObjectURL(url); delete mediaUrls.current[id] }
    }
    for (const file of result.media) {
      if (!mediaUrls.current[file.id]) mediaUrls.current[file.id] = URL.createObjectURL(file.blob)
    }
    setData({ draft: result.draft || initialContent(), published: result.published || initialContent(), media: result.media, urls: { ...mediaUrls.current } })
    setReady(true)
    setError('')
  }, [])

  useEffect(() => {
    if (!previewEnabled) return
    let active = true
    const sync = () => { if (active) refresh().catch((cause) => { if (active) { setError(cause.message); setReady(true) } }) }
    sync()
    if ('BroadcastChannel' in window) {
      channel.current = new BroadcastChannel(channelName)
      channel.current.onmessage = sync
    }
    window.addEventListener('focus', sync)
    return () => {
      active = false
      channel.current?.close()
      channel.current = null
      window.removeEventListener('focus', sync)
    }
  }, [refresh])

  const syncChange = async () => { await refresh(); channel.current?.postMessage('changed') }
  const saveDraft = async (content) => {
    if (!previewEnabled) throw new Error('A edição está disponível apenas no preview.')
    await writeContent('draft', { ...content, updatedAt: new Date().toISOString() })
    await syncChange()
  }
  const publish = async () => {
    if (!previewEnabled) throw new Error('A publicação de teste está disponível apenas no preview.')
    await writeContent('published', data.draft)
    await syncChange()
  }
  const upload = async (file, kind) => {
    const accepted = kind === 'image' ? ['image/jpeg', 'image/png', 'image/webp', 'image/avif'] : ['video/mp4', 'video/webm']
    if (!accepted.includes(file.type)) throw new Error(kind === 'image' ? 'Envie uma imagem JPG, PNG, WebP ou AVIF.' : 'Envie um vídeo MP4 ou WebM.')
    if (file.size > 250 * 1024 * 1024) throw new Error('Na demonstração, cada arquivo pode ter até 250 MB.')
    const { quota = Infinity, usage = 0 } = await navigator.storage?.estimate?.() || {}
    if (file.size > quota - usage) throw new Error('Não há espaço suficiente no navegador para esse arquivo.')
    const id = `${MEDIA_PREFIX}${crypto.randomUUID()}`
    await writeMedia({ id, blob: file, name: file.name, type: file.type, size: file.size, createdAt: new Date().toISOString() })
    await syncChange()
    return id
  }
  const removeMedia = async (id) => {
    if (JSON.stringify([data.draft, data.published]).includes(id)) throw new Error('Esse arquivo está em uso. Troque a mídia do projeto e publique a alteração antes de removê-lo.')
    await deleteMedia(id)
    await syncChange()
  }
  const reset = async () => { await clearPreview(); await syncChange() }
  const selected = previewEnabled ? data[viewMode === 'draft' ? 'draft' : 'published'] : data.published
  const resolved = useMemo(() => resolveContent(selected, data.urls), [selected, data.urls])
  const value = {
    ...data, ready, error, viewMode, saveDraft, publish, upload, removeMedia, reset,
    siteProjects: visibleProjects(resolved, previewEnabled && viewMode === 'draft'),
    siteHero: resolved.heroMedia,
    hasChanges: JSON.stringify(data.draft) !== JSON.stringify(data.published),
  }

  return <ContentContext.Provider value={value}>{children}</ContentContext.Provider>
}
