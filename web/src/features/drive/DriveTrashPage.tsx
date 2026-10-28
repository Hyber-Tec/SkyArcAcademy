import { useMemo, useState } from 'react'
import { LuArrowLeft, LuRotateCcw, LuTrash2 } from 'react-icons/lu'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { type TrashEntry, buildDriveIndex, countLabel, formatBytes, trashEntries, tsMs } from '@shared/drive/model'
import { formatInstant } from '@shared/time'
import { useBranch } from '@/branch/BranchProvider'
import { ContextMenuFor, ItemMenuButton, menu } from '@/components/app/ItemMenu'
import { PageHeader } from '@/components/app/PageHeader'
import { useConfirm } from '@/components/app/useConfirm'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { useStudentList } from '@/features/data/hooks'
import { deleteForever, restoreItems } from './api'
import { AccessBadge, FileGlyph, FolderGlyph } from './parts'
import { useDriveLists } from './useDriveIndex'

/**
 * The Drive's Trash: each item someone moved there (what was inside a folder comes back with it). Restore puts it
 * back where it was (or at the top, if that folder is gone); Delete forever removes it and its bytes. Items are
 * deleted for good automatically once they've been in the Trash longer than Settings → Trash allows.
 */
export function DriveTrashPage() {
  const { branchId, actor, timezone, settings, isAdmin, portal } = useBranch()
  const lists = useDriveLists()
  const { data: students } = useStudentList()
  const { confirm, dialog } = useConfirm()
  const [busy, setBusy] = useState<string | null>(null)
  const loading = lists.folders === null || lists.files === null
  const driveStudents = useMemo(() => students.map((s) => ({ id: s.id, name: s.name, finished: s.status === 'finished' })), [students])
  const entries = useMemo(() => (loading ? [] : trashEntries(lists.folders!, lists.files!, driveStudents)), [loading, lists, driveStudents])
  const liveFolders = useMemo(() => new Set(buildDriveIndex(lists.folders, lists.files, driveStudents).folders.map((f) => f.id)), [lists, driveStudents])
  const days = settings.trash.retentionDays

  async function restore(items: TrashEntry[]) {
    setBusy('restore')
    try {
      await restoreItems(branchId, actor, items, liveFolders, lists.folders!, lists.files!)
      toast.success(items.length === 1 ? `Restored “${items[0].name}”` : `Restored ${items.length} items`)
    } catch (e) {
      toast.error('Couldn’t restore it', { description: (e as Error).message })
    } finally {
      setBusy(null)
    }
  }

  async function remove(items: TrashEntry[], all = false) {
    const files = items.reduce((n, e) => n + e.files, 0)
    const ok = await confirm({
      title: all ? 'Empty the Trash?' : items.length === 1 ? `Delete “${items[0].name}” forever?` : `Delete ${items.length} items forever?`,
      description: `${countLabel(files, 'file')} will be deleted for good. This can’t be undone. Scores saved from them stay with the students.`,
      confirmLabel: all ? 'Empty Trash' : 'Delete forever',
      destructive: true,
    })
    if (!ok) return
    setBusy('delete')
    try {
      await deleteForever(branchId, actor, items, lists.folders!, lists.files!)
      toast.success(all ? 'The Trash is empty' : 'Deleted for good')
    } catch (e) {
      toast.error('Couldn’t delete it', { description: (e as Error).message })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="max-w-5xl">
      <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2.5">
        <Link to={`/${portal}/drive`}>
          <LuArrowLeft /> Drive
        </Link>
      </Button>
      <PageHeader
        title="Trash"
        description={`Items in the Trash are deleted for good after ${days} days.`}
        actions={
          isAdmin && entries.length ? (
            <Button variant="outline" className="text-destructive" disabled={!!busy} onClick={() => void remove(entries, true)}>
              {busy === 'delete' ? <Spinner /> : <LuTrash2 />} Empty Trash
            </Button>
          ) : null
        }
      />
      <div className="rounded-xl border bg-card">
        {loading ? (
          <Skeleton className="m-3 h-40" />
        ) : !entries.length ? (
          <div className="flex flex-col items-center gap-2 p-12 text-center text-sm text-muted-foreground">
            <LuTrash2 className="size-6" />
            The Trash is empty.
          </div>
        ) : (
          entries.map((e) => {
            const items = menu(
              isAdmin && { label: 'Restore', icon: LuRotateCcw, onSelect: () => void restore([e]) },
              isAdmin && { label: 'Delete forever', icon: LuTrash2, destructive: true, separatorBefore: true, onSelect: () => void remove([e]) },
            )
            const when = tsMs(e.trashedAt)
            return (
              <ContextMenuFor key={`${e.kind}-${e.id}`} entries={items}>
                <div className="flex items-center gap-3 border-b border-border/60 px-4 py-2.5 last:border-0" data-testid="trash-row">
                  {e.kind === 'folder' ? <FolderGlyph locked={e.access === 'admins'} /> : <FileGlyph kind={e.name.split('.').pop()?.toLowerCase() ?? ''} />}
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="truncate text-sm font-semibold">{e.name}</span>
                      {e.access === 'admins' ? <AccessBadge /> : null}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {e.from ? `From ${e.from}` : 'From the top of the Drive'}
                      {e.kind === 'folder' ? ` · ${countLabel(e.files, 'file')}` : ''} · {formatBytes(e.bytes)}
                    </div>
                  </div>
                  <div className="hidden text-right text-xs text-muted-foreground sm:block">
                    {when ? `Trashed ${formatInstant(when, timezone, { month: 'short', day: 'numeric' })}` : ''}
                    {e.trashedBy ? ` by ${e.trashedBy.name.split(' ')[0]}` : ''}
                  </div>
                  {isAdmin ? (
                    <Button variant="ghost" size="sm" disabled={!!busy} onClick={() => void restore([e])}>
                      <LuRotateCcw /> Restore
                    </Button>
                  ) : null}
                  <ItemMenuButton entries={items} className="text-muted-foreground" />
                </div>
              </ContextMenuFor>
            )
          })
        )}
      </div>
      {dialog}
    </div>
  )
}
