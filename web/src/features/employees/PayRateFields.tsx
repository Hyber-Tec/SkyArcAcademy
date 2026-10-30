import { LuCircleAlert } from 'react-icons/lu'
import type { StaffRole } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group'
import { rateHelp } from './rateDraft'

/**
 * The hourly rate asked when an employee is created: everyone has one rate (docs/DECISIONS.md §23, K1). People who
 * can't see pay rates get a note instead.
 */
export function PayRateFields({ role, value, onChange, idPrefix }: { role: StaffRole; value: string; onChange: (v: string) => void; idPrefix: string }) {
  const { can } = useBranch()
  if (!can('payRates')) {
    return (
      <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
        <LuCircleAlert className="mt-0.5 size-4 shrink-0" />
        Someone who can see pay rates needs to set their hourly rate on their page (Employees → Directory) before payroll.
      </p>
    )
  }
  const id = `${idPrefix}-rate`
  return (
    <Field>
      <FieldLabel htmlFor={id}>Hourly rate</FieldLabel>
      <InputGroup className="sm:w-48">
        <InputGroupAddon>
          <InputGroupText>$</InputGroupText>
        </InputGroupAddon>
        <InputGroupInput id={id} inputMode="decimal" placeholder="0.00" value={value} onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ''))} />
        <InputGroupAddon align="inline-end">
          <InputGroupText>/hr</InputGroupText>
        </InputGroupAddon>
      </InputGroup>
      <FieldDescription>
        {rateHelp(role)} {role === 'owner' ? 'You can set it later on their page in Employees → Directory.' : 'Required, so their time is never paid $0. You can change it later on their page in Employees → Directory.'}
      </FieldDescription>
    </Field>
  )
}
