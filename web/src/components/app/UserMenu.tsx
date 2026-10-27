import { useState } from 'react'
import { LuChevronsUpDown, LuKeyRound, LuLayoutGrid, LuLogOut, LuPresentation } from 'react-icons/lu'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthProvider'
import { useOptionalBranch } from '@/branch/BranchProvider'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SidebarMenuButton } from '@/components/ui/sidebar'
import { Switch } from '@/components/ui/switch'
import { initials } from '@shared/people'
import { SignInSecurityDialog } from './SignInSecurity'
import { ThemeSubmenu } from './ThemeToggle'

export function UserAvatar({ className }: { className?: string }) {
  const { user } = useAuth()
  // The name the academy knows the person by first (an email-and-password sign-in has none of its own).
  const name = useOptionalBranch()?.member?.displayName || user?.displayName || user?.email || '?'
  return (
    <Avatar className={className}>
      {user?.photoURL ? <AvatarImage src={user.photoURL} alt="" referrerPolicy="no-referrer" /> : null}
      <AvatarFallback>{initials(name)}</AvatarFallback>
    </Avatar>
  )
}

export function UserMenu({ variant = 'header' }: { variant?: 'header' | 'sidebar' }) {
  const { user, email, signOut } = useAuth()
  const branch = useOptionalBranch()
  const navigate = useNavigate()
  const [security, setSecurity] = useState(false)
  const name = branch?.member?.displayName || user?.displayName || email || ''

  const trigger =
    variant === 'sidebar' ? (
      <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
        <UserAvatar className="size-8 rounded-lg" />
        <div className="grid flex-1 text-left text-sm leading-tight">
          <span className="truncate font-medium">{name}</span>
          <span className="truncate text-xs text-muted-foreground">{email}</span>
        </div>
        <LuChevronsUpDown className="ml-auto size-4" />
      </SidebarMenuButton>
    ) : (
      <Button variant="ghost" size="icon" className="rounded-full" aria-label="Account menu">
        <UserAvatar className="size-8" />
      </Button>
    )

  return (
    <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-60" align="end" side={variant === 'sidebar' ? 'top' : 'bottom'}>
        <DropdownMenuLabel className="font-normal">
          <div className="text-sm font-medium">{name}</div>
          <div className="text-xs text-muted-foreground">{email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {branch && branch.isAdmin ? (
            <DropdownMenuItem onSelect={() => navigate('/kiosk')}>
              <LuLayoutGrid />
              Open kiosk mode
            </DropdownMenuItem>
          ) : null}
          {branch?.canSwitchDemo ? (
            <DropdownMenuItem
              data-testid="demo-switch"
              onSelect={() => {
                const on = !branch.isDemo
                branch.setDemo(on)
                navigate('/app')
                toast.success(on ? 'Demo data: made-up students and classes' : 'The academy’s real data')
              }}
            >
              <LuPresentation />
              Demo data
              <Switch checked={branch.isDemo} tabIndex={-1} aria-hidden className="pointer-events-none ml-auto" />
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onSelect={() => setSecurity(true)}>
            <LuKeyRound />
            Sign-in & security
          </DropdownMenuItem>
          <ThemeSubmenu />
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async () => {
            await signOut()
            navigate('/')
          }}
        >
          <LuLogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <SignInSecurityDialog open={security} onOpenChange={setSecurity} />
    </>
  )
}
