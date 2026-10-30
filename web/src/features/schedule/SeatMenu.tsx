import { LuEllipsis } from 'react-icons/lu'
import type { Session, WithId } from '@shared/types'
import { MenuOnTap } from '@/components/app/ItemMenu'
import { Button } from '@/components/ui/button'
import { useBoard } from './board'
import { seatActions } from './menus'
import type { ClassView } from './useClassData'

/**
 * A seat's ⋯ button and its actions: open the class, cancel or restore, move to another class this week, take out (the
 * same list a right-click on the student shows, after the marks). `compact`: a smaller button (the timeline's cards).
 */
export function SeatMenu({ seat, v, inSheet, compact }: { seat: WithId<Session>; v: ClassView; inSheet?: boolean; compact?: boolean }) {
  const b = useBoard()
  return (
    <MenuOnTap entries={seatActions(b, seat, v, inSheet)} align="end">
      <Button variant="ghost" size={compact ? 'icon-xs' : 'icon-sm'} aria-label={`More for ${seat.studentName}`} className={compact ? 'hover:bg-background/60' : undefined}>
        <LuEllipsis className={compact ? 'size-4' : undefined} />
      </Button>
    </MenuOnTap>
  )
}
