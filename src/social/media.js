// Prepares files in the browser before they reach the private bucket. Instagram accepts JPEG images
// only, so photos are converted (and optionally cropped) here; videos keep their bytes and get a
// poster frame for the library.
import { cropBox, uploadLimitBytes } from './model'

const imageTypes = /^image\/(jpeg|png|webp|avif|heic|heif)$/
const videoTypes = { 'video/mp4': 'mp4', 'video/quicktime': 'mov' }
export const acceptedFiles = 'image/jpeg,image/png,image/webp,image/avif,video/mp4,video/quicktime'

function canvasBlob(canvas, quality = 0.9) {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Não foi possível converter a imagem.')), 'image/jpeg', quality))
}

async function decodeImage(file) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }) } catch { /* fall back to <img> */ }
  }
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.decoding = 'async'
    image.src = url
    await image.decode()
    return image
  } catch { throw new Error('Este formato de imagem não pôde ser lido aqui. Exporte como JPEG e envie novamente.') }
  finally { URL.revokeObjectURL(url) }
}

// ratio: null keeps the original proportion; otherwise crops around the center.
export async function prepareImage(file, ratio = null, maxWidth = 1440) {
  if (!imageTypes.test(file.type)) throw new Error('Envie imagens JPEG, PNG, WebP ou AVIF.')
  const source = await decodeImage(file)
  const width = source.width, height = source.height
  const box = ratio ? cropBox(width, height, ratio) : { x: 0, y: 0, width, height }
  const scale = Math.min(1, maxWidth / box.width)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(box.width * scale); canvas.height = Math.round(box.height * scale)
  const context = canvas.getContext('2d')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(source, box.x, box.y, box.width, box.height, 0, 0, canvas.width, canvas.height)
  source.close?.()
  let blob = await canvasBlob(canvas, 0.9)
  if (blob.size > 8 * 1024 * 1024) blob = await canvasBlob(canvas, 0.78)
  if (blob.size > 8 * 1024 * 1024) throw new Error('A imagem continua acima de 8 MB depois de otimizada. Reduza a resolução e envie novamente.')
  return { file: blob, contentType: 'image/jpeg', extension: 'jpg', meta: { width: canvas.width, height: canvas.height, kind: 'image', size_bytes: blob.size, mime_type: 'image/jpeg' } }
}

export async function prepareVideo(file) {
  const extension = videoTypes[file.type]
  if (!extension) throw new Error('Envie vídeos MP4 ou MOV.')
  if (file.size > uploadLimitBytes) throw new Error('O vídeo passa do limite de 50 MB do armazenamento gratuito. Exporte uma versão mais leve.')
  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.muted = true; video.playsInline = true; video.preload = 'metadata'; video.src = url
  try {
    await new Promise((resolve, reject) => { video.onloadedmetadata = resolve; video.onerror = () => reject(new Error('Não foi possível ler este vídeo no navegador.')) })
    const meta = { width: video.videoWidth || null, height: video.videoHeight || null, duration_ms: Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : null, kind: 'video', size_bytes: file.size, mime_type: file.type }
    let poster = null
    try {
      video.currentTime = Math.min(1, (video.duration || 2) / 2)
      await new Promise((resolve, reject) => { video.onseeked = resolve; setTimeout(() => reject(new Error('timeout')), 4000) })
      const canvas = document.createElement('canvas'), scale = Math.min(1, 720 / (video.videoWidth || 720))
      canvas.width = Math.round((video.videoWidth || 720) * scale); canvas.height = Math.round((video.videoHeight || 1280) * scale)
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
      poster = await canvasBlob(canvas, 0.82)
    } catch { poster = null }
    return { file, contentType: file.type, extension, poster, meta }
  } finally { URL.revokeObjectURL(url) }
}

export const isVideo = file => Boolean(videoTypes[file?.type])
