import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { LuCamera, LuCheck, LuCircleAlert, LuCircleCheck, LuFileSearch, LuFileX, LuLoaderCircle, LuScanSearch, LuTrophy, LuUpload } from 'react-icons/lu'
import { toast } from 'sonner'
import type { DriveStudent } from '@shared/drive/model'
import { dayWords } from '@shared/scores/feed'
import { type Evaluation, POSITIONS, POSITION_COLORS, POSITION_LABELS, type Position, RESULT_KINDS, RESULT_KIND_LABELS, type ResultKind, isPosition, per10, wholePer10 } from '@shared/shooting/evaluation'
import { reviewTotals } from '@shared/targets/review'
import { type DateKey, formatMinutes, todayKey } from '@shared/time'
import type { Student, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useFileDropZone } from '@/features/drive/dropzone'
import { type FailedUpload, resend } from '@/features/drive/upload'
import { useDriveIndex } from '@/features/drive/useDriveIndex'
import { one } from '@/features/reports/model'
import { LevelChip } from '@/features/schedule/seatParts'
import { CompetitionForm } from '@/features/scores/CompetitionDialog'
import { CardCheck } from '@/features/scores/photos/CardCheck'
import { useObjectUrl } from '@/features/scores/photos/objectUrl'
import { TargetPlot } from '@/features/scores/TargetPlot'
import { cn } from '@/lib/utils'
import type { EarlierScore } from '../data'
import { ACCEPTED_FILES } from '../files'
import { type AddItem, fileTypeOf, itemNeeds, kindOfItem, leftOut, markRepeats, resultsOf, saves, status, withKind } from './items'
import { cardDraft, readFile } from './read'
import { saveItems } from './save'

/** What Add scores is asked to do: read some files at once, or (null) open where they're dropped or chosen. */
export interface AddRequest {
  id: number
  files: File[] | null
}

/** Files read at once. */
const MAX_FILES = 40

const plural = (n: number, word: string, words = `${word}s`) => `${n} ${n === 1 ? word : words}`

/**
 * Add scores on the Scores page (Goo's pick, docs/DECISIONS.md §29): files dropped on the page or chosen are read on
 * the spot, each as what it is: a SIUS report's PDF, a photo of a paper card, or a competition's results sheet (its
 * photo or PDF). "Reading 4 files…", then "Check 6 results": each with whose it is and where that came from, its
 * position, when, its figures and what it was; only what couldn't be read is asked ("Whose result?", a position, a card
 * to check, a sheet's numbers). Save files each in its student's Drive folder with its result, at once: the page shows
 * them at the top while the server confirms, and the files go up behind.
 */
export function AddScoresDialog({
  request,
  onClose,
  onSaved,
  students,
  known,
  student = null,
}: {
  request: AddRequest | null
  onClose: () => void
  /** The results saved, as soon as they're saved on this device. */
  onSaved: (added: WithId<Evaluation>[]) => void
  students: readonly WithId<Student>[]
  /** Every result already known: the same SIUS result isn't added twice, and a card shows a new best. */
  known: readonly EarlierScore[]
  /** A student's own Scores tab: everything dropped there is theirs (a file naming another student says so). */
  student?: string | null
}) {
  // A card is checked as on the Scores tab, in the room its picture and boxes need.
  const [wide, setWide] = useState(false)
  return (
    <Dialog open={!!request} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={cn('flex max-h-[92svh] flex-col gap-0', wide ? 'sm:max-w-5xl' : 'sm:max-w-3xl')} data-testid="add-scores-dialog">
        {request ? <AddFlow key={request.id} files={request.files} onClose={onClose} onSaved={onSaved} students={students} known={known} onWide={setWide} fixed={student} /> : null}
      </DialogContent>
    </Dialog>
  )
}

type View = { kind: 'list' } | { kind: 'card' | 'sheet'; key: number }

