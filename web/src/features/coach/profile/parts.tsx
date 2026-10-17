import type { Staff, WithId } from '@shared/types'
import { useAuth } from '@/auth/AuthProvider'
import { useBranch } from '@/branch/BranchProvider'
import { initials } from '@shared/people'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

/** The coach's own photo when it's really them; initials in their color otherwise (or while an owner or admin previews). */
export function MeAvatar({ staff, className }: { staff: WithId<Staff> | null; className?: string }) {
  const { user } = useAuth()
  const { viewAs } = useBranch()
  const name = staff?.name || user?.displayName || '?'
  const photo = !viewAs ? user?.photoURL : null
  const color = staff?.color
  return (
    <Avatar className={className}>
      {photo ? <AvatarImage src={photo} alt="" referrerPolicy="no-referrer" /> : null}
      <AvatarFallback className="font-semibold" style={color ? { backgroundColor: `${color}1f`, color } : undefined}>
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  )
}
