import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore'
import { useState } from 'react'
import { LuClock } from 'react-icons/lu'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { COL, ROOT } from '@shared/paths'
import { describePay } from '@shared/pay/paidTime'
import { type BusinessRules, resolveBusinessRules } from '@shared/settings/businessRules'
import type { AuditChange } from '@shared/types'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { FieldGroup } from '@/components/ui/field'
import { Separator } from '@/components/ui/separator'
import { Spinner } from '@/components/ui/spinner'
import { auditData } from '@/lib/audit'
import { db } from '@/lib/firebase'
import { useBranch } from '@/branch/BranchProvider'
import { SeatsField } from './BusinessRulesFields'

/**
 * Owners only: the academy's core rules. Pay is Hourly, one rate per person (docs/DECISIONS.md §23): said plainly, with
 * where its settings and rates are; the seats a class has can change here. Admins see them read-only.
 */
export function AcademyRulesCard() {
  const { branchId, branch, actor, settings } = useBranch()
  const rules = resolveBusinessRules(branch.businessRules)
  const [draft, setDraft] = useState<number | null>(null)
  const value = draft ?? rules.seatsPerClass
  const dirty = value !== rules.seatsPerClass
  const [busy, setBusy] = useState(false)

  async function write(next: BusinessRules, summary: string, changes: AuditChange[]) {
    const batch = writeBatch(db)
    batch.update(doc(db, ROOT.branches, branchId), { businessRules: next, updatedAt: serverTimestamp(), updatedBy: actor.email })
    batch.set(
      doc(collection(db, ROOT.branches, branchId, COL.auditLog)),
      auditData(actor, { action: 'branch.rules', category: 'settings', entityType: 'branch', entityId: branchId, summary, changes }),
    )
    await batch.commit()
  }

  async function saveSeats() {
    const next: BusinessRules = { ...rules, seatsPerClass: value }
    setBusy(true)
    try {
      await write(next, 'Changed the academy rules', [{ field: 'seatsPerClass', label: 'Seats per class', from: rules.seatsPerClass, to: next.seatsPerClass }])
      setDraft(null)
      toast.success('Academy rules saved')
    } catch (e) {
      toast.error('Could not save', { description: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Academy rules</CardTitle>
        <CardDescription>How everyone is paid and how many seats a class has. Only owners can change these; admins see them read-only.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-1.5" data-testid="pay-rule">
          <div className="text-sm font-medium">Pay: hourly, one rate per person</div>
          <p className="text-sm text-muted-foreground">{describePay(settings)}</p>
          <p className="text-sm text-muted-foreground">
            The arrival time and the automatic clock-out are in{' '}
            <Link to="/admin/settings/payroll" className="font-medium text-foreground underline underline-offset-2">
              Payroll &amp; time clock
            </Link>
            ; each person’s rate is on{' '}
            <Link to="/admin/employees/pay-rates" className="font-medium text-foreground underline underline-offset-2">
              Pay Rates
            </Link>
            .
          </p>
        </div>
        <Separator />
        <FieldGroup>
          <SeatsField value={value} onChange={setDraft} />
        </FieldGroup>
        {dirty ? (
          <Alert>
            <LuClock />
            <AlertDescription>Classes already on the schedule keep their seats; new classes get {value}.</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
      <CardFooter className="justify-end gap-2">
        <Button variant="outline" disabled={!dirty || busy} onClick={() => setDraft(null)}>
          Discard
        </Button>
        <Button disabled={!dirty || busy} onClick={() => void saveSeats()}>
          {busy ? <Spinner /> : null} Save rules
        </Button>
      </CardFooter>
    </Card>
  )
}
