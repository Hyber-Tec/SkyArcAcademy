import { useMemo, useRef, useState } from 'react'
import { LuFileText, LuPencil, LuPencilLine, LuScanSearch, LuTrash2 } from 'react-icons/lu'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { type Evaluation, POSITION_COLORS, POSITION_LABELS, SOURCE_LABELS, evaluationPoints, per10 } from '@shared/shooting/evaluation'
import { wasScanned } from '@shared/targets/flat'
import { formatDateKey, formatMinutes } from '@shared/time'
import type { WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { ItemMenuButton, menu } from '@/components/app/ItemMenu'
import { useConfirm } from '@/components/app/useConfirm'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { one } from '@/features/reports/model'
import { deleteEvaluation } from '@/features/scores/api'
import { cardPath } from '@/features/scores/card/parts'
import { PaperScoreDialog } from '@/features/scores/PaperScoreDialog'
import { prefersReducedMotion } from '@/features/scores/playback'
import { MiniTarget } from '@/features/scores/TargetPlot'
import { cn } from '@/lib/utils'
import { FeaturedResult } from './FeaturedResult'
import { SiusEditDialog } from './SiusEditDialog'

/** Rows shown before "Show all". */
const LIMIT = 8

/** The list's columns: fewer on a phone, every figure on a wide screen (container widths of the Scores card). */
const COLUMNS =
  'grid grid-cols-[2.5rem_minmax(0,1fr)_4.5rem] items-center gap-x-3 @xl:grid-cols-[2.5rem_minmax(0,1fr)_4.5rem_5.5rem] @2xl:grid-cols-[2.5rem_minmax(0,1fr)_4.5rem_5.5rem_4.5rem_4.5rem]'

/**
 * A student's results, newest first: the one picked shown large (FeaturedResult), above a list where every result
 * has a small picture of its target. Picking a result plays it back. Admins and coaches alike correct and delete them:
 * a card scanned with the phone on its picture (the card's page), a typed card or a SIUS result in a dialog.
 */
export function ResultsPanel({ evaluations, mode }: { evaluations: WithId<Evaluation>[]; mode: 'admin' | 'coach' }) {
  const { branchId, actor } = useBranch()
  const navigate = useNavigate()
  const { confirm, dialog } = useConfirm()
  /** The result picked, and how many times (each pick plays it again). */
  const [picked, setPicked] = useState<{ id: string; times: number } | null>(null)
  const [editing, setEditing] = useState<WithId<Evaluation> | null>(null)
  const [showAll, setShowAll] = useState(false)
  const featured = useRef<HTMLDivElement>(null)
  const rows = useMemo(() => [...evaluations].reverse(), [evaluations])
  const selected = rows.find((e) => e.id === picked?.id) ?? rows[0] ?? null

  async function remove(e: WithId<Evaluation>) {
    const ok = await confirm({
      title: 'Delete these scores?',
      description: `The ${POSITION_LABELS[e.position].toLowerCase()} result of ${formatDateKey(e.dateKey, 'medium')} leaves ${e.studentName}'s scores. Its file stays in the Drive, and reports already made keep their figures.`,
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!ok) return
    try {
      await deleteEvaluation(branchId, actor, e.id, e)
      toast.success('Scores deleted')
    } catch (err) {
      toast.error('Could not delete the scores', { description: (err as Error).message })
    }
  }

  const entriesOf = (e: WithId<Evaluation>, withFile: boolean) =>
    menu(
      withFile && !!e.fileId && { label: 'Open the file in the Drive', icon: LuFileText, onSelect: () => navigate(`/${mode}/drive/file/${e.fileId}`) },
      wasScanned(e)
        ? { label: 'Check the card', icon: LuScanSearch, separatorBefore: withFile && !!e.fileId, onSelect: () => navigate(cardPath(mode, e)) }
        : { label: e.source === 'paper' ? 'Edit scores' : 'Edit position or note', icon: LuPencil, separatorBefore: withFile && !!e.fileId, onSelect: () => setEditing(e) },
      { label: 'Delete', icon: LuTrash2, destructive: true, separatorBefore: true, onSelect: () => void remove(e) },
    )

  const pick = (e: WithId<Evaluation>) => {
    setPicked((p) => ({ id: e.id, times: (p?.id === e.id ? p.times : 0) + 1 }))
    // The picture sits above the list: bring it back into view when it has scrolled away.
    const el = featured.current
    if (!el) return
    const top = el.getBoundingClientRect().top
    if (top < 56 || top > window.innerHeight * 0.5) el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })
  }

  if (!selected) return <p className="border-t px-5 py-10 text-center text-sm text-muted-foreground">No scores yet. SIUS results dropped in the Drive and paper cards typed in show here.</p>

  const shown = showAll ? rows : rows.slice(0, LIMIT)
  const replays = picked?.id === selected.id ? picked.times : 0

  return (
    <>
      <div ref={featured} className="scroll-mt-16 border-t">
        <FeaturedResult key={`${selected.id}:${replays}`} e={selected} mode={mode} entries={entriesOf(selected, wasScanned(selected))} latest={selected.id === rows[0].id} autoPlay={replays > 0} />
      </div>

      <div className="border-t" data-testid="results-list">
        <div className="flex items-baseline justify-between gap-2 px-5 pt-4 pb-2">
          <h3 className="text-sm font-semibold">All results</h3>
          <span className="text-xs text-muted-foreground">{rows.length === 1 ? '1 result' : `${rows.length} results`}</span>
        </div>
        <div className={cn(COLUMNS, 'hidden border-y bg-muted/30 py-2 pr-11 pl-5 text-xs font-medium text-muted-foreground @xl:grid')} aria-hidden>
          <span />
          <span>Result</span>
          <span className="text-right">Per 10</span>
          <span className="text-right">Total</span>
          <span className="hidden text-right @2xl:block">Inner tens</span>
          <span className="hidden text-right @2xl:block">Group</span>
        </div>
        <ul className="divide-y border-t @xl:border-t-0">
          {shown.map((e) => (
            <ResultRow key={e.id} e={e} selected={e.id === selected.id} onPick={() => pick(e)} entries={entriesOf(e, true)} />
          ))}
        </ul>
        {rows.length > LIMIT ? (
          <div className="border-t px-5 py-2.5 text-center">
            <Button variant="ghost" size="sm" onClick={() => setShowAll(!showAll)}>
              {showAll ? 'Show the latest only' : `Show all ${rows.length} results`}
            </Button>
          </div>
        ) : null}
      </div>

      {editing?.source === 'paper' ? <PaperScoreDialog open onOpenChange={(o) => !o && setEditing(null)} existing={editing} /> : null}
      {editing?.source === 'sius' ? <SiusEditDialog evaluation={editing} onClose={() => setEditing(null)} /> : null}
      {dialog}
    </>
  )
}

