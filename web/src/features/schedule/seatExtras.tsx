import { LuBan } from 'react-icons/lu'
import { seatKind } from '@shared/schedule/classes'
import { KIND_COLORS, levelColor } from '@shared/schedule/seatColors'
import type { Session, WithId } from '@shared/types'
import { ContextMenuFor, MenuOnTap } from '@/components/app/ItemMenu'
import { cn } from '@/lib/utils'
import { useBoard } from './board'
import { guestActions, seatActions } from './menus'
import { guestWords } from './seatHours'
import { classRange, seatVars } from './seatParts'
import type { ClassView } from './useClassData'

/**
 * Who canceled, under a class's seats (the owner's pick, 2026-11-08, docs/DECISIONS.md §38): their seats show open
 * above, and each name opens its actions for the office (restore the seat, book a makeup).
 */
export function CanceledLine({ seats, v, className }: { seats: readonly WithId<Session>[]; v: ClassView; className?: string }) {
  const b = useBoard()
  const editable = b.mode === 'admin' && b.canEdit(v.c.dateKey)
  if (!seats.length) return null
  return (
    <div
      className={cn('flex h-5 min-w-0 shrink-0 items-center gap-1 overflow-hidden px-1 text-[12px] whitespace-nowrap text-muted-foreground', className)}
      title={`Canceled: ${seats.map((s) => s.studentName).join(', ')}`}
      data-testid="canceled-line"
    >
      <LuBan className="size-3 shrink-0" />
      <span className="shrink-0">Canceled:</span>
      {seats.map((s, i) => (
        <span key={s.id} className="shrink-0">
          {editable ? (
            <MenuOnTap entries={seatActions(b, s, v)}>
              <button type="button" className="rounded px-0.5 line-through decoration-[1.5px] hover:bg-muted hover:text-foreground" data-seat-id={s.id} data-status={s.status}>
                {s.studentName}
              </button>
            </MenuOnTap>
          ) : (
            <span className="line-through decoration-[1.5px]">{s.studentName}</span>
          )}
          {i < seats.length - 1 ? ',' : ''}
        </span>
      ))}
    </div>
  )
}

/**
 * A student of another class in during this one (docs/DECISIONS.md §38), as a seat of the list and the week's sheet:
 * dashed, in their level's colour, with until when (or from when) and their class. The office taps it to change their
 * hours or open their class; a coach taps it to open their class.
 */
export function GuestTile({ seat, v, className, small }: { seat: WithId<Session>; v: ClassView; className?: string; small?: boolean }) {
  const b = useBoard()
  const home = b.classById(seat.classId)
  const st = b.student(seat.studentId)
  const kind = seatKind(seat.note)
  const color = kind !== 'regular' ? KIND_COLORS[kind] : levelColor(st?.level ?? null, b.levels)
  const editable = b.mode === 'admin' && b.canEdit(seat.dateKey)
  const entries = editable ? guestActions(b, seat, home) : []
  const { late, when, what } = guestWords(seat, v, home)
  return (
    <ContextMenuFor entries={entries}>
      <div className={cn('min-w-0', className)} data-seat-id={seat.id} data-testid="guest-card">
        <MenuOnTap entries={entries}>
          <button
            type="button"
            onClick={entries.length ? undefined : () => home && b.openClass(home.c.id)}
            className={cn(
              'hatch-empty flex size-full min-w-0 flex-col justify-center rounded-lg border border-dashed border-foreground/25 text-left text-(--seat-ink) dark:text-(--seat-ink-dark)',
              small ? 'gap-0 rounded-[5px] px-1.5' : 'gap-0.5 px-3',
            )}
            style={{ ...seatVars(color), boxShadow: `inset ${small ? 3 : 4}px 0 0 ${color.dot}` }}
            title={`${seat.studentName}: ${classRange(seat.startMin, seat.endMin)}. ${what}, in a seat of this one ${when}.`}
          >
            <span className={cn('flex min-w-0 items-center gap-1', small ? 'text-[10px] leading-[13px]' : 'text-[12px]')}>
              <span className={cn('min-w-0 truncate opacity-85', small && 'font-medium')}>{small ? (late ? 'Staying on' : 'In early') : what}</span>
              <span className="ml-auto shrink-0 font-semibold tabular-nums">{when}</span>
            </span>
            <span className={cn('truncate font-semibold', small ? 'text-[11.5px] leading-[15px]' : 'text-[14px]')}>{seat.studentName}</span>
          </button>
        </MenuOnTap>
      </div>
    </ContextMenuFor>
  )
}
