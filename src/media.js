import media from './data/media.generated.json'

const mediaKey = (src) => src?.split('?')[0]

export function getImageSources(src) {
  const image = media.images[mediaKey(src)]
  return image ? { src: image.src, srcSet: image.srcSet } : { src }
}

export function getVideoSource(src, variant = 'desktop') {
  const video = media.videos[mediaKey(src)]
  return video?.[variant] || video?.ambient || src
}

export function preferMobileVideo() {
  return window.matchMedia('(max-width: 800px), (pointer: coarse)').matches ||
    navigator.connection?.saveData === true
}
