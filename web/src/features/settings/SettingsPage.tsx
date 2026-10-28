import { doc, serverTimestamp, writeBatch } from 'firebase/firestore'
import { LuChevronDown, LuChevronRight, LuSearch } from 'react-icons/lu'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { publicProfileFor } from '@shared/branchFactory'
import { COL, DOC, ROOT } from '@shared/paths'
import { describePay } from '@shared/pay/paidTime'
import { DEFAULT_SETTINGS, type BranchSettings } from '@shared/settings/defaults'
import { type SettingsOverrides, getPath, setPath, unsetPath } from '@shared/settings/resolve'
import type { Branch, BranchContact } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { PageHeader } from '@/components/app/PageHeader'
import { TimeZonePicker } from '@/components/app/TimeZonePicker'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { SignupShareCard } from '@/features/access/SignupShare'
import { AuditLogSection } from '@/features/audit/AuditLogSection'
import { ContractSettings } from '@/features/contracts/ContractSettings'
import { WebsiteSettings } from '@/features/website/WebsiteSettings'
import { type AuditInput, addAudit } from '@/lib/audit'
import { db } from '@/lib/firebase'
import { cn } from '@/lib/utils'
import { AcademyRulesCard } from './AcademyRulesCard'
import { DateHoursCard } from './DateHoursCard'
import { SettingField } from './SettingsFields'
import { OTHER_FINDS, SETTINGS_SECTIONS, type FieldDef } from './schema'

// The most used first (the manager's second meeting, ST1); the website (docs/DECISIONS.md §18) and the sign-up page
// after the academy's own rules, and the activity log last.
const SECTIONS = [
  { key: 'academy', title: 'Academy' },
  ...SETTINGS_SECTIONS.filter((s) => s.key !== 'signup').map((s) => ({ key: s.key, title: s.title })),
  { key: 'website', title: 'Website' },
  { key: 'signup', title: 'Sign-up page' },
  // The blank contract families sign from a link (docs/DECISIONS.md §23, F4).
  { key: 'contract', title: 'Enrollment contract' },
  { key: 'audit-log', title: 'Activity log' },
]

/** Addresses of sections that were renamed. */
const MOVED: Record<string, string> = { home: 'announcements' }

const words = (t: string) => t.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim()

/** Every setting and every other place on the page, for the search. */
const FINDS = [
  ...SETTINGS_SECTIONS.flatMap((sec) =>
    sec.fields.map((f) => ({ key: `field:${f.path}`, label: f.label, section: sec.key, sectionTitle: sec.title, find: f.path, text: words(`${f.label} ${f.help ?? ''} ${f.keywords ?? ''} ${f.group ?? ''} ${sec.title}`) })),
  ),
  ...OTHER_FINDS.map((o) => ({
    key: `other:${o.label}`,
    label: o.label,
    section: o.section,
    sectionTitle: SECTIONS.find((x) => x.key === o.section)?.title ?? '',
    find: o.anchor ?? null,
    text: words(`${o.label} ${o.keywords}`),
  })),
]

