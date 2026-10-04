import { getImageSources } from '../media'

export default function DeferredImage({ src, eager = false, loading = eager ? 'eager' : 'lazy', sizes = '100vw', ...props }) {
  return (
    <img
      decoding="async"
      fetchPriority={eager ? 'high' : 'auto'}
      {...props}
      {...getImageSources(src)}
      sizes={sizes}
      loading={loading}
    />
  )
}