function AddFlow({
  files,
  onClose,
  onSaved,
  students,
  known,
  onWide,
  fixed,
}: {
  files: File[] | null
  onClose: () => void
  onSaved: (added: WithId<Evaluation>[]) => void
  students: readonly WithId<Student>[]
  known: readonly EarlierScore[]
  onWide: (wide: boolean) => void
  fixed: string | null
}) {
  const { branchId, actor, timezone, settings } = useBranch()
  const today = todayKey(timezone)
  const index = useDriveIndex()
  const byId = useMemo(() => new Map(students.map((s) => [s.id, s])), [students])
  const driveStudents = useMemo<DriveStudent[]>(() => students.map((s) => ({ id: s.id, name: s.name, otherNames: s.otherNames ?? [], finished: s.status === 'finished' })), [students])
  const [read_, setItems] = useState<AddItem[]>([])
  // Each file with what it repeats, if anything (a saved result, or a file above it), worked out as it changes.
  const items = useMemo(() => markRepeats(read_, known, (k) => `${POSITION_LABELS[k.position].toLowerCase()} ${Number.isInteger(k.total) ? k.total : k.total.toFixed(1)}`), [read_, known])
  const [step, setStep] = useState<'pick' | 'reading' | 'check'>(files ? 'reading' : 'pick')
  const [view, setView] = useState<View>({ kind: 'list' })
  useEffect(() => {
    onWide(view.kind === 'card')
    return () => onWide(false)
  }, [view.kind, onWide])
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const nameOf = (id: string) => byId.get(id)?.name ?? ''
  const patch = (key: number, p: Partial<AddItem> | ((i: AddItem) => AddItem)) => setItems((all) => all.map((i) => (i.key === key ? (typeof p === 'function' ? p(i) : { ...i, ...p }) : i)))

  /** Whose an item is, picked here (a result already in their scores is then left out, `markRepeats`). */
  const pickStudent = (key: number, studentId: string) => patch(key, (i) => ({ ...i, studentId, studentFrom: 'picked' as const, namesOther: null, keepRepeat: false }))

  /** Reads the files, three at a time, then shows what was read. */
  async function read(list: File[]) {
    const fresh: AddItem[] = list.slice(0, MAX_FILES).map((file, i) => ({ key: i + 1, file, type: fileTypeOf(file), status: 'waiting', step: null, found: null, studentId: null, studentFrom: null, said: null, saidIn: null, candidates: [] }))
    if (list.length > MAX_FILES) toast(`The first ${MAX_FILES} files are read`, { description: 'Add the others once these are saved.' })
    setItems(fresh)
    setStep('reading')
    let next = 0
    const worker = async () => {
      while (next < fresh.length && alive.current) {
        const item = fresh[next++]
        patch(item.key, { status: 'reading' })
        try {
          const got = await readFile(item, { branchId, timezone, today, students: driveStudents, onStep: (s) => alive.current && patch(item.key, { step: s }) })
          if (!alive.current) return
          // On a student's own tab, it's theirs; a file naming someone else says so, to change it with a click.
          const theirs = fixed ? { studentId: fixed, studentFrom: got.studentId === fixed ? got.studentFrom : ('page' as const), namesOther: got.studentId && got.studentId !== fixed ? got.studentId : null, candidates: [] } : {}
          patch(item.key, (i) => ({ ...i, ...got, ...theirs, status: 'done' as const, step: null }))
        } catch (e) {
          patch(item.key, { status: 'done', step: null, found: { kind: 'none', reason: e instanceof Error ? e.message : 'It couldn’t be read.', photo: null, tip: null } })
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(3, fresh.length) }, worker))
    if (alive.current) setStep('check')
  }

  // Files given at the start (dropped on the page, or chosen in the rail): read at once.
  const started = useRef(false)
  useEffect(() => {
    if (started.current || !files?.length) return
    started.current = true
    void read(files)
    // Once, when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const drop = useFileDropZone({ canWrite: true, onFiles: (entries) => void read(entries.map((e) => e.file)), disabled: step !== 'pick' })
  const input = useRef<HTMLInputElement>(null)
  const camera = useRef<HTMLInputElement>(null)
  const touch = useMemo(() => window.matchMedia('(pointer: coarse)').matches, [])

  const priorBest = (studentId: string | null) => (p: Position) => {
    const scores = known.filter((k) => k.studentId === studentId && k.position === p && k.shots > 0).map((k) => wholePer10(k) ?? 0)
    return scores.length ? Math.max(...scores) : null
  }

  function save() {
    const { added, students: who, sighters, saved, uploaded } = saveItems(branchId, actor, index, items, nameOf)
    const n = added.length
    // One student's: their folder by name.
    const only = who === 1 ? byId.get(items.find((i) => saves(i))?.studentId ?? '') : null
    const filed = only ? `Filed in ${only.firstName || only.name.split(' ')[0]}’s Drive folder` : `For ${plural(who, 'student')}, each filed in their Drive folder`
    toast.success(n ? `${plural(n, 'result')} saved` : `${plural(sighters, 'file')} filed`, {
      description: `${filed}${n && sighters ? `, with ${plural(sighters, 'file')} of sighters only` : ''}.`,
    })
    saved.catch((e: unknown) => toast.error('The results weren’t saved', { description: e instanceof Error ? e.message : String(e) }))
    const tell = (failed: FailedUpload[]) => {
      if (!failed.length) return
      toast.error(failed.length === 1 ? 'A file didn’t upload' : `${failed.length} files didn’t upload`, {
        description: 'The scores are saved. Try again, or add the file later in the Drive.',
        duration: 30_000,
        action: { label: 'Try again', onClick: () => void resend(branchId, failed.map((f) => f.up)).then(tell) },
      })
    }
    void uploaded.then(tell, () => undefined)
    onSaved(added)
    onClose()
  }

  const foot = (children: ReactNode) => <div className="-mx-4 -mb-4 flex flex-wrap items-center justify-end gap-2 rounded-b-xl border-t bg-muted/50 p-4">{children}</div>

  // ------------------------------------------------------------ choosing the files
  if (step === 'pick')
    return (
      <>
        <DialogHeader className="pr-8 pb-4">
          <DialogTitle className="text-lg">Add scores</DialogTitle>
          <DialogDescription>The website reads each file: the student, the date, the position and the scores. It asks only what it couldn’t tell.</DialogDescription>
        </DialogHeader>
        <div className="-mx-4 border-t px-4 py-4 sm:px-5">
          <div {...drop.handlers} className={cn('flex flex-col items-center gap-2 rounded-xl border-[1.5px] border-dashed px-6 py-8 text-center transition-colors', drop.dragOver ? 'border-foreground/60 bg-muted' : 'border-border')} data-testid="add-scores-drop">
            <span className="flex size-10 items-center justify-center rounded-full bg-muted">
              <LuUpload className="size-[18px]" aria-hidden />
            </span>
            <p className="font-semibold">{touch ? 'Take a photo, or choose files' : 'Drop files here'}</p>
            <p className="text-[13px] text-balance text-muted-foreground">SIUS PDFs · photos of paper cards · a results sheet’s photo or PDF</p>
            <input
              ref={input}
              type="file"
              multiple
              accept={ACCEPTED_FILES}
              className="hidden"
              onChange={(e) => {
                const list = Array.from(e.target.files ?? [])
                e.target.value = ''
                if (list.length) void read(list)
              }}
              data-testid="add-scores-input"
            />
            <input
              ref={camera}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const list = Array.from(e.target.files ?? [])
                e.target.value = ''
                if (list.length) void read(list)
              }}
            />
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              <Button onClick={() => input.current?.click()}>Choose files</Button>
              {touch ? (
                <Button variant="outline" onClick={() => camera.current?.click()}>
                  <LuCamera /> Take a photo
                </Button>
              ) : null}
            </div>
          </div>
          <p className="mt-3 text-[13px] text-muted-foreground">Results are filed in each student’s Drive folder, named by their date. To type a card in by hand, open the student’s Scores.</p>
        </div>
        {foot(
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>,
        )}
      </>
    )

  // ------------------------------------------------------------ reading
  if (step === 'reading') {
    const done = items.filter((i) => i.status === 'done').length
    return (
      <>
        <DialogHeader className="pr-8 pb-4">
          <DialogTitle className="text-lg">{items.length === 1 ? 'Reading the file…' : `Reading ${items.length} files…`}</DialogTitle>
          <DialogDescription>Names, dates, positions and every shot, from each file.</DialogDescription>
        </DialogHeader>
        <div className="-mx-4 min-h-0 flex-1 overflow-y-auto border-t px-4 py-4 sm:px-5" data-testid="add-scores-reading">
          <ul className="space-y-2">
            {items.map((i) => (
              <ReadingLine key={i.key} item={i} name={i.studentId ? nameOf(i.studentId) : null} />
            ))}
          </ul>
          <div className="mt-4 h-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={done} aria-label="Files read">
            <div className="h-full rounded-full bg-foreground transition-[width] duration-300" style={{ width: `${items.length ? (done / items.length) * 100 : 0}%` }} />
          </div>
        </div>
        {foot(
          <>
            <span className="mr-auto text-[13px] text-muted-foreground">Then you check what was read before anything is saved.</span>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </>,
        )}
      </>
    )
  }

  // ------------------------------------------------------------ one card, or one sheet, checked
  const opened = view.kind === 'list' ? null : (items.find((i) => i.key === view.key) ?? null)
  if (view.kind === 'card' && opened?.found?.kind === 'card') {
    const f = opened.found
    const back = () => {
      patch(opened.key, (i) => (i.found?.kind === 'card' ? { ...i, found: { ...i.found, checked: true } } : i))
      setView({ kind: 'list' })
    }
    return (
      <>
        <DialogHeader className="pr-8 pb-4">
          <DialogTitle className="text-lg">Check the card</DialogTitle>
          <DialogDescription>
            {opened.file.name}
            {opened.studentId ? ` · ${nameOf(opened.studentId)}` : ''}. Amber needs a look; any box can be corrected.
          </DialogDescription>
        </DialogHeader>
        <div className="-mx-4 min-h-0 flex-1 overflow-y-auto border-t px-4 py-4 sm:px-5">
          <CardCheck key={f.card.key} card={f.card} onChange={(p) => patch(opened.key, (i) => (i.found?.kind === 'card' ? { ...i, found: { ...i.found, card: { ...i.found.card, ...p } } } : i))} priorBest={priorBest(opened.studentId)} />
        </div>
        {foot(
          <Button onClick={back} data-testid="card-done">
            <LuCheck /> Done
          </Button>,
        )}
      </>
    )
  }
  if (view.kind === 'sheet' && opened?.found?.kind === 'sheet') {
    const f = opened.found
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <CompetitionForm
          student={opened.studentId ? { id: opened.studentId, name: nameOf(opened.studentId) } : null}
          checking={{ draft: f.draft, fileName: opened.file.name, readNote: f.readNote, placedNote: f.placedNote }}
          onApply={(draft) => {
            patch(opened.key, (i) => (i.found?.kind === 'sheet' ? { ...i, found: { ...i.found, draft, checked: true } } : i))
            setView({ kind: 'list' })
          }}
          onDone={() => setView({ kind: 'list' })}
        />
      </div>
    )
  }

  // ------------------------------------------------------------ everything read, to check
  const total = items.reduce((n, i) => n + resultsOf(i), 0)
  const state = status(items)
  const left = items.filter((i) => !saves(i)).length
  return (
    <>
      <DialogHeader className="pr-8 pb-4">
        <DialogTitle className="text-lg">{total ? `Check ${plural(total, 'result')} before saving` : 'Check what was read'}</DialogTitle>
        <DialogDescription>
          Filled in from the {plural(items.length, 'file')}
          {left ? `, ${left} left out` : ''}. Change anything that’s wrong.
        </DialogDescription>
      </DialogHeader>
      <div className="-mx-4 min-h-0 flex-1 overflow-y-auto border-t px-4 py-4 sm:px-5" data-testid="add-scores-check">
        <ul className="space-y-2">
          {items.map((i) => (
            <ItemRow
              key={i.key}
              item={i}
              today={today}
              students={students}
              ladder={settings.students.levels}
              onStudent={(id) => pickStudent(i.key, id)}
              onPosition={(p) => patch(i.key, (x) => (x.found?.kind === 'sius' ? { ...x, found: { ...x.found, position: p, positionFrom: null } } : x))}
              onKind={(k) => patch(i.key, (x) => withKind(x, k))}
              onKeep={(keep) => patch(i.key, { keepRepeat: keep })}
              onCheck={() => setView({ kind: i.found?.kind === 'sheet' ? 'sheet' : 'card', key: i.key })}
              onType={() =>
                patch(i.key, (x) => (x.found?.kind === 'none' && x.found.photo ? { ...x, found: { kind: 'card', card: cardDraft(x.key, x.file, x.found.photo, today, timezone), checked: false } } : x))
              }
            />
          ))}
        </ul>
      </div>
      {foot(
        <>
          <span className={cn('mr-auto inline-flex basis-full items-center gap-1.5 text-[13px] sm:basis-auto', state.ready ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400')} data-testid="add-scores-status">
            {state.ready ? <LuCircleCheck className="size-4 shrink-0" aria-hidden /> : <LuCircleAlert className="size-4 shrink-0" aria-hidden />}
            {index.loading && state.ready ? 'Getting the Drive ready…' : state.text}
          </span>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!state.ready || index.loading} data-testid="add-scores-save">
            <LuCheck /> {total ? `Save ${plural(total, 'result')}` : 'Save'}
          </Button>
        </>,
      )}
    </>
  )
}

