import { useEffect, useState } from 'react'

/**
 * An element's width in CSS pixels, kept current as it resizes: pass `ref` to the element. 0 until it's measured
 * (and while it isn't on screen), so callers fall back to a guess from the window's width.
 */
export function useElementWidth<T extends HTMLElement>(): [ref: (el: T | null) => void, width: number] {
  const [el, setEl] = useState<T | null>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    if (!el) return
    // The observer reports the first size as soon as it starts.
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(el)
    return () => observer.disconnect()
  }, [el])
  return [setEl, el ? width : 0]
}
