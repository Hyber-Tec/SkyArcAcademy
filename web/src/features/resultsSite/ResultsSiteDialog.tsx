import { useState } from 'react'
import { LuRotateCcw } from 'react-icons/lu'
import { toast } from 'sonner'
import { CHECK_DAYS_CHOICES, type ResetCounts, SEARCH_FROM, checkWindowWords, resetWords, scheduleWords } from '@shared/scores/resultsSite'
import type { BranchSettings } from '@shared/settings/defaults'
import { type SettingsOverrides, resolveSettings } from '@shared/settings/resolve'
import { formatMinutesShort } from '@shared/time'
import type { AuditChange } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { useConfirm } from '@/components/app/useConfirm'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { FieldDef } from '@/features/settings/schema'
import { overridesFor, useBranchWriter } from '@/features/settings/settingsWrite'
import { resetResultsSite } from './api'

/**
 * The Results site page's settings (its gear, Goo's ask of 2026-11-10): when it checks on its own (off until it's
 * turned on: the days and the hour, the academy's time), how far back each check looks (a month), and the team names
 * and the distance it looks for. Saved as the academy's settings, with the activity log's entry. Under them, Start
 * over (Goo's ask of 2026-11-11, to try it and then show it from the beginning): what the results site brought in goes.
 */

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** The fields it saves, as the activity log names them. */
const FIELDS: FieldDef[] = [
  { kind: 'boolean', path: 'resultsSite.schedule.on', label: 'Results site: check on its own' },
  { kind: 'multiselect', path: 'resultsSite.schedule.days', label: 'Results site: days it checks', options: DAY_NAMES.map((d, i) => ({ value: String(i), label: d })) },
  { kind: 'number', path: 'resultsSite.schedule.hour', label: 'Results site: hour it checks' },
  { kind: 'number', path: 'resultsSite.checkDays', label: 'Results site: days each check looks at' },
  { kind: 'list', path: 'resultsSite.teamNames', label: 'Results site: the academy’s team names' },
  { kind: 'number', path: 'resultsSite.searchKm', label: 'Results site: looks for matches within (km)' },
]

/** A change as people read it in the activity log: days by name, the hour as a time. */
function readable(c: AuditChange): AuditChange {
  const days = (v: AuditChange['from']) => (typeof v === 'string' ? v.split(', ').map((d) => DAY_NAMES[Number(d)] ?? d).join(', ') : v)
  const hour = (v: AuditChange['from']) => (typeof v === 'number' ? formatMinutesShort(v * 60) : v)
  if (c.field === 'resultsSite.schedule.days') return { ...c, from: days(c.from), to: days(c.to) }
  if (c.field === 'resultsSite.schedule.hour') return { ...c, from: hour(c.from), to: hour(c.to) }
  return c
}
const HOURS = Array.from({ length: 24 }, (_, h) => h)

export function ResultsSiteDialog({
  open,
  onOpenChange,
  busy,
  counts,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** A check or an answer under way: no starting over meanwhile. */
  busy: boolean
  /** What Start over would take away now. */
  counts: ResetCounts
}) {
  return <Dialog open={open} onOpenChange={onOpenChange}>{open ? <Body onDone={() => onOpenChange(false)} busy={busy} counts={counts} /> : null}</Dialog>
}

