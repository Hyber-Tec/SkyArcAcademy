import { DEFAULT_BUSINESS_RULES, MAX_SEATS_PER_CLASS, PAY_MODELS, PAY_MODEL_HELP, PAY_MODEL_LABELS, type PayModel } from '@shared/settings/businessRules'
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

/** Seats per class: how many students a new class takes. */
export function SeatsField({ value, onChange }: { value: number; onChange: (next: number) => void }) {
  return (
    <Field>
      <FieldLabel>Seats per class</FieldLabel>
      <ToggleGroup type="single" variant="outline" value={String(value)} onValueChange={(v) => v && onChange(Number(v))} className="flex-wrap justify-start" aria-label="Seats per class">
        {Array.from({ length: MAX_SEATS_PER_CLASS }, (_, i) => i + 1).map((n) => (
          <ToggleGroupItem
            key={n}
            value={String(n)}
            className="w-10 tabular-nums data-[state=on]:bg-foreground data-[state=on]:text-background"
            aria-label={`${n} seat${n === 1 ? '' : 's'}`}
          >
            {n}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <FieldDescription>A new class has this many seats; each class can have its own.</FieldDescription>
    </Field>
  )
}
