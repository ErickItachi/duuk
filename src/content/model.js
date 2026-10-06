import { heroMedia, projects } from '../data/projects.js'

export const MEDIA_PREFIX = 'preview-media:'

export function initialContent() {
  return {
    projects: projects.map((project) => ({ ...structuredClone(project), id: project.slug, status: 'published' })),
    heroMedia: structuredClone(heroMedia),
    updatedAt: null,
  }
}

export function visibleProjects(content, draft = false) {
  return content.projects.filter((project) => draft ? project.status !== 'archived' : project.status === 'published')
}

export function slugify(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export function validMediaUrl(value) {
  if (!value) return true
  if (value.startsWith(MEDIA_PREFIX)) return /^preview-media:[a-z0-9-]+$/.test(value)
  if (value.startsWith('/') && !value.startsWith('//')) return !/[\\\s]/.test(value)
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password
  } catch {
    return false
  }
}

export function validateProject(project, allProjects) {
  if (!project.title.trim()) throw new Error('Informe o título do projeto.')
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(project.slug)) throw new Error('Use letras minúsculas, números e hífens no endereço do projeto.')
  if (allProjects.some((item) => item.id !== project.id && item.slug === project.slug)) throw new Error('Já existe um projeto com esse endereço. Escolha outro.')
  if (project.year && !/^\d{4}$/.test(project.year)) throw new Error('Informe o ano com quatro números.')
  if (![project.poster, project.video].every(validMediaUrl)) throw new Error('Use um arquivo enviado, um caminho do site ou um endereço HTTPS para as mídias.')
  if (project.status === 'published') {
    if (!project.poster) throw new Error('Escolha uma capa antes de tornar o projeto visível.')
    if (project.provider === 'youtube') {
      if (!/^[A-Za-z0-9_-]{11}$/.test(project.videoId || '')) throw new Error('Informe um ID válido de vídeo do YouTube, com 11 caracteres.')
    } else if (!project.video) throw new Error('Escolha um vídeo antes de tornar o projeto visível.')
  }
  return project
}

export function resolveContent(value, urls) {
  if (typeof value === 'string') return value.startsWith(MEDIA_PREFIX) ? urls[value] || '' : value
  if (Array.isArray(value)) return value.map((item) => resolveContent(item, urls))
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveContent(item, urls)]))
  return value
}
