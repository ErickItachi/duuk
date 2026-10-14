// Publishing rules shared by the DUUK Admin (validation before saving) and the duuk-social
// Edge Function (validation before sending). Limits follow the official Instagram Platform
// reference for content publishing; Instagram remains the final judge of every request.

export const captionLimits = Object.freeze({ length: 2200, hashtags: 30, mentions: 20 })
export const altTextLimit = 1000
export const imageLimits = Object.freeze({ bytes: 8 * 1024 * 1024, minRatio: 4 / 5, maxRatio: 1.91, maxWidth: 1440 })
// Supabase Storage on the free plan accepts files up to 50 MB.
export const uploadLimitBytes = 50 * 1024 * 1024

export const socialFormats = Object.freeze({
  image: { label: 'Foto', min: 1, max: 1, kinds: ['image'], caption: true, altText: true },
  carousel: { label: 'Carrossel', min: 2, max: 10, kinds: ['image', 'video'], caption: true, altText: true },
  reel: { label: 'Reel', min: 1, max: 1, kinds: ['video'], caption: true, altText: false },
  story: { label: 'Story', min: 1, max: 1, kinds: ['image', 'video'], caption: false, altText: false },
})

const hashtag = /(^|[^\p{L}\p{N}_&#])#[\p{L}\p{N}_]+/gu
const mention = /(^|[^\p{L}\p{N}_@.])@[\p{L}\p{N}_.]+/gu

export function captionStats(caption) {
  const text = String(caption ?? '')
  return { length: Array.from(text).length, hashtags: (text.match(hashtag) || []).length, mentions: (text.match(mention) || []).length }
}

const seconds = value => Math.round(value / 100) / 10
const sentence = (prefix, text) => prefix ? prefix + text : text.charAt(0).toUpperCase() + text.slice(1)

function videoRules(format) {
  if (format === 'story') return { min: 3000, max: 60000, label: 'Stories em vídeo precisam ter entre 3 e 60 segundos.' }
  return { min: 3000, max: 15 * 60000, label: format === 'reel' ? 'Reels precisam ter entre 3 segundos e 15 minutos.' : 'Vídeos do carrossel precisam ter entre 3 segundos e 15 minutos.' }
}

// Returns a list of { field, message } in Portuguese; an empty list means the post can be saved.
// media: [{ kind, mime_type, size_bytes, width, height, duration_ms, alt_text }]
export function validatePost({ format, caption = '', media = [], scheduledAt = null, now = Date.now(), schedule = false } = {}) {
  const errors = []
  const rules = socialFormats[format]
  if (!rules) return [{ field: 'format', message: 'Escolha o formato da publicação.' }]
  const count = media.length
  if (count < rules.min || count > rules.max) {
    errors.push({ field: 'media', message: rules.max === 1 ? `${rules.label} precisa de exatamente 1 mídia.` : `Carrossel precisa de 2 a 10 mídias (agora: ${count}).` })
  }
  media.forEach((item, index) => {
    const name = count > 1 ? `Mídia ${index + 1}: ` : ''
    if (!rules.kinds.includes(item.kind)) {
      errors.push({ field: `media.${index}`, message: sentence(name, `${format === 'reel' ? 'Reels aceitam somente vídeo.' : format === 'image' ? 'Foto aceita somente imagem.' : 'Tipo de arquivo não aceito neste formato.'}`) })
      return
    }
    if (item.kind === 'image') {
      if (item.mime_type && item.mime_type !== 'image/jpeg') errors.push({ field: `media.${index}`, message: sentence(name, `o Instagram aceita imagens somente em JPEG.`) })
      if (item.size_bytes > imageLimits.bytes) errors.push({ field: `media.${index}`, message: sentence(name, `a imagem passa de 8 MB.`) })
      if (format !== 'story' && item.width > 0 && item.height > 0) {
        const ratio = item.width / item.height
        if (ratio < imageLimits.minRatio - 0.005 || ratio > imageLimits.maxRatio + 0.005) errors.push({ field: `media.${index}`, message: sentence(name, `a proporção precisa ficar entre 4:5 (vertical) e 1,91:1 (horizontal). Recorte a imagem.`) })
      }
    }
    if (item.kind === 'video') {
      if (item.mime_type && !['video/mp4', 'video/quicktime'].includes(item.mime_type)) errors.push({ field: `media.${index}`, message: sentence(name, `use vídeo MP4 ou MOV.`) })
      const limits = videoRules(format)
      if (Number.isFinite(item.duration_ms) && item.duration_ms > 0 && (item.duration_ms < limits.min || item.duration_ms > limits.max)) errors.push({ field: `media.${index}`, message: sentence(name, `${limits.label} Este tem ${seconds(item.duration_ms)} s.`) })
      if (item.size_bytes > (format === 'story' ? 100 : 300) * 1024 * 1024) errors.push({ field: `media.${index}`, message: sentence(name, `o vídeo passa do tamanho aceito pelo Instagram.`) })
    }
    if (item.alt_text && String(item.alt_text).length > altTextLimit) errors.push({ field: `media.${index}.alt`, message: sentence(name, `o texto alternativo pode ter até ${altTextLimit} caracteres.`) })
    if (item.alt_text && (!rules.altText || item.kind !== 'image')) errors.push({ field: `media.${index}.alt`, message: sentence(name, `texto alternativo vale somente para imagens de foto ou carrossel.`) })
  })
  const stats = captionStats(caption)
  if (!rules.caption && stats.length) errors.push({ field: 'caption', message: 'Stories publicados pela API não aceitam legenda.' })
  if (stats.length > captionLimits.length) errors.push({ field: 'caption', message: `A legenda passa de ${captionLimits.length} caracteres.` })
  if (stats.hashtags > captionLimits.hashtags) errors.push({ field: 'caption', message: `Use até ${captionLimits.hashtags} hashtags (agora: ${stats.hashtags}).` })
  if (stats.mentions > captionLimits.mentions) errors.push({ field: 'caption', message: `Use até ${captionLimits.mentions} menções (agora: ${stats.mentions}).` })
  if (schedule) {
    const when = scheduledAt ? new Date(scheduledAt).getTime() : NaN
    if (!Number.isFinite(when)) errors.push({ field: 'scheduled_at', message: 'Escolha a data e o horário.' })
    else if (when < now + 60000) errors.push({ field: 'scheduled_at', message: 'Escolha um horário pelo menos 1 minuto à frente.' })
    else if (when > now + 365 * 86400000) errors.push({ field: 'scheduled_at', message: 'Agende com até 1 ano de antecedência.' })
  }
  return errors
}

// Crop box for an image so it fits the accepted feed proportions (or 9:16 for Stories).
export function cropBox(width, height, ratio, focusX = 0.5, focusY = 0.5) {
  if (!(width > 0 && height > 0 && ratio > 0)) return null
  let cropWidth = width, cropHeight = Math.round(width / ratio)
  if (cropHeight > height) { cropHeight = height; cropWidth = Math.round(height * ratio) }
  const clamp = (value, max) => Math.min(Math.max(0, Math.round(value)), Math.max(0, max))
  return { x: clamp((width - cropWidth) * focusX, width - cropWidth), y: clamp((height - cropHeight) * focusY, height - cropHeight), width: cropWidth, height: cropHeight }
}

export const cropRatios = Object.freeze([
  { id: '1:1', label: 'Quadrado 1:1', value: 1 },
  { id: '4:5', label: 'Vertical 4:5', value: 4 / 5 },
  { id: '1.91:1', label: 'Horizontal 1,91:1', value: 1.91 },
  { id: '9:16', label: 'Story 9:16', value: 9 / 16 },
])
