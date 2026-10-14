// Contract PDFs always stay in the private bucket. Never navigate to a URL from
// an unexpected origin, even when it was returned by an API response.
export function privateContractUrl(value, storageOrigin, filename) {
  try {
    const url = new URL(value), origin = new URL(storageOrigin)
    if (url.protocol !== 'https:' || url.origin !== origin.origin || url.username || url.password || url.hash || !url.pathname.startsWith('/storage/v1/object/sign/duuk-documents/') || !url.searchParams.get('token')) return ''
    if (filename) {
      if (!/^[a-zA-Z0-9._-]+\.pdf$/.test(filename)) return ''
      // This is Supabase Storage's native attachment option, also used by
      // createSignedUrl({ download: filename }); it preserves the signed token.
      url.searchParams.set('download', filename)
    }
    return url.href
  } catch { return '' }
}

// Reserve the browsing context during the original tap. Awaiting authorization
// first loses user activation on Safari/iOS and can silently block a download.
export function prepareContractDownload(browser = window) {
  let destination = null, completed = false
  try {
    destination = browser.open('', '_blank')
    if (destination) {
      destination.opener = null
      destination.document.title = 'DUUK · Preparando PDF'
      const referrer = destination.document.createElement('meta')
      referrer.name = 'referrer'; referrer.content = 'no-referrer'
      destination.document.head.append(referrer)
      destination.document.body.textContent = 'Preparando seu PDF privado…'
    }
  } catch { destination?.close(); destination = null }
  return {
    complete(value, storageOrigin, filename) {
      const url = privateContractUrl(value, storageOrigin, filename)
      if (!url) throw new Error('Não foi possível obter um acesso seguro ao PDF. Atualize o documento e tente novamente.')
      // A blocked popup needs another direct tap. Returning the safe link keeps
      // the app and any unsaved contract fields open instead of navigating away.
      if (!destination || destination.closed) return url
      destination.location.replace(url)
      completed = true
      return ''
    },
    cancel() { if (!completed && destination && !destination.closed) destination.close() },
  }
}

export function signingDateTime(value) {
  if (!value || Number.isNaN(new Date(value).getTime())) return '—'
  return `${new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))} (horário de Brasília)`
}
