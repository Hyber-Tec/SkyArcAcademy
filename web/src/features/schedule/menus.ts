import { LuArrowRight, LuArrowRightLeft, LuBan, LuCheck, LuInbox, LuPlus, LuRotateCcw, LuSquareArrowOutUpRight, LuTrash2, LuUserPlus, LuUserX, LuUsers } from 'react-icons/lu'
import { type DateKey, addDays, formatDateKey } from '@shared/time'
import type { Session, WithId } from '@shared/types'
import { type MenuEntry, menu } from '@/components/app/ItemMenu'
import { type Board, freeSeats } from './board'
import { classRange } from './seatParts'
import type { ClassView } from './useClassData'

/**
 * The schedule's menus, each one list of actions shown behind its ⋯ button (SeatMenu) and on a right-click (the owner,
 * 2026-10-29: "if we can right-click the student session card or other places"). Only the office gets them, as before.
 */

const dayName = (d: DateKey) => formatDateKey(d, 'weekdayLong').replace(/, \d{4}$/, '')

/** `first`, then `rest` under a line. */
function after(first: MenuEntry[], rest: MenuEntry[]): MenuEntry[] {
  return [...first, ...rest.map((e, i) => (i === 0 && e.kind !== 'label' ? { ...e, separatorBefore: true } : e))]
}

/** A seat's actions (its ⋯ menu): open the class, cancel or restore, move to another class this week, take out. */
export function seatActions(b: Board, seat: WithId<Session>, v: ClassView, inSheet = false): MenuEntry[] {
  const canceled = seat.status === 'canceled'
  // The rest of the week, from the seat's day: the classes the office can move it to.
  const days: DateKey[] = []
  for (let i = 0; i < 7; i++) {
    const d = addDays(seat.dateKey, i)
    if ((b.byDate.get(d) ?? []).length && b.canEdit(d)) days.push(d)
  }
  return menu(
    !inSheet && { label: 'Open the class', icon: LuSquareArrowOutUpRight, onSelect: () => b.openClass(v.c.id) },
    canceled
      ? { label: 'Restore the seat', icon: LuRotateCcw, onSelect: () => b.setStatus(seat, 'confirmed') }
      : { label: 'Mark canceled (absent)', icon: LuBan, onSelect: () => b.setStatus(seat, 'canceled') },
    !canceled &&
      days.length > 0 && {
        kind: 'sub',
        label: 'Move to another class',
        icon: LuArrowRightLeft,
        entries: days.flatMap((d): MenuEntry[] => [
          { kind: 'label', label: dayName(d) },
          ...(b.byDate.get(d) ?? []).map((x): MenuEntry => {
            const left = freeSeats(x)
            const here = x.c.id === v.c.id
            const already = !here && x.seats.some((s) => s.studentId === seat.studentId && s.status !== 'canceled')
            return {
              label: classRange(x.c.startMin, x.c.endMin),
              hint: here ? 'This class' : already ? 'In it' : left > 0 ? `${left} open` : 'Full',
              disabled: here || already || left <= 0,
              onSelect: () => b.move(seat, x.c),
            }
          }),
        ]),
      },
    { label: 'Take out of this class', icon: LuTrash2, destructive: true, separatorBefore: true, onSelect: () => b.removeSeat(seat) },
  )
}

/** A student's card, right-clicked: here or no-show (from the class's day on), then the seat's actions. */
export function seatContextActions(b: Board, seat: WithId<Session>, v: ClassView): MenuEntry[] {
  const present = seat.status === 'present'
  const noShow = seat.status === 'no_show'
  // Here and no-show belong to the class's day: a class next week has nothing to mark yet.
  const markable = seat.dateKey <= b.today && seat.status !== 'canceled'
  return after(
    menu(
      { kind: 'label', label: seat.studentName },
      markable && { label: present ? 'Undo here' : 'Mark here', icon: LuCheck, onSelect: () => b.setStatus(seat, present ? 'confirmed' : 'present') },
      markable && { label: noShow ? 'Undo no-show' : 'Mark no-show', icon: LuUserX, onSelect: () => b.setStatus(seat, noShow ? 'confirmed' : 'no_show') },
    ),
    seatActions(b, seat, v),
  )
}

/** A class's actions, as its sheet has them: open it, add a student, who's in that day, remove it. */
export function classActions(b: Board, v: ClassView): MenuEntry[] {
  const { c } = v
  const free = freeSeats(v)
  return menu(
    { kind: 'label', label: `${classRange(c.startMin, c.endMin)} class` },
    { label: 'Open the class', icon: LuSquareArrowOutUpRight, onSelect: () => b.openClass(c.id) },
    { label: 'Add a student', icon: LuUserPlus, hint: free > 0 ? `${free} open` : 'Full', disabled: free <= 0, onSelect: () => b.addSeat(c.id) },
    { label: "Who's in this day", icon: LuUsers, onSelect: () => b.editWhosIn(c.dateKey) },
    { label: 'Remove this class', icon: LuTrash2, destructive: true, separatorBefore: true, onSelect: () => b.removeClass(v) },
  )
}

/** An open seat, right-clicked: add a student to it, or open its class. */
export function openSeatActions(b: Board, v: ClassView): MenuEntry[] {
  return after(
    [{ label: 'Add a student here', icon: LuUserPlus, onSelect: () => b.addSeat(v.c.id) }],
    [{ label: 'Open the class', icon: LuSquareArrowOutUpRight, onSelect: () => b.openClass(v.c.id) }],
  )
}

/** A family's request on a class, right-clicked: open it (to approve, decline or suggest another class), or the class. */
export function requestActions(b: Board, requestId: string, v: ClassView): MenuEntry[] {
  return after(
    [{ label: 'Open the request', icon: LuInbox, onSelect: () => b.openRequest(requestId) }],
    [{ label: 'Open the class', icon: LuSquareArrowOutUpRight, onSelect: () => b.openClass(v.c.id) }],
  )
}

/** A day's empty space on the timeline, right-clicked: add a class, who's in, and in the week, open the day. */
export function dayActions(b: Board, d: DateKey, week = false): MenuEntry[] {
  return menu(
    { kind: 'label', label: dayName(d) },
    { label: 'Add a class', icon: LuPlus, onSelect: () => b.addClass(d) },
    { label: "Who's in", icon: LuUsers, onSelect: () => b.editWhosIn(d) },
    week && { label: 'Open the day', icon: LuArrowRight, separatorBefore: true, onSelect: () => b.openDay(d) },
  )
}
