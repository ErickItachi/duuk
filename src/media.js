import media from './data/media.generated.json'

const mediaKey = (src) => src?.split('?')[0]

export function getImageSources(src) {
  const image = media.images[mediaKey(src)]
  return image ? { src: image.src, srcSet: image.srcSet } : { src }
}

// Always the high-quality file: phones, previews and slow connections get the same 1080p video.
const HIGH_QUALITY = { mobile: 'desktop', preview: 'desktop', lightweight: 'ambient' }

export function getVideoSource(src, variant = 'desktop') {
  const video = media.videos[mediaKey(src)]
  const key = HIGH_QUALITY[variant] || variant
  return video?.[key] || video?.desktop || video?.ambient || src
}

export function getAdaptiveVideoSource() {
  // adaptive streaming would step down to lower renditions; keep the full-quality file instead
  return undefined
}

export function getAmbientFallback(src) {
  return getVideoSource(src, 'ambient')
}

export function preferMobileVideo() {
  return false
}
