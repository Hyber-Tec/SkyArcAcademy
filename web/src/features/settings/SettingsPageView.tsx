import { useEffect, useMemo, useRef, useState } from 'react'
import { LuArrowLeft, LuChevronDown, LuClock, LuExternalLink, LuInfo } from 'react-icons/lu'
import { Link, useBlocker, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { describePay } from '@shared/pay/paidTime'
import { DEFAULT_SETTINGS, type BranchSettings } from '@shared/settings/defaults'
import {
  arrivalExample,
  autoClockOutExample,
  autoStatusExample,
  cancelExample,
  changeWindowExample,
  classLengthExample,
  leadExample,
  lockExample,
  payEndExample,
  payPeriodExample,
  requestsExample,
} from '@shared/settings/examples'
import { type SettingsOverrides, getPath, setPath } from '@shared/settings/resolve'
import { type DateKey, todayKey } from '@shared/time'
import type { AuditChange } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { useConfirm } from '@/components/app/useConfirm'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Spinner } from '@/components/ui/spinner'
import { SignupShareCard } from '@/features/access/SignupShare'
import { AuditLogSection } from '@/features/audit/AuditLogSection'
import { ContractSettings } from '@/features/contracts/ContractSettings'
import { WebsiteSettings } from '@/features/website/WebsiteSettings'
import { useNow } from '@/lib/useNow'
import { cn } from '@/lib/utils'
import { SeatsField } from './BusinessRulesFields'
import { DateHoursCard } from './DateHoursCard'
import { type BlockKey, FIELDS, type PageItem, type SettingsPageDef, pageBlocks, pageFields } from './pages'
import { ProfileFields } from './ProfileFields'
import { PAGE_ICONS } from './pageIcons'
import { SettingField } from './SettingsFields'
import { overridesFor, profileChanges, profileOf, profilePatch, useBranchWriter, useRulesWriter } from './settingsWrite'

/** A setting's effect, worked out from the value being set (shared/src/settings/examples.ts). */
const EXAMPLES: Record<string, (s: BranchSettings, today: DateKey) => string> = {
  'schedule.autoConfirm.hoursBefore': (s) => cancelExample(s),
  'schedule.requests.daysAhead': requestsExample,
  'schedule.defaultSessionMinutes': (s) => classLengthExample(s),
  'availability.lockWindowDays': lockExample,
  'availability.leadTimeDays': leadExample,
  'timeClock.arrivalMinutes': (s) => arrivalExample(s),
  'timeClock.payEndsAtLastClass': (s) => payEndExample(s),
  'timeClock.autoClockOut.enabled': (s) => autoClockOutExample(s),
  'payroll.payPeriod.type': payPeriodExample,
  'students.autoStatus.enabled': (s) => autoStatusExample(s),
  'notifications.sessionChangeWindowHours': (s) => changeWindowExample(s),
}

/** Blocks that are cards of their own: they sit beside the page's card, and keep their own saving. */
const CARD_BLOCKS: BlockKey[] = ['dateHours', 'signupShare', 'website', 'contract', 'activity']
/** Where the search's `?find=` marks a block. */
const BLOCK_ANCHOR: Partial<Record<BlockKey, string>> = { dateHours: 'date-hours', seats: 'seats', payRule: 'pay-rule', profile: 'profile', signupShare: 'signup-share' }

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/**
 * One Settings page (Goo's pick of 2026-10-28, docs/DECISIONS.md §23): its settings in plain groups with what each one
 * does, the fine-tuning under "More options", and a bar at the bottom while something isn't saved. Leaving with
 * unsaved changes asks first. Its address is its own (/admin/settings/<key>); `?find=` marks a setting the search found.
 */
