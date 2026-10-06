import assert from 'node:assert/strict'
import test from 'node:test'
import { initialContent, resolveContent, slugify, validateProject, validMediaUrl, visibleProjects } from '../src/content/model.js'

test('a demonstração copia os projetos sem alterar os dados originais', () => {
  const content = initialContent()
  content.projects[0].description.pt = 'Rascunho de teste'
  assert.notEqual(initialContent().projects[0].description.pt, 'Rascunho de teste')
})

test('o site publicado e a prévia do rascunho respeitam a visibilidade', () => {
  const content = initialContent()
  content.projects[0].status = 'draft'
  content.projects[1].status = 'archived'
  assert.equal(visibleProjects(content).length, content.projects.length - 2)
  assert.equal(visibleProjects(content, true).length, content.projects.length - 1)
})

test('endereços de projetos são únicos e seguros', () => {
  assert.equal(slugify('Uma história / São Paulo!'), 'uma-historia-sao-paulo')
  const content = initialContent()
  const project = { ...content.projects[0], id: 'new-project' }
  assert.throws(() => validateProject(project, content.projects), /Já existe/)
  project.slug = '../outro'
  assert.throws(() => validateProject(project, content.projects), /hífens/)
})

test('a publicação exige capa e vídeo, enquanto o rascunho pode estar incompleto', () => {
  const project = { ...initialContent().projects[0], poster: '', video: '', status: 'draft' }
  assert.doesNotThrow(() => validateProject(project, []))
  project.status = 'published'
  assert.throws(() => validateProject(project, []), /capa/)
  project.poster = '/media/capa.webp'
  assert.throws(() => validateProject(project, []), /vídeo/)
})

test('mídias aceitam HTTPS e rejeitam scripts, URLs sem protocolo e credenciais', () => {
  assert.equal(validMediaUrl('https://example.com/video.mp4'), true)
  assert.equal(validMediaUrl('/media/video.mp4'), true)
  for (const url of ['javascript:alert(1)', 'data:text/html,test', '//example.com/video.mp4', 'https://user:password@example.com/file', '/\\example.com/file']) assert.equal(validMediaUrl(url), false)
})

test('arquivos persistidos são resolvidos em projetos, abertura e filmes extras', () => {
  const file = 'preview-media:test-file'
  const content = { projects: [{ poster: file, films: [{ video: file }] }], heroMedia: { video: file } }
  const resolved = resolveContent(content, { [file]: 'blob:preview' })
  assert.equal(resolved.projects[0].poster, 'blob:preview')
  assert.equal(resolved.projects[0].films[0].video, 'blob:preview')
  assert.equal(resolved.heroMedia.video, 'blob:preview')
  assert.equal(content.projects[0].poster, file)
})
