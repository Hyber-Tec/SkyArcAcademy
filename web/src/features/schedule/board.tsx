import { type DragEvent, type HTMLAttributes, createContext, use } from 'react'
import type { ClassRequest } from '@shared/schedule/requests'
import type { SessionStatus } from '@shared/settings/defaults'
import type { DateKey } from '@shared/time'
import type { AcademyClass, Availability, ClockShift, Session, Student, WithId } from '@shared/types'
import type { ClassView } from './useClassData'

/** A seat being dragged to another class. */
export interface Drag {
  seatId: string
  studentId: string
  fromClassId: string
}

/**
 * What the schedule's parts share: the week's classes and who's in, the people, and what the office can do (a coach
 * sees the same board, read-only).
 */
export interface Board {
  mode: 'admin' | 'coach'
  /** The coach looking (coach mode): their classes stand out, the others are a little faded. */
  me: string | null
  today: DateKey
  nowMin: number
  levels: readonly string[]
  byDate: ReadonlyMap<DateKey, ClassView[]>
  classById: (id: string) => ClassView | undefined
  /** Everyone with hours that day, earliest first. */
  inOn: (d: DateKey) => WithId<Availability>[]
  isOpen: (d: DateKey) => boolean
  student: (id: string) => WithId<Student> | undefined
  staffName: (staffId: string, fallback?: string) => string
  staffColor: (staffId: string) => string
  /** Clocked in now (the kiosk), for today's who's in. */
  clockedIn: (staffId: string) => number | null
  /** The kiosk's shifts that day, as clocked (the office only: the timeline draws them behind each person's row). */
  shiftsOn: (d: DateKey) => WithId<ClockShift>[]
  /** Teaches: a coach (the manager and the owner can be in without teaching). */
  teaches: (staffId: string) => boolean
  /**
   * Families' open requests on a class (the office only): those asking for it, waiting for the office, and those it was
   * suggested for, waiting for the family's answer.
   */
  requestsFor: (classId: string) => WithId<ClassRequest>[]
  /** Opens a request to approve, decline or suggest another class. */
  openRequest: (requestId: string) => void
  /** The office can change this day: owners and admins, any day (a day that's over too); never a coach. */
  canEdit: (d: DateKey) => boolean

  openClass: (classId: string) => void
  openDay: (d: DateKey) => void
  addSeat: (classId: string) => void
  addClass: (d: DateKey) => void
  editWhosIn: (d: DateKey) => void
  setStatus: (s: WithId<Session>, status: SessionStatus) => void
  setLabel: (s: WithId<Session>, label: string) => void
  move: (s: WithId<Session>, to: WithId<AcademyClass>) => void
  removeSeat: (s: WithId<Session>) => void
  saveClass: (v: ClassView, patch: { startMin?: number; endMin?: number; seats?: number; note?: string }) => void
  removeClass: (v: ClassView) => void
  /** That day's opening hours, for the class's time pickers. */
  hoursOf: (d: DateKey) => { isOpen: boolean; openMin: number; closeMin: number }

  drag: Drag | null
  /** The seat that looks lifted (set a frame after the drag starts, so the browser's drag picture isn't faded). */
  lifted: string | null
  startDrag: (d: Drag) => void
  endDrag: () => void
  /** The class under the pointer while dragging. */
  over: string | null
  setOver: (id: string | null | ((o: string | null) => string | null)) => void
}

export const BoardContext = createContext<Board | null>(null)

export function useBoard(): Board {
  const b = use(BoardContext)
  if (!b) throw new Error('useBoard outside the schedule')
  return b
}

/** Seats still free in a class. */
export const freeSeats = (v: ClassView) => Math.max(0, v.c.seats - v.taken)

/** Whether a dragged seat can land in a class: not its own, not a full one, not one the student is already in. */
export type DropCheck = { ok: true } | { ok: false; reason: 'same' | 'full' | 'already' | 'past' }
export function canDrop(b: Board, seat: WithId<Session> | undefined, v: ClassView): DropCheck {
  if (!seat || seat.classId === v.c.id) return { ok: false, reason: 'same' }
  if (!b.canEdit(v.c.dateKey)) return { ok: false, reason: 'past' }
  if (v.seats.some((s) => s.studentId === seat.studentId && s.status !== 'canceled')) return { ok: false, reason: 'already' }
  if (freeSeats(v) <= 0) return { ok: false, reason: 'full' }
  return { ok: true }
}

export const REFUSAL: Record<'full' | 'already' | 'past', string> = {
  full: 'Class is full',
  already: 'Already in this class',
  past: 'Past day',
}

/** A seat to drag to another class (not a canceled one, not on a past day, and only for the office). */
export function useDragSource(seat: WithId<Session>): HTMLAttributes<HTMLElement> & { draggable: boolean } {
  const b = useBoard()
  if (b.mode !== 'admin' || seat.status === 'canceled' || !b.canEdit(seat.dateKey)) return { draggable: false }
  return {
    draggable: true,
    onDragStart: (e: DragEvent<HTMLElement>) => {
      e.dataTransfer.setData('text/plain', seat.id)
      e.dataTransfer.effectAllowed = 'move'
      b.startDrag({ seatId: seat.id, studentId: seat.studentId, fromClassId: seat.classId })
    },
    onDragEnd: () => b.endDrag(),
  }
}

/** A class as a drop target while a seat is dragged. */
export function useDropTarget(v: ClassView) {
  const b = useBoard()
  const seat = b.drag ? b.classById(b.drag.fromClassId)?.seats.find((s) => s.id === b.drag?.seatId) : undefined
  const check = b.drag ? canDrop(b, seat, v) : null
  const ok = check?.ok === true
  const refused = check && !check.ok && check.reason !== 'same' ? check.reason : null
  const hovered = b.over === v.c.id
  return {
    dragging: !!b.drag,
    ok,
    refused,
    hovered,
    props: {
      'data-class': v.c.id,
      onDragEnter: (e: DragEvent<HTMLElement>) => {
        if (b.drag && ok) e.preventDefault()
      },
      onDragOver: (e: DragEvent<HTMLElement>) => {
        if (!b.drag) return
        if (ok) {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
        } else e.dataTransfer.dropEffect = 'none'
        if (b.over !== v.c.id) b.setOver(v.c.id)
      },
      onDragLeave: (e: DragEvent<HTMLElement>) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) b.setOver((o) => (o === v.c.id ? null : o))
      },
      onDrop: (e: DragEvent<HTMLElement>) => {
        e.preventDefault()
        const d = b.drag
        b.endDrag()
        if (d && ok && seat) b.move(seat, v.c)
      },
    },
  }
}

/** A class's cells as the sheet keeps them (shared with the phone app). */
export { cellsOf } from '@shared/schedule/classes'
