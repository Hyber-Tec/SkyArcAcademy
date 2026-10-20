import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { websitePostFolder } from '@shared/website/images'
import type { WebsiteImage } from '@shared/website/types'
import { prepareImage, uploadErrorText, uploadImage } from '@/features/website/images'

export interface CoverUpload {
  /** The picture being prepared and uploaded: its preview, progress, or why it failed. */
  working: { preview: string; progress: number; error: string | null } | null
  /** A file, or the address of a picture already in the post. */
  start: (source: Blob | string) => void
  /** Waits for the upload in progress: its picture, or undefined when none is going. Rejects if it fails. */
  wait: () => Promise<WebsiteImage | undefined>
  cancel: () => void
}

async function fetchPicture(url: string): Promise<Blob> {
  const res = await fetch(url).catch(() => null)
  if (!res?.ok) throw new Error('That picture couldn’t be read here. Upload it instead.')
  return res.blob()
}

/**
 * The cover's upload: resized for the website into its own folder under the post's (`websitePostFolder`), so a new
 * cover never replaces the files of one the website may still show (they're cached for a year).
 */
export function useCoverUpload(branchId: string, announcementId: string, onDone: (img: WebsiteImage) => void): CoverUpload {
  const [working, setWorking] = useState<CoverUpload['working']>(null)
  const run = useRef(0)
  const task = useRef<Promise<WebsiteImage> | null>(null)
  const done = useRef(onDone)
  useLayoutEffect(() => {
    done.current = onDone
  })

  const start = useCallback(
    (source: Blob | string) => {
      const n = ++run.current
      const preview = typeof source === 'string' ? source : URL.createObjectURL(source)
      setWorking({ preview, progress: 0, error: null })
      const p = (async () => {
        const blob = typeof source === 'string' ? await fetchPicture(source) : source
        const prepared = await prepareImage(blob)
        const folder = `${websitePostFolder(branchId, announcementId)}/${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`
        return uploadImage(folder, prepared, (progress) => {
          if (run.current === n) setWorking((w) => (w ? { ...w, progress } : w))
        })
      })()
      task.current = p
      p.then(
        (img) => {
          if (run.current !== n) return
          task.current = null
          done.current(img)
          setWorking(null)
          if (typeof source !== 'string') URL.revokeObjectURL(preview)
        },
        (e) => {
          if (run.current !== n) return
          task.current = null
          setWorking({ preview, progress: 0, error: uploadErrorText(e) })
        },
      )
    },
    [branchId, announcementId],
  )

  const wait = useCallback(() => task.current ?? Promise.resolve(undefined), [])
  const cancel = useCallback(() => {
    run.current += 1
    task.current = null
    setWorking(null)
  }, [])
  return { working, start, wait, cancel }
}
