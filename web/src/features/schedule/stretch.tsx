import { type PointerEvent as ReactPointerEvent, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { type SeatTimeProblem, takesSeat } from '@shared/schedule/classes'
import { formatMinutes } from '@shared/time'
import type { Session, WithId } from '@shared/types'
import { cn } from '@/lib/utils'
import type { Board } from './board'
import { hoursProblem, problemText } from './seatHours'

type Span = { startMin: number; endMin: number }

const SNAP = 15
const snap = (m: number) => Math.round(m / SNAP) * SNAP

interface Live {
  edge: 'start' | 'end'
  /** Where the pointer went down, and the card's place then. */
  x0: number
  rect: DOMRect
  /** The hours the drag would save (the last ones that pass the checks). */
  next: Span
  /** Why the pointer's own time doesn't (shown in the pill), or null. */
  problem: SeatTimeProblem | null
}

/**
 * The edges of a student's card on the timeline (the office, on a day it can change): drag one to stay later or leave
 * earlier, come earlier or later, in 15-minute steps. While dragging, a bar shows the new hours across the timeline
 * with the time it ends (or starts), and why it stops when it can't go further. Let go to save. `span`: the time the
 * card's box stands for (its class's, on the timeline); `edges`: where each handle sits along the card (CSS `left`),
 * or none.
 */
export function StretchHandles({
  b,
  seat,
  span,
  ppm,
  cardRef,
  edges = { start: '0%', end: '100%' },
}: {
  b: Board
  seat: WithId<Session>
  span: Span
  ppm: number
  cardRef: React.RefObject<HTMLElement | null>
  edges?: { start?: string | null; end?: string | null }
}) {
  const [live, setLive] = useState<Live | null>(null)
  const liveRef = useRef<Live | null>(null)
  const set = (l: Live | null) => {
    liveRef.current = l
    setLive(l)
  }
  if (!takesSeat(seat)) return null

  const start = (edge: Live['edge']) => (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0 || !cardRef.current) return
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    set({ edge, x0: e.clientX, rect: cardRef.current.getBoundingClientRect(), next: { startMin: seat.startMin, endMin: seat.endMin }, problem: null })
  }
  const move = (e: ReactPointerEvent<HTMLElement>) => {
    const l = liveRef.current
    if (!l) return
    const delta = snap((e.clientX - l.x0) / ppm)
    const want = l.edge === 'end' ? { startMin: seat.startMin, endMin: seat.endMin + delta } : { startMin: seat.startMin + delta, endMin: seat.endMin }
    // As far toward the pointer as the checks allow, a step at a time back from it.
    let next = want
    let problem = hoursProblem(b, seat, want)
    const first = problem
    for (let steps = Math.abs(delta) / SNAP; problem && steps > 0; steps--) {
      const back = (l.edge === 'end' ? next.endMin : next.startMin) - Math.sign(delta) * SNAP
      next = l.edge === 'end' ? { ...next, endMin: back } : { ...next, startMin: back }
      problem = hoursProblem(b, seat, next)
    }
    if (problem) next = { startMin: seat.startMin, endMin: seat.endMin }
    if (next.startMin !== l.next.startMin || next.endMin !== l.next.endMin || first?.kind !== l.problem?.kind) set({ ...l, next, problem: first })
  }
  const end = () => {
    const l = liveRef.current
    set(null)
    if (l && (l.next.startMin !== seat.startMin || l.next.endMin !== seat.endMin)) b.setSeatTime(seat, l.next)
  }
  const handle = (edge: Live['edge'], at: string) => (
    <span
      key={edge}
      role="presentation"
      onPointerDown={start(edge)}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={() => set(null)}
      onClick={(e) => e.stopPropagation()}
      title={edge === 'end' ? 'Drag to stay later or leave earlier' : 'Drag to come earlier or later'}
      className={cn(
        'group/handle absolute inset-y-0 z-10 flex w-3 cursor-ew-resize touch-none items-center justify-center',
        // Inside the card at its own edges (the card clips what's outside), centred on a line inside it.
        at === '0%' ? 'translate-x-0' : at === '100%' ? '-translate-x-full' : '-translate-x-1/2',
      )}
      style={{ left: at }}
      data-testid={`stretch-${edge}`}
    >
      <span className="h-6 w-1.5 rounded-full bg-background opacity-0 shadow-[0_0_0_1px_color-mix(in_oklab,var(--foreground)_35%,transparent),0_1px_3px_rgb(0_0_0/0.2)] transition-opacity group-hover/card:opacity-100 group-hover/handle:opacity-100" />
    </span>
  )

  return (
    <>
      {edges.start ? handle('start', edges.start) : null}
      {edges.end ? handle('end', edges.end) : null}
      {live ? <Ghost live={live} seat={seat} span={span} ppm={ppm} /> : null}
    </>
  )
}

/** The new hours while dragging: a bar over the timeline where the card would reach, and the time at the edge moved. */
function Ghost({ live, seat, span, ppm }: { live: Live; seat: Span; span: Span; ppm: number }) {
  const { rect, next, edge, problem } = live
  // The card's box stands for `span`: its edges are that time's start and end.
  const left = rect.left + (next.startMin - span.startMin) * ppm
  const right = rect.right + (next.endMin - span.endMin) * ppm
  const changed = next.startMin !== seat.startMin || next.endMin !== seat.endMin
  const at = edge === 'end' ? next.endMin : next.startMin
  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[60]" data-testid="stretch-ghost">
      <div
        className="absolute rounded-lg border-2 border-dashed border-foreground/50 bg-foreground/[0.06]"
        style={{ left, top: rect.top, width: Math.max(8, right - left), height: rect.height }}
      />
      <div
        className={cn('absolute -translate-x-1/2 rounded-md px-2 py-1 text-xs font-semibold whitespace-nowrap shadow-md', problem && !changed ? 'bg-amber-600 text-white' : 'bg-foreground text-background')}
        style={{ left: edge === 'end' ? right : left, top: rect.top - 30 }}
      >
        {`${edge === 'end' ? 'until' : 'from'} ${formatMinutes(at)}`}
        {problem ? <span className="font-normal opacity-85"> · {problemText(problem)}</span> : null}
      </div>
    </div>,
    document.body,
  )
}
