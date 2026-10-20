import { RadioGroup as RadioGroupPrimitive } from 'radix-ui'
import type { ReactNode } from 'react'
import { LuCircleAlert } from 'react-icons/lu'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

/** Form pieces for the booking and contact forms: large, calm fields with their label and error under them. */
export const inputClass =
  'h-12 rounded-xl border-line bg-white px-3.5 text-[15px] md:text-[15px] shadow-[0_1px_0_rgb(10_10_10/0.02)] placeholder:text-stone/60 focus-visible:border-ink focus-visible:ring-ink/10 aria-invalid:border-red-text aria-invalid:ring-red-text/15'

export const selectTriggerClass =
  'h-12 w-full rounded-xl border-line bg-white px-3.5 text-[15px] data-[size=default]:h-12 focus-visible:border-ink focus-visible:ring-ink/10 aria-invalid:border-red-text'

export function Field({ id, label, error, hint, children, className }: { id: string; label: string; error?: string | null; hint?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('grid content-start gap-1.5', className)}>
      <Label htmlFor={id} className="text-[13px] font-medium text-ink">
        {label}
      </Label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="flex items-center gap-1.5 text-[12.5px] font-medium text-red-text" role="alert">
          <LuCircleAlert className="size-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : hint ? (
        <p className="text-[12.5px] text-stone">{hint}</p>
      ) : null}
    </div>
  )
}

/** Two or three choices side by side (a radio group that looks like a segmented control). */
export function Segmented<T extends string>({ value, onChange, options, label, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string; className?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex rounded-xl border border-line bg-warm p-1', className)}>
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn(
              'min-h-10 flex-1 rounded-[10px] px-4 text-[14px] font-medium transition focus-visible:ring-2 focus-visible:ring-ink/30 focus-visible:outline-none',
              on ? 'bg-white text-ink shadow-[0_1px_2px_rgb(10_10_10/0.08),0_0_0_1px_rgb(10_10_10/0.06)]' : 'text-stone hover:text-ink',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** Choices as cards (the athlete's experience). */
export function ChoiceCards({ value, onChange, options, label, invalid, className }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; label: string; invalid?: boolean; className?: string }) {
  return (
    <RadioGroupPrimitive.Root value={value} onValueChange={onChange} aria-label={label} aria-invalid={invalid || undefined} className={cn('grid gap-2 sm:grid-cols-3', className)}>
      {options.map((o) => (
        <RadioGroupPrimitive.Item
          key={o.value}
          value={o.value}
          className={cn(
            'group flex min-h-12 items-center gap-2.5 rounded-xl border border-line bg-white px-3.5 py-2.5 text-left text-[14px] font-medium transition hover:border-ink/40 focus-visible:ring-2 focus-visible:ring-ink/25 focus-visible:outline-none data-[state=checked]:border-ink data-[state=checked]:bg-warm',
            invalid && 'border-red-text/60',
          )}
        >
          <span className="flex size-4.5 shrink-0 items-center justify-center rounded-full border border-ink/30 group-data-[state=checked]:border-ink group-data-[state=checked]:bg-ink">
            <RadioGroupPrimitive.Indicator className="size-1.5 rounded-full bg-white" />
          </span>
          {o.label}
        </RadioGroupPrimitive.Item>
      ))}
    </RadioGroupPrimitive.Root>
  )
}