/** A file's type as a small tile: PDF, or the photo's kind. */
function FileTile({ file }: { file: File }) {
  const type = fileTypeOf(file)
  const ext = type === 'pdf' ? 'PDF' : (file.name.split('.').pop() ?? 'IMG').toUpperCase().slice(0, 4)
  return (
    <span
      className={cn(
        'flex h-10 w-[2.15rem] shrink-0 items-center justify-center rounded-md text-[9.5px] font-extrabold tracking-wide',
        type === 'pdf' ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300' : type === 'photo' ? 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300' : 'bg-muted text-muted-foreground',
      )}
      aria-hidden
    >
      {ext}
    </span>
  )
}

/** One file while the files are read: what it's being read as, then what was found. */
function ReadingLine({ item, name }: { item: AddItem; name: string | null }) {
  const f = item.found
  const what =
    item.status === 'waiting'
      ? item.type === 'pdf'
        ? 'A PDF'
        : item.type === 'photo'
          ? 'A photo'
          : 'A file'
      : item.status === 'reading'
        ? (item.step ?? 'Reading…')
        : !f || f.kind === 'none'
          ? 'Not read'
          : f.kind === 'sius'
            ? [name ?? (item.said ? `“${item.said}”` : null), f.position ? POSITION_LABELS[f.position] : null, f.sius.reading.noShots ? 'Sighters only' : f.sius.reading.total.toFixed(1)].filter(Boolean).join(' · ')
            : f.kind === 'card'
              ? [name, 'Paper card', f.card.position ? POSITION_LABELS[f.card.position] : null].filter(Boolean).join(' · ')
              : [name ?? (item.said ? `“${item.said}”` : null), f.draft.match || 'Results sheet', plural(f.draft.rows.length, 'position')].filter(Boolean).join(' · ')
  return (
    <li className="flex items-center gap-3 rounded-xl border px-3 py-2.5" data-testid="add-scores-file">
      <FileTile file={item.file} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{item.file.name}</span>
        <span className="block truncate text-xs text-muted-foreground">{what}</span>
      </span>
      <span className={cn('flex shrink-0 items-center gap-1.5 text-xs', item.status === 'done' ? (f && f.kind !== 'none' ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400') : 'text-muted-foreground')}>
        {item.status === 'reading' ? <LuLoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
        {item.status === 'done' ? f && f.kind !== 'none' ? <LuCircleCheck className="size-3.5" aria-hidden /> : <LuCircleAlert className="size-3.5" aria-hidden /> : null}
        {item.status === 'waiting' ? 'Waiting' : item.status === 'reading' ? 'Reading' : f && f.kind !== 'none' ? 'Read' : 'Not read'}
      </span>
    </li>
  )
}

/** A students list to pick from, searchable, opened by `children`. */
function StudentPick({ students, ladder, onPick, children }: { students: readonly WithId<Student>[]; ladder: readonly string[]; onPick: (id: string) => void; children: React.ReactElement }) {
  const [open, setOpen] = useState(false)
  const list = useMemo(() => students.filter((s) => s.status !== 'finished').sort((a, b) => a.name.localeCompare(b.name)), [students])
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search students…" />
          <CommandList>
            <CommandEmpty>No student by that name.</CommandEmpty>
            <CommandGroup>
              {list.map((s) => (
                <CommandItem
                  key={s.id}
                  value={`${s.name} ${(s.otherNames ?? []).join(' ')} ${s.id}`}
                  onSelect={() => {
                    onPick(s.id)
                    setOpen(false)
                  }}
                >
                  <span className="min-w-0 flex-1 truncate">{s.name}</span>
                  {s.level ? <LevelChip level={s.level} levels={ladder} /> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

/** A file's picture in the list: its shots on a target, the card read, a sheet's trophy, or a file not read. */
function ItemPicture({ item }: { item: AddItem }) {
  const f = item.found
  const card = f?.kind === 'card' ? f.card.read : null
  const url = useObjectUrl(card?.jpeg ?? null)
  const box = 'flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg'
  if (f?.kind === 'sius') {
    const shots = f.sius.reading.series.flatMap((s) => s.shots)
    return <TargetPlot shots={shots} size={44} color={f.position ? POSITION_COLORS[f.position] : '#6b7280'} showMpi={false} />
  }
  if (f?.kind === 'card') return <span className={cn(box, 'bg-muted')}>{url ? <img src={url} alt="" className="size-full object-cover" /> : null}</span>
  if (f?.kind === 'sheet')
    return (
      <span className={cn(box, 'bg-violet-100 text-violet-700 dark:bg-violet-950/70 dark:text-violet-300')}>
        <LuTrophy className="size-[18px]" aria-hidden />
      </span>
    )
  return (
    <span className={cn(box, 'border border-dashed text-muted-foreground')}>
      <LuFileX className="size-[18px]" aria-hidden />
    </span>
  )
}

/** One file read, to check: whose it is, what it is, its figures, where they came from, and what it was. */
function ItemRow({
  item,
  today,
  students,
  ladder,
  onStudent,
  onPosition,
  onKind,
  onKeep,
  onCheck,
  onType,
}: {
  item: AddItem
  today: DateKey
  students: readonly WithId<Student>[]
  ladder: readonly string[]
  onStudent: (id: string) => void
  onPosition: (p: Position) => void
  onKind: (k: ResultKind) => void
  /** Saves a repeated result anyway, or leaves it out again. */
  onKeep: (keep: boolean) => void
  onCheck: () => void
  onType: () => void
}) {
  const f = item.found
  if (!f) return null
  const student = item.studentId ? (students.find((s) => s.id === item.studentId) ?? null) : null
  const asking = saves(item) && !student
  const needs = itemNeeds(item)
  const kind = kindOfItem(item)
  const first = student ? student.firstName || student.name.split(' ')[0] : ''
  const name = (id: string) => students.find((s) => s.id === id)

  // What it is, and when.
  let what: ReactNode = null
  let figures: ReactNode = null
  let from: string | null = null
  let action: ReactNode = null
  if (f.kind === 'sius') {
    const r = f.sius.reading
    what = (
      <>
        <PositionPick value={f.position} onChange={onPosition} />
        <span>· SIUS · {dayWords(r.dateKey, today)}, {formatMinutes(r.timeMin)}</span>
      </>
    )
    figures = r.noShots ? (
      <span className="text-muted-foreground">Sighters only: filed in the student’s folder without scores.</span>
    ) : (
      <span className="tabular-nums">
        <b className="font-semibold">{one(per10(r.wholeTotal, r.shots) ?? 0)}</b> per 10 · {one(per10(r.total, r.shots) ?? 0)} decimal · total {r.total.toFixed(1)}-{r.innerTens} / {r.shots}
      </span>
    )
    const whoFrom = item.studentFrom === 'report' ? 'Student' : item.studentFrom === 'file' ? 'Student from the file name' : item.studentFrom === 'picked' ? 'Student picked by you' : null
    const posFrom = f.positionFrom === 'report' ? 'position' : f.positionFrom === 'file' ? 'position from the file name' : null
    from = whoFrom === 'Student' && posFrom === 'position' ? 'Student and position from the report' : [whoFrom === 'Student' ? 'Student from the report' : whoFrom, posFrom === 'position' ? 'position from the report' : posFrom].filter(Boolean).join(' · ') || null
  } else if (f.kind === 'card') {
    const t = f.card.review ? reviewTotals(f.card.review) : null
    what = (
      <>
        {f.card.position ? <span className="size-2 shrink-0 rounded-full" style={{ background: POSITION_COLORS[f.card.position] }} aria-hidden /> : null}
        <span>
          {f.card.position ? POSITION_LABELS[f.card.position] : 'Position?'} · Paper card · {dayWords(f.card.dateKey, today)}
        </span>
      </>
    )
    figures = t ? (
      <span className="tabular-nums">
        <b className="font-semibold">{one(per10(t.total, t.shots) ?? 0)}</b> per 10 · total {t.total} / {t.shots}
        {t.toCheck && !needs ? <span className="text-amber-700 dark:text-amber-400"> · {plural(t.toCheck, 'bull')} worth a look</span> : null}
      </span>
    ) : null
    from = [item.studentFrom === 'file' ? 'Student from the file name' : item.studentFrom === 'picked' ? 'Student picked by you' : null, f.card.positionFromName ? 'position from the file name' : null, f.card.read?.found ? 'the bulls read from the photo' : 'scores typed'].filter(Boolean).join(' · ')
    action = (
      <Button size="xs" variant={needs && item.studentId ? 'default' : 'outline'} onClick={onCheck} data-testid="add-check-card">
        <LuScanSearch /> {f.checked ? 'Check it again' : 'Check the card'}
      </Button>
    )
  } else if (f.kind === 'sheet') {
    const d = f.draft
    what = (
      <span>
        {d.match.trim() || 'A competition'} · Results sheet · {dayWords(d.dateKey, today)}
      </span>
    )
    figures = (
      <span className="flex flex-wrap gap-1.5">
        {d.rows.map((r) => (
          <span key={r.key} className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs">
            {r.position ? <span className="size-2 rounded-full" style={{ background: POSITION_COLORS[r.position] }} aria-hidden /> : null}
            {r.position ? POSITION_LABELS[r.position] : 'Position?'} <b className="font-semibold tabular-nums">{r.total || '—'}{r.innerTens ? `-${r.innerTens}` : ''}</b>
          </span>
        ))}
      </span>
    )
    from = [item.studentFrom === 'sheet' ? 'Shooter, match and scores from the sheet' : item.studentFrom === 'picked' ? 'Student picked by you · match and scores from the sheet' : 'Match and scores from the sheet', f.partly ? 'partly read' : null].filter(Boolean).join(' · ')
    action = (
      <Button size="xs" variant={f.partly && !f.checked ? 'default' : 'outline'} onClick={onCheck} data-testid="add-check-sheet">
        <LuFileSearch /> {f.checked ? 'Check them again' : 'Check the numbers'}
      </Button>
    )
  } else {
    what = <span className="text-muted-foreground">{f.reason}</span>
    figures = f.tip && f.photo ? <span className="text-xs text-muted-foreground">If it’s a card, the card reader says: {f.tip}</span> : null
    action = f.photo ? (
      <Button size="xs" variant="outline" onClick={onType} data-testid="add-type-card">
        It’s a paper card: type its scores
      </Button>
    ) : null
  }

  const repeat = item.repeat ?? null
  const duplicate = leftOut(item)
  return (
    <li
      className={cn(
        'grid grid-cols-[2.75rem_minmax(0,1fr)] gap-x-3.5 gap-y-2 rounded-xl border p-3 sm:grid-cols-[2.75rem_minmax(0,1fr)_auto]',
        asking ? 'border-amber-300 bg-amber-50/70 dark:border-amber-800/70 dark:bg-amber-950/25' : f.kind === 'none' || duplicate ? 'bg-muted/40' : 'bg-card',
      )}
      data-testid="add-scores-item"
    >
      <ItemPicture item={item} />
      <div className="min-w-0 space-y-1 text-[13px]">
        <div className="flex min-h-6 flex-wrap items-center gap-x-2 gap-y-1">
          {f.kind === 'none' ? (
            <span className="font-semibold">Not read: left out</span>
          ) : student ? (
            <>
              <span className="text-sm font-semibold">{student.name}</span>
              {student.level ? <LevelChip level={student.level} levels={ladder} /> : null}
              <StudentPick students={students} ladder={ladder} onPick={onStudent}>
                <button type="button" className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                  Change
                </button>
              </StudentPick>
            </>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-800 dark:text-amber-300">
              <LuCircleAlert className="size-4" aria-hidden /> {f.kind === 'card' ? 'Whose card?' : 'Whose result?'}
            </span>
          )}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-muted-foreground">{what}</div>
        {figures ? <div>{figures}</div> : null}
        {item.namesOther && name(item.namesOther) ? (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-amber-800 dark:text-amber-300" data-testid="add-names-other">
            <span>
              The {f.kind === 'sius' ? 'report' : f.kind === 'sheet' ? 'sheet' : 'file'} names {name(item.namesOther)?.name}, another student.
            </span>
            <button type="button" onClick={() => onStudent(item.namesOther as string)} className="text-xs font-medium text-foreground underline underline-offset-4">
              It’s {name(item.namesOther)?.name}’s
            </button>
          </p>
        ) : null}
        {repeat ? (
          <p className={cn('flex flex-wrap items-center gap-x-2 gap-y-1', duplicate ? 'text-muted-foreground' : 'text-amber-800 dark:text-amber-300')} data-testid="add-repeat">
            <span>
              {'saved' in repeat ? `Already in ${first}’s scores (${repeat.saved}, ${dayWords(repeat.dateKey, today)})` : `The same as ${repeat.file} above`}
              {duplicate ? ': left out.' : ', saved again anyway.'}
            </span>
            <button type="button" onClick={() => onKeep(duplicate)} className="text-xs font-medium text-foreground underline underline-offset-4" data-testid="add-repeat-keep">
              {duplicate ? 'Save it anyway' : 'Leave it out'}
            </button>
          </p>
        ) : null}
        {f.kind === 'sius' && f.sius.reading.problems.length && !duplicate ? (
          <p className="flex items-start gap-1.5 text-amber-800 dark:text-amber-300">
            <LuCircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden /> Check: {f.sius.reading.problems[0]} It’s saved marked Check.
          </p>
        ) : null}
        {asking ? (
          <div className="flex flex-wrap items-center gap-1.5 pt-1" role="group" aria-label="Whose result">
            <span className="w-full text-muted-foreground">
              {item.said && item.candidates.length
                ? `${item.saidIn === 'file' ? 'The file’s name says' : item.saidIn === 'sheet' ? 'The sheet says' : 'The report says'} “${item.said}”, and ${item.candidates.length === 1 ? 'one student matches' : `${item.candidates.length} students match`}.`
                : item.said && item.saidIn !== 'file'
                  ? `The ${item.saidIn === 'sheet' ? 'sheet' : 'report'} says “${item.said}”, and no student matches.`
                  : `The ${f.kind === 'sius' ? 'report' : f.kind === 'sheet' ? 'sheet' : 'photo'} doesn’t say whose it is.`}
            </span>
            {item.candidates.map((id) => {
              const s = name(id)
              if (!s) return null
              return (
                <Button key={id} size="sm" variant="outline" className="bg-background" onClick={() => onStudent(id)} data-testid="add-candidate">
                  {s.name}
                  {s.level ? <LevelChip level={s.level} levels={ladder} /> : null}
                </Button>
              )
            })}
            <StudentPick students={students} ladder={ladder} onPick={onStudent}>
              <Button size="sm" variant="outline" className="bg-background" data-testid="add-someone">
                {item.candidates.length ? 'Someone else…' : 'Choose a student…'}
              </Button>
            </StudentPick>
          </div>
        ) : null}
        {needs && student ? (
          <p className="flex items-center gap-1.5 text-amber-800 dark:text-amber-300">
            <LuCircleAlert className="size-3.5 shrink-0" aria-hidden /> {capital(needs)}
          </p>
        ) : null}
        {from ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <LuFileSearch className="size-3.5 shrink-0" aria-hidden /> {capital(from)}
          </p>
        ) : null}
        {action ? <div className="pt-1">{action}</div> : null}
      </div>
      <div className="col-span-2 flex items-center justify-between gap-2 sm:col-span-1 sm:flex-col sm:items-end">
        <span className="max-w-[13rem] min-w-0 truncate text-xs text-muted-foreground" title={item.file.name}>
          {item.file.name}
        </span>
        {kind && saves(item) && !(f.kind === 'sius' && f.sius.reading.noShots) ? (
          <Select value={kind} onValueChange={(v) => onKind(v as ResultKind)}>
            <SelectTrigger size="sm" className="w-32 bg-background" aria-label="What it was">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {RESULT_KINDS.map((k) => (
                <SelectItem key={k} value={k}>
                  {RESULT_KIND_LABELS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>
    </li>
  )
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** A SIUS result's position: the one read, or one to choose (amber until it is). */
function PositionPick({ value, onChange }: { value: Position | null; onChange: (p: Position) => void }) {
  return (
    <Select value={value ?? ''} onValueChange={(v) => isPosition(v) && onChange(v)}>
      <SelectTrigger
        size="sm"
        className={cn('h-6! gap-1 border-transparent bg-transparent px-1.5 text-[13px] text-foreground shadow-none hover:bg-muted dark:bg-transparent', !value && 'border-amber-400 text-amber-800 dark:border-amber-600 dark:text-amber-300')}
        aria-label="Position"
      >
        <SelectValue placeholder="Which position?" />
      </SelectTrigger>
      <SelectContent>
        {POSITIONS.map((p) => (
          <SelectItem key={p} value={p}>
            <span className="size-2 rounded-full" style={{ background: POSITION_COLORS[p] }} aria-hidden />
            {POSITION_LABELS[p]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
