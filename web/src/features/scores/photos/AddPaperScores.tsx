import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { LuCheck, LuChevronLeft, LuChevronRight, LuCircleAlert, LuFolder, LuImagePlus, LuKeyboard, LuLoaderCircle, LuScanText, LuUpload } from 'react-icons/lu'
import { toast } from 'sonner'
import { dateInName } from '@shared/drive/exif'
import { tsMs } from '@shared/drive/model'
import { type DriveFile, studentFolderId } from '@shared/drive/types'
import { otherNamesText } from '@shared/names'
import { studentLabel } from '@shared/people'
import { printOf, repeatOf, resultWords, sameResult } from '@shared/scores/duplicates'
import { type Position, wholePer10 } from '@shared/shooting/evaluation'
import { positionFromName } from '@shared/sius/parse'
import { cardEvaluation, cardFileName } from '@shared/targets/flat'
import { typedReview } from '@shared/targets/review'
import { dateKeyOf, todayKey } from '@shared/time'
import type { WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { DriveIcon } from '@/components/app/DriveIcon'
import { OptionPicker } from '@/components/app/OptionPicker'
import { useConfirm } from '@/components/app/useConfirm'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useStudentList } from '@/features/data/hooks'
import { fileBlob } from '@/features/drive/FilePreview'
import { useFileDropZone, useWindowDropGuard } from '@/features/drive/dropzone'
import { type CardSave, type FailedUpload, plannedFile, resend, saveCards } from '@/features/drive/upload'
import { useDriveIndex } from '@/features/drive/useDriveIndex'
import { useStudentEvaluations } from '@/features/scores/hooks'
import { PaperScoreForm } from '@/features/scores/PaperScoreDialog'
import { cn } from '@/lib/utils'
import { CardCheck } from './CardCheck'
import { type CardDraft, MAX_PHOTOS, type PhotoSource, cardNeeds, isPhotoFile, typing } from './cards'
import { DrivePhotos, DriveThumb } from './DrivePhotos'
import { useObjectUrl } from './objectUrl'
import { readCardPhoto } from './reader'

type Tab = 'computer' | 'drive' | 'type'

/** What the page around the dialog does once cards are saved: the message's button (Show, on the Scores tab). */
export type SavedAction = (ids: string[]) => { label: string; onClick: () => void } | undefined

/**
 * Add paper scores (Goo's pick, docs/DECISIONS.md §29): photos of the student's paper cards, chosen on the computer
 * (several at once, dropped or picked; an iPhone's HEIC too) or ticked in their Drive folder, are read in the browser
 * with the phone app's own card reader (photos/reader.worker.ts), then checked one by one ("Card 1 of 2": each bull's
 * score in a box, what's worth a look, the position, the date, what it was, the note) and saved together, as the phone
 * saves a scanned card: each card straightened and filed in the student's folder, a photo from the Drive kept beside it,
 * so families see the card with its scores. Typing the scores stays, on its own tab. `drivePhotos` starts on photos
 * picked in the Drive.
 */