/** One result in the list: its target in small, when, the position, and the figures. The row shows it large. */
function ResultRow({ e, selected, onPick, entries }: { e: WithId<Evaluation>; selected: boolean; onPick: () => void; entries: ReturnType<typeof menu> }) {
  const color = POSITION_COLORS[e.position]
  const whole = per10(e.wholeTotal, e.shots)
  const decimal = e.source === 'sius' ? per10(e.total, e.shots) : null
  const points = evaluationPoints(e)
  return (
    <li className={cn('relative flex items-center gap-1 pr-2 transition-colors', selected ? 'bg-muted/70' : 'hover:bg-muted/40')}>
      {selected ? <span className="absolute inset-y-0 left-0 w-0.5 bg-brand-solid" aria-hidden /> : null}
      <button
        type="button"
        onClick={onPick}
        aria-current={selected ? 'true' : undefined}
        aria-label={`${formatDateKey(e.dateKey, 'medium')}, ${POSITION_LABELS[e.position]}, ${SOURCE_LABELS[e.source]}: ${whole !== null ? one(whole) : 'no score'} per 10 shots. Show it above`}
        className={cn(COLUMNS, 'min-w-0 flex-1 rounded-md py-2 pl-5 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset')}
      >
        {points.length ? (
          <MiniTarget points={points} color={color} size={40} />
        ) : (
          <span className="flex size-10 items-center justify-center rounded-full border border-dashed text-muted-foreground" title="Typed in: no places on the target">
            <LuPencilLine className="size-4" />
          </span>
        )}
        <span className="min-w-0">
          <span className="block truncate font-medium">
            {formatDateKey(e.dateKey, 'medium')}
            {e.timeMin !== null ? <span className="ml-1.5 text-xs font-normal text-muted-foreground tabular-nums">{formatMinutes(e.timeMin)}</span> : null}
          </span>
          <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <span className="size-2 shrink-0 rounded-full" style={{ background: color }} />
            <span className="truncate">
              {POSITION_LABELS[e.position]} · {SOURCE_LABELS[e.source]}
            </span>
            {e.problems?.length ? (
              <Badge variant="outline" className="h-4 border-amber-300 px-1.5 text-[10px] text-amber-800 dark:text-amber-300">
                Check
              </Badge>
            ) : null}
          </span>
        </span>
        <span className="text-right tabular-nums">
          <span className="font-semibold">{whole !== null ? one(whole) : '—'}</span>
          {decimal !== null ? <span className="ml-1.5 text-xs text-muted-foreground">{one(decimal)}</span> : null}
        </span>
        <span className="hidden text-right tabular-nums @xl:block">
          {e.source === 'sius' ? e.total.toFixed(1) : e.total} <span className="text-xs text-muted-foreground">/ {e.shots}</span>
        </span>
        <span className="hidden text-right tabular-nums @2xl:block">{e.innerTens ?? '—'}</span>
        <span className="hidden text-right tabular-nums @2xl:block">{e.groupMm !== null ? `${one(e.groupMm)} mm` : '—'}</span>
      </button>
      {entries.length ? <ItemMenuButton entries={entries} /> : <span className="size-8 shrink-0" />}
    </li>
  )
}