/** What Start over takes away, in a sentence for its question: "This removes 18 athletes, …, and puts back …". */
function startOverWords(c: ResetCounts): string {
  const n = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`
  const gone = [n(c.athletes, 'athlete'), `${n(c.results, 'result')} it added to the scores`, 'the matches it looked at', n(c.checks, 'check')]
  const back = c.scans ? `, and puts back ${c.scans === 1 ? 'the results sheet scan' : `the ${c.scans} results sheet scans`} it brought up to the site’s, as ${c.scans === 1 ? 'it was' : 'they were'}` : ''
  return `This removes ${gone.slice(0, -1).join(', ')} and ${gone[gone.length - 1]}${back}.`
}

function Body({ onDone, busy, counts }: { onDone: () => void; busy: boolean; counts: ResetCounts }) {
  const { branch, branchId, settings } = useBranch()
  const write = useBranchWriter()
  const saved = settings.resultsSite
  const [on, setOn] = useState(saved.schedule.on)
  const [days, setDays] = useState<number[]>(saved.schedule.days.length ? [...saved.schedule.days] : [0])
  const [hour, setHour] = useState(saved.schedule.hour)
  const [checkDays, setCheckDays] = useState(saved.checkDays)
  const [teams, setTeams] = useState(saved.teamNames.join('\n'))
  const [km, setKm] = useState(String(saved.searchKm))
  const [saving, setSaving] = useState(false)
  const [resetting, setResetting] = useState(false)
  const { confirm, dialog } = useConfirm()
  const nothing = !counts.athletes && !counts.results && !counts.matches && !counts.checks && !counts.scans

  async function startOver() {
    const ok = await confirm({
      title: 'Start the results site over?',
      description: `${startOverWords(counts)} The next check starts from the beginning. These settings and the site’s key stay, and families aren’t told anything.`,
      confirmLabel: 'Start over',
      destructive: true,
    })
    if (!ok) return
    setResetting(true)
    try {
      const r = await resetResultsSite({ branchId })
      toast.success(`Started over. ${resetWords(r.data)}`)
      onDone()
    } catch (e) {
      toast.error('Couldn’t start over', { description: (e as Error).message.replace(/^.*?: /, '') })
    } finally {
      setResetting(false)
    }
  }
  const kmValue = Math.round(Number(km))
  const kmOk = Number.isFinite(kmValue) && kmValue >= 25 && kmValue <= 1000
  const draftSchedule = { on, days: [...days].sort((a, b) => a - b), hour }

  async function save() {
    const draft: BranchSettings = {
      ...settings,
      resultsSite: {
        schedule: draftSchedule,
        checkDays,
        teamNames: teams
          .split('\n')
          .map((t) => t.trim())
          .filter(Boolean),
        searchKm: kmValue,
      },
    }
    const stored = (branch.settings ?? {}) as SettingsOverrides
    const { overrides, changes } = overridesFor(FIELDS, draft, resolveSettings(stored), stored)
    if (!changes.length) return onDone()
    setSaving(true)
    try {
      await write(
        { settings: overrides as typeof branch.settings },
        { action: 'settings.update', category: 'settings', entityType: 'branch', entityId: branchId, summary: 'Updated Results site settings', changes: changes.map(readable) },
      )
      toast.success(on ? `Saved. It checks on its own: ${scheduleWords(draftSchedule)}.` : 'Saved.')
      onDone()
    } catch (e) {
      toast.error('Couldn’t save the settings', { description: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <DialogContent className="sm:max-w-lg" data-testid="results-site-settings">
      <DialogHeader>
        <DialogTitle>Results site settings</DialogTitle>
        <DialogDescription>When the app looks on the results site, and what it looks for.</DialogDescription>
      </DialogHeader>
      <div className="space-y-6">
        <Field>
          <div className="flex items-center justify-between gap-4">
            <FieldLabel htmlFor="results-site-on">Check on its own</FieldLabel>
            <Switch id="results-site-on" checked={on} onCheckedChange={setOn} />
          </div>
          <FieldDescription>{on ? scheduleWords(draftSchedule) : 'Off: it checks only when someone presses Check now.'}</FieldDescription>
          {on ? (
            <div className="mt-2 space-y-3">
              <ToggleGroup
                type="multiple"
                variant="outline"
                value={days.map(String)}
                onValueChange={(v) => v.length && setDays(v.map(Number))}
                className="flex-wrap justify-start"
                aria-label="Days it checks"
              >
                {DAYS.map((d, i) => (
                  <ToggleGroupItem key={d} value={String(i)} aria-label={DAY_NAMES[i]} className="w-12 data-[state=on]:bg-foreground data-[state=on]:text-background">
                    {d}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <div className="flex items-center gap-2 text-sm">
                <span>At</span>
                <Select value={String(hour)} onValueChange={(v) => setHour(Number(v))}>
                  <SelectTrigger className="w-32" aria-label="Hour it checks">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HOURS.map((h) => (
                      <SelectItem key={h} value={String(h)}>
                        {formatMinutesShort(h * 60)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-muted-foreground">the academy’s time</span>
              </div>
            </div>
          ) : null}
        </Field>

        <Field>
          <FieldLabel>Each check looks at</FieldLabel>
          <Select value={String(checkDays)} onValueChange={(v) => setCheckDays(Number(v))}>
            <SelectTrigger className="w-52" aria-label="How far back each check looks">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CHECK_DAYS_CHOICES.map((d) => (
                <SelectItem key={d} value={String(d)}>
                  {checkWindowWords(d)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>Its matches, and the results the site corrects in them. Look back finds the ones from before.</FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="results-site-teams">The academy’s team names on the site</FieldLabel>
          <Textarea id="results-site-teams" rows={3} value={teams} onChange={(e) => setTeams(e.target.value)} className="font-mono text-sm" />
          <FieldDescription>One per line; * stands for anything (“ARC 10.9*” also finds “ARC 10.9 P”). Its athletes are suggested to you, never linked on their own.</FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="results-site-km">Look for matches within</FieldLabel>
          <div className="flex items-center gap-2 text-sm">
            <Input id="results-site-km" type="number" inputMode="numeric" min={25} max={1000} step={25} value={km} onChange={(e) => setKm(e.target.value)} className="w-28" />
            <span className="text-muted-foreground">km of {SEARCH_FROM.place}, and at the clubs and schools where its athletes shot before</span>
          </div>
          {!kmOk ? <FieldDescription className="text-destructive">Between 25 and 1,000 km.</FieldDescription> : null}
        </Field>

        <div className="space-y-2 rounded-lg border border-dashed p-3" data-testid="results-site-start-over">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">Start over</p>
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive"
              disabled={busy || saving || resetting || nothing}
              onClick={() => void startOver()}
              data-testid="results-site-reset"
            >
              {resetting ? <Spinner /> : <LuRotateCcw />} Start over
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {nothing
              ? 'Nothing to remove: the results site hasn’t brought anything in.'
              : busy
                ? 'Once the check under way is done.'
                : 'Removes everything the results site brought in (the athletes and who they are, the results it added to the scores, the matches and checks) and puts back the results sheet scans it changed. For trying it, then showing it from the beginning.'}
          </p>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onDone} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={() => void save()} disabled={saving || !kmOk} data-testid="results-site-settings-save">
          {saving ? <Spinner /> : null} Save
        </Button>
      </DialogFooter>
      {dialog}
    </DialogContent>
  )
}
