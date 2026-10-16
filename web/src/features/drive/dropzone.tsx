import { useCallback, useEffect, useRef, useState } from 'react'
import { MAX_FILES_PER_DROP } from '@shared/drive/files'
import { cn } from '@/lib/utils'

/**
 * Dragging files in from the computer, everywhere in the Drive (ported from the drive it's modeled on):
 * - `useFileDropZone`: one drop zone (the page, or a folder's row or card through `DropTargetWrapper`);
 * - `readDroppedEntries`: a drop as files, rebuilding the folders when a whole folder was dropped.
 *
 * Enter and leave are counted, not a boolean: `dragleave` fires every time the pointer crosses into a child, so a
 * boolean would flicker over the rows. And a refusal still has to accept the drop (a browser only delivers `drop`
 * when `dragover` called preventDefault), so a read-only person gets a no-drop cursor and, on release, a sentence
 * saying why, instead of a drop that silently vanishes.
 */

export interface DroppedEntry {
  file: File
  /** The folders to recreate inside the Drive (empty for a loose file). */
  path: string[]
}

/** Does this drag carry files from the computer (rather than one of the Drive's own rows)? */
export const dragHasFiles = (e: React.DragEvent | DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files')

const SYSTEM_FILES = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini'])

/** `readEntries` returns at most a batch (100 in Chrome) per call; reading once would cut big folders short. */
function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const all: FileSystemEntry[] = []
    const next = () =>
      reader.readEntries((batch) => {
        if (!batch.length) resolve(all)
        else {
          all.push(...batch)
          next()
        }
      }, reject)
    next()
  })
}

async function walkEntry(entry: FileSystemEntry, path: string[], out: DroppedEntry[], limit: number) {
  if (out.length >= limit) return
  if (entry.isFile) {
    const file = await new Promise<File | null>((res) => (entry as FileSystemFileEntry).file(res, () => res(null)))
    if (file && !SYSTEM_FILES.has(file.name)) out.push({ file, path })
    return
  }
  if (entry.isDirectory) {
    const kids = await readAllEntries((entry as FileSystemDirectoryEntry).createReader()).catch(() => [])
    for (const kid of kids) {
      if (out.length >= limit) return
      await walkEntry(kid, [...path, entry.name], out, limit)
    }
  }
}

/**
 * Everything a drop holds. The item list must be read before the first await (the browser empties it once the
 * event handler returns); without `webkitGetAsEntry`, folders don't expand but files still come through.
 */
export async function readDroppedEntries(dataTransfer: DataTransfer, limit = MAX_FILES_PER_DROP + 1): Promise<DroppedEntry[]> {
  const roots = Array.from(dataTransfer.items ?? [])
    .filter((it) => it.kind === 'file')
    .map((it) => it.webkitGetAsEntry?.() ?? null)
  if (!roots.length || roots.every((r) => !r)) return Array.from(dataTransfer.files ?? []).map((file) => ({ file, path: [] }))
  const out: DroppedEntry[] = []
  for (const root of roots) if (root) await walkEntry(root, [], out, limit)
  return out
}

/** One drop zone. Spread `handlers` on the element. */
export function useFileDropZone({
  canWrite,
  onFiles,
  onRefuse,
  disabled = false,
}: {
  canWrite: boolean
  onFiles: (entries: DroppedEntry[]) => void
  onRefuse?: () => void
  disabled?: boolean
}) {
  const [dragOver, setDragOver] = useState(false)
  const depth = useRef(0)
  const reset = useCallback(() => {
    depth.current = 0
    setDragOver(false)
  }, [])
  // A drag that ends outside the window fires no leave event here.
  useEffect(() => {
    window.addEventListener('dragend', reset)
    window.addEventListener('drop', reset)
    return () => {
      window.removeEventListener('dragend', reset)
      window.removeEventListener('drop', reset)
    }
  }, [reset])

  const handlers = {
    onDragEnter: (e: React.DragEvent) => {
      if (disabled || !dragHasFiles(e)) return
      e.preventDefault()
      depth.current += 1
      if (canWrite) setDragOver(true)
    },
    onDragOver: (e: React.DragEvent) => {
      if (disabled || !dragHasFiles(e)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = canWrite ? 'copy' : 'none'
    },
    onDragLeave: (e: React.DragEvent) => {
      if (disabled || !dragHasFiles(e)) return
      depth.current = Math.max(0, depth.current - 1)
      if (!depth.current) setDragOver(false)
    },
    onDrop: async (e: React.DragEvent) => {
      if (disabled || !dragHasFiles(e)) return
      e.preventDefault()
      reset()
      // A folder's row claims the drop first (it's deeper); the page then stands down instead of uploading twice.
      const native = e.nativeEvent as DragEvent & { __skyarcDropClaimed?: boolean }
      if (native.__skyarcDropClaimed) return
      native.__skyarcDropClaimed = true
      if (!canWrite) {
        onRefuse?.()
        return
      }
      onFiles(await readDroppedEntries(e.dataTransfer))
    },
  }
  return { dragOver, handlers }
}

/** Wraps a folder's row or card so files dropped on it land in that folder. */
export function DropTargetWrapper({
  canWrite,
  onFiles,
  onRefuse,
  disabled,
  children,
}: {
  canWrite: boolean
  onFiles: (entries: DroppedEntry[]) => void
  onRefuse?: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  const { dragOver, handlers } = useFileDropZone({ canWrite, onFiles, onRefuse, disabled })
  return (
    <div className={cn('contents [&>*]:transition-colors', dragOver && '[&>*]:bg-brand/10 [&>*]:ring-2 [&>*]:ring-brand/50 [&>*]:ring-inset')} {...handlers}>
      {children}
    </div>
  )
}

/** A file dropped outside any zone must not make the browser leave the app. */
export function useWindowDropGuard() {
  useEffect(() => {
    const prevent = (e: DragEvent) => {
      if (Array.from(e.dataTransfer?.types ?? []).includes('Files')) e.preventDefault()
    }
    window.addEventListener('dragover', prevent)
    window.addEventListener('drop', prevent)
    return () => {
      window.removeEventListener('dragover', prevent)
      window.removeEventListener('drop', prevent)
    }
  }, [])
}
