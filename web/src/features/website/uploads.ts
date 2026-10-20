import { useSyncExternalStore } from 'react'
import { websitePhotoFolder } from '@shared/website/images'
import type { WebsiteAlbum, WebsiteImage, WebsitePhoto, WebsitePlace } from '@shared/website/types'
import type { Actor } from '@/lib/audit'
import { addPhoto, newPhotoId } from './api'
import { ImageError, type PreparedImage, deleteImageFiles, prepareImage, uploadErrorText, uploadImage } from './images'

/**
 * Photos on their way to the website's library. Each shows at once (from the file itself), then is resized and
 * uploaded, and only then gets its record, so the website never names a photo whose files aren't there. The list
 * lives here, outside React, so an upload keeps going (with its progress) while the person moves around the CRM; a
 * failed one waits for Retry or Remove. Closing the tab while photos are still going up asks first.
 */

export type UploadStage = 'waiting' | 'preparing' | 'uploading' | 'saving' | 'failed'

export interface PhotoUpload {
  id: string
  name: string
  /** The file itself, shown until the record exists. */
  preview: string
  stage: UploadStage
  /** 0 to 1. */
  progress: number
  error: string | null
  /** False when the picture itself can't be read: only removing it helps. */
  canRetry: boolean
  order: number
  album: WebsiteAlbum
  /** Shown in this place once it's saved (Pages → Choose photo → Upload). */
  place: WebsitePlace | null
}

interface Job {
  branchId: string
  actor: Actor
  file: File
  prepared: PreparedImage | null
  image: WebsiteImage | null
}

const CONCURRENCY = 2
let uploads: PhotoUpload[] = []
const jobs = new Map<string, Job>()
const listeners = new Set<() => void>()
let running = 0
let guarding = false

const holdPage = (e: BeforeUnloadEvent) => e.preventDefault()

function emit() {
  for (const l of [...listeners]) l()
  const busy = uploads.some((u) => u.stage !== 'failed')
  if (busy === guarding) return
  guarding = busy
  if (busy) window.addEventListener('beforeunload', holdPage)
  else window.removeEventListener('beforeunload', holdPage)
}

function patch(id: string, p: Partial<PhotoUpload>) {
  uploads = uploads.map((u) => (u.id === id ? { ...u, ...p } : u))
  emit()
}

function forget(id: string) {
  const u = uploads.find((x) => x.id === id)
  if (u) URL.revokeObjectURL(u.preview)
  uploads = uploads.filter((x) => x.id !== id)
  jobs.delete(id)
  emit()
}

/** The uploads in progress or failed, live. */
export function usePhotoUploads(): PhotoUpload[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => uploads,
  )
}

/** The gallery order for `count` new photos: before every photo there is (and every one still uploading). */
export function firstNewOrder(photos: Pick<WebsitePhoto, 'order'>[], count: number): number {
  let min = 0
  for (const p of photos) min = Math.min(min, p.order)
  for (const u of uploads) min = Math.min(min, u.order)
  return min - count
}

async function run(id: string) {
  const job = jobs.get(id)
  if (!job) return
  try {
    if (!job.prepared) {
      patch(id, { stage: 'preparing', progress: 0, error: null })
      job.prepared = await prepareImage(job.file)
    }
    if (!job.image) {
      patch(id, { stage: 'uploading', progress: 0, error: null })
      job.image = await uploadImage(websitePhotoFolder(job.branchId, id), job.prepared, (progress) => patch(id, { progress }))
    }
    patch(id, { stage: 'saving', progress: 1, error: null })
    const u = uploads.find((x) => x.id === id)
    if (!u) return
    await addPhoto(job.branchId, job.actor, id, { ...job.image, album: u.album, caption: '', alt: '', focus: '50% 50%', order: u.order, hidden: false }, u.name, u.place)
    forget(id)
  } catch (e) {
    patch(id, { stage: 'failed', error: uploadErrorText(e), canRetry: !(e instanceof ImageError) })
  }
}

function pump() {
  while (running < CONCURRENCY) {
    const next = uploads.find((u) => u.stage === 'waiting')
    if (!next) return
    running += 1
    patch(next.id, { stage: 'preparing' })
    void run(next.id).finally(() => {
      running -= 1
      pump()
    })
  }
}

/** Starts uploading photos to the library, in the order given; returns their IDs (known at once). */
export function startPhotoUploads(
  branchId: string,
  actor: Actor,
  files: File[],
  opts: { album: WebsiteAlbum; photos: Pick<WebsitePhoto, 'order'>[]; place?: WebsitePlace | null },
): string[] {
  const first = firstNewOrder(opts.photos, files.length)
  const added: PhotoUpload[] = files.map((file, i) => {
    const id = newPhotoId(branchId)
    jobs.set(id, { branchId, actor, file, prepared: null, image: null })
    return {
      id,
      name: file.name || 'Photo',
      preview: URL.createObjectURL(file),
      stage: 'waiting',
      progress: 0,
      error: null,
      canRetry: true,
      order: first + i,
      album: opts.album,
      place: opts.place ?? null,
    }
  })
  uploads = [...added, ...uploads]
  emit()
  pump()
  return added.map((u) => u.id)
}

export function retryPhotoUpload(id: string) {
  const u = uploads.find((x) => x.id === id)
  if (!u || u.stage !== 'failed' || !u.canRetry) return
  patch(id, { stage: 'waiting', error: null })
  pump()
}

/** Drops a failed upload, with whatever copies of it already reached Storage. */
export async function removePhotoUpload(id: string) {
  const u = uploads.find((x) => x.id === id)
  const job = jobs.get(id)
  if (!u || u.stage !== 'failed') return
  forget(id)
  if (job?.prepared) {
    const folder = websitePhotoFolder(job.branchId, id)
    await deleteImageFiles({ folder, format: job.prepared.format, widths: job.prepared.copies.map((c) => c.width) }).catch(() => undefined)
  }
}

/** A place chosen by hand forgets any upload that was going to land there. */
export function releasePlace(place: WebsitePlace) {
  if (uploads.some((u) => u.place === place)) {
    uploads = uploads.map((u) => (u.place === place ? { ...u, place: null } : u))
    emit()
  }
}

export function uploadStageText(u: PhotoUpload): string {
  if (u.stage === 'waiting') return 'Waiting…'
  if (u.stage === 'preparing') return 'Preparing…'
  if (u.stage === 'uploading') return `Uploading ${Math.round(u.progress * 100)}%`
  if (u.stage === 'saving') return 'Saving…'
  return 'Didn’t upload'
}
