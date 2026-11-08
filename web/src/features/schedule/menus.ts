import { LuArrowRight, LuArrowRightLeft, LuBan, LuCalendarPlus, LuCheck, LuCheckCheck, LuClock, LuInbox, LuPlus, LuRotateCcw, LuSquareArrowOutUpRight, LuTrash2, LuUndo2, LuUserPlus, LuUserX, LuUsers } from 'react-icons/lu'
import { earnsMakeup, makeupLabel, takesSeat } from '@shared/schedule/classes'
import { type DateKey, addDays, formatDateKey } from '@shared/time'
import type { Session, WithId } from '@shared/types'
import { type MenuEntry, menu } from '@/components/app/ItemMenu'
import { type Board, freeSeats, isIn } from './board'
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

/**
 * A seat's actions (its ⋯ menu): open the class, change the student's hours (docs/DECISIONS.md §38), cancel or
 * restore, book a make-up for a canceled class, move to another class this week, take out.
 */
export function seatActions(b: Board, seat: WithId<Session>, v: ClassView, inSheet = false): MenuEntry[] {
  const canceled = seat.status === 'canceled'
  const own = seat.startMin !== v.c.startMin || seat.endMin !== v.c.endMin
  // The rest of the week, from the seat's day: the classes the office can move it to.
  const days: DateKey[] = []
  for (let i = 0; i < 7; i++) {
    const d = addDays(seat.dateKey, i)
    if ((b.byDate.get(d) ?? []).length && b.canEdit(d)) days.push(d)
  }
  return menu(
    !inSheet && { label: 'Open the class', icon: LuSquareArrowOutUpRight, onSelect: () => b.openClass(v.c.id) },
    !canceled && { label: 'Change hours…', icon: LuClock, hint: own ? classRange(seat.startMin, seat.endMin) : undefined, onSelect: () => b.changeHours(seat) },
    !canceled && own && { label: `Back to ${classRange(v.c.startMin, v.c.endMin)}`, icon: LuUndo2, onSelect: () => b.setSeatTime(seat, { startMin: v.c.startMin, endMin: v.c.endMin }) },
    canceled
      ? { label: 'Restore the seat', icon: LuRotateCcw, onSelect: () => b.setStatus(seat, 'confirmed') }
      : { label: 'Mark canceled (absent)', icon: LuBan, onSelect: () => b.setStatus(seat, 'canceled') },
    canceled && earnsMakeup(seat) && makeupEntry(b, seat),
    !canceled &&
      days.length > 0 && {
        kind: 'sub',
        label: 'Move to another class',
        icon: LuArrowRightLeft,
        entries: days.flatMap((d): MenuEntry[] => [
          { kind: 'label', label: dayName(d) },
          ...(b.byDate.get(d) ?? []).map((x): MenuEntry => {
            const left = freeSeats(x) + (x.guests.some((s) => s.id === seat.id) ? 1 : 0)
            const here = x.c.id === v.c.id
            const already = !here && isIn(x, seat.studentId, seat.id)
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

/**
 * "Book a makeup this week": the week's classes from today on with a seat open (the schedule's data is the week shown),
 * or where it's booked already. Booked, it's a seat labelled "MU for 11/8", as Add a student books one.
 */
function makeupEntry(b: Board, seat: WithId<Session>): MenuEntry {
  const label = makeupLabel(seat.dateKey).toLowerCase()
  for (const list of b.byDate.values()) {
    for (const x of list) {
      const booked = x.seats.find((s) => s.studentId === seat.studentId && takesSeat(s) && (s.note ?? '').trim().toLowerCase() === label)
      if (booked) return { kind: 'label', label: `Makeup booked: ${formatDateKey(x.c.dateKey, 'weekdayMedium')}, ${classRange(x.c.startMin, x.c.endMin)}`, tone: 'muted' }
    }
  }
  const days = [...b.byDate.keys()].filter((d) => d >= b.today && b.canEdit(d) && (b.byDate.get(d) ?? []).length).sort()
  return {
    kind: 'sub',
    label: 'Book a makeup this week',
    icon: LuCalendarPlus,
    entries: days.flatMap((d): MenuEntry[] => [
      { kind: 'label', label: dayName(d) },
      ...(b.byDate.get(d) ?? []).map((x): MenuEntry => {
        const left = freeSeats(x)
        const missed = x.c.id === seat.classId
        const already = isIn(x, seat.studentId)
        const started = x.c.dateKey === b.today && x.c.startMin <= b.nowMin
        return {
          label: classRange(x.c.startMin, x.c.endMin),
          hint: missed ? 'Missed' : already ? 'In it' : started ? 'Started' : left > 0 ? `${left} open` : 'Full',
          disabled: missed || already || started || left <= 0,
          onSelect: () => b.bookMakeup(seat, x),
        }
      }),
    ]),
  }
}

/**
 * A student of another class in during this one (staying on, or in early, docs/DECISIONS.md §38), as its card's menu:
 * their hours, back to their own class's hours, or their class.
 */
export function guestActions(b: Board, seat: WithId<Session>, home: ClassView | undefined): MenuEntry[] {
  return menu(
    { kind: 'label', label: home ? `${seat.studentName} · ${classRange(home.c.startMin, home.c.endMin)} class` : seat.studentName },
    { label: 'Change hours…', icon: LuClock, hint: classRange(seat.startMin, seat.endMin), onSelect: () => b.changeHours(seat) },
    !!home && { label: `Back to ${classRange(home.c.startMin, home.c.endMin)}`, icon: LuUndo2, onSelect: () => b.setSeatTime(seat, { startMin: home.c.startMin, endMin: home.c.endMin }) },
    !!home && { label: 'Open their class', icon: LuSquareArrowOutUpRight, separatorBefore: true, onSelect: () => b.openClass(home.c.id) },
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

/**
 * A class's actions, as its sheet has them: open it, mark the students not marked yet here (once it has started), add
 * a student, who's in that day, remove it.
 */
export function classActions(b: Board, v: ClassView): MenuEntry[] {
  const { c } = v
  const free = freeSeats(v)
  const toMark = b.toMark([v]).length
  return menu(
    { kind: 'label', label: `${classRange(c.startMin, c.endMin)} class` },
    { label: 'Open the class', icon: LuSquareArrowOutUpRight, onSelect: () => b.openClass(c.id) },
    toMark > 0 && { label: 'Mark the rest here', icon: LuCheckCheck, hint: String(toMark), onSelect: () => b.markHere([v], 'class') },
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

/**
 * A day's empty space on the timeline, right-clicked: add a class, who's in, mark the students not marked yet here (a
 * day that has started), and in the week, open the day.
 */
export function dayActions(b: Board, d: DateKey, week = false): MenuEntry[] {
  const classes = b.byDate.get(d) ?? []
  const toMark = b.toMark(classes).length
  return menu(
    { kind: 'label', label: dayName(d) },
    toMark > 0 && { label: 'Mark the rest of the day here', icon: LuCheckCheck, hint: String(toMark), onSelect: () => b.markHere(classes, 'day') },
    { label: 'Add a class', icon: LuPlus, onSelect: () => b.addClass(d) },
    { label: "Who's in", icon: LuUsers, onSelect: () => b.editWhosIn(d) },
    week && { label: 'Open the day', icon: LuArrowRight, separatorBefore: true, onSelect: () => b.openDay(d) },
  )
}
