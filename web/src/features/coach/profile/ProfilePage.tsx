import type { IconType } from 'react-icons'
import { LuBell, LuKeyRound, LuSunMoon, LuUserRound, LuWallet } from 'react-icons/lu'
import { formatDateKey } from '@shared/time'
import type { Staff, WithId } from '@shared/types'
import { useAuth } from '@/auth/AuthProvider'
import { useBranch } from '@/branch/BranchProvider'
import { StaffStatusBadge } from '@/components/app/StatusBadge'
import { useTheme } from '@/components/app/theme'
import { Skeleton } from '@/components/ui/skeleton'
import { ProfileLayout } from '@/features/profile/ProfileLayout'
import { useIsMobile } from '@/hooks/use-mobile'
import { NOTIFICATION_SWITCHES, prefOn } from '../api'
import { NOT_LINKED, useMyStaff } from '../hooks'
import { AccountSection } from './AccountSection'
import { MeAvatar } from './parts'

interface Section {
  to: string
  label: string
  icon: IconType
  /** Short value on the right of the phone list ("5", "Light"). */
  value?: (ctx: { staff: WithId<Staff> | null; theme: string }) => string | null
}

const SECTIONS: Section[] = [
  { to: 'account', label: 'Account details', icon: LuUserRound },
  {
    to: 'notifications',
    label: 'Notifications',
    icon: LuBell,
    value: ({ staff }) => {
      if (!staff) return null
      const on = NOTIFICATION_SWITCHES.filter((s) => prefOn(staff.notificationPrefs, s.key)).length
      return on === NOTIFICATION_SWITCHES.length ? 'All on' : on === 0 ? 'Off' : `${on} of ${NOTIFICATION_SWITCHES.length} on`
    },
  },
  { to: 'security', label: 'Sign-in & security', icon: LuKeyRound },
  { to: 'appearance', label: 'Appearance', icon: LuSunMoon, value: ({ theme }) => theme[0].toUpperCase() + theme.slice(1) },
]

/**
 * Profile: the coach's own pages. Computers get the sections in a side list;
 * phones get the list on its own (as in the phone app) and open each section.
 */
export function ProfilePage() {
  const { data: staff, loading } = useMyStaff()
  const { theme } = useTheme()
  const rows = SECTIONS.map((s) => ({ to: s.to, label: s.label, icon: s.icon, value: s.value?.({ staff, theme }) ?? null }))
  const [account, notifications, security, appearance] = rows
  return (
    <ProfileLayout
      base="/coach/profile"
      header={<ProfileHeader staff={staff} loading={loading} />}
      sections={rows}
      groups={[
        { title: 'Your account', rows: [account, { to: '/coach/payroll', label: 'Payroll', icon: LuWallet }] },
        { title: 'Settings', rows: [notifications, security, appearance] },
      ]}
    />
  )
}

/** `/coach/profile`: the account details on computers (phones show the list instead). */
export function ProfileIndex() {
  const isMobile = useIsMobile()
  return isMobile ? null : <AccountSection />
}

function ProfileHeader({ staff, loading }: { staff: WithId<Staff> | null; loading: boolean }) {
  const { branch, viewAs } = useBranch()
  const { email } = useAuth()
  if (loading) {
    return (
      <div className="flex items-center gap-4">
        <Skeleton className="size-16 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>
    )
  }
  if (!staff) return <p className="text-sm text-muted-foreground">{NOT_LINKED}</p>
  const since = staff.startDate ? ` since ${formatDateKey(staff.startDate, 'monthYear')}` : ''
  return (
    <header className="flex items-center gap-4">
      <MeAvatar staff={staff} className="size-16 text-lg" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{staff.name}</h1>
          <StaffStatusBadge status={staff.status} />
        </div>
        {/* Wraps on a phone rather than cutting off the date. */}
        <p className="mt-1 text-sm text-pretty text-muted-foreground">
          Coach at {branch.name}
          {since}
        </p>
        {/* The sign-in email (an owner or admin previewing with View as sees the coach's own). */}
        <p className="truncate text-sm text-muted-foreground">{viewAs ? staff.email : (email ?? staff.email)}</p>
      </div>
    </header>
  )
}
