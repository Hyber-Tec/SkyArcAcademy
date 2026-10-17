import type { IconType } from 'react-icons'
import { LuChevronLeft, LuChevronRight, LuLogOut } from 'react-icons/lu'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { useAuth } from '@/auth/AuthProvider'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'

export interface ProfileRow {
  /** A section below the profile ("account"), or a page of its own ("/coach/payroll", "/help"). */
  to: string
  label: string
  icon: IconType
  /** Short value on the right of the phone list ("All on", "Light"). */
  value?: string | null
}

const href = (base: string, to: string) => (to.startsWith('/') ? to : `${base}/${to}`)

/**
 * Profile: the person's own pages, in the portals that have one (coaches, parents, students). Computers get the
 * header and the sections in a side list beside the open one; phones get the header and the sections as grouped rows
 * (as in the phone app), each opening on its own page with a way back.
 */
export function ProfileLayout({
  base,
  header,
  sections,
  groups,
}: {
  /** The profile's address, e.g. "/coach/profile". */
  base: string
  header: React.ReactNode
  /** The side list on computers; the first opens at the profile's own address. */
  sections: ProfileRow[]
  /** The phone list, in groups. */
  groups: { title: string; rows: ProfileRow[] }[]
}) {
  const isMobile = useIsMobile()
  const { pathname } = useLocation()
  const atIndex = pathname.replace(/\/$/, '') === base
  const current = sections.find((s) => pathname.startsWith(href(base, s.to)))

  if (isMobile) {
    if (atIndex) {
      return (
        <div className="mx-auto w-full max-w-lg">
          {header}
          <ProfileList base={base} groups={groups} />
        </div>
      )
    }
    return (
      <div className="mx-auto w-full max-w-lg">
        <Link to={base} className="-ml-1 mb-3 inline-flex items-center gap-0.5 text-sm font-medium text-muted-foreground hover:text-foreground">
          <LuChevronLeft className="size-4" /> Profile
        </Link>
        <Outlet />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      {header}
      {/* Computers: the sections in a side list. Tablets: a row of tabs above the section. */}
      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:gap-12">
        <nav aria-label="Profile" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:sticky lg:top-6 lg:mx-0 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:px-0 lg:pb-0">
          {sections.map((s) => {
            const active = current ? current.to === s.to : s === sections[0]
            return (
              <NavLink
                key={s.to}
                to={href(base, s.to)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-9 shrink-0 items-center gap-2.5 rounded-lg px-3 text-sm whitespace-nowrap transition-colors',
                  active ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                )}
              >
                <s.icon className="size-4 shrink-0" />
                <span className="flex-1 truncate">{s.label}</span>
              </NavLink>
            )
          })}
        </nav>
        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  )
}

/** Phones: the sections as grouped rows, then Sign out (the phone app's Profile). */
function ProfileList({ base, groups }: { base: string; groups: { title: string; rows: ProfileRow[] }[] }) {
  const { signOut } = useAuth()
  const navigate = useNavigate()
  return (
    <div className="mt-6 space-y-6">
      {groups.map((g) => (
        <section key={g.title}>
          <h2 className="mb-1.5 px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">{g.title}</h2>
          <ul className="divide-y overflow-hidden rounded-xl border bg-card">
            {g.rows.map((r) => (
              <li key={r.to}>
                <Link to={href(base, r.to)} className="flex min-h-12 items-center gap-3 px-4 py-2.5 active:bg-muted/70" data-testid={`profile-row-${r.label.toLowerCase().replace(/\W+/g, '-')}`}>
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
                    <r.icon className="size-4" />
                  </span>
                  <span className="flex-1 text-[15px] font-medium">{r.label}</span>
                  {r.value ? <span className="text-sm text-muted-foreground tabular-nums">{r.value}</span> : null}
                  <LuChevronRight className="size-4 text-muted-foreground/70" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <button
        type="button"
        onClick={async () => {
          await signOut()
          navigate('/')
        }}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border bg-card text-[15px] font-medium text-red-600 active:bg-muted/70 dark:text-red-400"
      >
        <LuLogOut className="size-4" /> Sign out
      </button>
    </div>
  )
}

/** Title and one line under it, at the top of each section. */
export function SectionTitle({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  // Phones show a section on its own page, so its title is the page's heading.
  const Heading = useIsMobile() ? 'h1' : 'h2'
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <Heading className="text-xl font-semibold tracking-tight">{title}</Heading>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions}
    </div>
  )
}
