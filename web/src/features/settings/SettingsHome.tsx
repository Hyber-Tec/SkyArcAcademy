import { limit, orderBy, query } from 'firebase/firestore'
import { useMemo, useState } from 'react'
import { LuChevronRight, LuSearch, LuX } from 'react-icons/lu'
import { Link, useNavigate } from 'react-router'
import { COL } from '@shared/paths'
import { searchFinds } from '@shared/settings/search'
import {
  type DatedHours,
  activitySummary,
  availabilitySummary,
  classesSummary,
  contractSummary,
  hoursSummary,
  noticesSummary,
  paySummary,
  signupSummary,
  studentsSummary,
  websiteSummary,
} from '@shared/settings/summaries'
import { addDays, todayKey, weekdayOf } from '@shared/time'
import type { AuditEntry } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'
import { useIsSuperAdmin } from '@/features/ai/api'
import { AiTileSummary } from '@/features/ai/AiTileSummary'
import { useContractTemplates } from '@/features/contracts/api'
import { useDayConfigs } from '@/features/data/hooks'
import { useNewWebsiteMessageCount } from '@/features/website/api'
import { branchCol, useQuery } from '@/lib/firestore'
import { useNow } from '@/lib/useNow'
import { HOME_GROUPS, PAGES, SETTINGS_FINDS, pageByKey, pageTitle } from './pages'
import { PAGE_ICONS, zoneWords } from './pageIcons'

/**
 * Settings → the home (Goo's pick of 2026-10-28, docs/DECISIONS.md §23): a tile for each page, in three groups, each
 * saying what it's set to now; and a search for any setting by its words, which opens its page with the setting marked.
 */
export function SettingsHome() {
  const { branch, branchId, settings, rules, timezone } = useBranch()
  const navigate = useNavigate()
  const now = useNow(60_000)
  const today = todayKey(timezone, now)
  const [q, setQ] = useState('')
  // The AI page is for super admins only: its tile and its search results too.
  const { isSuperAdmin } = useIsSuperAdmin()
  const pages = useMemo(() => PAGES.filter((p) => !p.superAdminOnly || isSuperAdmin), [isSuperAdmin])
  const found = useMemo(() => searchFinds(SETTINGS_FINDS, q).filter((f) => !pageByKey(f.page)?.superAdminOnly || isSuperAdmin), [q, isSuperAdmin])

  // What the tiles say beyond the settings: the next dates with other hours, new messages, the contract, the last change.
  const { map: dayConfigs } = useDayConfigs(today, addDays(today, 180))
  const dated = useMemo<DatedHours[]>(() => {
    const week = settings.schedule.defaultWeek
    return [...dayConfigs.values()].filter((d) => {
      const usual = week[weekdayOf(d.dateKey)]
      return d.isOpen !== usual.isOpen || (d.isOpen && (d.openMin !== usual.openMin || d.closeMin !== usual.closeMin))
    })
  }, [dayConfigs, settings.schedule.defaultWeek])
  const newMessages = useNewWebsiteMessageCount(true)
  const contract = useContractTemplates()
  const lastQuery = useMemo(() => query(branchCol(branchId, COL.auditLog), orderBy('at', 'desc'), limit(1)), [branchId])
  const last = useQuery<AuditEntry>(lastQuery, `settings-last-change-${branchId}`).data[0]

  const summary: Record<string, string> = {
    hours: hoursSummary(settings, dated),
    classes: classesSummary(settings, rules),
    availability: availabilitySummary(settings),
    pay: paySummary(settings),
    students: studentsSummary(settings),
    signup: signupSummary(settings),
    notices: noticesSummary(settings),
    academy: [branch.name, zoneWords(timezone), branch.contact?.email].filter(Boolean).join(' · '),
    website: websiteSummary(newMessages),
    contract: contract.loading ? '' : contractSummary(!!contract.current),
    activity: activitySummary(last ? { summary: last.summary, who: last.actorName || 'Someone', atMs: last.at?.toMillis?.() ?? now } : null, now),
  }

  const open = (page: string, find: string | null) => navigate(`/admin/settings/${page}${find ? `?find=${encodeURIComponent(find)}` : ''}`)

  return (
    <div className="mx-auto max-w-7xl pb-10" data-testid="settings-home">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">Everything the academy sets, in plain words. Open one to change it.</p>
        </div>
        <InputGroup className="h-10 w-full bg-card sm:w-96">
          <InputGroupAddon>
            <LuSearch />
          </InputGroupAddon>
          <InputGroupInput
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && found[0]) open(found[0].page, found[0].find)
              if (e.key === 'Escape') setQ('')
            }}
            placeholder="Search: cancel, pay, holidays, levels…"
            aria-label="Search settings"
            data-testid="settings-search"
          />
          {q ? (
            <InputGroupAddon align="inline-end">
              <InputGroupButton size="icon-xs" onClick={() => setQ('')} aria-label="Clear the search">
                <LuX />
              </InputGroupButton>
            </InputGroupAddon>
          ) : null}
        </InputGroup>
      </div>

      {q ? (
        <div className="mt-6 max-w-3xl" data-testid="settings-results">
          {found.length ? (
            <ul className="space-y-2">
              {found.map((r) => {
                const Icon = PAGE_ICONS[r.page]
                return (
                  <li key={r.key}>
                    <button
                      type="button"
                      onClick={() => open(r.page, r.find)}
                      className="flex w-full items-center gap-3 rounded-xl border bg-card px-4 py-3 text-left shadow-xs transition-colors hover:bg-muted/50"
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">{Icon ? <Icon className="size-4" /> : null}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{r.label}</span>
                        <span className="block text-xs text-muted-foreground">{r.key.startsWith('page:') ? 'Open the page' : pageTitle(r.page)}</span>
                      </span>
                      <LuChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Nothing matches “{q}”. Try words like cancel, pay, holiday or levels.</p>
          )}
        </div>
      ) : (
        HOME_GROUPS.filter((g) => pages.some((p) => p.home === g.key)).map((g) => (
          <section key={g.key} className="mt-8">
            <h2 className="mb-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase">{g.title}</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {pages.filter((p) => p.home === g.key).map((p) => {
                const Icon = PAGE_ICONS[p.key]
                return (
                  <Link
                    key={p.key}
                    to={`/admin/settings/${p.key}`}
                    className="group flex min-h-28 items-start gap-3.5 rounded-2xl border bg-card p-4 shadow-xs transition-[border-color,box-shadow] hover:border-foreground/20 hover:shadow-md"
                    data-testid={`settings-tile-${p.key}`}
                  >
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted">{Icon ? <Icon className="size-5" /> : null}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{p.title}</span>
                      <span className="mt-1 line-clamp-4 text-sm text-muted-foreground">{p.key === 'ai' ? <AiTileSummary /> : summary[p.key]}</span>
                    </span>
                    <LuChevronRight className="mt-3 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </Link>
                )
              })}
            </div>
          </section>
        ))
      )}
    </div>
  )
}
