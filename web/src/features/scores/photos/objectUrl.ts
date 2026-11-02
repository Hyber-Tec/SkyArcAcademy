import { useEffect } from 'react'

/**
 * Blobs shown as pictures (their object URLs), one URL each, freed a moment after the last picture showing it leaves
 * the page: a moment, because React mounts things twice while developing, and a picture may come straight back.
 */
const shown = new Map<Blob, { url: string; users: number; timer: ReturnType<typeof setTimeout> | null }>()

function entry(blob: Blob) {
  let e = shown.get(blob)
  if (!e) {
    e = { url: URL.createObjectURL(blob), users: 0, timer: null }
    shown.set(blob, e)
    // Never shown after all (a render React threw away): freed all the same.
    sweep(blob, e)
  }
  return e
}

function sweep(blob: Blob, e: { url: string; users: number; timer: ReturnType<typeof setTimeout> | null }) {
  if (e.timer) clearTimeout(e.timer)
  e.timer = setTimeout(() => {
    if (e.users > 0) return
    URL.revokeObjectURL(e.url)
    shown.delete(blob)
  }, 2000)
}

/** A file or blob shown as a picture (its object URL), for as long as it's on the page. */
export function useObjectUrl(blob: Blob | null): string | null {
  const url = blob ? entry(blob).url : null
  useEffect(() => {
    if (!blob) return
    const e = entry(blob)
    e.users += 1
    if (e.timer) clearTimeout(e.timer)
    e.timer = null
    return () => {
      e.users -= 1
      if (e.users <= 0) sweep(blob, e)
    }
  }, [blob])
  return url
}
