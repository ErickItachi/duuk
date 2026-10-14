import { useState } from 'react'

// Accent- and case-insensitive text matching for list search fields.
export const normalizeText = value => String(value ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()
export function matchesQuery(query, ...fields) {
  const terms = normalizeText(query).split(/\s+/).filter(Boolean)
  if (!terms.length) return true
  const haystack = fields.flat().map(normalizeText).join(' ')
  return terms.every(term => haystack.includes(term))
}

// Client-side pagination. Changing resetKey (search, filters, month) returns to the first page
// without an effect; the page also clamps when the list shrinks.
export function usePagination(items, { pageSize = 25, resetKey = '' } = {}) {
  const [state, setState] = useState({ page: 1, key: resetKey })
  const total = items?.length || 0
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const page = Math.min(state.key === resetKey ? state.page : 1, pageCount)
  const start = (page - 1) * pageSize
  return {
    page, pageCount, pageSize, total,
    from: total ? start + 1 : 0,
    to: Math.min(total, start + pageSize),
    items: (items || []).slice(start, start + pageSize),
    setPage: next => setState({ page: Math.max(1, Math.min(pageCount, next)), key: resetKey }),
  }
}

// Page buttons with gaps: 1 … 4 5 6 … 12
export function pageList(page, pageCount) {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1)
  const pages = new Set([1, pageCount, page - 1, page, page + 1])
  if (page <= 3) [2, 3, 4].forEach(value => pages.add(value))
  if (page >= pageCount - 2) [pageCount - 3, pageCount - 2, pageCount - 1].forEach(value => pages.add(value))
  const sorted = [...pages].filter(value => value >= 1 && value <= pageCount).sort((a, b) => a - b)
  return sorted.flatMap((value, index) => index && value - sorted[index - 1] > 1 ? ['gap-' + value, value] : [value])
}
