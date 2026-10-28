import { MAX_SEATS_PER_CLASS } from '@shared/settings/businessRules'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

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