export function SettingsPageView({ page }: { page: SettingsPageDef }) {
  const { branch, branchId, settings, rules, isOwner, timezone } = useBranch()
  const [params] = useSearchParams()
  const findPath = params.get('find')
  const now = useNow(60_000)
  const today = todayKey(timezone, now)
  const { confirm, dialog } = useConfirm()
  const write = useBranchWriter()
  const writeRules = useRulesWriter()
  const fields = useMemo(() => pageFields(page), [page])
  const blocks = useMemo(() => pageBlocks(page), [page])

  const [draft, setDraft] = useState<BranchSettings>(settings)
  const [profile, setProfile] = useState(() => profileOf(branch))
  const [seats, setSeats] = useState(rules.seatsPerClass)
  const [moreOpen, setMoreOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const changedFields = fields.filter((p) => !same(getPath(draft, p), getPath(settings, p)))
  const profileChanged: AuditChange[] = blocks.includes('profile') ? profileChanges(profileOf(branch), profile) : []
  const seatsChanged = blocks.includes('seats') && isOwner && seats !== rules.seatsPerClass
  const unsaved = [...changedFields.map((p) => FIELDS[p].label), ...profileChanged.map((c) => c.label), ...(seatsChanged ? ['Seats per class'] : [])]
  const dirty = unsaved.length > 0

  // What's saved moves on (this save, or someone else's) while nothing here is changed: follow it.
  const dirtyRef = useRef(dirty)
  useEffect(() => {
    dirtyRef.current = dirty
  })
  useEffect(() => {
    if (!dirtyRef.current) {
      setDraft(settings)
      setProfile(profileOf(branch))
      setSeats(rules.seatsPerClass)
    }
  }, [settings, branch, rules.seatsPerClass])

  // Leaving with changes not saved asks first; so does closing the tab.
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname)
  useEffect(() => {
    if (blocker.state !== 'blocked') return
    void confirm({
      title: 'Leave without saving?',
      description: `${unsaved.length === 1 ? `Your change to “${unsaved[0]}” isn’t` : `Your ${unsaved.length} changes aren’t`} saved yet. Leaving drops ${unsaved.length === 1 ? 'it' : 'them'}.`,
      confirmLabel: 'Leave without saving',
      destructive: true,
    }).then((ok) => (ok ? blocker.proceed() : blocker.reset()))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocker.state])
  useEffect(() => {
    if (!dirty) return
    const hold = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', hold)
    return () => window.removeEventListener('beforeunload', hold)
  }, [dirty])

  // The setting the search found: its "More options" open, scrolled to and marked.
  const showMore = moreOpen || (!!findPath && page.more.includes(findPath))
  useEffect(() => {
    if (!findPath) return
    const t = window.setTimeout(() => document.getElementById(`setting-${findPath}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150)
    return () => window.clearTimeout(t)
  }, [findPath])

  function discard() {
    setDraft(settings)
    setProfile(profileOf(branch))
    setSeats(rules.seatsPerClass)
  }

  async function save() {
    if (blocks.includes('profile') && !profile.name.trim()) return void toast.error('The academy needs a name.')
    setBusy(true)
    try {
      const patch: Parameters<typeof write>[0] = {}
      const changes: AuditChange[] = []
      if (changedFields.length) {
        const { overrides, changes: c } = overridesFor(
          fields.map((p) => FIELDS[p]),
          draft,
          settings,
          (branch.settings ?? {}) as SettingsOverrides,
        )
        patch.settings = overrides as typeof branch.settings
        changes.push(...c)
      }
      if (profileChanged.length) {
        Object.assign(patch, profilePatch(profile))
        changes.push(...profileChanged)
      }
      if (Object.keys(patch).length) {
        await write(patch, {
          action: 'settings.update',
          category: 'settings',
          entityType: 'branch',
          entityId: branchId,
          summary: page.key === 'academy' ? 'Updated the academy profile' : `Updated ${page.title} settings`,
          changes,
        })
      }
      // The academy rules are the owners' and a write of their own (firestore.rules).
      if (seatsChanged) {
        await writeRules({ ...rules, seatsPerClass: seats }, 'Changed the academy rules', [{ field: 'seatsPerClass', label: 'Seats per class', from: rules.seatsPerClass, to: seats }])
      }
      toast.success(`${page.title}: saved`, { description: unsaved.join(' · ') })
    } catch (e) {
      toast.error('Could not save', { description: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const found = (anchor: string) => findPath === anchor
  const marked = (anchor: string) => cn('scroll-mt-24 rounded-lg', found(anchor) && 'bg-amber-50 ring-2 ring-amber-300/80 ring-offset-4 ring-offset-card dark:bg-amber-950/30')

  const field = (path: string) => {
    const def = FIELDS[path]
    if (def.visible && !def.visible(draft)) return null
    const example = EXAMPLES[path]?.(draft, today)
    return (
      <div key={path} id={`setting-${path}`} className={cn('px-5 py-4', marked(path))} data-testid={`setting-${path}`}>
        <SettingField
          def={def}
          value={getPath(draft, path)}
          isDefault={same(getPath(draft, path), getPath(DEFAULT_SETTINGS, path))}
          onChange={(v) => setDraft((d) => setPath(d, path, v))}
          onReset={() => setDraft((d) => setPath(d, path, getPath(DEFAULT_SETTINGS, path)))}
          weekStartsOn={draft.general.weekStartsOn}
        />
        {example ? (
          <p className="mt-3 flex gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground" data-testid="setting-example">
            <LuInfo className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>{example}</span>
          </p>
        ) : null}
      </div>
    )
  }

  const block = (key: BlockKey) => {
    const anchor = BLOCK_ANCHOR[key]
    const wrap = (node: React.ReactNode, card = false) => (
      <div key={key} id={anchor ? `setting-${anchor}` : undefined} className={cn(card ? 'scroll-mt-24 rounded-xl' : 'px-5 py-4', anchor && marked(anchor))}>
        {node}
      </div>
    )
    switch (key) {
      case 'dateHours':
        return wrap(<DateHoursCard />, true)
      case 'signupShare':
        return wrap(<SignupShareCard />, true)
      case 'website':
        return wrap(<WebsiteSettings />, true)
      case 'contract':
        return wrap(<ContractSettings />, true)
      case 'activity':
        return wrap(<AuditLogSection />, true)
      case 'seats':
        return wrap(
          isOwner ? (
            <div className="space-y-3">
              <SeatsField value={seats} onChange={setSeats} />
              {seatsChanged ? (
                <Alert>
                  <LuClock />
                  <AlertDescription>Classes already on the schedule keep their seats; new classes get {seats}.</AlertDescription>
                </Alert>
              ) : null}
            </div>
          ) : (
            <div className="space-y-1">
              <div className="text-sm font-medium">Seats per class</div>
              <p className="text-sm text-muted-foreground">
                {rules.seatsPerClass} seats. Each class can have its own. Only the academy’s owners can change this.
              </p>
            </div>
          ),
        )
      case 'payRule':
        return wrap(
          <div className="space-y-2" data-testid="pay-rule">
            <div className="text-sm font-medium">Everyone is paid by the hour, at their own rate</div>
            <p className="text-sm text-muted-foreground">{describePay(draft)}</p>
            {/* Each person's rate is on their page in Employees → Directory (the page's description says so). */}
            <Button asChild variant="outline" size="sm">
              <Link to="/admin/employees/directory">
                <LuExternalLink /> Employees
              </Link>
            </Button>
          </div>,
        )
      case 'profile':
        return wrap(<ProfileFields value={profile} onChange={setProfile} />)
    }
  }

  // A group's items: fields and small blocks together in one card; a card block on its own.
  const group = (items: PageItem[]) => {
    const out: React.ReactNode[] = []
    let run: React.ReactNode[] = []
    const flush = () => {
      if (run.length) out.push(<Card key={`card-${out.length}`} className="gap-0 divide-y py-0">{run}</Card>)
      run = []
    }
    for (const i of items) {
      if ('block' in i && CARD_BLOCKS.includes(i.block)) {
        flush()
        out.push(block(i.block))
      } else run.push('field' in i ? field(i.field) : block(i.block))
    }
    flush()
    return out
  }

  const Icon = PAGE_ICONS[page.key]
  return (
    <div className={cn('mx-auto pb-6', page.wide ? 'max-w-6xl' : 'max-w-3xl')} data-testid={`settings-page-${page.key}`}>
      <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
        <Link to="/admin/settings">
          <LuArrowLeft /> Settings
        </Link>
      </Button>
      {page.selfTitled ? (
        <h1 className="sr-only">{page.title}</h1>
      ) : (
        <div className="mt-2 mb-6 flex items-start gap-3.5">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-muted">{Icon ? <Icon className="size-6" /> : null}</span>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">{page.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{page.description}</p>
          </div>
        </div>
      )}

      <div className={cn('space-y-7', page.selfTitled && 'mt-3')}>
        {page.groups.map((g, i) => (
          <section key={g.title ?? i} className="space-y-3">
            {g.title ? <h2 className="text-sm font-semibold">{g.title}</h2> : null}
            {group(g.items)}
          </section>
        ))}
        {page.more.length ? (
          <Collapsible open={showMore} onOpenChange={setMoreOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground" data-testid="settings-more">
                <LuChevronDown className={cn('transition-transform', showMore && 'rotate-180')} /> More options
                <span className="text-xs font-normal">· fine-tuning almost nobody changes</span>
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">
              <Card className="gap-0 divide-y py-0">{page.more.map(field)}</Card>
            </CollapsibleContent>
          </Collapsible>
        ) : null}
      </div>

      {dirty ? (
        <div
          className="sticky bottom-3 z-20 mt-6 flex flex-wrap items-center gap-3 rounded-2xl border bg-card px-4 py-3 shadow-lg sm:flex-nowrap"
          role="region"
          aria-label="Changes not saved"
          data-testid="settings-savebar"
        >
          <span className="size-2.5 shrink-0 rounded-full bg-amber-500" aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">{unsaved.length === 1 ? '1 change not saved' : `${unsaved.length} changes not saved`}</div>
            <div className="truncate text-xs text-muted-foreground">{unsaved.join(' · ')}</div>
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            <Button variant="outline" className="flex-1 sm:flex-none" disabled={busy} onClick={discard}>
              Discard
            </Button>
            <Button className="flex-1 sm:flex-none" disabled={busy} onClick={() => void save()}>
              {busy ? <Spinner /> : null} Save changes
            </Button>
          </div>
        </div>
      ) : null}
      {dialog}
    </div>
  )
}
