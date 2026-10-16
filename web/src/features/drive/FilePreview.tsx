import { getBlob, ref as storageRef } from 'firebase/storage'
import { useEffect, useState } from 'react'
import { LuChevronLeft, LuChevronRight, LuDownload, LuX } from 'react-icons/lu'
import { categoryOf, isViewableImage } from '@shared/drive/files'
import { type DriveFile, driveObjectPath } from '@shared/drive/types'
import type { WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import { storage } from '@/lib/firebase'
import { FileGlyph } from './parts'

/**
 * Opening a file: its bytes are read through the Storage rules (staff only; never a public link) and shown in the
 * app: PDFs and photos in place, videos with a player, anything else as a download. ← and → step through the folder.
 */

const blobs = new Map<string, Promise<Blob>>()

/** A file's bytes, read once per visit. */
export function fileBlob(branchId: string, fileId: string): Promise<Blob> {
  const key = `${branchId}/${fileId}`
  if (!blobs.has(key)) {
    const p = getBlob(storageRef(storage, driveObjectPath(branchId, fileId)))
    p.catch(() => blobs.delete(key))
    blobs.set(key, p)
  }
  return blobs.get(key)!
}

/** Saves a file to the computer under its Drive name. */
export async function downloadFile(branchId: string, file: Pick<DriveFile, 'name'> & { id: string }) {
  const blob = await fileBlob(branchId, file.id)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

const previewable = (f: Pick<DriveFile, 'kind'>) => f.kind === 'pdf' || isViewableImage(f.kind) || categoryOf(f.kind) === 'video'

export function FilePreview({ file, siblings, onOpen, onClose, where }: { file: WithId<DriveFile>; siblings: WithId<DriveFile>[]; onOpen: (f: WithId<DriveFile>) => void; onClose: () => void; where: string }) {
  const { branchId } = useBranch()
  const [state, setState] = useState<{ id: string; url: string | null; error: string | null }>({ id: '', url: null, error: null })
  const loading = state.id !== file.id
  const steps = siblings.filter((f) => f.status === 'ready' && previewable(f))
  const at = steps.findIndex((f) => f.id === file.id)
  const prev = at > 0 ? steps[at - 1] : null
  const next = at >= 0 && at < steps.length - 1 ? steps[at + 1] : null

  useEffect(() => {
    if (!previewable(file)) return
    let url: string | null = null
    let alive = true
    fileBlob(branchId, file.id)
      .then((blob) => {
        if (!alive) return
        url = URL.createObjectURL(blob.type ? blob : new Blob([blob], { type: file.mime }))
        setState({ id: file.id, url, error: null })
      })
      .catch((e: { code?: string; message?: string }) => alive && setState({ id: file.id, url: null, error: e?.code === 'storage/unauthorized' ? 'You don’t have access to this file.' : 'The file couldn’t be opened.' }))
    return () => {
      alive = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [branchId, file.id, file.mime, file])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && prev) onOpen(prev)
      if (e.key === 'ArrowRight' && next) onOpen(next)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [prev, next, onOpen])

  const kind = categoryOf(file.kind)
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent showCloseButton={false} className="flex h-[92svh] max-w-[min(1100px,96vw)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(1100px,96vw)]">
        <div className="flex items-center gap-3 border-b px-4 py-2.5">
          <FileGlyph kind={file.kind} className="size-6" />
          <div className="min-w-0 flex-1 leading-tight">
            <DialogTitle className="truncate text-sm font-semibold">{file.name}</DialogTitle>
            <DialogDescription className="truncate text-xs">{where}</DialogDescription>
          </div>
          <Button variant="ghost" size="icon" aria-label="Previous file" disabled={!prev} onClick={() => prev && onOpen(prev)}>
            <LuChevronLeft />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Next file" disabled={!next} onClick={() => next && onOpen(next)}>
            <LuChevronRight />
          </Button>
          <Button variant="outline" size="sm" onClick={() => void downloadFile(branchId, file)}>
            <LuDownload /> Download
          </Button>
          <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose}>
            <LuX />
          </Button>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center bg-muted/40">
          {!previewable(file) ? (
            <div className="flex flex-col items-center gap-3 p-8 text-center text-sm text-muted-foreground">
              <FileGlyph kind={file.kind} className="size-12" />
              {file.kind === 'heic' || file.kind === 'heif' ? 'This photo format can’t be shown in the browser. Download it to view it.' : 'This kind of file can’t be shown here. Download it to open it.'}
            </div>
          ) : loading ? (
            <Spinner className="size-6" />
          ) : state.error || !state.url ? (
            <p className="p-8 text-sm text-muted-foreground">{state.error ?? 'The file couldn’t be opened.'}</p>
          ) : kind === 'pdf' ? (
            <iframe title={file.name} src={state.url} className="size-full border-0 bg-white" />
          ) : kind === 'video' ? (
            <video src={state.url} controls className="max-h-full max-w-full" />
          ) : (
            <img src={state.url} alt={file.name} className="max-h-full max-w-full object-contain" />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
