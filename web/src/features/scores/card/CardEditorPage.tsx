import { useEffect, useMemo, useRef, useState } from 'react'
import { LuArrowLeft, LuFileImage, LuScanSearch, LuTrash2 } from 'react-icons/lu'
import { Link, useBlocker, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import type { DriveFile } from '@shared/drive/types'
import { COL } from '@shared/paths'
import { type Evaluation, POSITIONS, POSITION_COLORS, POSITION_LABELS, type Position, isPosition } from '@shared/shooting/evaluation'
import { canReplay } from '@shared/shooting/replay'
import { offsetWords } from '@shared/shooting/target'
import { FLAT_SIZE, cardEvaluation, editModeOf, isFlatCard, savedReview, wasScanned } from '@shared/targets/flat'
import { type CardReview, placeShot, reviewTotals } from '@shared/targets/review'
import { type DateKey, formatDateKey, todayKey } from '@shared/time'
import type { WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { DatePicker } from '@/components/app/DatePicker'
import { ItemMenuButton } from '@/components/app/ItemMenu'
import { useConfirm } from '@/components/app/useConfirm'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { fileBlob } from '@/features/drive/FilePreview'
import { type NewEvaluation, deleteEvaluation, updateEvaluation } from '@/features/scores/api'
import { prefersReducedMotion } from '@/features/scores/playback'
import { ShotReplay } from '@/features/scores/ShotReplay'
import { branchDocRef, useDoc } from '@/lib/firestore'
import { cn } from '@/lib/utils'
import { BullCloseUp, type Moving } from './BullCloseUp'
import { BullTiles } from './BullTiles'
import { CardPicture } from './CardPicture'
import { useMedia, useTouchScreen } from './parts'

interface Draft {
  position: Position
  dateKey: DateKey
  note: string
  review: CardReview
}

/** A saved card back as it was checked: its shots on the flattened card's bulls (shared/src/targets/flat.ts). */
const draftOf = (e: Evaluation): Draft => ({ position: e.position, dateKey: e.dateKey, note: e.note ?? '', review: savedReview(e)! })
const versionOf = (e: Evaluation) => JSON.stringify([e.position, e.dateKey, e.note, e.total, e.series])

/** The card as it will be saved, rebuilt from the draft as the phone app's score screen does it. */
function changed(e: WithId<Evaluation>, d: Draft): NewEvaluation {
  return cardEvaluation({ student: { id: e.studentId, name: e.studentName }, position: d.position, dateKey: d.dateKey, note: d.note, review: d.review, total: null }, e.fileId)
}

/**
 * Students → a student → Scores → a scanned paper card: its picture, to check and correct what the phone app found
 * (CardEditor). Loaded by ID, so a reload or a shared link opens it again; admins and coaches alike.
 */
export function CardEditorPage({ mode = 'admin' }: { mode?: 'admin' | 'coach' }) {
  const { studentId = '', evaluationId = '' } = useParams()
  const { branchId } = useBranch()
  const ref = useMemo(() => branchDocRef(branchId, COL.evaluations, evaluationId), [branchId, evaluationId])
  const { data: e, loading } = useDoc<Evaluation>(ref)
  const back = `/${mode}/students/${e?.studentId ?? studentId}/scores`

  if (loading) return <Skeleton className="h-[36rem] w-full max-w-7xl rounded-xl" />
  if (!e || e.source !== 'paper' || editModeOf(e) !== 'card') {
    return (
      <div className="mx-auto max-w-lg py-16 text-center" data-testid="card-editor-missing">
        <h1 className="text-lg font-semibold">{e ? 'This score has no card to check' : 'This score isn’t there any more'}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {e ? 'Only a paper card scored bull by bull is checked here. Its scores change from the student’s page.' : 'It may have been deleted.'}
        </p>
        <Button className="mt-4" variant="outline" asChild>
          <Link to={back}>Back to the scores</Link>
        </Button>
      </div>
    )
  }
  return <CardEditor key={e.id} e={e} mode={mode} back={back} />
}

export function CoachCardEditorPage() {
  return <CardEditorPage mode="coach" />
}

type Picture = { kind: 'none' } | { kind: 'loading' } | { kind: 'ready'; image: ImageBitmap } | { kind: 'note'; text: string }

const CHANGEABLE = 'Its scores can still be changed bull by bull.'

/** The card's frame: its own shape, and short enough to be seen whole below the page's title (a phone's width allows it). */
const CARD_FRAME = {
  aspectRatio: `${FLAT_SIZE.width} / ${FLAT_SIZE.height}`,
  maxWidth: `max(20rem, calc((100svh - 10.5rem) * ${FLAT_SIZE.width / FLAT_SIZE.height}))`,
}

/**
 * A scanned card's picture: the Drive's flattened copy, read through the Storage rules (never a download link). Why
 * it can't be shown when it can't (not in the Drive yet, in the Trash, not a flattened card), as the phone app says it.
 */
function useCardPicture(scanned: boolean, fileId: string | null): Picture {
  const { branchId } = useBranch()
  const ref = useMemo(() => (fileId ? branchDocRef(branchId, COL.driveFiles, fileId) : null), [branchId, fileId])
  const { data: file, loading } = useDoc<DriveFile>(ref)
  const ready = !!file && file.status === 'ready' && !file.trashed
  const [read, setRead] = useState<{ id: string; image: ImageBitmap | null } | null>(null)

  useEffect(() => {
    if (!fileId || !ready) return
    let alive = true
    fileBlob(branchId, fileId)
      .then((blob) => createImageBitmap(blob))
      .then((image) => alive && setRead({ id: fileId, image }))
      .catch(() => alive && setRead({ id: fileId, image: null }))
    return () => {
      alive = false
    }
  }, [branchId, fileId, ready])

  if (!scanned) return { kind: 'none' }
  if (loading) return { kind: 'loading' }
  if (!fileId || !file) return { kind: 'note', text: `The card’s picture isn’t in the Drive. ${CHANGEABLE}` }
  if (file.trashed) return { kind: 'note', text: `The card’s picture is in the Drive’s Trash. ${CHANGEABLE}` }
  if (file.status === 'error') return { kind: 'note', text: `The card’s picture didn’t reach the Drive. ${CHANGEABLE}` }
  if (file.status === 'uploading') return { kind: 'note', text: 'The card’s picture is on its way to the Drive; it shows here once it’s there.' }
  if (read?.id !== fileId) return { kind: 'loading' }
  if (!read.image) return { kind: 'note', text: `The card’s picture couldn’t be opened. ${CHANGEABLE}` }
  if (!isFlatCard(read.image.width, read.image.height)) return { kind: 'note', text: `The card’s picture isn’t the flattened card the phone app saves, so the shots can’t be drawn on it. ${CHANGEABLE}` }
  return { kind: 'ready', image: read.image }
}

/**
 * One scanned paper card, to check and correct like on the phone: the card big (zoom and move it; a bull opens up
 * close), each bull's tile, the total and what's worth a look, the shots played back as they'll be saved, and the
 * card's position, date and note. Every change waits for Save; leaving with changes not saved asks first. On a wide
 * screen the card stays on the left with the bull up close on the right; on a phone the bull opens in a sheet.
 */
function CardEditor({ e, mode, back }: { e: WithId<Evaluation>; mode: 'admin' | 'coach'; back: string }) {
  const { branchId, actor, timezone, branch } = useBranch()
  const navigate = useNavigate()
  const { confirm, dialog } = useConfirm()
  const wide = useMedia('(min-width: 1024px)')
  const touch = useTouchScreen()
  const scanned = wasScanned(e)
  const picture = useCardPicture(scanned, scanned ? e.fileId : null)
  const image = picture.kind === 'ready' ? picture.image : null
  const today = todayKey(timezone)

  const [draft, setDraft] = useState<Draft>(() => draftOf(e))
  const [dirty, setDirty] = useState(false)
  /** The bull up close, and a shot being dragged there. */
  const [open, setOpen] = useState<number | null>(null)
  const [moving, setMoving] = useState<Moving | null>(null)
  const panel = useRef<HTMLElement>(null)
  const leaving = useRef(false)

  // The draft follows the saved card (a change made on the phone shows here) until something is changed here.
  const version = versionOf(e)
  const [seen, setSeen] = useState(version)
  if (!dirty && version !== seen) {
    setSeen(version)
    setDraft(draftOf(e))
  }
  const change = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }))
    setDirty(true)
  }

  // While a shot is dragged, the totals, tiles and card follow it; the replay shows the card as it will be saved.
  const live = moving && open !== null ? placeShot(draft.review, open, moving.i, moving.x, moving.y) : draft.review
  const totals = reviewTotals(live)
  const preview = useMemo(() => changed(e, draft), [e, draft])
  const where = offsetWords(preview.mpi)
  const facts = [
    `${preview.shots} shots`,
    preview.groupMm !== null ? `group ${preview.groupMm} mm` : null,
    preview.mpi ? (where ? `sits ${where}` : 'centred') : null,
  ].filter(Boolean)

  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && !leaving.current && currentLocation.pathname !== nextLocation.pathname)
  useEffect(() => {
    if (blocker.state !== 'blocked') return
    void confirm({ title: 'Discard your changes?', description: 'The card stays as it was saved.', confirmLabel: 'Discard', destructive: true }).then((ok) => (ok ? blocker.proceed() : blocker.reset()))
  }, [blocker, confirm])
  useEffect(() => {
    if (!dirty) return
    const hold = (ev: BeforeUnloadEvent) => ev.preventDefault()
    window.addEventListener('beforeunload', hold)
    return () => window.removeEventListener('beforeunload', hold)
  }, [dirty])

  useEffect(() => {
    document.title = `${e.studentName}’s card | ${branch.name}`
  }, [e.studentName, branch.name])

  // Escape closes the bull up close (on a phone, the sheet does it itself).
  useEffect(() => {
    if (!wide || open === null) return
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape' && !ev.defaultPrevented) setOpen(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [wide, open])

  // A bull picked on the card (which stays in view) brings the whole of its close-up into view.
  useEffect(() => {
    const el = panel.current
    if (!wide || open === null || !el) return
    el.scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }, [wide, open])

  const openBull = (n: number) => {
    setMoving(null)
    setOpen(n)
  }

  // Saving keeps the change in the browser at once (this page and the student's page show it) while the server
  // confirms it; a refusal puts the card back as it was and says so.
  const save = () => {
    void updateEvaluation(branchId, actor, e.id, e, changed(e, draft)).catch((err: unknown) =>
      toast.error('Couldn’t save the changes', { description: err instanceof Error ? err.message : String(err) }),
    )
    setDirty(false)
    toast.success('Changes saved')
  }
  const discard = () => {
    setMoving(null)
    setDraft(draftOf(e))
    setDirty(false)
  }
  const remove = async () => {
    const ok = await confirm({
      title: 'Delete these scores?',
      description: `The ${POSITION_LABELS[e.position].toLowerCase()} card of ${formatDateKey(e.dateKey, 'medium')} leaves ${e.studentName}'s scores. Its picture stays in the Drive, and reports already made keep their figures.`,
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!ok) return
    void deleteEvaluation(branchId, actor, e.id, e).catch((err: unknown) => toast.error('Couldn’t delete the scores', { description: err instanceof Error ? err.message : String(err) }))
    toast.success('Scores deleted')
    leaving.current = true
    navigate(back)
  }

  const closeUp =
    open !== null ? (
      <BullCloseUp
        key={open}
        image={image}
        review={draft.review}
        n={open}
        total={totals.total}
        moving={moving}
        onMoving={setMoving}
        onChange={(review) => change({ review })}
        onStep={openBull}
        onClose={() => setOpen(null)}
      />
    ) : null

  const worth = totals.toCheck ? `${totals.toCheck} ${totals.toCheck === 1 ? 'bull is' : 'bulls are'} worth a look` : 'Every bull looks right'
  const summary = (
    <section className="rounded-xl border bg-card p-4" aria-label="The card’s total">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-4xl leading-none font-semibold tabular-nums" data-testid="card-total">
          {totals.total}
        </span>
        <span className="text-lg text-muted-foreground tabular-nums">/ {totals.shots * 10}</span>
        {dirty && preview.total !== e.total ? (
          <Badge variant="outline" className="ml-1 tabular-nums">
            saved {e.total}
          </Badge>
        ) : null}
      </div>
      <p className={cn('mt-2 text-sm', totals.toCheck || totals.missing ? 'text-amber-800 dark:text-amber-300' : 'text-muted-foreground')} data-testid="card-worth">
        {worth}
        {totals.missing ? ` · ${totals.missing} missing (0)` : ''}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{facts.join(' · ')}</p>
      <div className="mt-4">
        <BullTiles review={live} selected={open} onBull={openBull} />
      </div>
    </section>
  )

  const left = !scanned ? null : picture.kind === 'ready' ? (
    <>
      <CardPicture
        image={picture.image}
        review={live}
        selected={open}
        onBull={openBull}
        className="mx-auto w-full"
        style={CARD_FRAME}
      />
      <p className="mx-auto mt-2 max-w-prose text-center text-xs text-muted-foreground">
        {touch
          ? 'Tap a bull to check it up close. Pinch to zoom, drag with one finger once zoomed, double-tap to zoom in there.'
          : 'Click a bull to check it up close. Scroll or pinch to zoom, drag to look around, double-click to zoom in there. Keys: + − 0.'}
      </p>
    </>
  ) : picture.kind === 'note' ? (
    <p className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-balance text-muted-foreground" data-testid="card-picture-note">
      {picture.text}
    </p>
  ) : (
    <Skeleton className="mx-auto w-full rounded-xl" style={CARD_FRAME} />
  )

  // The changes waiting to be saved: in the right column on a wide screen (so it never covers the card), across the
  // page otherwise (above a coach's bottom tabs on a phone).
  const saveBar = (
    <div
      className={cn(
        'sticky z-20 flex items-center justify-end gap-2 rounded-xl border bg-card/95 px-4 py-3 shadow-lg backdrop-blur',
        wide && left ? 'bottom-4' : cn('mt-6', mode === 'coach' ? 'bottom-[calc(4.75rem+env(safe-area-inset-bottom))] md:bottom-4' : 'bottom-4'),
      )}
      data-testid="card-save-bar"
    >
      <span className="mr-auto min-w-0 truncate text-sm text-muted-foreground">
        Unsaved changes<span className="hidden sm:inline"> · total {preview.total}</span>
      </span>
      <Button variant="outline" onClick={discard} data-testid="card-discard">
        Discard
      </Button>
      <Button onClick={save} data-testid="card-save">
        Save changes
      </Button>
    </div>
  )

  return (
    <div className="max-w-7xl" data-testid="card-editor">
      <Button variant="ghost" size="sm" asChild className="mb-3 -ml-2.5">
        <Link to={back}>
          <LuArrowLeft /> {e.studentName}
        </Link>
      </Button>
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Check the card</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {POSITION_LABELS[draft.position]} paper card of {formatDateKey(draft.dateKey, 'medium')}
            {scanned ? ', scanned with the phone' : ', typed in'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {e.fileId ? (
            <Button variant="outline" size="sm" asChild>
              <Link to={`/${mode}/drive/file/${e.fileId}`} aria-label="Open the card’s picture in the Drive" title="Open the card’s picture in the Drive">
                <LuFileImage /> <span className="hidden sm:inline">Open in the Drive</span>
              </Link>
            </Button>
          ) : null}
          <ItemMenuButton entries={[{ label: 'Delete these scores', icon: LuTrash2, destructive: true, onSelect: () => void remove() }]} />
        </div>
      </div>

      <div className={cn('grid gap-6', left && 'lg:grid-cols-[minmax(0,1fr)_24rem] xl:grid-cols-[minmax(0,1fr)_27rem]')}>
        {left ? <div className="min-w-0 lg:sticky lg:top-6 lg:self-start">{left}</div> : null}
        <div className={cn('min-w-0 space-y-5', !left && 'max-w-lg')}>
          {summary}
          {wide || !left ? (
            <section ref={panel} className="scroll-mt-6 scroll-mb-24 rounded-xl border bg-card p-4" aria-label="The bull up close">
              {closeUp ?? (
                <div className="flex flex-col items-center gap-2 py-6 text-center text-sm text-balance text-muted-foreground">
                  <LuScanSearch className="size-6" />
                  {left ? 'Choose a bull on the card, or its tile above, to see it up close and move its shots.' : 'Typed scores, without places on the target. Choose a bull above to change its score.'}
                </div>
              )}
            </section>
          ) : null}
          {canReplay(preview) ? (
            <section className="rounded-xl border bg-card p-4" aria-label="The shots played back">
              <h2 className="text-sm font-semibold">Played back</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Bull by bull, as the card will be saved.</p>
              <div className="mt-3 flex justify-center">
                <ShotReplay evaluation={preview} color={POSITION_COLORS[draft.position]} size={320} />
              </div>
            </section>
          ) : null}
          <section className="rounded-xl border bg-card p-4" aria-label="Details">
            <h2 className="mb-3 text-sm font-semibold">Details</h2>
            <FieldGroup className="gap-4">
              <Field>
                <FieldLabel>Position</FieldLabel>
                <ToggleGroup type="single" variant="outline" value={draft.position} onValueChange={(v) => isPosition(v) && change({ position: v })} aria-label="Position" className="w-full">
                  {POSITIONS.map((p) => (
                    <ToggleGroupItem key={p} value={p} className="flex-1">
                      {POSITION_LABELS[p]}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </Field>
              <Field>
                <FieldLabel>Date shot</FieldLabel>
                <DatePicker value={draft.dateKey} onChange={(dateKey) => change({ dateKey })} max={today} aria-label="Date shot" />
              </Field>
              <Field>
                <FieldLabel htmlFor="card-note">Coach’s note</FieldLabel>
                <Textarea id="card-note" value={draft.note} maxLength={2000} rows={3} onChange={(ev) => change({ note: ev.target.value })} placeholder="Anything worth remembering about this card." />
                <FieldDescription>The student and their parents see this note with the score.</FieldDescription>
              </Field>
            </FieldGroup>
          </section>
          {dirty && wide && left ? saveBar : null}
        </div>
      </div>

      {dirty && !(wide && left) ? saveBar : null}

      {!wide && left ? (
        <Sheet open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
          <SheetContent side="bottom" showCloseButton={false} className="max-h-[92svh] gap-0 overflow-y-auto rounded-t-2xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <SheetTitle className="sr-only">{open !== null ? `Bull ${open}` : 'A bull'}</SheetTitle>
            <SheetDescription className="sr-only">The bull up close, to move, add or remove its shots.</SheetDescription>
            {closeUp}
          </SheetContent>
        </Sheet>
      ) : null}
      {dialog}
    </div>
  )
}
