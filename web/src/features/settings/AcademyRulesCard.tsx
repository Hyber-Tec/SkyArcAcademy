import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore'
import { useMemo, useState } from 'react'
import { LuArrowRightLeft, LuClock } from 'react-icons/lu'
import { toast } from 'sonner'
import { COL, DOC, ROOT } from '@shared/paths'
import {
  type BusinessRules,
  PAY_MODELS,
  PAY_MODEL_LABELS,
  PAY_MODEL_SINCE_START,
  type PayModel,
  earliestPayModelChange,
  payModelOn,
  resolveBusinessRules,
  withPayModelChange,
} from '@shared/settings/businessRules'
import { type DateKey, formatDateKey, todayKey } from '@shared/time'
import type { AuditChange } from '@shared/types'
import { DatePicker } from '@/components/app/DatePicker'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Separator } from '@/components/ui/separator'
import { Spinner } from '@/components/ui/spinner'
import { auditData } from '@/lib/audit'
import { db } from '@/lib/firebase'
import { useDoc } from '@/lib/firestore'
import { useBranch } from '@/branch/BranchProvider'
import { CapacityField, PayModelChoice } from './BusinessRulesFields'

/** Owners only: the academy's core rules, including pay-model changes from a date. Admins see them read-only. */
export function AcademyRulesCard() {
  const { branchId, branch, actor } = useBranch()
  const rules = resolveBusinessRules(branch.businessRules)
  const today = todayKey(branch.timezone)
  const stateRef = useMemo(() => doc(db, ROOT.branches, branchId, COL.payroll, DOC.payrollState), [branchId])
  const { data: payroll } = useDoc<{ lockedThrough?: DateKey | null }>(stateRef)
  const lockedThrough = payroll?.lockedThrough ?? null
  const [draft, setDraft] = useState<number | null>(null)
  const value = draft ?? rules.maxStudentsPerTutor
  const dirty = value !== rules.maxStudentsPerTutor
  const [busy, setBusy] = useState(false)
  const [changing, setChanging] = useState(false)

  async function write(next: BusinessRules, summary: string, changes: AuditChange[]) {
    const batch = writeBatch(db)
    batch.update(doc(db, ROOT.branches, branchId), { businessRules: next, updatedAt: serverTimestamp(), updatedBy: actor.email })
    batch.set(
      doc(collection(db, ROOT.branches, branchId, COL.auditLog)),
      auditData(actor, { action: 'branch.rules', category: 'settings', entityType: 'branch', entityId: branchId, summary, changes }),
    )
    await batch.commit()
  }

  async function saveCapacity() {
    const next: BusinessRules = { ...rules, maxStudentsPerTutor: value }
    setBusy(true)
    try {
      await write(next, 'Changed the academy rules', [
        { field: 'maxStudentsPerTutor', label: 'Students per tutor at once', from: rules.maxStudentsPerTutor, to: next.maxStudentsPerTutor },
      ])
      setDraft(null)
      toast.success('Academy rules saved')
    } catch (e) {
      toast.error('Could not save', { description: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const modelNow = payModelOn(rules, today)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Academy rules</CardTitle>
        <CardDescription>How coaches are paid and how many students they take at once. Only owners can change these; admins see them read-only.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-medium">Pay model</div>
              <div className="text-sm text-muted-foreground">Now: {PAY_MODEL_LABELS[modelNow]}</div>
            </div>
            <Button variant="outline" size="sm" onClick={() => setChanging(true)}>
              <LuArrowRightLeft /> Change pay model…
            </Button>
          </div>
          <ol className="divide-y rounded-lg border text-sm" data-testid="pay-model-history">
            {rules.payModels.map((p, i) => {
              const next = rules.payModels[i + 1]
              const current = p.from <= today && (!next || next.from > today)
              return (
                <li key={`${p.model}-${p.from}`} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <span className="font-medium">{PAY_MODEL_LABELS[p.model]}</span>
                  <span className="text-muted-foreground">
                    {p.from === PAY_MODEL_SINCE_START ? 'from the start' : `from ${formatDateKey(p.from, 'medium')}`}
                    {next ? ` to ${formatDateKey(next.from, 'medium')}` : ''}
                  </span>
                  {current ? <Badge variant="secondary">Now</Badge> : p.from > today ? <Badge variant="outline">Scheduled</Badge> : null}
                </li>
              )
            })}
          </ol>
        </div>
        <Separator />
        <FieldGroup>
          <CapacityField value={value} onChange={setDraft} />
        </FieldGroup>
        {value < rules.maxStudentsPerTutor ? (
          <Alert>
            <LuClock />
            <AlertDescription>Classes already on the schedule stay as they are; new classes, moves and pastes follow the new limit.</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
      <CardFooter className="justify-end gap-2">
        <Button variant="outline" disabled={!dirty || busy} onClick={() => setDraft(null)}>
          Discard
        </Button>
        <Button disabled={!dirty || busy} onClick={() => void saveCapacity()}>
          {busy ? <Spinner /> : null} Save rules
        </Button>
      </CardFooter>
      {changing ? (
        <ChangePayModelDialog
          rules={rules}
          today={today}
          lockedThrough={lockedThrough}
          onClose={() => setChanging(false)}
          onSave={async (model, from) => {
            await write(withPayModelChange(rules, model, from), `Changed the pay model to ${PAY_MODEL_LABELS[model]} from ${formatDateKey(from, 'medium')}`, [
              { field: 'payModel', label: 'Pay model', from: PAY_MODEL_LABELS[payModelOn(rules, from)], to: `${PAY_MODEL_LABELS[model]} (from ${from})` },
            ])
            toast.success(`Pay model: ${PAY_MODEL_LABELS[model]} from ${formatDateKey(from, 'medium')}`)
            setChanging(false)
          }}
        />
      ) : null}
    </Card>
  )
}

function ChangePayModelDialog({
  rules,
  today,
  lockedThrough,
  onClose,
  onSave,
}: {
  rules: BusinessRules
  today: DateKey
  lockedThrough: DateKey | null
  onClose: () => void
  onSave: (model: PayModel, from: DateKey) => Promise<void>
}) {
  const earliest = earliestPayModelChange(lockedThrough)
  const [model, setModel] = useState<PayModel>(PAY_MODELS.find((m) => m !== payModelOn(rules, today)) ?? 'hourly')
  const [from, setFrom] = useState<DateKey>(earliest && earliest > today ? earliest : today)
  const [busy, setBusy] = useState(false)
  const tooEarly = !!earliest && from < earliest
  const same = payModelOn(rules, from) === model
  const inPast = from < today

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Change the pay model</DialogTitle>
          <DialogDescription>Pay before the start date keeps the model it was earned under, so past payroll doesn’t change.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel>New pay model</FieldLabel>
            <PayModelChoice value={model} onChange={setModel} idPrefix="cpm" />
          </Field>
          <Field data-invalid={tooEarly}>
            <FieldLabel htmlFor="cpm-from">Starts on</FieldLabel>
            <DatePicker id="cpm-from" value={from} min={earliest} onChange={setFrom} className="w-56" />
            <FieldDescription>
              {earliest ? `Pay is locked through ${formatDateKey(lockedThrough!, 'medium')}, so the earliest start is ${formatDateKey(earliest, 'medium')}.` : 'No pay period is locked yet.'}
            </FieldDescription>
            {tooEarly ? <FieldError>Pick a date after the last locked pay period.</FieldError> : null}
          </Field>
          {same ? <p className="text-sm text-muted-foreground">The academy already uses {PAY_MODEL_LABELS[model]} on that date.</p> : null}
          {inPast && !tooEarly && !same ? (
            <Alert>
              <LuClock />
              <AlertDescription>
                The start date is in the past: pay from {formatDateKey(from, 'medium')} to today will be recalculated with {PAY_MODEL_LABELS[model]}.
              </AlertDescription>
            </Alert>
          ) : null}
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={busy || tooEarly || same}
            onClick={async () => {
              setBusy(true)
              try {
                await onSave(model, from)
              } catch (e) {
                toast.error('Could not change the pay model', { description: (e as Error).message })
                setBusy(false)
              }
            }}
          >
            {busy ? <Spinner /> : null} Change from {formatDateKey(from, 'medium')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