export function SettingsPage() {
  const { isOwner } = useBranch()
  const { section } = useParams()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [search, setSearch] = useState('')
  const asked = section ? (MOVED[section] ?? section) : 'academy'
  const active = SECTIONS.some((s) => s.key === asked) ? asked : 'academy'
  const setActive = (key: string) => navigate(`/admin/settings/${key}`)
  const q = words(search)
  const found = q ? FINDS.filter((f) => q.split(' ').every((w) => f.text.includes(w))) : []
  // A setting found by the search: its section opens on it (and its "More options" with it), marked.
  const findPath = params.get('find')
  useEffect(() => {
    if (!findPath) return
    const t = window.setTimeout(() => document.getElementById(`setting-${findPath}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150)
    return () => window.clearTimeout(t)
  }, [findPath, active])
  return (
    <div>
      <PageHeader title="Settings" description="The academy’s profile and day-to-day settings. Anything you don’t change keeps the standard setup." />
      <div className="flex flex-col gap-6 lg:flex-row">
        <nav className="space-y-3 lg:sticky lg:top-4 lg:w-56 lg:shrink-0 lg:self-start">
          <InputGroup>
            <InputGroupAddon>
              <LuSearch />
            </InputGroupAddon>
            <InputGroupInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search settings" aria-label="Search settings" data-testid="settings-search" />
          </InputGroup>
          <div className="lg:hidden">
            <Select value={active} onValueChange={setActive}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SECTIONS.map((s) => (
                  <SelectItem key={s.key} value={s.key}>
                    {s.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <ul className="hidden space-y-0.5 lg:block">
            {SECTIONS.map((s) => (
              <li key={s.key}>
                <button
                  type="button"
                  onClick={() => setActive(s.key)}
                  className={cn(
                    'w-full rounded-md px-3 py-1.5 text-left text-sm transition-colors',
                    active === s.key ? 'bg-muted font-medium' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                  )}
                >
                  {s.title}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <div className={cn('min-w-0 flex-1', q ? 'lg:max-w-3xl' : active === 'website' ? 'lg:max-w-6xl' : active === 'audit-log' ? 'lg:max-w-5xl' : 'lg:max-w-3xl')}>
          {q ? (
            <Card data-testid="settings-results">
              <CardHeader>
                <CardTitle>{found.length ? `${found.length} ${found.length === 1 ? 'setting' : 'settings'} found` : 'Nothing found'}</CardTitle>
                <CardDescription>{found.length ? 'Open one to change it.' : 'Try another word: “cancel”, “lock”, “pay”, “hours”.'}</CardDescription>
              </CardHeader>
              {found.length ? (
                <CardContent className="p-0">
                  <ul className="divide-y border-t">
                    {found.map((f) => (
                      <li key={f.key}>
                        <button
                          type="button"
                          className="flex w-full items-center justify-between gap-3 px-6 py-3 text-left text-sm hover:bg-muted/50"
                          onClick={() => {
                            setSearch('')
                            navigate(`/admin/settings/${f.section}${f.find ? `?find=${encodeURIComponent(f.find)}` : ''}`)
                          }}
                        >
                          <span className="min-w-0">
                            <span className="block font-medium">{f.label}</span>
                            <span className="block text-xs text-muted-foreground">{f.sectionTitle}</span>
                          </span>
                          <LuChevronRight className="size-4 shrink-0 text-muted-foreground" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              ) : null}
            </Card>
          ) : active === 'website' ? (
            <WebsiteSettings />
          ) : active === 'contract' ? (
            <ContractSettings />
          ) : active === 'academy' ? (
            <div className="space-y-4">
              <BranchProfileCard />
              {isOwner ? <AcademyRulesCard /> : <BusinessRulesCard />}
            </div>
          ) : active === 'audit-log' ? (
            <AuditLogSection />
          ) : active === 'schedule' ? (
            <div className="space-y-4">
              <BusinessSection sectionKey={active} findPath={findPath} />
              <div id="setting-date-hours" className={cn('scroll-mt-24 rounded-xl', findPath === 'date-hours' && 'ring-2 ring-amber-400/70 ring-offset-4 ring-offset-background')}>
                <DateHoursCard />
              </div>
            </div>
          ) : active === 'signup' ? (
            <div className="space-y-4">
              <BusinessSection sectionKey={active} findPath={findPath} />
              <SignupShareCard />
            </div>
          ) : (
            <BusinessSection sectionKey={active} findPath={findPath} />
          )}
        </div>
      </div>
    </div>
  )
}

function useBranchWriter() {
  const { branchId, actor, branch } = useBranch()
  return async (patch: Partial<Branch>, audit: AuditInput) => {
    const batch = writeBatch(db)
    batch.update(doc(db, ROOT.branches, branchId), { ...patch, updatedAt: serverTimestamp(), updatedBy: actor.email })
    const next = { ...branch, ...patch }
    batch.set(doc(db, ROOT.branches, branchId, COL.public, DOC.publicProfile), publicProfileFor(next))
    addAudit(batch, branchId, actor, audit)
    await batch.commit()
  }
}

/** Read-only, for admins: the core rules the academy's owners set (Academy rules). */
function BusinessRulesCard() {
  const { rules, settings } = useBranch()
  const rows: { label: string; value: string; help?: string }[] = [
    { label: 'Pay', value: 'Hourly, one rate per person', help: describePay(settings) },
    { label: 'Seats per class', value: String(rules.seatsPerClass), help: 'A new class has this many seats; each class can have its own.' },
  ]
  return (
    <Card>
      <CardHeader>
        <CardTitle>Academy rules</CardTitle>
        <CardDescription>Only the academy’s owners can change these.</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="divide-y rounded-lg border text-sm">
          {rows.map((r) => (
            <div key={r.label} className="grid gap-1 px-3 py-2.5 sm:grid-cols-[14rem_1fr]">
              <dt className="text-muted-foreground">{r.label}</dt>
              <dd>
                <div className="font-medium">{r.value}</div>
                {r.help ? <div className="text-xs text-muted-foreground">{r.help}</div> : null}
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}

function BranchProfileCard() {
  const { branch, branchId } = useBranch()
  const write = useBranchWriter()
  const [name, setName] = useState(branch.name)
  const [shortName, setShortName] = useState(branch.shortName)
  const [timezone, setTimezone] = useState(branch.timezone)
  const [contact, setContact] = useState<BranchContact>(branch.contact ?? { email: '', phone: '', address: '', website: '' })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setName(branch.name)
    setShortName(branch.shortName)
    setTimezone(branch.timezone)
    setContact(branch.contact ?? { email: '', phone: '', address: '', website: '' })
  }, [branch])

  async function save() {
    if (!name.trim()) return toast.error('The academy needs a name.')
    setBusy(true)
    try {
      await write(
        { name: name.trim(), shortName: shortName.trim() || name.trim(), timezone, contact },
        {
          action: 'settings.update',
          category: 'settings',
          entityType: 'branch',
          entityId: branchId,
          summary: 'Updated the academy profile',
          changes: [
            ...(branch.name !== name.trim() ? [{ field: 'name', label: 'Name', from: branch.name, to: name.trim() }] : []),
            ...(branch.timezone !== timezone ? [{ field: 'timezone', label: 'Time zone', from: branch.timezone, to: timezone }] : []),
          ],
        },
      )
      toast.success('Academy profile saved')
    } catch (e) {
      toast.error('Could not save', { description: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Academy</CardTitle>
        <CardDescription>
          The academy’s name, time zone and contact details, as people see them in the app. The contact details also appear on the{' '}
          <Link to="/privacy" target="_blank" className="underline underline-offset-2">
            privacy policy
          </Link>
          , which anyone can open.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="bp-name">Name</FieldLabel>
              <Input id="bp-name" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="bp-short">Short name</FieldLabel>
              <Input id="bp-short" value={shortName} onChange={(e) => setShortName(e.target.value)} />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="bp-tz">Time zone</FieldLabel>
            <TimeZonePicker id="bp-tz" value={timezone} onChange={setTimezone} />
            <FieldDescription>All dates, “today”, locks and cut-offs use this zone, whatever device people use.</FieldDescription>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            {(['email', 'phone', 'website', 'address'] as const).map((k) => (
              <Field key={k}>
                <FieldLabel htmlFor={`bp-${k}`} className="capitalize">
                  {k}
                </FieldLabel>
                <Input id={`bp-${k}`} value={contact[k] ?? ''} onChange={(e) => setContact({ ...contact, [k]: e.target.value })} />
              </Field>
            ))}
          </div>
        </FieldGroup>
      </CardContent>
      <CardFooter className="justify-end">
        <Button onClick={() => void save()} disabled={busy}>
          {busy ? <Spinner /> : null} Save
        </Button>
      </CardFooter>
    </Card>
  )
}

function BusinessSection({ sectionKey, findPath }: { sectionKey: string; findPath: string | null }) {
  const { branch, branchId, settings } = useBranch()
  const write = useBranchWriter()
  const [draft, setDraft] = useState<BranchSettings>(settings)
  const [busy, setBusy] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  // The fields the draft needs (the clock-out time only while the automatic clock-out is on).
  const section = useMemo(() => {
    const full = SETTINGS_SECTIONS.find((s) => s.key === sectionKey)!
    return { ...full, fields: full.fields.filter((f) => !f.visible || f.visible(draft)) }
  }, [sectionKey, draft])

  useEffect(() => setDraft(settings), [settings, sectionKey])

  // Groups in the order their first setting comes; fine-tuning under "More options", opened when one was found or
  // changed from the standard setup.
  const groups = useMemo(() => {
    const out: { title: string | null; fields: FieldDef[] }[] = []
    for (const f of section.fields.filter((x) => !x.more)) {
      const title = f.group ?? null
      const g = out.find((x) => x.title === title)
      if (g) g.fields.push(f)
      else out.push({ title, fields: [f] })
    }
    return out
  }, [section])
  const more = section.fields.filter((f) => f.more)
  const showMore = moreOpen || more.some((f) => f.path === findPath)
  const field = (f: FieldDef) => (
    <div
      key={f.path}
      id={`setting-${f.path}`}
      className={cn('scroll-mt-24 rounded-lg', f.path === findPath && 'bg-amber-50 ring-2 ring-amber-300/80 ring-offset-4 ring-offset-card dark:bg-amber-950/30')}
    >
      <SettingField
        def={f}
        value={getPath(draft, f.path)}
        isDefault={JSON.stringify(getPath(draft, f.path)) === JSON.stringify(getPath(DEFAULT_SETTINGS, f.path))}
        onChange={(v) => setDraft((d) => setPath(d, f.path, v))}
        onReset={() => setDraft((d) => setPath(d, f.path, getPath(DEFAULT_SETTINGS, f.path)))}
        weekStartsOn={draft.general.weekStartsOn}
      />
    </div>
  )

  const dirty = useMemo(
    () => section.fields.some((f) => JSON.stringify(getPath(draft, f.path)) !== JSON.stringify(getPath(settings, f.path))),
    [draft, settings, section],
  )

  async function save() {
    let overrides: SettingsOverrides = (branch.settings ?? {}) as SettingsOverrides
    const changes: AuditInput['changes'] = []
    for (const f of section.fields) {
      const next = cleanValue(f, getPath(draft, f.path))
      const prev = getPath(settings, f.path)
      if (JSON.stringify(next) !== JSON.stringify(prev)) {
        changes.push({ field: f.path, label: f.label, from: display(prev), to: display(next) })
      }
      overrides =
        JSON.stringify(next) === JSON.stringify(getPath(DEFAULT_SETTINGS, f.path))
          ? unsetPath(overrides, f.path)
          : setPath(overrides, f.path, next)
    }
    setBusy(true)
    try {
      await write(
        { settings: overrides },
        {
          action: 'settings.update',
          category: 'settings',
          entityType: 'branch',
          entityId: branchId,
          summary: `Updated ${section.title} settings`,
          changes,
        },
      )
      toast.success(`${section.title} settings saved`)
    } catch (e) {
      toast.error('Could not save', { description: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{section.title}</CardTitle>
        <CardDescription>{section.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-7">
        {groups.map((g) => (
          <section key={g.title ?? 'main'} className="space-y-4">
            {g.title ? <h3 className="border-b pb-2 text-sm font-semibold">{g.title}</h3> : null}
            <FieldGroup>{g.fields.map(field)}</FieldGroup>
          </section>
        ))}
        {more.length ? (
          <Collapsible open={showMore} onOpenChange={setMoreOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
                <LuChevronDown className={cn('transition-transform', showMore && 'rotate-180')} /> {showMore ? 'Fewer options' : 'More options'}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-4">
              <FieldGroup>{more.map(field)}</FieldGroup>
            </CollapsibleContent>
          </Collapsible>
        ) : null}
      </CardContent>
      <CardFooter className="justify-end gap-2">
        <Button variant="outline" disabled={!dirty || busy} onClick={() => setDraft(settings)}>
          Discard
        </Button>
        <Button disabled={!dirty || busy} onClick={() => void save()}>
          {busy ? <Spinner /> : null} Save changes
        </Button>
      </CardFooter>
    </Card>
  )
}

function cleanValue(f: FieldDef, v: unknown): unknown {
  if (f.kind === 'list' && Array.isArray(v)) return v.map((s) => String(s).trim()).filter(Boolean)
  return v
}

function display(v: unknown): string | number | boolean | null {
  if (v === undefined || v === null) return null
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v
  if (Array.isArray(v)) return v.join(', ')
  return JSON.stringify(v)
}