export function AddPaperScoresDialog({
  open,
  onOpenChange,
  studentId,
  drivePhotos,
  onSaved,
  savedAction,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The student, when known (their page, their folder); otherwise chosen here. */
  studentId: string | null
  /** Photos picked in the Drive (its "Add paper scores…" on a photo): read at once. */
  drivePhotos?: WithId<DriveFile>[]
  /** The new scores' IDs, as soon as they're saved on this device. */
  onSaved?: (ids: string[]) => void
  savedAction?: SavedAction
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[94svh] flex-col gap-0 sm:max-w-5xl" data-testid="add-paper-dialog">
        {open ? <AddFlow fixedStudent={studentId} drivePhotos={drivePhotos} onSaved={onSaved} savedAction={savedAction} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  )
}

let nextKey = 1

function AddFlow({ fixedStudent, drivePhotos, onSaved, savedAction, onDone }: { fixedStudent: string | null; drivePhotos?: WithId<DriveFile>[]; onSaved?: (ids: string[]) => void; savedAction?: SavedAction; onDone: () => void }) {
  const { branchId, actor, timezone } = useBranch()
  const today = todayKey(timezone)
  const index = useDriveIndex()
  const { data: students } = useStudentList(true)
  const [chosen, setChosen] = useState<string | null>(fixedStudent)
  const student = students.find((s) => s.id === chosen) ?? null
  const first = student ? student.firstName || student.name.split(' ')[0] : ''
  const { data: evaluations } = useStudentEvaluations(chosen)
  const { confirm, dialog: confirmDialog } = useConfirm()
  const [tab, setTab] = useState<Tab>('computer')
  const [step, setStep] = useState<'choose' | 'reading' | 'check'>('choose')
  const [cards, setCards] = useState<CardDraft[]>([])
  const [current, setCurrent] = useState(0)
  const [ticked, setTicked] = useState<WithId<DriveFile>[]>([])
  const alive = useRef(true)
  const input = useRef<HTMLInputElement>(null)
  useWindowDropGuard()
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const patch = (key: number, p: Partial<CardDraft>) => setCards((all) => all.map((c) => (c.key === key ? { ...c, ...p } : c)))

  /** Reads the photos one after another, then shows the first to check. */
  async function read(sources: PhotoSource[]) {
    const drafts: CardDraft[] = sources.slice(0, MAX_PHOTOS).map((source) => {
      const name = source.file.name
      const position = positionFromName(name)
      return { key: nextKey++, name, source, status: 'reading', error: null, read: null, scanned: null, review: null, position, positionFromName: !!position, dateKey: today, dateFrom: 'file', kind: 'practice', note: '' }
    })
    if (sources.length > MAX_PHOTOS) toast(`The first ${MAX_PHOTOS} photos are read`, { description: 'Add the others once these are saved.' })
    setCards(drafts)
    setCurrent(0)
    setStep('reading')
    for (const d of drafts) {
      if (!alive.current) return
      try {
        const blob = d.source.kind === 'computer' ? d.source.file : await fileBlob(branchId, d.source.file.id)
        const card = await readCardPhoto(blob, d.name)
        const review = card.found ? card.review : typedReview(1)
        // When it was taken, by the photo's own word; else a date in its name; else the file's date. Never after today.
        const fileMs = d.source.kind === 'computer' ? d.source.file.lastModified : tsMs(d.source.file.uploadedAt)
        const named = dateInName(d.name)
        const date = card.takenAt?.dateKey ?? named ?? (fileMs ? dateKeyOf(fileMs, timezone) : today)
        patch(d.key, { status: 'ready', read: card, scanned: review, review, dateKey: date > today ? today : date, dateFrom: card.takenAt ? 'photo' : named ? 'name' : 'file' })
      } catch (e) {
        patch(d.key, { status: 'failed', error: e instanceof Error ? e.message : String(e) })
      }
    }
    if (alive.current) setStep('check')
  }

  const pickFiles = (files: File[]) => {
    const photos = files.filter(isPhotoFile)
    const others = files.filter((f) => !isPhotoFile(f))
    if (others.length) toast.error(others.length === 1 ? `“${others[0].name}” isn’t a photo` : `${others.length} files aren’t photos`, { description: 'Only photos of paper cards are read here: JPEG, PNG or HEIC.' })
    if (photos.length) void read(photos.map((file) => ({ kind: 'computer', file })))
  }
  const drop = useFileDropZone({ canWrite: true, onFiles: (entries) => pickFiles(entries.map((e) => e.file)), disabled: step !== 'choose' || tab !== 'computer' || !student })

  // Photos picked in the Drive: read at once.
  const started = useRef(false)
  useEffect(() => {
    if (started.current || !drivePhotos?.length) return
    started.current = true
    void read(drivePhotos.map((file) => ({ kind: 'drive', file })))
    // Once, when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Each position's best per 10 so far, for "New best for kneeling". */
  const priorBest = (p: Position) => {
    const scores = evaluations.filter((e) => e.position === p && e.shots > 0).map((e) => wholePer10(e) ?? 0)
    return scores.length ? Math.max(...scores) : null
  }

  const card = cards[current] ?? null
  const problem = cards.findIndex((c) => cardNeeds(c))
  const ready = step === 'check' && cards.length > 0 && problem < 0 && !!student

  const leaveOut = (key: number) => {
    const rest = cards.filter((c) => c.key !== key)
    setCards(rest)
    setCurrent((i) => Math.min(i, Math.max(0, rest.length - 1)))
    if (!rest.length) setStep('choose')
  }

  async function save() {
    if (!ready || !student) return
    const who = { id: student.id, name: student.name }
    const made = cards.map((c) => {
      const evaluation = cardEvaluation({ student: who, position: c.position as Position, dateKey: c.dateKey, note: c.note, review: c.review, total: null }, null)
      evaluation.kind = c.kind
      return evaluation
    })
    // A card already in their scores, or the same card twice here: asked first (the third meeting, CP2).
    const known = evaluations.map((e) => ({ ...printOf(e), e }))
    const prints = made.map((e) => printOf(e))
    const already = prints.flatMap((p) => {
      const e = repeatOf(p, known)?.e
      return e ? [resultWords(e)] : []
    })
    const twins = prints.flatMap((p, i) => (prints.slice(0, i).some((q) => sameResult(p, q)) ? [i + 1] : []))
    if (
      (already.length || twins.length) &&
      !(await confirm({
        title: 'Already saved?',
        description: [
          already.length ? `${student.name}’s scores already have ${already.join('; ')}, with the same scores.` : '',
          twins.length ? `${twins.map((n) => `Card ${n}`).join(' and ')} ${twins.length === 1 ? 'has' : 'have'} the same scores as another card here.` : '',
          `Save ${cards.length === 1 ? 'it' : 'them all'} anyway?`,
        ]
          .filter(Boolean)
          .join(' '),
        confirmLabel: 'Save anyway',
      }))
    )
      return
    const toSave: CardSave[] = cards.map((c, i) => {
      const evaluation = made[i]
      // The card the reader found, straightened, is filed as the score's picture, as the phone's scanner files it: so
      // families and students see it with each bull's score, read-only (Goo, 2026-11-07). A photo picked in the Drive
      // stays beside it as it was. A photo where no card was found (typed scores) keeps its own file from the Drive.
      if (c.source.kind === 'drive' && typing(c)) return { evaluation, up: null, driveFileId: c.source.file.id }
      const name = cardFileName(c.dateKey, c.position as Position)
      const up = plannedFile(branchId, new File([c.read!.jpeg], name, { type: 'image/jpeg' }), { name, kind: 'jpg', mime: 'image/jpeg' }, studentFolderId(student.id), student.id, { originalName: c.source.file.name })
      return { evaluation, up, driveFileId: null }
    })
    const { ids, saved, uploaded } = saveCards(branchId, actor, index, toSave)
    const n = ids.length
    const filed = toSave.some((c) => c.up)
    toast.success(n > 1 ? `${n} cards added for ${first}` : `Scores added for ${first}`, {
      description: filed ? `${n > 1 ? 'The cards’ pictures are' : 'The card’s picture is'} filed in ${first}’s Drive folder.` : undefined,
      action: savedAction?.(ids),
    })
    saved.catch((e: unknown) => toast.error(n > 1 ? 'The cards weren’t saved' : 'The card wasn’t saved', { description: e instanceof Error ? e.message : String(e) }))
    const tell = (failed: FailedUpload[]) => {
      if (!failed.length) return
      toast.error(failed.length === 1 ? 'A card’s picture didn’t upload' : `${failed.length} cards’ pictures didn’t upload`, {
        description: 'The scores are saved. Try again, or add the picture later from the Drive.',
        duration: 30_000,
        action: { label: 'Try again', onClick: () => void resend(branchId, failed.map((f) => f.up)).then(tell) },
      })
    }
    void uploaded.then(tell, () => undefined)
    onSaved?.(ids)
    onDone()
  }

  const head = (description: string) => (
    <DialogHeader className="pr-8 pb-4">
      <DialogTitle className="text-lg">Add paper scores</DialogTitle>
      <DialogDescription>{description}</DialogDescription>
    </DialogHeader>
  )
  const foot = (children: ReactNode) => <div className="-mx-4 -mb-4 flex flex-wrap items-center justify-end gap-2 rounded-b-xl border-t bg-muted/50 p-4">{children}</div>
  const body = (children: ReactNode, className?: string) => <div className={cn('-mx-4 min-h-0 flex-1 overflow-y-auto border-t px-4 py-4 sm:px-5', className)}>{children}</div>

  if (step === 'reading')
    return (
      <>
        {head(`For ${student?.name ?? ''}.`)}
        {body(<Reading cards={cards} />)}
        {foot(
          <Button variant="outline" onClick={onDone}>
            Cancel
          </Button>,
        )}
      </>
    )

  if (step === 'check' && card)
    return (
      <>
        {head('Check what was read from each card. Amber needs a look; any box can be corrected.')}
        {body(
          <>
            {fixedStudent ? null : (
              <div className="mb-4">
                <StudentChoice value={chosen} onChange={setChosen} students={students} />
              </div>
            )}
            {cards.length > 1 ? <Strip cards={cards} current={current} onPick={setCurrent} /> : null}
            {card.status === 'ready' ? (
              <CardCheck key={card.key} card={card} onChange={(p) => patch(card.key, p)} priorBest={priorBest} />
            ) : (
              <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100" data-testid="card-failed">
                <LuCircleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
                <span>
                  <span className="font-medium">{card.name}</span> couldn’t be read: {card.error}
                </span>
              </p>
            )}
            {cards.length > 1 || card.status === 'failed' ? (
              <Button variant="link" size="sm" className="mt-3 h-auto px-0 text-muted-foreground" onClick={() => leaveOut(card.key)}>
                Leave this card out
              </Button>
            ) : null}
          </>,
        )}
        {foot(
          <>
            {cards.length > 1 ? (
              <span className="mr-auto hidden items-center gap-1 sm:flex">
                <Button variant="outline" size="icon-sm" aria-label="Previous card" disabled={current === 0} onClick={() => setCurrent(current - 1)}>
                  <LuChevronLeft />
                </Button>
                <span className="px-1 text-sm text-muted-foreground tabular-nums">
                  Card {current + 1} of {cards.length}
                </span>
                <Button variant="outline" size="icon-sm" aria-label="Next card" disabled={current === cards.length - 1} onClick={() => setCurrent(current + 1)}>
                  <LuChevronRight />
                </Button>
              </span>
            ) : null}
            {problem >= 0 ? (
              <button type="button" onClick={() => setCurrent(problem)} className="inline-flex basis-full items-center gap-1.5 text-left text-sm text-amber-700 hover:underline sm:basis-auto dark:text-amber-400" data-testid="card-needs">
                <LuCircleAlert className="size-4 shrink-0" aria-hidden />
                {cards.length > 1 ? `Card ${problem + 1} ${cardNeeds(cards[problem])}` : `The card ${cardNeeds(cards[problem])}`}
              </button>
            ) : !student ? (
              <span className="inline-flex basis-full items-center gap-1.5 text-sm text-amber-700 sm:basis-auto dark:text-amber-400" data-testid="card-needs">
                <LuCircleAlert className="size-4 shrink-0" aria-hidden />
                Choose whose {cards.length > 1 ? 'cards they are' : 'card it is'}
              </span>
            ) : null}
            <Button variant="outline" onClick={() => setStep('choose')}>
              Back
            </Button>
            {confirmDialog}
            <Button onClick={() => void save()} disabled={!ready} data-testid="save-cards">
              <LuCheck /> {cards.length > 1 ? `Save ${cards.length} cards` : 'Save scores'}
            </Button>
          </>,
        )}
      </>
    )

  // Choosing the photos (or typing the scores).
  return (
    <>
      {head(student ? `For ${student.name}. Photos of the paper cards are read for you; check each one before it’s saved.` : 'Photos of the paper cards are read for you; check each one before it’s saved.')}
      <div className="-mx-4 space-y-3 border-t px-4 pt-4 pb-3 sm:px-5">
        {fixedStudent ? null : <StudentChoice value={chosen} onChange={setChosen} students={students} />}
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1" role="tablist" aria-label="Where the scores come from">
          {(
            [
              ['computer', LuUpload, 'From this computer', 'Photos'],
              ['drive', DriveIcon, student ? `From ${first}’s Drive` : 'From the Drive', 'Drive'],
              ['type', LuKeyboard, 'Type the scores', 'Type'],
            ] as const
          ).map(([key, Icon, long, short]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={cn('inline-flex h-9 min-w-0 items-center justify-center gap-2 rounded-lg px-2 text-sm font-medium whitespace-nowrap', tab === key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              <span className="hidden truncate sm:inline">{long}</span>
              <span className="sm:hidden">{short}</span>
            </button>
          ))}
        </div>
      </div>
      {tab === 'type' ? (
        <PaperScoreForm studentId={chosen} bodyClassName="-mx-4 min-h-0 flex-1 overflow-y-auto px-4 pt-1 pb-4 sm:px-5" onSaved={(id) => onSaved?.([id])} onDone={onDone} />
      ) : tab === 'drive' ? (
        <>
          {body(student ? <DrivePhotos studentId={student.id} studentName={student.name} picked={new Set(ticked.map((f) => f.id))} onPick={(f) => setTicked((all) => (all.some((x) => x.id === f.id) ? all.filter((x) => x.id !== f.id) : [...all, f]))} /> : <ChooseFirst />, 'border-t-0 pt-1')}
          {foot(
            <>
              <span className="mr-auto text-sm text-muted-foreground">{ticked.length ? `${ticked.length} ${ticked.length === 1 ? 'photo' : 'photos'} ticked` : 'Tick the photos to read'}</span>
              <Button variant="outline" onClick={onDone}>
                Cancel
              </Button>
              <Button disabled={!ticked.length} onClick={() => void read(ticked.map((file) => ({ kind: 'drive', file })))} data-testid="read-drive-photos">
                <LuScanText /> {ticked.length > 1 ? `Read ${ticked.length} photos` : 'Read the photo'}
              </Button>
            </>,
          )}
        </>
      ) : (
        <>
          {body(
            student ? (
              <>
                <div
                  {...drop.handlers}
                  className={cn('flex flex-col items-center gap-3 rounded-xl border-[1.5px] border-dashed px-6 py-10 text-center transition-colors', drop.dragOver ? 'border-foreground/60 bg-muted' : 'border-border')}
                  data-testid="photo-drop"
                >
                  <span className="flex size-12 items-center justify-center rounded-xl border bg-card shadow-xs">
                    <LuImagePlus className="size-6" aria-hidden />
                  </span>
                  <p className="text-base font-semibold">
                    <span className="hidden sm:inline">Drop photos of the paper cards here</span>
                    <span className="sm:hidden">Photos of the paper cards</span>
                  </p>
                  <p className="max-w-md text-sm text-balance text-muted-foreground">Several at once, straight from a phone. Each card’s bulls and holes are found and scored, for you to check.</p>
                  <input
                    ref={input}
                    type="file"
                    accept="image/*,.heic,.heif"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      pickFiles(Array.from(e.target.files ?? []))
                      e.target.value = ''
                    }}
                    data-testid="photo-input"
                  />
                  <Button onClick={() => input.current?.click()}>
                    <LuUpload /> Choose photos
                  </Button>
                </div>
                <ol className="mt-5 grid gap-4 text-sm sm:grid-cols-3">
                  {[
                    ['Choose the photos', 'Taken on a phone, or from this computer.'],
                    ['Check each card', 'Its ten bulls’ scores, the position and the date.'],
                    ['Save', `The scores join ${first}’s results; each card’s picture goes in ${first}’s Drive folder.`],
                  ].map(([title, text], i) => (
                    <li key={title} className="flex gap-3">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold">{i + 1}</span>
                      <span>
                        <span className="block font-medium">{title}</span>
                        <span className="text-muted-foreground">{text}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              <ChooseFirst />
            ),
            'border-t-0 pt-1',
          )}
          {foot(
            <>
              {student ? (
                <span className="mr-auto hidden items-center gap-1.5 text-sm text-muted-foreground sm:inline-flex">
                  <LuFolder className="size-4" aria-hidden /> Each card’s picture is filed in {first}’s Drive folder
                </span>
              ) : null}
              <Button variant="outline" onClick={onDone}>
                Cancel
              </Button>
            </>,
          )}
        </>
      )}
    </>
  )
}

function ChooseFirst() {
  return <p className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">Choose the student first.</p>
}

/** The student, when the dialog didn't open on theirs (the Drive's own folders). */
function StudentChoice({ value, onChange, students }: { value: string | null; onChange: (id: string) => void; students: { id: string; name: string; grade?: string | null; status?: string }[] }) {
  const options = useMemo(() => students.filter((s) => s.status !== 'finished' || s.id === value).map((s) => ({ value: s.id, label: studentLabel(s.name, s.grade), keywords: otherNamesText(s) })), [students, value])
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <span className="text-sm font-medium">Student</span>
      <div className="min-w-56 flex-1">
        <OptionPicker value={value} onChange={onChange} options={options} placeholder="Choose a student…" searchPlaceholder="Search students…" />
      </div>
    </div>
  )
}

/** A photo from the computer in small, while it's read (a HEIC shows a frame: browsers but Safari can't draw it). */
function ComputerThumb({ file }: { file: File }) {
  const url = useObjectUrl(/\.(heic|heif)$/i.test(file.name) ? null : file)
  return (
    <span className="flex aspect-[4/5] w-full items-center justify-center overflow-hidden rounded-md bg-muted">
      {url ? <img src={url} alt="" className="size-full object-cover" /> : <span className="text-[10px] font-semibold text-muted-foreground uppercase">{file.name.split('.').pop()}</span>}
    </span>
  )
}

/** The photos being read, each with how far it has got. */
function Reading({ cards }: { cards: CardDraft[] }) {
  const done = cards.filter((c) => c.status !== 'reading').length
  return (
    <div className="flex flex-col items-center gap-5 py-6 text-center" data-testid="reading-cards">
      <ul className="flex max-w-full flex-wrap justify-center gap-3">
        {cards.slice(0, 8).map((c) => (
          <li key={c.key} className="relative w-24 sm:w-28">
            {c.source.kind === 'computer' ? <ComputerThumb file={c.source.file} /> : <DriveThumb file={c.source.file} />}
            <span className="absolute right-1.5 bottom-1.5 flex size-6 items-center justify-center rounded-full bg-background/95 shadow-sm">
              {c.status === 'reading' ? <LuLoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : c.status === 'ready' ? <LuCheck className="size-4 text-emerald-600" aria-hidden /> : <LuCircleAlert className="size-4 text-amber-600" aria-hidden />}
            </span>
          </li>
        ))}
        {cards.length > 8 ? <li className="flex w-24 items-center justify-center text-sm text-muted-foreground">+{cards.length - 8} more</li> : null}
      </ul>
      <div role="status" aria-live="polite">
        <p className="inline-flex items-center gap-2 font-semibold">
          <LuLoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
          {cards.length === 1 ? 'Reading the card…' : `Reading ${cards.length} cards… ${done} of ${cards.length} done`}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">Finding the ten bulls and their holes, and scoring each one.</p>
      </div>
    </div>
  )
}

/** The cards read, side by side: each one's photo, name, position and total, and whether it still needs something. */
function Strip({ cards, current, onPick }: { cards: CardDraft[]; current: number; onPick: (i: number) => void }) {
  return (
    <div className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="The cards">
      {cards.map((c, i) => (
        <StripCard key={c.key} card={c} on={i === current} onPick={() => onPick(i)} />
      ))}
    </div>
  )
}

function StripCard({ card, on, onPick }: { card: CardDraft; on: boolean; onPick: () => void }) {
  const url = useObjectUrl(card.read?.jpeg ?? null)
  const needs = cardNeeds(card)
  const total = card.review ? card.review.bulls.reduce((n, b) => n + b.shots.reduce((m, s) => m + s.value, 0), 0) : null
  return (
    <button
      type="button"
      role="tab"
      aria-selected={on}
      onClick={onPick}
      className={cn('flex max-w-64 min-w-48 shrink-0 items-center gap-2.5 rounded-xl border bg-card p-1.5 pr-3 text-left', on ? 'border-foreground ring-1 ring-foreground' : 'hover:border-foreground/30')}
      data-testid="card-tab"
    >
      <span className="flex h-12 w-10 shrink-0 items-center justify-center overflow-hidden rounded bg-muted">{url ? <img src={url} alt="" className="size-full object-cover" /> : null}</span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-semibold">{card.name}</span>
        <span className={cn('flex items-center gap-1 truncate text-xs', needs ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground')}>
          {needs ? <LuCircleAlert className="size-3 shrink-0" aria-hidden /> : null}
          {card.status === 'failed' ? 'Couldn’t be read' : `${card.position ? card.position.charAt(0).toUpperCase() + card.position.slice(1) : 'Position?'}${total !== null ? ` · ${total}` : ''}`}
        </span>
      </span>
    </button>
  )
}
