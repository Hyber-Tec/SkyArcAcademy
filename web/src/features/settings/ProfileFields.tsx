import { Link } from 'react-router'
import type { BranchContact } from '@shared/types'
import { TimeZonePicker } from '@/components/app/TimeZonePicker'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import type { ProfileDraft } from './settingsWrite'

const CONTACT: { key: keyof BranchContact; label: string; type?: string }[] = [
  { key: 'email', label: 'Email', type: 'email' },
  { key: 'phone', label: 'Phone', type: 'tel' },
  { key: 'website', label: 'Website' },
  { key: 'address', label: 'Address' },
]

/** The academy's name, time zone and contact details (Settings → Academy profile), saved with the page's bar. */
export function ProfileFields({ value, onChange }: { value: ProfileDraft; onChange: (next: ProfileDraft) => void }) {
  return (
    <FieldGroup>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="bp-name">Name</FieldLabel>
          <Input id="bp-name" value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} />
        </Field>
        <Field>
          <FieldLabel htmlFor="bp-short">Short name</FieldLabel>
          <Input id="bp-short" value={value.shortName} onChange={(e) => onChange({ ...value, shortName: e.target.value })} />
          <FieldDescription>Where the full name doesn’t fit.</FieldDescription>
        </Field>
      </div>
      <Field>
        <FieldLabel htmlFor="bp-tz">Time zone</FieldLabel>
        <TimeZonePicker id="bp-tz" value={value.timezone} onChange={(timezone) => onChange({ ...value, timezone })} />
        <FieldDescription>All dates, “today”, locks and cut-offs use this zone, whatever device people use.</FieldDescription>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        {CONTACT.map((c) => (
          <Field key={c.key}>
            <FieldLabel htmlFor={`bp-${c.key}`}>{c.label}</FieldLabel>
            <Input id={`bp-${c.key}`} type={c.type} value={value.contact[c.key] ?? ''} onChange={(e) => onChange({ ...value, contact: { ...value.contact, [c.key]: e.target.value } })} />
          </Field>
        ))}
      </div>
      <FieldDescription>
        The contact details also appear on the{' '}
        <Link to="/privacy" target="_blank" className="underline underline-offset-2">
          privacy policy
        </Link>
        , which anyone can open.
      </FieldDescription>
    </FieldGroup>
  )
}
