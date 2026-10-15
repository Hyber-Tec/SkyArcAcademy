import { DEFAULT_BUSINESS_RULES, MAX_STUDENTS_PER_COACH_LIMIT, PAY_MODELS, PAY_MODEL_HELP, PAY_MODEL_LABELS, type PayModel } from '@shared/settings/businessRules'
import { Field, FieldContent, FieldDescription, FieldLabel, FieldTitle } from '@/components/ui/field'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

/** Pay model cards: Classes taught (the default), Hourly, Teaching + Admin, or Teaching only. */
export function PayModelChoice({ value, onChange, idPrefix }: { value: PayModel; onChange: (m: PayModel) => void; idPrefix: string }) {
  return (
    <RadioGroup value={value} onValueChange={(v) => onChange(v as PayModel)} className="grid gap-2">
      {PAY_MODELS.map((m) => (
        <FieldLabel key={m} htmlFor={`${idPrefix}-${m}`} className="has-data-[state=checked]:border-primary has-data-[state=checked]:bg-muted/40">
          <Field orientation="horizontal">
            <FieldContent>
              <FieldTitle>
                {PAY_MODEL_LABELS[m]}
                {m === DEFAULT_BUSINESS_RULES.payModels[0].model ? <span className="text-xs font-normal text-muted-foreground">(default)</span> : null}
              </FieldTitle>
              <FieldDescription>{PAY_MODEL_HELP[m]}</FieldDescription>
            </FieldContent>
            <RadioGroupItem value={m} id={`${idPrefix}-${m}`} />
          </Field>
        </FieldLabel>
      ))}
    </RadioGroup>
  )
}

/** Students per coach at once: the schedule's capacity rule. */
export function CapacityField({ value, onChange }: { value: number; onChange: (next: number) => void }) {
  return (
    <Field>
      <FieldLabel>Students per coach at once</FieldLabel>
      <ToggleGroup
        type="single"
        variant="outline"
        value={String(value)}
        onValueChange={(v) => v && onChange(Number(v))}
        className="justify-start"
      >
        {Array.from({ length: MAX_STUDENTS_PER_COACH_LIMIT }, (_, i) => i + 1).map((n) => (
          <ToggleGroupItem
            key={n}
            value={String(n)}
            className="w-11 tabular-nums data-[state=on]:bg-foreground data-[state=on]:text-background"
            aria-label={`${n} at once`}
          >
            {n}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <FieldDescription>
        {value === 1
          ? 'Strictly one-to-one: the schedule never gives a coach two students at the same time.'
          : `The schedule never gives a coach more than ${value} students at the same time.`}{' '}
        Lowering it leaves classes already booked above the new limit as conflicts on the schedule until they’re moved.
      </FieldDescription>
    </Field>
  )
}
