import test from 'node:test'
import assert from 'node:assert/strict'
import { youtubeId, heroVideo } from '../src/content/youtube.js'

test('links reais do YouTube são aceitos sem permitir domínios falsos', () => {
  const id = 'M7lc1UVf-VE'
  for (const value of [id, `https://youtu.be/${id}?si=abc`, `https://www.youtube.com/watch?v=${id}&t=12`, `https://youtube.com/shorts/${id}`, `https://www.youtube-nocookie.com/embed/${id}`]) assert.equal(youtubeId(value), id)
  for (const value of [`https://youtube.com.evil.test/watch?v=${id}`, `https://user:password@youtube.com/watch?v=${id}`, `javascript:alert(1)`, `https://youtube.com/watch?v=invalid`, `https://youtu.be/${id}/extra`]) assert.equal(youtubeId(value), '')
})

test('desktop e celular escolhem vídeos e capas independentes', () => {
  const media = { video: '/desktop.mp4', poster: '/desktop.webp', videoMobile: '', posterMobile: '/mobile.webp', videoMobileProvider: 'youtube', videoMobileId: 'https://youtu.be/M7lc1UVf-VE' }
  assert.equal(heroVideo(media).provider, 'mp4')
  assert.equal(heroVideo(media).video, '/desktop.mp4')
  assert.deepEqual(heroVideo(media, true), { provider: 'youtube', video: '', poster: '/mobile.webp', videoId: 'M7lc1UVf-VE' })
})
