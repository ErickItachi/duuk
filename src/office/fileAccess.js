import { downloadFile } from './model.js'

// iPhone and iPad ignore downloads that start after an await, and the installed
// app has no download manager. There the PDF opens in a new tab, where
// Compartilhar › Salvar em Arquivos keeps it.
export function appleTouch(nav = typeof navigator === 'undefined' ? null : navigator) {
  if (!nav) return false
  return /iP(hone|ad|od)/.test(nav.userAgent || '') || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1)
}

// Supabase Storage answers with Content-Disposition: attachment when `download` is set on a signed URL.
export function attachmentUrl(url, filename) {
  const next = new URL(url)
  next.searchParams.set('download', filename)
  return next.href
}

export function pdfName(title, suffix) {
  const clean = Array.from(String(title || '').normalize('NFC'), char => char.charCodeAt(0) < 32 || '\\/:*?"<>|'.includes(char) ? ' ' : char).join('')
  const base = clean.replace(/\s+/g, ' ').trim().slice(0, 90) || 'contrato'
  return `${base}${suffix ? ` - ${suffix}` : ''}.pdf`
}

// The tab must open inside the tap, before any request, or Safari blocks it.
function blankTab() {
  const tab = window.open('', '_blank')
  if (!tab) throw new Error('Permita abrir uma nova aba para ver o PDF e tente novamente.')
  try { tab.opener = null; tab.document.title = 'Abrindo PDF…'; tab.document.body.style.font = '16px system-ui, sans-serif'; tab.document.body.textContent = 'Abrindo PDF…' } catch { /* the tab still navigates */ }
  return tab
}

function clickLink(href) {
  const link = document.createElement('a')
  link.href = href; link.rel = 'noopener'
  document.body.append(link); link.click(); link.remove()
}

// Opens (or downloads) a private PDF whose short-lived URL comes from the server.
// Returns 'tab' when the file opened in a new tab and 'download' when the browser saved it.
export async function openPdf(getUrl, { download = false, filename = 'documento.pdf' } = {}) {
  const tab = !download || appleTouch() ? blankTab() : null
  try {
    const url = await getUrl()
    if (!url) throw new Error('Não foi possível confirmar o endereço privado deste PDF.')
    if (tab) { tab.location.replace(url); return 'tab' }
    clickLink(attachmentUrl(url, filename))
    return 'download'
  } catch (cause) { tab?.close(); throw cause }
}

// Same idea for a file built in the browser.
export async function saveBlob(makeBlob, filename) {
  const tab = appleTouch() ? blankTab() : null
  try {
    const blob = await makeBlob()
    if (!tab) { downloadFile(blob, filename); return 'download' }
    const url = URL.createObjectURL(blob)
    tab.location.replace(url)
    window.setTimeout(() => URL.revokeObjectURL(url), 120000)
    return 'tab'
  } catch (cause) { tab?.close(); throw cause }
}

export const savedOnTab = 'O PDF abriu em uma nova aba. Para guardar no iPhone, toque em Compartilhar › Salvar em Arquivos.'
