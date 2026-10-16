import { useState } from 'react'
import { LuChevronRight, LuHardDrive } from 'react-icons/lu'
import type { DriveIndex } from '@shared/drive/model'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import { FolderGlyph } from './parts'

/** "Move to…": walk the Drive's folders and move the items into the one you're in. */
export function MoveDialog({
  index,
  folderIds,
  fileIds,
  startAt,
  onMove,
  onClose,
}: {
  index: DriveIndex
  folderIds: string[]
  fileIds: string[]
  startAt: string | null
  onMove: (targetId: string | null) => Promise<void>
  onClose: () => void
}) {
  const [at, setAt] = useState<string | null>(startAt)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const moving = new Set(folderIds)
  const count = folderIds.length + fileIds.length
  const name = count === 1 ? (index.folderOf(folderIds[0])?.name ?? index.fileOf(fileIds[0])?.name ?? 'the item') : `${count} items`
  const crumbs = index.pathOf(at)
  const homes = new Set([...folderIds.map((id) => index.folderOf(id)?.parentId ?? null), ...fileIds.map((id) => index.fileOf(id)?.folderId ?? null)])
  const refusal = !index.canMoveInto(folderIds, at)
    ? folderIds.some((id) => index.folderOf(id)?.studentId)
      ? 'A student’s folder stays at the top.'
      : 'A folder can’t go inside itself.'
    : homes.size === 1 && homes.has(at)
      ? 'It’s already here.'
      : null
  const move = async () => {
    setBusy(true)
    setError(null)
    try {
      await onMove(at)
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const folders = index.foldersIn(at).filter((f) => !moving.has(f.id))
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Move {count === 1 ? `“${name}”` : name}</DialogTitle>
          <DialogDescription>Open the folder it should go in, then choose Move here.</DialogDescription>
        </DialogHeader>
        <nav className="flex min-w-0 flex-wrap items-center gap-1 text-sm" aria-label="Where">
          <button type="button" className={cn('rounded px-1.5 py-0.5 hover:bg-muted', !at && 'font-semibold')} onClick={() => setAt(null)}>
            Drive
          </button>
          {crumbs.map((c) => (
            <span key={c.id} className="flex min-w-0 items-center gap-1">
              <LuChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
              <button type="button" className={cn('truncate rounded px-1.5 py-0.5 hover:bg-muted', c.id === at && 'font-semibold')} onClick={() => setAt(c.id)}>
                {c.name}
              </button>
            </span>
          ))}
        </nav>
        <ul className="h-72 divide-y overflow-y-auto rounded-lg border" aria-label="Folders">
          {folders.length ? (
            folders.map((f) => (
              <li key={f.id}>
                <button type="button" className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted/60" onClick={() => setAt(f.id)}>
                  <FolderGlyph student={!!f.studentId} className="size-6" />
                  <span className="min-w-0 flex-1 truncate">{f.name}</span>
                  <LuChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </button>
              </li>
            ))
          ) : (
            <li className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
              <LuHardDrive className="size-5" />
              No folders in here.
            </li>
          )}
        </ul>
        {refusal || error ? <p className="text-sm text-muted-foreground">{error ?? refusal}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void move()} disabled={!!refusal || busy}>
            {busy ? <Spinner /> : null} Move here
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
