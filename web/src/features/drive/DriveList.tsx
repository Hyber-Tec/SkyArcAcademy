import { Fragment, useEffect, useState } from 'react'
import { LuArrowDown, LuArrowUp, LuFolder } from 'react-icons/lu'
import { Link } from 'react-router'
import { isViewableImage } from '@shared/drive/files'
import { type DriveColumn, type DriveIndex, type DriveItem, type DriveSort, formatBytes, itemDate, itemOwner, itemUpdated, updatedText } from '@shared/drive/model'
import { scoreTotal } from '@shared/drive/scores'
import { accessOf, isFixedFolder } from '@shared/drive/types'
import { POSITION_COLORS, POSITION_LABELS, type Evaluation, per10 } from '@shared/shooting/evaluation'
import { formatDateKey } from '@shared/time'
import type { WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { ContextMenuFor, ItemMenuButton, type MenuEntry } from '@/components/app/ItemMenu'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import { scorePath } from '@/features/scores/card/parts'
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
 * Details panel open, leaves the name its room. Narrow, the name takes what the row's menu doesn't need. A student's
 * folder has a Date column after the name (the day of what each file holds: Goo, 2026-11-03) and a Score column after
 * it once there's room (until then each file's date and scores sit under its name), and its Owner column waits for
 * more room still.
 */
const GRID = 'grid grid-cols-[1.5rem_minmax(0,1fr)_auto] @xl:grid-cols-[1.5rem_minmax(0,1fr)_11rem_5rem_4.5rem] @4xl:grid-cols-[1.5rem_minmax(0,1fr)_11rem_13rem_5rem_4.5rem] items-center gap-3'
const SCORE_GRID =
  'grid grid-cols-[1.5rem_minmax(0,1fr)_auto] @xl:grid-cols-[1.5rem_minmax(0,1fr)_7rem_11rem_5rem_4.5rem] @4xl:grid-cols-[1.5rem_minmax(0,1fr)_7rem_13rem_11rem_5rem_4.5rem] @6xl:grid-cols-[1.5rem_minmax(0,1fr)_7rem_13rem_11rem_13rem_5rem_4.5rem] items-center gap-3'
/** Where the Owner column shows (its heading, then its cells): later in a student's folder, where Score comes first. */
const ownerHead = (scores: boolean) => (scores ? 'hidden @6xl:flex' : 'hidden @4xl:flex')
const ownerCell = (scores: boolean) => (scores ? 'hidden @6xl:block' : 'hidden @4xl:block')

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
  /** Every score made from each file on screen, by file ID (a student's folder; a results sheet makes several). */
  scoresByFile: Map<string, WithId<Evaluation>[]>
  /** The folder open is a student's (or in one): the list has the Date and Score columns. */
  scoreColumn: boolean
  dropFiles: (folderId: string, entries: DroppedEntry[]) => void
  refuseDrop: () => void
  canDropInto: (itemId: string, targetId: string | null) => boolean
  moveInto: (itemId: string, targetId: string | null) => void
}

/**
 * A score made from the file, as a link to it on the student's Scores tab (the row or card around it opens the file):
 * "● Prone 187.1", with its average per 10 shots when it isn't 10 shots. In the Score column (`cell`), as a chip under
 * the name where the list is too narrow for the column (`chip`), or shorter on a grid card (`card`). Its position's
 * colour is mixed with the text's, so it reads in dark mode too.
 */
