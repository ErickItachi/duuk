import { useEffect, useRef, useState } from 'react'

export default function DeferredImage({ src, eager = false, ...props }) {
  const imageRef = useRef(null)
  const [shouldLoad, setShouldLoad] = useState(eager)

  useEffect(() => {
    if (shouldLoad) return undefined

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShouldLoad(true)
          observer.disconnect()
        }
      },
      { rootMargin: '400px 0px' },
    )

    observer.observe(imageRef.current.parentElement)
    return () => observer.disconnect()
  }, [shouldLoad])

  return <img ref={imageRef} src={shouldLoad ? src : undefined} {...props} />
}
