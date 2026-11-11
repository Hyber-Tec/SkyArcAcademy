import { useId } from 'react'
import { LuChevronDown, LuFileText, LuTrash2 } from 'react-icons/lu'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import type { ScattSession } from '@shared/scatt/session'
import { POSITION_COLORS, POSITION_LABELS, per10 } from '@shared/shooting/evaluation'
import { formatDateKey, formatMinutes } from '@shared/time'
import type { WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { ContextMenuFor, ItemMenuButton, type MenuEntry, menu } from '@/components/app/ItemMenu'
import { useConfirm } from '@/components/app/useConfirm'
import { one } from '@/features/reports/model'
import { Figure } from '@/features/scores/ResultDetail'
import { Unfold } from '@/features/scores/ResultRow'
import { RESULT_COLUMNS, useOpenRows } from '@/features/scores/results'
import { MiniTarget } from '@/features/scores/TargetPlot'
import { cn } from '@/lib/utils'
import { deleteScattSession, useScattTraces } from './api'
import { ScattReplay } from './ScattReplay'

type Session = WithId<ScattSession>

/** Which rows are open, when the page opens some itself (useOpenRows). */
type OpenRows = Pick<ReturnType<typeof useOpenRows>, 'isOpen' | 'toggle'>

/** The shots of a session whose position wasn't set in SCATT. */
const NO_POSITION_COLOR = '#71717a'

const plural = (n: number, word: string) => `${n} ${n === 1 ? word : `${word}s`}`

/**
 * A student's SCATT sessions as rows, in the score list's columns (ResultRow; Goo, 2026-11-11: "row type just like how
 * we see the scores"): newest first, each with its shots on a small target, when, the position and the shots, the score
 * per 10 (and the decimal) and the total. A click opens it under itself (any number at once) with its numbers and its
 * shots played back (ScattReplay). `staff` gives each its menu, behind ⋯ and a right-click: its file in the Drive, and
 * Delete (filed in the wrong student's folder); families only watch. `rows`: which are open, when the page opens some
 * itself (a SCATT file just uploaded); else the list keeps its own.
 */
export function ScattSessions({ sessions, staff, rows: given }: { sessions: Session[]; staff: boolean; rows?: OpenRows }) {
  const { branchId, actor, portal } = useBranch()
  const navigate = useNavigate()
  const { confirm, dialog } = useConfirm()
  const own = useOpenRows()
  const rows = given ?? own

  async function remove(s: Session) {
    const ok = await confirm({
      title: `Delete the SCATT session of ${formatDateKey(s.dateKey, 'medium')}?`,
      description: `Its ${s.matchShots} shots and their traces leave ${s.studentName}'s scores. The SCATT file stays in the Drive; dropping it in again brings the session back.`,
      confirmLabel: 'Delete the session',
      destructive: true,
    })
    if (!ok) return
    try {
      await deleteScattSession(branchId, actor, s)
      toast.success('SCATT session deleted')
    } catch (e) {
      toast.error('Couldn’t delete the session', { description: (e as Error).message })
    }
  }

  const entriesOf = (s: Session): MenuEntry[] =>
    staff
      ? menu(
          { label: 'Open the file in the Drive', icon: LuFileText, onSelect: () => navigate(`/${portal}/drive/file/${s.fileId}`) },
          { label: 'Delete the session', icon: LuTrash2, destructive: true, separatorBefore: true, onSelect: () => void remove(s) },
        )
      : []

  return (
    <div data-testid="scatt-sessions">
      <div className={cn(RESULT_COLUMNS, 'hidden border-y bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground @xl:grid @xl:px-5')} aria-hidden>
        <span />
        <span>Session</span>
        <span className="text-right">Per 10</span>
        <span className="text-right">Total</span>
        <span />
      </div>
      <ul className="border-t @xl:border-t-0" data-testid="scatt-list">
        {sessions.map((s) => (
          <ScattRow key={s.id} s={s} open={rows.isOpen(s.id)} onToggle={() => rows.toggle(s.id)} entries={entriesOf(s)} />
        ))}
      </ul>
      {dialog}
    </div>
  )
}

/** A session's figures: per 10 shots (whole, as a card is counted, and SCATT's decimal) and the total of its match shots. */
function figures(s: Session) {
  return {
    whole: s.totalInt !== null ? per10(s.totalInt, s.matchShots) : null,
    decimal: s.total !== null ? per10(s.total, s.matchShots) : null,
    total: s.total !== null ? s.total.toFixed(1) : '—',
    color: s.position ? POSITION_COLORS[s.position] : NO_POSITION_COLOR,
  }
}

/**
 * One session's line, as a score's (ResultRow): its match shots on a small target, the day and time, the position and
 * the shots, the score per 10 with the decimal, and the total; opened, its numbers and replay under it.
 */
function ScattRow({ s, open, onToggle, entries }: { s: Session; open: boolean; onToggle: () => void; entries: MenuEntry[] }) {
  const detailId = useId()
  const { whole, decimal, total, color } = figures(s)
  const match = s.shots.filter((x) => !x.sighting)
  const points = (match.length ? match : s.shots).map((x) => ({ x: x.x, y: x.y }))
  const position = s.position ? POSITION_LABELS[s.position] : 'Position not set'
  const what = [position, plural(s.matchShots, 'shot'), s.sighters ? plural(s.sighters, 'sighter') : null].filter(Boolean).join(' · ')
  const label = `${formatDateKey(s.dateKey, 'medium')}, a SCATT session, ${what}: ${whole !== null ? one(whole) : 'no score'} per 10 shots. ${open ? 'Close it' : 'Open it here'}`
  return (
    <li className="relative scroll-mt-20 border-b last:border-b-0" data-scatt-row={s.id}>
      {open ? <span className="absolute inset-y-0 left-0 z-10 w-0.5 bg-brand-solid" aria-hidden /> : null}
      <ContextMenuFor entries={entries}>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={open ? detailId : undefined}
          aria-label={label}
          className={cn(
            RESULT_COLUMNS,
            'min-h-[3.75rem] w-full px-4 py-2.5 text-left text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset @xl:min-h-16 @xl:px-5',
            open ? 'bg-muted/50' : 'hover:bg-muted/40',
          )}
          data-testid="scatt-row"
        >
          <MiniTarget points={points} color={color} size={40} />
          <span className="min-w-0">
            <span className="flex min-w-0 items-baseline gap-2 whitespace-nowrap">
              <span className="truncate font-semibold">{formatDateKey(s.dateKey, 'medium')}</span>
              <span className="text-xs font-normal text-muted-foreground tabular-nums">{formatMinutes(s.timeMin)}</span>
            </span>
            <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
              <span className="size-2 shrink-0 rounded-full" style={{ background: color }} />
              <span className="min-w-0 truncate">{what}</span>
            </span>
          </span>
          <span className="text-right whitespace-nowrap tabular-nums">
            <span className="text-[15px] font-semibold">{whole !== null ? one(whole) : '—'}</span>
            {decimal !== null ? <span className="ml-1.5 hidden text-xs text-muted-foreground @xl:inline">{one(decimal)}</span> : null}
            <span className="block text-[11px] text-muted-foreground @xl:hidden">{total}</span>
          </span>
          <span className="hidden text-right text-[13px] whitespace-nowrap tabular-nums @xl:block">
            {total}
            <span className="ml-0.5 text-xs text-muted-foreground">/{s.matchShots}</span>
          </span>
          <LuChevronDown className={cn('size-4 justify-self-end text-muted-foreground transition-transform duration-200', open && 'rotate-180 text-foreground')} aria-hidden />
        </button>
      </ContextMenuFor>
      <Unfold open={open} id={detailId}>
        <ScattDetail s={s} entries={entries} />
      </Unfold>
    </li>
  )
}

/** A session opened under its row: its figures, the ⋯ menu, its sighters and series, and its shots played back. */
function ScattDetail({ s, entries }: { s: Session; entries: MenuEntry[] }) {
  const { branchId } = useBranch()
  const traces = useScattTraces(branchId, s.id)
  const { whole, decimal, total } = figures(s)
  const facts = [
    s.sighters ? `${plural(s.sighters, 'sighter')}, not counted` : null,
    s.series.length > 1 ? `Series ${s.series.map((x) => `${x.n}: ${x.total.toFixed(1)}`).join(' · ')}` : null,
  ].filter((x): x is string => !!x)
  return (
    <div className="@container border-t bg-muted/30 px-4 pt-4 pb-5 @[35rem]:px-5 @[35rem]:pt-5" data-testid="scatt-detail">
      <div className="flex min-w-0 items-start gap-3">
        <dl className="grid min-w-0 flex-1 grid-cols-3 gap-x-3 gap-y-2.5 @[35rem]:flex @[35rem]:flex-wrap @[35rem]:gap-x-6 @[35rem]:gap-y-3">
          <Figure label="Per 10 shots" value={whole !== null ? one(whole) : '—'} />
          {decimal !== null ? <Figure label="Decimal" value={one(decimal)} unit="per 10" /> : null}
          <Figure label="Total" value={total} unit={`/ ${s.matchShots}`} />
          {s.averages ? <Figure label="Aiming" value={one(s.averages.aimS)} unit="s a shot" /> : null}
        </dl>
        <ItemMenuButton entries={entries} label="More: open the file, delete" className="-mt-1 -mr-1" />
      </div>
      {facts.length ? (
        <p className="mt-3 flex flex-wrap gap-x-3.5 gap-y-1 text-[13px] text-muted-foreground">
          {facts.map((f) => (
            <span key={f}>{f}</span>
          ))}
        </p>
      ) : null}
      <div className="mt-4">
        <ScattReplay session={s} traces={traces.data} loading={traces.loading} />
      </div>
    </div>
  )
}