function ScoreLink({ e, variant, className }: { e: WithId<Evaluation>; variant: 'cell' | 'chip' | 'card'; className?: string }) {
  const { portal } = useBranch()
  const color = POSITION_COLORS[e.position]
  const chip = variant === 'chip'
  const p10 = e.shots !== 10 ? per10(e.total, e.shots) : null
  const text = `${POSITION_LABELS[e.position]} ${scoreTotal(e)}${p10 !== null ? ` · ${p10} per 10` : ''}`
  return (
    <Link
      to={scorePath(portal, e)}
      // A drag from it moves the row, and a click opens the score, not the file.
      draggable={false}
      onClick={(ev) => ev.stopPropagation()}
      title="Open this score"
      aria-label={`Open the score: ${text}`}
      data-testid="drive-score"
      className={cn(
        'inline-flex max-w-full min-w-0 items-center tabular-nums transition-colors outline-none hover:bg-foreground/[0.07] focus-visible:ring-2 focus-visible:ring-ring',
        chip ? 'rounded-full border px-2 py-0.5 text-[11px] font-medium' : '-mx-1.5 gap-1.5 rounded-md px-1.5 py-0.5',
        variant === 'cell' ? 'text-[13px]' : variant === 'card' ? 'text-xs' : null,
        className,
      )}
      style={{ borderColor: chip ? `${color}55` : undefined, color: `color-mix(in oklab, ${color} 80%, var(--foreground))` }}
    >
      {chip ? null : <span className="size-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden />}
      <span className="truncate">
        <span className={chip ? undefined : 'font-medium'}>{POSITION_LABELS[e.position]}</span>
        {chip ? ' · ' : ' '}
        <span className={chip ? undefined : 'font-semibold'}>{scoreTotal(e)}</span>
        {p10 !== null && variant !== 'card' ? <span className="font-normal text-muted-foreground"> · {p10} per 10</span> : null}
      </span>
    </Link>
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
    <div className={cn(api.scoreColumn ? SCORE_GRID : GRID, 'sticky top-0 z-10 rounded-t-xl border-b bg-background px-3 py-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase')} role="row">
      <span />
      {COLUMNS.filter(({ col }) => col !== 'date').map(({ col, label, className }) => {
        const active = api.sort.col === col
        return (
          <Fragment key={col}>
            <button
              type="button"
              onClick={() => api.onSort(col)}
              className={cn('flex items-center gap-1 py-2 text-left uppercase hover:text-foreground', active && 'text-foreground', col === 'owner' ? ownerHead(api.scoreColumn) : className)}
              title={`Sort by ${label.toLowerCase()}`}
            >
              {label}
              {active ? api.sort.dir === 'asc' ? <LuArrowUp className="size-3.5" /> : <LuArrowDown className="size-3.5" /> : null}
            </button>
            {col === 'name' && api.scoreColumn ? (
              <>
                <button
                  type="button"
                  onClick={() => api.onSort('date')}
                  className={cn('hidden items-center gap-1 py-2 text-left uppercase hover:text-foreground @xl:flex', api.sort.col === 'date' && 'text-foreground')}
                  title="Sort by the day of what each file holds"
                  data-testid="drive-sort-date"
                >
                  Date
                  {api.sort.col === 'date' ? api.sort.dir === 'asc' ? <LuArrowUp className="size-3.5" /> : <LuArrowDown className="size-3.5" /> : null}
                </button>
                <span className="hidden items-center py-2 @4xl:flex">Score</span>
              </>
            ) : null}
          </Fragment>
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
  const scores = (file && api.scoresByFile.get(file.id)) || []
  const changed = itemUpdated(it, api.index)
  // The day of what it holds, where the list has a Date column (a student's folder).
  const day = api.scoreColumn ? itemDate(it, scores) : null
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
        api.scoreColumn ? SCORE_GRID : GRID,
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
          {/* The scores (or "Owners and admins") go under the name when they don't fit on one line with it; on phones a
              long name takes two lines. Where the Score column shows, the scores are there instead. */}
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="line-clamp-2 max-w-full text-sm font-semibold wrap-anywhere @xl:line-clamp-1" title={isFolder ? it.folder.name : file!.name}>
              {isFolder ? it.folder.name : file!.name}
            </span>
            {day ? (
              <span className="text-xs text-muted-foreground tabular-nums @xl:hidden" data-testid="drive-date-short">
                {formatDateKey(day, 'medium')}
              </span>
            ) : null}
            {scores.map((e) => (
              <ScoreLink key={e.id} e={e} variant="chip" className={api.scoreColumn ? '@4xl:hidden' : undefined} />
            ))}
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
      {api.scoreColumn ? (
        <span className="hidden truncate text-[13px] tabular-nums @xl:block" data-testid="drive-date">
          {day ? formatDateKey(day, 'medium') : <span className="text-muted-foreground/50">—</span>}
        </span>
      ) : null}
      {api.scoreColumn ? (
        <span className="hidden min-w-0 flex-col items-start gap-0.5 @4xl:flex">
          {scores.length ? scores.map((e) => <ScoreLink key={e.id} e={e} variant="cell" />) : <span className="text-[13px] text-muted-foreground/50">—</span>}
        </span>
      ) : null}
      <span className={cn('min-w-0 text-[13px] text-muted-foreground', ownerCell(api.scoreColumn))}>
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
  const scores = (file && api.scoresByFile.get(file.id)) || []
  const score = scores[0]
  const uploading = file?.status === 'uploading'
  const flight = file ? flightOf(file.id) : null
  const draggable = api.canWrite && !uploading && !fixed(it)
  const c = isFolder ? api.index.countsOf(it.id) : null
  const where = api.whereOf(it)
  // In a student's folder a file's card names the day of what it holds first.
  const day = api.scoreColumn ? itemDate(it, scores) : null
  const meta = where !== null ? where || 'Drive' : isFolder ? `${c!.folders + c!.files} ${c!.folders + c!.files === 1 ? 'item' : 'items'}` : [day ? formatDateKey(day, 'medium') : null, formatBytes(file!.size)].filter(Boolean).join(' · ')
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
          {/* A result's scores, each opening its score (a search says where the file is instead). */}
          {scores.length && where === null ? (
            <div className="flex min-w-0 flex-wrap gap-x-3">
              {scores.map((e) => (
                <ScoreLink key={e.id} e={e} variant="card" />
              ))}
            </div>
          ) : (
            <div className="truncate text-xs text-muted-foreground">{meta}</div>
          )}
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
