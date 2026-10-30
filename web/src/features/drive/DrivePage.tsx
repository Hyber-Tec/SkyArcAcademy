import { getDocs, query, where } from 'firebase/firestore'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  LuChevronRight,
  LuClipboardPen,
  LuDownload,
  LuExternalLink,
  LuFolderInput,
  LuFolderPlus,
  LuFolderUp,
  LuHardDrive,
  LuLayoutGrid,
  LuList,
  LuLock,
  LuPanelRight,
  LuPencilLine,
  LuPlus,
  LuSearch,
  LuTarget,
  LuTrash2,
  LuUpload,
  LuUserRound,
  LuX,
} from 'react-icons/lu'
import { Link, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { MAX_FILES_PER_DROP, classifyFile, cleanFolderName, isViewableImage } from '@shared/drive/files'
import { studentNamedIn } from '@shared/drive/suggest'
import { DRIVE_DEFAULT_SORT, type DriveItem, countLabel, cycleDriveSort, formatBytes, levelItems, moveAccessNote, moveRefusal, searchWithin, sortDriveItems, trailFrom } from '@shared/drive/model'
import { type DriveFile, accessOf, isFixedFolder, studentFolderId } from '@shared/drive/types'
import { COL } from '@shared/paths'
import { isStaffRole } from '@shared/roles'
import { type Evaluation, POSITION_LABELS, type Position, type ResultKind } from '@shared/shooting/evaluation'
import { positionFromName } from '@shared/sius/parse'
import type { WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { ContextMenuFor, type MenuEntry, menu } from '@/components/app/ItemMenu'
import { useConfirm } from '@/components/app/useConfirm'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { PaperScoreDialog } from '@/features/scores/PaperScoreDialog'
import { useStudentEvaluations } from '@/features/scores/hooks'
import { branchCol } from '@/lib/firestore'
import { cn } from '@/lib/utils'
import { AddResultsDialog, type ResultRow } from './AddResultsDialog'
import { createFolder, ensureFolderPaths, moveItems, removeFailedUpload, renameFile, renameFolder, setFolderAccess, trashItems } from './api'
import { DetailsPanel } from './DetailsPanel'
import { AccessDialog, NameDialog, RefusedDialog } from './dialogs'
import { DriveCard, DriveListHead, DriveRow, type ListApi, dropHandlers } from './DriveList'
import { type DroppedEntry, useFileDropZone, useWindowDropGuard } from './dropzone'
import { FilePreview, downloadFile } from './FilePreview'
import { MoveDialog } from './MoveDialog'
import { AccessBadge, FolderGlyph } from './parts'
import { readSiusFiles } from './sius'
import { type ResultUpload, plannedFile, saveResults, sendAll, uploadsInFlight, useUploadProgress, writeRecords } from './upload'
import { useDriveIndex } from './useDriveIndex'

const SEARCH_LIMIT = 200
const READING_TOAST = 'drive-reading'

type Dialog =
  | { kind: 'newFolder'; parentId: string | null }
  | { kind: 'renameFolder'; id: string }
  | { kind: 'renameFile'; id: string }
  | { kind: 'move'; folderIds: string[]; fileIds: string[] }
  | { kind: 'access'; id: string }
  | { kind: 'paper'; studentId: string | null; fileId: string | null; position: Position | null }
  | { kind: 'refused'; refused: { name: string; reason: string }[]; added: number }

/** "2026-10-07 Prone 186.8.pdf": a SIUS result is filed under its date, so a student's folder sorts by date. */
function resultName(dateKey: string, position: Position | null, total: number | null): string {
  return [dateKey, position ? POSITION_LABELS[position] : null, total === null ? 'Sighters' : total.toFixed(1)].filter(Boolean).join(' ') + '.pdf'
}

/**
 * The Drive (docs/DECISIONS.md §7): every student's folder at the top, and whatever folders the academy makes. Files
 * dropped anywhere on it (or added with New, or a right-click) go into the folder open; SIUS PDFs among them are read
 * on the spot: whoever adds them confirms whose result each is and its position, and each is filed in the student's
 * folder, named by its date, with its scores saved for the reports. Admins and coaches add, rename, move and trash alike
 * (the owner's call, 2026-10-17); only admins open the Trash, to restore or delete for good. Admins choose who sees a
 * folder (F6): everyone on staff, or owners and admins only, which coaches never see (the Contracts folders are); the
 * page lists what the viewer's role may read. Families never see the Drive.
 */
export function DrivePage() {
  const { portal } = useBranch()
  return <DriveBrowser base={`/${portal}/drive`} rootId={null} />
}

/**
 * The Drive's folders and files, with everything done to them: the Drive page (from the top), and a student's Drive tab
 * on their page (from their folder, which it stays inside: its crumbs, search and drops). The address says which folder
 * is open: `{base}`, `{base}/f/{folderId}` or `{base}/file/{fileId}`, one route, so the page stays put between folders.
 */
export function DriveBrowser({ base, rootId, embedded = false }: { base: string; rootId: string | null; embedded?: boolean }) {
  const [segment, routeId = null] = (useParams()['*'] ?? '').split('/')
  const routeFolder = segment === 'f' ? routeId : null
  const routeFile = segment === 'file' ? routeId : null
  const navigate = useNavigate()
  const { branchId, actor, isAdmin, role, portal, timezone } = useBranch()
  useWindowDropGuard()
  useUploadProgress()
  const index = useDriveIndex()
  const ready = !index.loading && !index.error
  const [sort, setSort] = useState(DRIVE_DEFAULT_SORT)
  const [layout, setLayout] = useState<'list' | 'grid'>(() => {
    try {
      return localStorage.getItem('skyarc:drive-layout') === 'grid' ? 'grid' : 'list'
    } catch {
      return 'list'
    }
  })
  const [details, setDetails] = useState(false)
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [preview, setPreview] = useState<WithId<DriveFile> | null>(null)
  const [results, setResults] = useState<{ rows: ResultRow[]; baseId: string | null; fixedStudentId: string | null } | null>(null)
  const [reading, setReading] = useState<{ done: number; total: number } | null>(null)
  const [hotCrumb, setHotCrumb] = useState<string | null | undefined>(undefined)
  const uploadInput = useRef<HTMLInputElement>(null)
  const folderInput = useRef<HTMLInputElement>(null)
  // Where the files chosen next go: the folder whose menu said Upload (null: the top), else the folder open.
  const uploadTo = useRef<string | null | undefined>(undefined)
  const { confirm, dialog: confirmDialog } = useConfirm()

  useEffect(() => {
    try {
      localStorage.setItem('skyarc:drive-layout', layout)
    } catch {
      /* private mode */
    }
  }, [layout])

  // Where we are: the folder in the address, or the folder of the file in the address (else the top).
  const linkedFile = routeFile ? index.fileOf(routeFile) : null
  const cwd = routeFile ? (linkedFile?.folderId ?? rootId) : (routeFolder ?? rootId)
  const folder = ready && cwd ? index.folderOf(cwd) : null
  // A finished student's folder is gone once it's empty: their tab says so, and takes nothing.
  const rootMissing = ready && !!rootId && !index.folderOf(rootId)
  const canWrite = isStaffRole(role) && !rootMissing
  // From the top (the Drive's, or the student's folder) down to the folder open.
  const crumbs: { id: string | null; name: string }[] = rootId ? trailFrom(index, rootId, cwd) : [{ id: null, name: 'Drive' }, ...(folder ? trailFrom(index, null, folder.id) : [])]
  const studentHere = index.studentOf(cwd)
  const urlOf = (id: string | null) => (id && id !== rootId ? `${base}/f/${id}` : base)
  const go = (id: string | null) => {
    setQ('')
    setSelected(new Set())
    navigate(urlOf(id))
  }

  // A link to a file opens it where it lives.
  const opened = useRef<string | null>(null)
  useEffect(() => {
    if (!ready || !routeFile || opened.current === routeFile) return
    opened.current = routeFile
    if (linkedFile) setPreview(linkedFile)
    else toast.error('That file isn’t in the Drive any more.')
  }, [ready, routeFile, linkedFile])
  // A folder that's gone, or (in a student's tab) one outside their folder, gives way to the top.
  useEffect(() => {
    if (!ready) return
    const outside = (id: string | null) => !!rootId && !index.isInside(id, rootId)
    if (routeFolder && (!index.folderOf(routeFolder) || outside(routeFolder))) navigate(base, { replace: true })
    else if (linkedFile && outside(linkedFile.folderId)) navigate(base, { replace: true })
  }, [ready, routeFolder, linkedFile, rootId, index, navigate, base])

  // A student's folder shows each result's scores.
  const { data: evaluations } = useStudentEvaluations(studentHere)
  const scoresByFile = useMemo(() => new Map(evaluations.filter((e) => e.fileId).map((e) => [e.fileId as string, e])), [evaluations])

  const query_ = q.trim()
  const hits = useMemo(() => (query_ && ready ? searchWithin(index, query_, rootId) : []), [index, query_, ready, rootId])
  const rows = useMemo(() => {
    if (!ready) return []
    const sorted = sortDriveItems(query_ ? hits : levelItems(index, cwd), sort, index)
    return sorted.slice(0, SEARCH_LIMIT)
  }, [ready, query_, hits, index, cwd, sort])
  const whereOf = (it: DriveItem) => {
    if (!query_) return null
    if (!rootId) return (it as { where?: string }).where ?? ''
    return trailFrom(index, rootId, it.kind === 'folder' ? it.folder.parentId : it.file.folderId).map((c) => c.name).join(' / ')
  }

  useEffect(() => {
    setSelected((cur) => {
      if (!cur.size) return cur
      const live = new Set(rows.map((r) => r.id))
      const next = new Set([...cur].filter((id) => live.has(id)))
      return next.size === cur.size ? cur : next
    })
  }, [rows])
  const selectedRows = rows.filter((r) => selected.has(r.id))

  // ------------------------------------------------------------ files in
  const refuseDrop = () => toast.error(rootMissing ? 'This student has finished, so their folder takes no new files.' : 'Only the academy’s staff can add files to the Drive.')
  const studentName = (id: string | null) => (id ? (index.students.find((s) => s.id === id)?.name ?? null) : null)
  /** PDFs being read (SIUS results are found among them), shown as a toast until the results open. */
  const showReading = (r: { done: number; total: number } | null, whose: string | null) => {
    setReading(r)
    if (!r) return void toast.dismiss(READING_TOAST)
    toast.loading(r.total === 1 ? 'Reading the PDF…' : `Reading ${Math.min(r.done + 1, r.total)} of ${r.total} PDFs…`, {
      id: READING_TOAST,
      description: whose ? `Then you check the position of each of ${whose}’s results.` : 'Then you choose whose result each one is and its position.',
    })
  }

  async function intake(raw: DroppedEntry[], baseId: string | null) {
    if (!canWrite) return refuseDrop()
    // One drop is read at a time: a second one meanwhile would replace the first one's results.
    if (reading) return void toast.info('Still reading the PDFs from before. Add these once their results open.')
    const entries = raw.slice(0, MAX_FILES_PER_DROP)
    const refused: { name: string; reason: string }[] = []
    if (raw.length > MAX_FILES_PER_DROP) refused.push({ name: `${raw.length - MAX_FILES_PER_DROP} more files`, reason: `Up to ${MAX_FILES_PER_DROP} files at a time.` })
    const accepted: { entry: DroppedEntry; plan: { name: string; kind: string; mime: string } }[] = []
    for (const entry of entries) {
      const plan = classifyFile(entry.file)
      if (plan.ok) accepted.push({ entry, plan })
      else refused.push({ name: plan.name, reason: plan.reason })
    }
    // PDFs are read first: SIUS results go to the review, everything else straight in.
    let pdfs = accepted.filter((a) => a.plan.kind === 'pdf')
    let read: Awaited<ReturnType<typeof readSiusFiles>> = []
    if (pdfs.length) {
      const whose = studentName(index.studentOf(baseId))
      showReading({ done: 0, total: pdfs.length }, whose)
      try {
        read = await readSiusFiles(pdfs.map((a) => a.entry.file), timezone, (done) => showReading({ done, total: pdfs.length }, whose))
      } catch {
        // The reader didn't load (offline?): the PDFs wait for another try rather than going in unread.
        toast.error(pdfs.length === 1 ? 'Couldn’t read the PDF' : 'Couldn’t read the PDFs', { description: `Check the connection, then add ${pdfs.length === 1 ? 'it' : 'them'} again.` })
        pdfs = []
      } finally {
        showReading(null, null)
      }
    }
    const sius = pdfs.flatMap((a, i) => (read[i] ? [{ ...a, sius: read[i]! }] : []))
    const notResults = pdfs.filter((_, i) => !read[i])
    const plain = [...notResults, ...accepted.filter((a) => a.plan.kind !== 'pdf')]
    if (plain.length) void uploadPlain(plain, baseId, notResults.map((a) => a.plan.name))
    if (sius.length) {
      const fixed = index.studentOf(baseId)
      setResults({
        baseId,
        fixedStudentId: fixed,
        rows: sius.map((a, i) => {
          // A name printed on the report (set on the SIUS lane) comes first, then the file name's.
          const printed = a.sius.result.pageText.join(' ')
          const fileName = a.entry.file.name.replace(/\.pdf$/i, '')
          const fromReport = fixed ? null : studentNamedIn(printed, index.students)
          const fromFile = fixed || fromReport ? null : studentNamedIn(fileName, index.students)
          const positionOnReport = positionFromName(printed)
          const position = positionOnReport ?? positionFromName(fileName)
          return {
            key: `${i}-${a.entry.file.name}`,
            file: a.entry.file,
            plan: a.plan,
            sius: a.sius,
            studentId: fixed ?? fromReport ?? fromFile,
            position,
            studentFrom: fromReport ? 'report' : fromFile ? 'file' : null,
            positionFrom: positionOnReport ? 'report' : position ? 'file' : null,
          }
        }),
      })
    }
    if (refused.length) setDialog({ kind: 'refused', refused, added: plain.length + sius.length })
  }

  /** Uploads files as they are; `notResults` names the PDFs among them that were read and aren't SIUS results. */
  async function uploadPlain(items: { entry: DroppedEntry; plan: { name: string; kind: string; mime: string } }[], baseId: string | null, notResults: string[] = []) {
    const key = (path: string[]) => path.map(cleanFolderName).join('/')
    try {
      const chains = new Map(items.filter((a) => a.entry.path.length).map((a) => [key(a.entry.path), a.entry.path]))
      const made = chains.size ? await ensureFolderPaths(branchId, actor, index, baseId, [...chains.values()]) : { folders: new Map<string, string | null>([['', baseId]]), accessIn: index.accessIn }
      const student = index.studentOf(baseId)
      const ups = items.map((a) => {
        const folderId = made.folders.get(key(a.entry.path)) ?? baseId
        return plannedFile(branchId, a.entry.file, a.plan, folderId, student, { access: made.accessIn(folderId) })
      })
      await writeRecords(branchId, actor, index, ups, chains.size ? [] : [baseId])
      const failures = await sendAll(branchId, ups)
      if (failures.length) toast.error(failures.length === 1 ? 'One file didn’t upload' : `${failures.length} files didn’t upload`, { description: failures.slice(0, 3).join(' ') })
      else {
        // A PDF that isn't a SIUS result is still kept, and whoever dropped it is told why it has no scores.
        const why = !notResults.length
          ? undefined
          : ups.length === 1
            ? 'It isn’t a SIUS result, so it’s kept as a file, without scores.'
            : notResults.length === 1
              ? `“${notResults[0]}” isn’t a SIUS result, so it’s kept as a file, without scores.`
              : `${notResults.length} of the PDFs aren’t SIUS results, so they’re kept as files, without scores.`
        toast.success(ups.length === 1 ? `Uploaded “${ups[0].record.name}”` : `Uploaded ${ups.length} files`, { description: why, duration: why ? 8000 : undefined })
      }
    } catch (e) {
      toast.error('Couldn’t upload', { description: (e as Error).message })
    }
  }

  /** Where a result is filed: the folder it was dropped in when that's the student's own (or inside it), else the student's folder. */
  const resultFolder = (baseId: string | null, studentId: string) => (baseId && index.studentOf(baseId) === studentId ? baseId : studentFolderId(studentId))
  /** "Mia Larkin’s folder", or "Mia Larkin / Matches" inside it. */
  const resultWhere = (baseId: string | null, studentId: string) => {
    const path = index.pathOf(resultFolder(baseId, studentId)).map((c) => c.name)
    if (path.length > 1) return path.join(' / ')
    return `${path[0] ?? index.students.find((s) => s.id === studentId)?.name ?? 'the student'}’s folder`
  }

  async function confirmResults(list: ResultRow[], kind: ResultKind) {
    if (!results) return
    const studentName = new Map(index.students.map((s) => [s.id, s.name]))
    // A result already in the Drive (the same printed time and total) isn't added twice.
    const known = new Map<string, Set<string>>()
    for (const id of new Set(list.map((r) => r.studentId as string))) {
      const snap = await getDocs(query(branchCol(branchId, COL.evaluations), where('studentId', '==', id)))
      known.set(id, new Set(snap.docs.map((d) => d.data() as Evaluation).filter((e) => e.sius).map((e) => `${e.sius!.printed}|${e.total}`)))
    }
    const fresh = list.filter((r) => r.sius.reading.noShots || !known.get(r.studentId!)?.has(`${r.sius.reading.printed}|${r.sius.reading.total}`))
    const skipped = list.length - fresh.length
    const uploads: ResultUpload[] = fresh.map((r) => {
      const reading = r.sius.reading
      const studentId = r.studentId as string
      const folderId = resultFolder(results.baseId, studentId)
      const up = plannedFile(branchId, r.file, { ...r.plan, name: resultName(reading.dateKey, r.position, reading.noShots ? null : reading.total) }, folderId, studentId, { originalName: r.file.name })
      const evaluation =
        reading.noShots || !r.position
          ? null
          : {
              studentId,
              studentName: studentName.get(studentId) ?? '',
              source: 'sius' as const,
              kind,
              position: r.position,
              dateKey: reading.dateKey,
              timeMin: reading.timeMin,
              shots: reading.shots,
              total: reading.total,
              wholeTotal: reading.wholeTotal,
              innerTens: reading.innerTens,
              mpi: reading.mpi,
              groupMm: reading.groupMm,
              series: reading.series,
              sighters: reading.sighters,
              fileId: up.fileId,
              note: '',
              problems: reading.problems,
              sius: { printed: reading.printed, event: reading.event, clockFixMin: reading.clockFixMin },
            }
      return { up, evaluation }
    })
    const baseId = results.baseId
    setResults(null)
    if (skipped) toast.info(skipped === 1 ? 'One result was already in the Drive, so it wasn’t added again.' : `${skipped} results were already in the Drive, so they weren’t added again.`)
    if (!uploads.length) return
    try {
      const failures = await saveResults(branchId, actor, index, uploads)
      const scored = uploads.filter((u) => u.evaluation).length
      if (failures.length) toast.error(failures.length === 1 ? 'One file didn’t upload' : `${failures.length} files didn’t upload`, { description: failures.slice(0, 3).join(' ') })
      else {
        const extra = uploads.length - scored
        const sighters = `${extra === 1 ? 'one file' : `${extra} files`} with sighters only`
        const who = [...new Set(uploads.map((u) => u.up.record.studentId as string))]
        const one = who.length === 1 ? who[0] : null
        const name = one ? (studentName.get(one) ?? '') : ''
        const added = scored ? `${scored === 1 ? 'One result' : `${scored} results`} added${one && name ? ` for ${name}` : ''}${extra ? `, plus ${sighters}` : ''}` : `Added ${sighters}`
        // One student's results: their scores are a click away.
        toast.success(added, {
          description: one ? `Filed in ${resultWhere(baseId, one)}.` : `Filed in ${who.length} students’ folders.`,
          action: one && scored ? { label: 'Open scores', onClick: () => navigate(`/${portal}/students/${one}/scores`) } : undefined,
          duration: one && scored ? 10_000 : undefined,
        })
      }
    } catch (e) {
      toast.error('Couldn’t add the results', { description: (e as Error).message })
    }
  }

  const pageDrop = useFileDropZone({ canWrite, disabled: !ready || !!dialog || !!results, onRefuse: refuseDrop, onFiles: (entries) => void intake(entries, cwd) })
  const dropFiles = (folderId: string, entries: DroppedEntry[]) => void intake(entries, folderId)

  // ------------------------------------------------------------ moving
  const homeOf = (id: string): string | null | undefined => {
    const f = index.folderOf(id)
    if (f) return f.parentId
    const file = index.fileOf(id)
    return file ? file.folderId : undefined
  }
  const canDropInto = (itemId: string, targetId: string | null) => {
    if (!canWrite || itemId === targetId) return false
    if (targetId && !index.folderOf(targetId)) return false
    const from = homeOf(itemId)
    if (from === undefined || from === targetId) return false
    const isFolder = !!index.folderOf(itemId)
    return !moveRefusal(index, isFolder ? [itemId] : [], isFolder ? [] : [itemId], targetId)
  }
  const moveInto = (itemId: string, targetId: string | null) => {
    const isFolder = !!index.folderOf(itemId)
    // Dropped into (or out of) a folder only owners and admins see: who sees it changes, and the message says so.
    const note = moveAccessNote(index, isFolder ? [itemId] : [], isFolder ? [] : [itemId], targetId) ?? undefined
    void moveItems(branchId, actor, index, isFolder ? [itemId] : [], isFolder ? [] : [itemId], targetId)
      .then(() => toast.success(`Moved to ${targetId ? `“${index.folderOf(targetId)?.name}”` : 'the top of the Drive'}`, { description: note }))
      .catch((e: Error) => toast.error('Couldn’t move it', { description: e.message }))
  }

  // ------------------------------------------------------------ menus
  const openItem = (it: DriveItem) => {
    if (it.kind === 'folder') return go(it.id)
    if (it.file.status === 'uploading') return
    if (it.file.status === 'error') return toast.error(it.file.error || 'This upload failed.')
    setPreview(it.file)
  }
  const trash = async (folderIds: string[], fileIds: string[]) => {
    const folders = folderIds.map((id) => index.folderOf(id)!).filter(Boolean)
    const files = fileIds.map((id) => index.fileOf(id)!).filter(Boolean)
    const inside = folders.reduce((n, f) => n + index.countsOf(f.id).files, 0)
    const count = folders.length + files.length
    const ok = await confirm({
      title: count === 1 ? `Move “${folders[0]?.name ?? files[0]?.name}” to the Trash?` : `Move ${count} items to the Trash?`,
      description: `${inside ? `${countLabel(inside, 'file')} inside go${inside === 1 ? 'es' : ''} with ${folders.length === 1 ? 'it' : 'them'}. ` : ''}${isAdmin ? 'You' : 'An admin'} can restore ${count === 1 ? 'it' : 'them'} from the Trash.`,
      confirmLabel: 'Move to Trash',
      destructive: true,
    })
    if (!ok) return
    try {
      await trashItems(branchId, actor, folders, files)
      setSelected(new Set())
      toast.success('Moved to the Trash')
    } catch (e) {
      toast.error('Couldn’t move it to the Trash', { description: (e as Error).message })
    }
  }
  const menuOf = (it: DriveItem): MenuEntry[] => {
    // One of several selected: the menu is for all of them.
    if (canWrite && selected.size > 1 && selected.has(it.id)) {
      const folderIds = selectedRows.filter((r) => r.kind === 'folder').map((r) => r.id)
      const fileIds = selectedRows.filter((r) => r.kind === 'file').map((r) => r.id)
      return menu(
        { kind: 'label', label: `${countLabel(folderIds.length + fileIds.length, 'item')} selected` },
        { label: 'Move to…', icon: LuFolderInput, onSelect: () => setDialog({ kind: 'move', folderIds, fileIds }) },
        { label: 'Clear the selection', icon: LuX, onSelect: () => setSelected(new Set()) },
        { label: 'Move to Trash', icon: LuTrash2, destructive: true, separatorBefore: true, onSelect: () => void trash(folderIds, fileIds) },
      )
    }
    if (it.kind === 'folder') {
      const f = it.folder
      const fixed = isFixedFolder(f)
      return menu(
        { label: 'Open', icon: LuChevronRight, onSelect: () => go(f.id) },
        canWrite && { kind: 'sub', label: 'New', icon: LuPlus, entries: newItems(f.id) },
        f.studentId ? { label: 'Student’s page', icon: LuUserRound, onSelect: () => navigate(`/${portal}/students/${f.studentId}`) } : null,
        f.studentId ? { label: 'Scores', icon: LuTarget, onSelect: () => navigate(`/${portal}/students/${f.studentId}/scores`) } : null,
        canWrite && !fixed && { label: 'Rename…', icon: LuPencilLine, onSelect: () => setDialog({ kind: 'renameFolder', id: f.id }) },
        canWrite && !fixed && { label: 'Move to…', icon: LuFolderInput, onSelect: () => setDialog({ kind: 'move', folderIds: [f.id], fileIds: [] }) },
        // Who sees it: admins choose, for any folder but a student's (or one in it) and the Contracts folder.
        isAdmin && !fixed && !index.studentOf(f.id) && { label: 'Who can see it…', icon: LuLock, onSelect: () => setDialog({ kind: 'access', id: f.id }) },
        canWrite && !fixed && { label: 'Move to Trash', icon: LuTrash2, destructive: true, separatorBefore: true, onSelect: () => void trash([f.id], []) },
      )
    }
    const f = it.file
    const settled = f.status !== 'uploading'
    const fileReady = f.status === 'ready'
    const score = scoresByFile.get(f.id)
    const photo = isViewableImage(f.kind) || f.kind === 'heic' || f.kind === 'heif'
    const stale = f.status === 'uploading' && !uploadsInFlight()
    return menu(
      { label: 'Open', icon: LuExternalLink, disabled: !fileReady, onSelect: () => setPreview(f) },
      { label: 'Download', icon: LuDownload, disabled: !fileReady, onSelect: () => void downloadFile(branchId, f).catch(() => toast.error('Couldn’t download it.')) },
      score && f.studentId ? { label: 'Scores', icon: LuTarget, onSelect: () => navigate(`/${portal}/students/${f.studentId}/scores`) } : null,
      canWrite && photo && !score && fileReady ? { label: 'Add paper scores…', icon: LuClipboardPen, onSelect: () => setDialog({ kind: 'paper', studentId: f.studentId, fileId: f.id, position: positionFromName(f.name) }) } : null,
      canWrite && { label: 'Rename…', icon: LuPencilLine, disabled: !settled, separatorBefore: true, onSelect: () => setDialog({ kind: 'renameFile', id: f.id }) },
      canWrite && { label: 'Move to…', icon: LuFolderInput, disabled: !settled, onSelect: () => setDialog({ kind: 'move', folderIds: [], fileIds: [f.id] }) },
      canWrite && (f.status === 'error' || stale) ? { label: 'Remove', icon: LuTrash2, destructive: true, separatorBefore: true, onSelect: () => void removeFailedUpload(branchId, f).catch((e: Error) => toast.error(e.message)) } : null,
      canWrite && settled && { label: 'Move to Trash', icon: LuTrash2, destructive: true, separatorBefore: true, onSelect: () => void trash([], [f.id]) },
    )
  }
  const choose = (input: React.RefObject<HTMLInputElement | null>, folderId: string | null) => {
    uploadTo.current = folderId
    input.current?.click()
  }
  /** New (the button), and the same in the menus: a folder's, a crumb's, and a right-click on the list's background. */
  const newItems = (folderId: string | null) =>
    menu(
      { label: 'New folder', icon: LuFolderPlus, onSelect: () => setDialog({ kind: 'newFolder', parentId: folderId }) },
      { label: 'Upload files', icon: LuUpload, onSelect: () => choose(uploadInput, folderId) },
      { label: 'Upload folder', icon: LuFolderUp, onSelect: () => choose(folderInput, folderId) },
      { label: 'Add paper scores…', icon: LuClipboardPen, separatorBefore: true, onSelect: () => setDialog({ kind: 'paper', studentId: index.studentOf(folderId), fileId: null, position: null }) },
    )
  const backgroundMenu = menu(
    ...(canWrite && ready ? newItems(cwd) : []),
    {
      kind: 'radio',
      value: layout,
      options: [
        { value: 'list', label: 'List' },
        { value: 'grid', label: 'Grid' },
      ],
      onChange: (v) => setLayout(v === 'grid' ? 'grid' : 'list'),
      separatorBefore: true,
    },
    { label: details ? 'Hide details' : 'Show details', icon: LuPanelRight, separatorBefore: true, onSelect: () => setDetails((d) => !d) },
  )
  /** A crumb's menu: its folder's (the top's is New). */
  const crumbMenu = (id: string | null): MenuEntry[] => {
    const f = id ? index.folderOf(id) : null
    if (!id) return canWrite ? newItems(null) : []
    return f ? menuOf({ kind: 'folder', id, folder: f }) : []
  }

  const api: ListApi = {
    index,
    canWrite,
    sort,
    onSort: (col) => setSort((s) => cycleDriveSort(s, col)),
    whereOf,
    menuOf,
    openItem,
    selected,
    toggle: (id) =>
      setSelected((cur) => {
        const next = new Set(cur)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      }),
    scoresByFile,
    dropFiles,
    refuseDrop,
    canDropInto,
    moveInto,
  }

  const used = ready ? index.countsOf(null).bytes : 0
  const controls = (
    <span className="flex items-center gap-1 normal-case">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8" aria-label={layout === 'list' ? 'Grid view' : 'List view'} onClick={() => setLayout(layout === 'list' ? 'grid' : 'list')}>
            {layout === 'list' ? <LuLayoutGrid /> : <LuList />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{layout === 'list' ? 'Grid view' : 'List view'}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className={cn('size-8', details && 'bg-muted')} aria-label="Details" aria-pressed={details} onClick={() => setDetails((d) => !d)}>
            <LuChevronRight className={cn('transition-transform', details && 'rotate-180')} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{details ? 'Hide details' : 'Show details'}</TooltipContent>
      </Tooltip>
    </span>
  )

  const rootName = rootId ? (index.folderOf(rootId)?.name ?? null) : null
  /** "the Drive", or "Mia Larkin’s folder" in her tab: what a search looks through. */
  const within = rootName ? `${rootName}’s folder` : 'the Drive'
  let state: React.ReactNode = null
  if (index.error) state = <p className="p-10 text-center text-sm text-muted-foreground">The Drive couldn’t be loaded. {index.error.message}</p>
  else if (!ready) state = <Skeleton className="m-3 h-48" />
  else if (!rows.length && !query_)
    state = (
      <div className="flex flex-col items-center gap-2 p-12 text-center text-sm text-muted-foreground">
        <LuHardDrive className="size-6" />
        {rootMissing ? 'This student has finished, and their folder is empty.' : cwd ? 'This folder is empty.' : 'Nothing in the Drive yet.'}
        {canWrite ? <span>Drop files here, or use New (or a right-click).</span> : null}
      </div>
    )
  else if (!rows.length) state = <p className="p-10 text-center text-sm text-muted-foreground">Nothing in {within} matches “{query_}”.</p>

  const title = folder ? folder.name : 'Drive'
  // ← and → in the preview step through the folder in the list's order.
  const siblings = preview ? sortDriveItems(index.filesIn(preview.folderId).map((file) => ({ kind: 'file' as const, id: file.id, file })), sort, index).map((it) => it.file) : []
  const dialogFolder = dialog?.kind === 'renameFolder' ? index.folderOf(dialog.id) : null
  const dialogFile = dialog?.kind === 'renameFile' ? index.fileOf(dialog.id) : null

  const nav = (
    <nav className="flex min-w-0 flex-wrap items-center gap-1 text-sm text-muted-foreground" aria-label="Where you are">
      {crumbs.map((c, i) => (
        <span key={c.id ?? 'top'} className="flex min-w-0 items-center gap-1">
          {i ? <span aria-hidden>/</span> : null}
          <ContextMenuFor entries={crumbMenu(c.id)}>
            {i === crumbs.length - 1 ? (
              <span className="truncate px-1 font-medium text-foreground">{c.name}</span>
            ) : (
              <button type="button" className={cn('truncate rounded px-1 hover:text-foreground', hotCrumb === c.id && 'bg-brand/10 text-foreground')} onClick={() => go(c.id)} {...dropHandlers(api, c.id, (h) => setHotCrumb(h ? c.id : undefined))}>
                {c.name}
              </button>
            )}
          </ContextMenuFor>
        </span>
      ))}
    </nav>
  )
  // Where a drop lands, and what happens to SIUS results in it.
  const dropWhere = folder?.studentId ? `${folder.name}’s folder` : folder ? `“${folder.name}”` : 'the Drive'
  const dropLine = studentHere ? `SIUS results are read and filed as ${studentName(studentHere) ?? 'the student'}’s, with their scores.` : 'SIUS results are read and filed in each student’s folder, with their scores.'

  return (
    <>
      {/* The whole page takes a drop, into the folder open, and a right-click on it is New (a row's or a crumb's is
          its own). */}
      <ContextMenuFor entries={backgroundMenu}>
        <div
          className={cn('@container/drive relative', embedded ? '-m-2 min-h-[28rem] p-2' : '-m-4 min-h-[calc(100svh-3.5rem)] p-4 sm:-m-6 sm:p-6')}
          data-testid="drive-page"
          {...pageDrop.handlers}
        >
          {pageDrop.dragOver ? (
            <div className="pointer-events-none absolute inset-2 z-30 rounded-2xl border-2 border-dashed border-brand/60 bg-brand/5" data-testid="drive-drop-overlay">
              <div className="sticky top-[35vh] mx-auto mt-24 w-fit max-w-[calc(100%-2rem)] rounded-xl border bg-card px-5 py-3 text-center shadow-lg">
                <p className="flex items-center justify-center gap-2 text-sm font-semibold">
                  <LuUpload className="size-4 shrink-0 text-brand-text" /> Drop to upload to {dropWhere}
                </p>
                <p className="mt-0.5 text-[13px] text-pretty text-muted-foreground">{dropLine}</p>
              </div>
            </div>
          ) : null}

          {embedded ? (
            <div className="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-2">
              {nav}
              {!rootMissing ? (
                <Button variant="ghost" size="sm" className="text-muted-foreground" asChild>
                  <Link to={`/${portal}/drive${cwd ? `/f/${cwd}` : ''}`}>
                    <LuExternalLink /> Open in the Drive
                  </Link>
                </Button>
              ) : null}
            </div>
          ) : (
            <>
              <div className="mb-3">{nav}</div>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border bg-card">
                    {folder ? <FolderGlyph student={!!folder.studentId} locked={accessOf(folder) === 'admins'} className="size-6" /> : <LuHardDrive className="size-5" />}
                  </span>
                  <h1 className="truncate text-2xl font-semibold tracking-tight">{title}</h1>
                  {folder && accessOf(folder) === 'admins' ? <AccessBadge /> : null}
                  {folder?.studentId ? (
                    <Button variant="outline" size="sm" asChild>
                      <Link to={`/${portal}/students/${folder.studentId}/scores`}>
                        <LuTarget /> Scores
                      </Link>
                    </Button>
                  ) : null}
                </div>
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  {isAdmin ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Trash" asChild>
                          <Link to={`${base}/trash`}>
                            <LuTrash2 />
                          </Link>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Trash</TooltipContent>
                    </Tooltip>
                  ) : null}
                  <span className="tabular-nums" title="Everything stored in the Drive (not counting the Trash)">
                    {ready ? `${formatBytes(used)} used` : 'Measuring…'}
                  </span>
                </div>
              </div>
            </>
          )}

          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="relative w-full max-w-md" role="search">
              <LuSearch className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && setQ('')}
                // The browser's own menu (paste) here, not the page's.
                onContextMenu={(e) => e.stopPropagation()}
                placeholder={`Search ${within}`}
                aria-label={`Search ${within}`}
                autoComplete="off"
                data-1p-ignore="true"
                className="rounded-full pr-9 pl-9"
              />
              {q ? (
                <button type="button" className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-muted" onClick={() => setQ('')} aria-label="Clear search">
                  <LuX className="size-4" />
                </button>
              ) : null}
            </div>
            {canWrite ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button className="rounded-full" disabled={!ready}>
                    <LuPlus /> New
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  {newItems(cwd).map((m) =>
                    m.kind === undefined || m.kind === 'item' ? (
                      <span key={m.label} className="contents">
                        {m.separatorBefore ? <DropdownMenuSeparator /> : null}
                        <DropdownMenuItem onSelect={m.onSelect}>
                          {m.icon ? <m.icon /> : null} {m.label}
                        </DropdownMenuItem>
                      </span>
                    ) : null,
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>

          {query_ && ready ? (
            <p className="mb-2 text-sm text-muted-foreground">
              {hits.length ? `${countLabel(hits.length, 'result')} in ${within} for “${query_}”${hits.length > SEARCH_LIMIT ? ` (the first ${SEARCH_LIMIT} are shown)` : ''}` : null}
            </p>
          ) : null}
          {canWrite && selectedRows.length ? (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm" role="toolbar" aria-label="Selection">
              <span className="font-medium">{selectedRows.length} selected</span>
              <Button size="sm" variant="outline" onClick={() => setDialog({ kind: 'move', folderIds: selectedRows.filter((r) => r.kind === 'folder').map((r) => r.id), fileIds: selectedRows.filter((r) => r.kind === 'file').map((r) => r.id) })}>
                <LuFolderInput /> Move…
              </Button>
              <Button size="sm" variant="outline" className="text-destructive" onClick={() => void trash(selectedRows.filter((r) => r.kind === 'folder').map((r) => r.id), selectedRows.filter((r) => r.kind === 'file').map((r) => r.id))}>
                <LuTrash2 /> Move to Trash
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                Clear
              </Button>
            </div>
          ) : null}

          <input ref={uploadInput} type="file" multiple hidden onChange={(e) => {
            const files = [...(e.target.files ?? [])]
            e.target.value = ''
            void intake(files.map((file) => ({ file, path: [] })), uploadTo.current === undefined ? cwd : uploadTo.current)
          }} />
          <input ref={folderInput} type="file" multiple hidden {...({ webkitdirectory: '', directory: '' } as Record<string, string>)} onChange={(e) => {
            const files = [...(e.target.files ?? [])].map((file) => ({ file, path: String((file as File & { webkitRelativePath?: string }).webkitRelativePath ?? '').split('/').filter(Boolean).slice(0, -1) }))
            e.target.value = ''
            void intake(files, uploadTo.current === undefined ? cwd : uploadTo.current)
          }} />

          {/* Beside the list when there's room: the page's width on the Drive, the tab's own on a student's page. */}
          <div className={cn('grid gap-4', details && (embedded ? '@4xl/drive:grid-cols-[minmax(0,1fr)_18rem]' : 'lg:grid-cols-[minmax(0,1fr)_18rem]'))}>
            <div className="@container min-w-0 rounded-xl border bg-card">
              {layout === 'list' ? (
                <>
                  <DriveListHead api={api} controls={controls} />
                  {state ?? rows.map((it) => <DriveRow key={it.id} it={it} api={api} />)}
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between border-b px-3 py-1.5">
                    <span className="text-xs text-muted-foreground">
                      {sort.col ? `Sorted by ${sort.col}, ${sort.dir === 'asc' ? 'A to Z or oldest first' : 'newest or largest first'}` : 'Folders A to Z, then the newest files'}
                    </span>
                    {controls}
                  </div>
                  {state ?? (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-3 p-3">
                      {rows.map((it) => (
                        <DriveCard key={it.id} it={it} api={api} />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
            {details && ready ? (
              <DetailsPanel
                index={index}
                folderId={cwd}
                selected={selectedRows.length === 1 ? selectedRows[0] : null}
                scoresByFile={scoresByFile}
                onAccess={isAdmin ? (id) => setDialog({ kind: 'access', id }) : undefined}
              />
            ) : null}
          </div>
        </div>
      </ContextMenuFor>

      {/* Dialogs sit outside the page's right-click menu: their fields keep the browser's own. */}
      {preview ? (
        <FilePreview
          file={preview}
          siblings={siblings}
          where={['Drive', ...index.pathOf(preview.folderId).map((c) => c.name)].join(' / ')}
          onOpen={setPreview}
          onClose={() => {
            setPreview(null)
            if (routeFile) navigate(urlOf(cwd), { replace: true })
          }}
        />
      ) : null}
      {results ? (
        <AddResultsDialog
          rows={results.rows}
          students={index.students}
          fixedStudentId={results.fixedStudentId}
          whereOf={(studentId) => resultWhere(results.baseId, studentId)}
          onConfirm={confirmResults}
          onClose={() => setResults(null)}
        />
      ) : null}
      {dialog?.kind === 'newFolder' ? (
        <NameDialog
          title="New folder"
          description={index.accessIn(dialog.parentId) === 'admins' ? 'Only owners and admins will see it, like the folder it’s in.' : undefined}
          confirmLabel="Make folder"
          initial="Untitled folder"
          onSubmit={async (name) => {
            if (index.nameTaken(dialog.parentId, name)) throw new Error(`There’s already a folder called “${cleanFolderName(name)}” here.`)
            await createFolder(branchId, actor, index, name, dialog.parentId)
          }}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === 'renameFolder' && dialogFolder ? (
        <NameDialog
          title="Rename folder"
          initial={dialogFolder.name}
          onSubmit={async (name) => {
            if (index.nameTaken(dialogFolder.parentId, name, dialogFolder.id)) throw new Error(`There’s already a folder called “${cleanFolderName(name)}” here.`)
            await renameFolder(branchId, actor, dialogFolder, name)
          }}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === 'renameFile' && dialogFile ? <NameDialog title="Rename file" initial={dialogFile.name} maxLength={200} selectStem onSubmit={(name) => renameFile(branchId, actor, dialogFile, name)} onClose={() => setDialog(null)} /> : null}
      {dialog?.kind === 'move' ? (
        <MoveDialog
          index={index}
          folderIds={dialog.folderIds}
          fileIds={dialog.fileIds}
          startAt={cwd}
          onMove={async (target) => {
            const note = moveAccessNote(index, dialog.folderIds, dialog.fileIds, target) ?? undefined
            await moveItems(branchId, actor, index, dialog.folderIds, dialog.fileIds, target)
            setSelected(new Set())
            toast.success(`Moved to ${target ? `“${index.folderOf(target)?.name}”` : 'the top of the Drive'}`, { description: note })
          }}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === 'access' ? (
        <AccessDialog
          index={index}
          folderId={dialog.id}
          onSave={async (access) => {
            await setFolderAccess(branchId, actor, index, dialog.id, access)
            toast.success(access === 'admins' ? `Only owners and admins see “${index.folderOf(dialog.id)?.name}” now` : `Everyone on staff sees “${index.folderOf(dialog.id)?.name}” now`)
          }}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === 'paper' ? (
        <PaperScoreDialog open onOpenChange={(o) => !o && setDialog(null)} studentId={dialog.studentId} fileId={dialog.fileId} position={dialog.position} />
      ) : null}
      {dialog?.kind === 'refused' ? <RefusedDialog refused={dialog.refused} added={dialog.added} onClose={() => setDialog(null)} /> : null}
      {confirmDialog}
    </>
  )
}
