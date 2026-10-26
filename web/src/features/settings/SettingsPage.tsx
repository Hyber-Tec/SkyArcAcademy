import { doc, serverTimestamp, writeBatch } from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { publicProfileFor } from '@shared/branchFactory'
import { COL, DOC, ROOT } from '@shared/paths'
import { PAY_MODEL_HELP, PAY_MODEL_LABELS, payModelOn } from '@shared/settings/businessRules'
import { DEFAULT_SETTINGS, type BranchSettings } from '@shared/settings/defaults'
import { formatDateKey, todayKey } from '@shared/time'
import { type SettingsOverrides, getPath, setPath, unsetPath } from '@shared/settings/resolve'
import type { Branch, BranchContact } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { PageHeader } from '@/components/app/PageHeader'
import { TimeZonePicker } from '@/components/app/TimeZonePicker'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { SignupShareCard } from '@/features/access/SignupShare'
import { AuditLogSection } from '@/features/audit/AuditLogSection'
import { type AuditInput, addAudit } from '@/lib/audit'
import { db } from '@/lib/firebase'
import { cn } from '@/lib/utils'
import { AcademyRulesCard } from './AcademyRulesCard'
import { DateHoursCard } from './DateHoursCard'
import { SettingField } from './SettingsFields'
import { SETTINGS_SECTIONS, type FieldDef } from './schema'

const SECTIONS = [
  { key: 'academy', title: 'Academy' },
  ...SETTINGS_SECTIONS.map((s) => ({ key: s.key, title: s.title })),
  { key: 'audit-log', title: 'Audit Log' },
]

export function SettingsPage() {
  const { isOwner } = useBranch()
  const { section } = useParams()
  const navigate = useNavigate()
  const active = SECTIONS.some((s) => s.key === section) ? section! : 'academy'
  const setActive = (key: string) => navigate(`/admin/settings/${key}`)
  return (
    <div>
      <PageHeader title="Settings" description="The academy’s profile and day-to-day settings. Anything you don’t change keeps the standard setup." />
      <div className="flex flex-col gap-6 lg:flex-row">
        <nav className="lg:sticky lg:top-4 lg:w-52 lg:shrink-0 lg:self-start">
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
        <div className={cn('min-w-0 flex-1', active === 'audit-log' ? 'lg:max-w-5xl' : 'lg:max-w-3xl')}>
          {active === 'academy' ? (
            <div className="space-y-4">
              <BranchProfileCard />
              {isOwner ? <AcademyRulesCard /> : <BusinessRulesCard />}
            </div>
          ) : active === 'audit-log' ? (
            <AuditLogSection />
          ) : active === 'schedule' ? (
            <div className="space-y-4">
              <BusinessSection sectionKey={active} />
              <DateHoursCard />
            </div>
          ) : active === 'signup' ? (
            <div className="space-y-4">
              <BusinessSection sectionKey={active} />
              <SignupShareCard />
            </div>
          ) : (
            <BusinessSection sectionKey={active} />
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
  const { rules, timezone } = useBranch()
  const today = todayKey(timezone)
  const now = payModelOn(rules, today)
  const next = rules.payModels.find((p) => p.from > today)
  const rows: { label: string; value: string; help?: string }[] = [
    {
      label: 'Pay model',
      value: PAY_MODEL_LABELS[now],
      help: next ? `Changes to ${PAY_MODEL_LABELS[next.model]} on ${formatDateKey(next.from, 'medium')}. ${PAY_MODEL_HELP[now]}` : PAY_MODEL_HELP[now],
    },
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

function BusinessSection({ sectionKey }: { sectionKey: string }) {
  const { branch, branchId, settings, rules } = useBranch()
  const write = useBranchWriter()
  const section = useMemo(() => {
    const full = SETTINGS_SECTIONS.find((s) => s.key === sectionKey)!
    return { ...full, fields: full.fields.filter((f) => !f.visible || f.visible(rules)) }
  }, [sectionKey, rules])
  const [draft, setDraft] = useState<BranchSettings>(settings)
  const [busy, setBusy] = useState(false)

  useEffect(() => setDraft(settings), [settings, sectionKey])

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
      <CardContent>
        <FieldGroup>
          {section.fields.map((f) => (
            <SettingField
              key={f.path}
              def={f}
              value={getPath(draft, f.path)}
              isDefault={JSON.stringify(getPath(draft, f.path)) === JSON.stringify(getPath(DEFAULT_SETTINGS, f.path))}
              onChange={(v) => setDraft((d) => setPath(d, f.path, v))}
              onReset={() => setDraft((d) => setPath(d, f.path, getPath(DEFAULT_SETTINGS, f.path)))}
              weekStartsOn={draft.general.weekStartsOn}
            />
          ))}
        </FieldGroup>
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
