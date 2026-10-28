import { useEffect, useState } from 'react'
import { LuArrowDown, LuArrowUp, LuFolder } from 'react-icons/lu'
import { isViewableImage } from '@shared/drive/files'
import { type DriveColumn, type DriveIndex, type DriveItem, type DriveSort, formatBytes, itemOwner, itemUpdated, updatedText } from '@shared/drive/model'
import { accessOf, isFixedFolder } from '@shared/drive/types'
import { POSITION_COLORS, POSITION_LABELS, type Evaluation, per10 } from '@shared/shooting/evaluation'
import type { WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { ContextMenuFor, ItemMenuButton, type MenuEntry } from '@/components/app/ItemMenu'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import { TargetPlot } from '@/features/scores/TargetPlot'
import { cn } from '@/lib/utils'
import { DropTargetWrapper, type DroppedEntry } from './dropzone'
import { fileBlob } from './FilePreview'
import { AccessBadge, FileGlyph, FolderGlyph, PersonChip } from './parts'
import { flightOf } from './upload'

/** Only owners and admins see it (coaches never get it at all). */
const adminsOnly = (it: DriveItem) => accessOf(it.kind === 'folder' ? it.folder : it.file) === 'admins'
/** A student's folder or the Contracts folder: it stays put, so it isn't picked up or selected. */
const fixed = (it: DriveItem) => it.kind === 'folder' && isFixedFolder(it.folder)

/**
 * The Drive's list and grid. Rows are CSS-grid rows, not a table, so a folder's row can take files dropped on it and
 * rows can be dragged onto folders. While a file uploads, its progress borrows the Updated cell.
 */

export const DRAG_TYPE = 'application/x-skyarc-drive'

const COLUMNS: { col: DriveColumn; label: string; className: string }[] = [
  { col: 'name', label: 'Name', className: '' },
  { col: 'owner', label: 'Owner', className: 'hidden @4xl:flex' },
  { col: 'updated', label: 'Updated', className: 'hidden @xl:flex' },
  { col: 'size', label: 'Size', className: 'hidden @xl:flex justify-end' },
]

/**
 * The columns follow the list's own width (it's an `@container`), not the window's: a tablet beside the sidebar, or the
 * Details panel open, leaves the name its room. Narrow, the name takes what the row's menu doesn't need.
 */
const GRID = 'grid grid-cols-[1.5rem_minmax(0,1fr)_auto] @xl:grid-cols-[1.5rem_minmax(0,1fr)_11rem_5rem_4.5rem] @4xl:grid-cols-[1.5rem_minmax(0,1fr)_11rem_13rem_5rem_4.5rem] items-center gap-3'

export interface ListApi {
  index: DriveIndex
  canWrite: boolean
  sort: DriveSort
  onSort: (col: DriveColumn) => void
  /** While searching, where each hit lives. */
  whereOf: (it: DriveItem) => string | null
  menuOf: (it: DriveItem) => MenuEntry[]
  openItem: (it: DriveItem) => void
  selected: Set<string>
  toggle: (id: string) => void
  /** Evaluations of the files on screen, by file ID (a student's folder). */
  scoresByFile: Map<string, WithId<Evaluation>>
  dropFiles: (folderId: string, entries: DroppedEntry[]) => void
  refuseDrop: () => void
  canDropInto: (itemId: string, targetId: string | null) => boolean
  moveInto: (itemId: string, targetId: string | null) => void
}

function ScoreChip({ e }: { e: Evaluation }) {
  const p10 = per10(e.total, e.shots)
  return (
    <span className="inline-flex max-w-full min-w-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-medium tabular-nums" style={{ borderColor: `${POSITION_COLORS[e.position]}55`, color: POSITION_COLORS[e.position] }}>
      <span className="truncate">
        {POSITION_LABELS[e.position]} · {e.source === 'sius' ? e.total.toFixed(1) : e.total}
        {e.shots !== 10 && p10 !== null ? <span className="text-muted-foreground"> · {p10} per 10</span> : null}
      </span>
    </span>
  )
}

/** Internal drags: a row picked up and dropped on a folder or a crumb. */
export function dropHandlers(api: Pick<ListApi, 'canDropInto' | 'moveInto'>, targetId: string | null, setHot: (hot: boolean) => void) {
  const itemOf = (e: React.DragEvent) => (Array.from(e.dataTransfer.types).includes(DRAG_TYPE) ? (window as unknown as { __skyarcDrag?: string }).__skyarcDrag ?? null : null)
  return {
    onDragOver: (e: React.DragEvent) => {
      const id = itemOf(e)
      if (!id || !api.canDropInto(id, targetId)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      setHot(true)
    },
    onDragLeave: () => setHot(false),
    onDrop: (e: React.DragEvent) => {
      const id = itemOf(e)
      setHot(false)
      if (!id || !api.canDropInto(id, targetId)) return
      e.preventDefault()
      api.moveInto(id, targetId)
    },
  }
}

function dragStart(id: string) {
  return (e: React.DragEvent) => {
    ;(window as unknown as { __skyarcDrag?: string }).__skyarcDrag = id
    e.dataTransfer.setData(DRAG_TYPE, id)
    e.dataTransfer.effectAllowed = 'move'
  }
}

export function DriveListHead({ api, controls }: { api: ListApi; controls: React.ReactNode }) {
  return (
    <div className={cn(GRID, 'sticky top-0 z-10 rounded-t-xl border-b bg-background px-3 py-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase')} role="row">
      <span />
      {COLUMNS.map(({ col, label, className }) => {
        const active = api.sort.col === col
        return (
          <button key={col} type="button" onClick={() => api.onSort(col)} className={cn('flex items-center gap-1 py-2 text-left uppercase hover:text-foreground', active && 'text-foreground', className)} title={`Sort by ${label.toLowerCase()}`}>
            {label}
            {active ? api.sort.dir === 'asc' ? <LuArrowUp className="size-3.5" /> : <LuArrowDown className="size-3.5" /> : null}
          </button>
        )
      })}
      <span className="flex justify-end">{controls}</span>
    </div>
  )
}

export function DriveRow({ it, api }: { it: DriveItem; api: ListApi }) {
  const { timezone } = useBranch()
  const [hot, setHot] = useState(false)
  const where = api.whereOf(it)
  const menu = api.menuOf(it)
  const isFolder = it.kind === 'folder'
  const file = it.kind === 'file' ? it.file : null
  const flight = file ? flightOf(file.id) : null
  const uploading = file?.status === 'uploading'
  const score = file ? api.scoresByFile.get(file.id) : undefined
  const changed = itemUpdated(it, api.index)
  const draggable = api.canWrite && !uploading && !fixed(it)
  const size = isFolder ? api.index.countsOf(it.id).bytes : (file?.size ?? 0)
  const updatedCell = uploading ? (
    <span className="flex items-center gap-2">
      <span className="text-xs">{flight ? 'Uploading…' : 'Waiting…'}</span>
      <Progress value={Math.round((flight?.progress ?? 0) * 100)} className="h-1.5 w-20" />
    </span>
  ) : file?.status === 'error' ? (
    <span className="text-xs text-destructive">Upload failed</span>
  ) : (
    updatedText(changed.at, changed.by, timezone) || <span className="text-muted-foreground/50">—</span>
  )
  const row = (
    <div
      role="row"
      data-testid="drive-row"
      data-kind={it.kind}
      draggable={draggable}
      onDragStart={draggable ? dragStart(it.id) : undefined}
      onClick={() => api.openItem(it)}
      {...(isFolder ? dropHandlers(api, it.id, setHot) : {})}
      className={cn(
        GRID,
        'group min-h-[3.25rem] cursor-pointer border-b border-border/60 px-3 py-2 transition-colors hover:bg-accent/60',
        api.selected.has(it.id) && 'bg-brand/5',
        hot && 'bg-brand/10 ring-2 ring-brand/50 ring-inset',
        uploading && 'cursor-default opacity-80',
      )}
    >
      <span onClick={(e) => e.stopPropagation()} className="flex items-center">
        {api.canWrite && !uploading && !fixed(it) ? (
          <Checkbox checked={api.selected.has(it.id)} onCheckedChange={() => api.toggle(it.id)} aria-label={`Select ${isFolder ? it.folder.name : file?.name}`} className={cn(!api.selected.size && 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100')} />
        ) : null}
      </span>
      <span className="flex min-w-0 items-center gap-3">
        {isFolder ? <FolderGlyph student={!!it.folder.studentId} locked={adminsOnly(it)} /> : <FileGlyph kind={file!.kind} />}
        <span className="min-w-0 flex-1">
          {/* The score (or "Owners and admins") goes under the name when both don't fit on one line; on phones a long
              name takes two lines. */}
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="line-clamp-2 max-w-full text-sm font-semibold wrap-anywhere @xl:line-clamp-1" title={isFolder ? it.folder.name : file!.name}>
              {isFolder ? it.folder.name : file!.name}
            </span>
            {score ? <ScoreChip e={score} /> : null}
            {adminsOnly(it) ? <AccessBadge /> : null}
          </span>
          {where !== null ? (
            <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
              <LuFolder className="size-3 shrink-0" />
              <span className="truncate">{where || 'Drive'}</span>
            </span>
          ) : null}
        </span>
      </span>
      <span className="hidden min-w-0 text-[13px] text-muted-foreground @4xl:block">
        <PersonChip person={itemOwner(it)} />
      </span>
      <span className="hidden truncate text-[13px] text-muted-foreground @xl:block">{updatedCell}</span>
      <span className="hidden text-right text-[13px] text-muted-foreground tabular-nums @xl:block">{size ? formatBytes(size) : '—'}</span>
      <span className="flex justify-end" onClick={(e) => e.stopPropagation()}>
        <ItemMenuButton entries={menu} className="text-muted-foreground" />
      </span>
    </div>
  )
  const withMenu = menu.length ? <ContextMenuFor entries={menu}>{row}</ContextMenuFor> : row
  return isFolder ? (
    <DropTargetWrapper canWrite={api.canWrite} onFiles={(entries) => api.dropFiles(it.id, entries)} onRefuse={api.refuseDrop}>
      {withMenu}
    </DropTargetWrapper>
  ) : (
    withMenu
  )
}

/** A photo's thumbnail, read through the rules once it's on screen. */
function Thumb({ fileId, name }: { fileId: string; name: string }) {
  const { branchId } = useBranch()
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    let made: string | null = null
    fileBlob(branchId, fileId)
      .then((b) => {
        if (!alive) return
        made = URL.createObjectURL(b)
        setUrl(made)
      })
      .catch(() => undefined)
    return () => {
      alive = false
      if (made) URL.revokeObjectURL(made)
    }
  }, [branchId, fileId])
  return url ? <img src={url} alt={name} className="size-full object-cover" /> : null
}

export function DriveCard({ it, api }: { it: DriveItem; api: ListApi }) {
  const [hot, setHot] = useState(false)
  const menu = api.menuOf(it)
  const isFolder = it.kind === 'folder'
  const file = it.kind === 'file' ? it.file : null
  const score = file ? api.scoresByFile.get(file.id) : undefined
  const uploading = file?.status === 'uploading'
  const flight = file ? flightOf(file.id) : null
  const draggable = api.canWrite && !uploading && !fixed(it)
  const c = isFolder ? api.index.countsOf(it.id) : null
  const where = api.whereOf(it)
  const meta = where !== null ? where || 'Drive' : isFolder ? `${c!.folders + c!.files} ${c!.folders + c!.files === 1 ? 'item' : 'items'}` : score ? `${POSITION_LABELS[score.position]} · ${score.source === 'sius' ? score.total.toFixed(1) : score.total}` : formatBytes(file!.size)
  const picture = isFolder ? (
    <FolderGlyph student={!!it.folder.studentId} locked={adminsOnly(it)} className="size-14" />
  ) : score && score.source === 'sius' ? (
    <TargetPlot shots={score.series.flatMap((s) => s.shots)} size={104} color={POSITION_COLORS[score.position]} showMpi={false} />
  ) : file && isViewableImage(file.kind) && file.status === 'ready' && file.size < 15 * 1024 * 1024 ? (
    <Thumb fileId={file.id} name={file.name} />
  ) : (
    <FileGlyph kind={file!.kind} className="size-12" />
  )
  const card = (
    <div
      data-testid="drive-card"
      draggable={draggable}
      onDragStart={draggable ? dragStart(it.id) : undefined}
      onClick={() => api.openItem(it)}
      {...(isFolder ? dropHandlers(api, it.id, setHot) : {})}
      className={cn('group relative flex cursor-pointer flex-col overflow-hidden rounded-xl border bg-card transition hover:shadow-sm', api.selected.has(it.id) && 'ring-2 ring-brand/40', hot && 'ring-2 ring-brand/60')}
    >
      <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-muted/40">
        {picture}
        {adminsOnly(it) ? <AccessBadge className="absolute right-2 bottom-2 bg-amber-50/95 dark:bg-amber-950/80" /> : null}
      </div>
      {uploading ? <Progress value={Math.round((flight?.progress ?? 0) * 100)} className="h-1 rounded-none" /> : null}
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-sm leading-snug font-medium break-words" title={isFolder ? it.folder.name : file!.name}>
            {isFolder ? it.folder.name : file!.name}
          </div>
          <div className="truncate text-xs text-muted-foreground">{meta}</div>
        </div>
        <span onClick={(e) => e.stopPropagation()}>
          <ItemMenuButton entries={menu} className="text-muted-foreground" />
        </span>
      </div>
      {api.canWrite && !uploading && !fixed(it) ? (
        <span className="absolute top-2 left-2" onClick={(e) => e.stopPropagation()}>
          <Checkbox checked={api.selected.has(it.id)} onCheckedChange={() => api.toggle(it.id)} aria-label="Select" className={cn('bg-background', !api.selected.has(it.id) && 'opacity-0 group-hover:opacity-100')} />
        </span>
      ) : null}
    </div>
  )
  const withMenu = menu.length ? <ContextMenuFor entries={menu}>{card}</ContextMenuFor> : card
  return isFolder ? (
    <DropTargetWrapper canWrite={api.canWrite} onFiles={(entries) => api.dropFiles(it.id, entries)} onRefuse={api.refuseDrop}>
      {withMenu}
    </DropTargetWrapper>
  ) : (
    withMenu
  )
}
