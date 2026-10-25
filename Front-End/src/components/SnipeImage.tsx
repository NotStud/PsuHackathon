import { useEffect, useRef, useState } from 'react'
import { getToken } from '../api'

/** Fetch private proof photos only near the viewport; the browser caches each image. */
export function SnipeImage({ src }: { src: string }) {
  const image = useRef<HTMLImageElement>(null)
  const [loaded, setLoaded] = useState<{ source: string; url: string } | null>(null)
  const privatePhoto = src.startsWith('/api/leagues/')

  useEffect(() => {
    if (!privatePhoto || !image.current) return
    const controller = new AbortController()
    let objectUrl: string | null = null
    let started = false
    async function load() {
      if (started) return
      started = true
      observer?.disconnect()
      try {
        const token = getToken()
        const response = await fetch(src, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: controller.signal,
        })
        if (!response.ok) return
        const blob = await response.blob()
        if (controller.signal.aborted) return
        objectUrl = URL.createObjectURL(blob)
        setLoaded({ source: src, url: objectUrl })
      } catch { /* Keep the alt text if the photo is unavailable. */ }
    }
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(
      (entries) => { if (entries.some((entry) => entry.isIntersecting)) void load() },
      { rootMargin: '200px' },
    )
    if (observer) observer.observe(image.current)
    else void load()
    return () => {
      controller.abort()
      observer?.disconnect()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [src, privatePhoto])

  return <img ref={image} className="feed-photo" loading="lazy" decoding="async"
    src={privatePhoto ? (loaded?.source === src ? loaded.url : undefined) : src} alt="Snipe proof" />
}
