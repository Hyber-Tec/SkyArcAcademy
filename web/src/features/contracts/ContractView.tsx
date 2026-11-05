import { LuEraser } from 'react-icons/lu'
import { type ContractBlock, type ContractDocument, type ContractField, type Line, signerField } from '@shared/contracts/document'
import { type ContractValues, RELATION_LABELS, SIGN_KEYS, typingDate, usDate } from '@shared/contracts/fill'
import type { SignerRelation } from '@shared/contracts/types'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { cn } from '@/lib/utils'
import { SignaturePad, type SignaturePadHandle } from './SignaturePad'

/** Signing's own parts, beside the contract's fields: the name (when the contract has no field for it), parent or guardian, the agreement. */
export interface SignState {
  name: string
  relation: SignerRelation | ''
  agree: boolean
}

interface ViewProps {
  doc: ContractDocument
  values: ContractValues
  onValue: (id: string, value: string | string[]) => void
  sign: SignState
  onSign: (patch: Partial<SignState>) => void
  /** By field ID, or by `SIGN_KEYS` (shared/src/contracts/fill.ts). */
  errors: Record<string, string>
  /** "Ava": whose contract it is. */
  studentFirst: string
  pad: React.Ref<SignaturePadHandle>
  onInk: (hasInk: boolean) => void
  /** Clears the drawn signature. */
  onClear: () => void
  /** Today (YYYY-MM-DD) in the academy's time zone: the date beside the signature. */
  today: string
}

/**
 * The academy's contract as a page (docs/DECISIONS.md §33): its own words, top to bottom, with the parts the family
 * fills in where the paper has them (the option they choose, the boxes they check, their initials, the student's and
 * their own details), the academy's parts shown as the academy's, and the signature at the end. Every part carries
 * `data-part` (its field ID, or a `SIGN_KEYS` key), so the form can take the family to what's missing.
 */
export function ContractView(props: ViewProps) {
  const { doc } = props
  return (
    <article className="space-y-4 text-sm leading-relaxed" data-testid="contract-view">
      {doc.title ? <h2 className="border-b-4 border-foreground pb-3 text-xl font-bold tracking-tight text-balance sm:text-2xl">{doc.title}</h2> : null}
      {doc.blocks.map((b, i) => (
        <Block key={`${b.kind}-${i}`} block={b} {...props} />
      ))}
    </article>
  )
}

/** A line's words, with its bold ones. */
function Words({ line }: { line: Line }) {
  return (
    <>
      {line.map((r, i) =>
        r.bold ? (
          <strong key={i} className="font-semibold">
            {r.text}
          </strong>
        ) : (
          <span key={i}>{r.text}</span>
        ),
      )}
    </>
  )
}

function Block({ block: b, ...props }: ViewProps & { block: ContractBlock }) {
  const { values, onValue, errors } = props
  switch (b.kind) {
    case 'heading':
      return <h3 className="pt-3 text-base font-bold tracking-tight text-brand-text">{b.text}</h3>
    case 'subheading':
      return <h4 className="pt-1 text-sm font-bold tracking-tight text-brand-text">{b.text}</h4>
    case 'paragraph':
      return (
        <p>
          <Words line={b.text} />
        </p>
      )
    case 'bullets':
      return (
        <ul className="space-y-1.5">
          {b.items.map((item, i) => (
            <li key={i} className="flex gap-2.5">
              <span className="mt-[0.55em] size-1.5 shrink-0 rounded-full bg-brand" aria-hidden />
              <span>
                <Words line={item} />
              </span>
            </li>
          ))}
        </ul>
      )
    case 'numbered':
      return (
        <ol className="space-y-1.5">
          {b.items.map((item, i) => (
            <li key={i} className="flex gap-2">
              <span className="w-6 shrink-0 text-muted-foreground tabular-nums">{item.n}</span>
              <span>
                <Words line={item.text} />
              </span>
            </li>
          ))}
        </ol>
      )
    case 'box':
      return (
        <div className="space-y-0.5 rounded-lg border bg-muted/50 px-4 py-3 text-center">
          {b.lines.map((l, i) => (
            <p key={i} className={cn(i > 0 && 'text-xs text-muted-foreground')}>
              <Words line={l} />
            </p>
          ))}
        </div>
      )
    case 'choose': {
      const chosen = typeof values[b.id] === 'string' ? (values[b.id] as string) : ''
      const option = b.options.find((o) => o.id === chosen)
      const error = errors[b.id]
      return (
        <div data-part={b.id} className="space-y-3">
          <div className={cn('text-sm font-semibold', error && 'text-destructive')}>{b.label}: choose one</div>
          <RadioGroup value={chosen} onValueChange={(v) => onValue(b.id, v)} className="grid gap-2 sm:grid-cols-2" aria-label={b.label} aria-invalid={!!error || undefined}>
            {b.options.map((o) => (
              <label
                key={o.id}
                htmlFor={`contract-${b.id}-${o.id}`}
                className={cn(
                  'flex cursor-pointer gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-muted/40 has-data-[state=checked]:border-primary has-data-[state=checked]:bg-muted/60',
                  error && 'border-destructive/60',
                )}
                data-testid={`contract-choose-${o.id}`}
              >
                <RadioGroupItem value={o.id} id={`contract-${b.id}-${o.id}`} className="mt-0.5" />
                <span className="min-w-0 flex-1 space-y-1">
                  <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <span className="font-semibold">{o.title}</span>
                    {o.price ? <span className="font-bold whitespace-nowrap">{o.price}</span> : null}
                  </span>
                  {o.lines.map((l, i) => (
                    <span key={i} className="block text-xs leading-snug text-muted-foreground">
                      {l}
                    </span>
                  ))}
                </span>
              </label>
            ))}
          </RadioGroup>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {option ? (
            <dl className="divide-y rounded-lg border" data-testid="contract-chosen">
              <Row label={b.label} value={option.title} />
              {b.priceLabel ? <Row label={b.priceLabel} value={option.price} /> : null}
            </dl>
          ) : null}
        </div>
      )
    }
    case 'check': {
      const list = Array.isArray(values[b.id]) ? (values[b.id] as string[]) : []
      return (
        <fieldset data-part={b.id} className="space-y-2">
          <legend className="text-sm font-semibold">{b.label}</legend>
          <p className="text-xs text-muted-foreground">Check any that apply.</p>
          {b.options.map((o) => (
            <label key={o.id} className="flex cursor-pointer items-start gap-3 rounded-lg border bg-card px-3 py-2.5 hover:bg-muted/40 has-data-[state=checked]:border-primary" data-testid={`contract-check-${o.id}`}>
              <Checkbox checked={list.includes(o.id)} onCheckedChange={(v) => onValue(b.id, v === true ? [...list.filter((x) => x !== o.id), o.id] : list.filter((x) => x !== o.id))} className="mt-0.5" />
              <span>{o.text}</span>
            </label>
          ))}
        </fieldset>
      )
    }
    case 'initials': {
      const error = errors[b.id]
      return (
        <Field data-part={b.id} data-invalid={!!error} className="w-fit">
          <FieldLabel htmlFor={`contract-${b.id}`}>{b.label}</FieldLabel>
          <Input
            id={`contract-${b.id}`}
            value={typeof values[b.id] === 'string' ? (values[b.id] as string) : ''}
            onChange={(e) => onValue(b.id, e.target.value.toUpperCase())}
            maxLength={8}
            autoComplete="off"
            autoCapitalize="characters"
            className="w-32 uppercase"
            aria-invalid={!!error || undefined}
            data-testid="contract-initials"
          />
          {error ? <FieldError>{error}</FieldError> : null}
        </Field>
      )
    }
    case 'fields':
      return b.by === 'family' ? (
        <section data-part={b.id} className="overflow-hidden rounded-lg border">
          <h4 className="bg-foreground px-3 py-2 text-xs font-bold tracking-wide text-background">{b.title}</h4>
          <div className="divide-y">
            {b.fields.map((f) => (
              <FamilyField key={f.id} field={f} value={typeof values[f.id] === 'string' ? (values[f.id] as string) : ''} onValue={(v) => onValue(f.id, v)} error={errors[f.id]} />
            ))}
          </div>
        </section>
      ) : (
        <section className="overflow-hidden rounded-lg border">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 bg-brand-solid px-3 py-2 text-white">
            <h4 className="text-xs font-bold tracking-wide">{b.title}</h4>
            <span className="text-xs">Filled in by the academy</span>
          </div>
          <dl className="divide-y">
            {b.fields.map((f) => (
              <Row key={f.id} label={f.label} value="" />
            ))}
          </dl>
        </section>
      )
    case 'sign':
      return b.by === 'family' ? <FamilySign block={b} {...props} /> : <AcademySign label={b.label} />
  }
}

/** A label and its value, as the paper's boxes have them ("—" for one still blank). */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-0.5 px-3 py-2 sm:grid-cols-[11rem_1fr] sm:gap-3">
      <dt className="font-semibold">{label}</dt>
      <dd className={cn(!value && 'text-muted-foreground')}>{value || '—'}</dd>
    </div>
  )
}

/** One field the family fills in, with the keyboard it needs. */
function FamilyField({ field: f, value, onValue, error }: { field: ContractField; value: string; onValue: (v: string) => void; error?: string }) {
  const id = `contract-${f.id}`
  const kind: React.ComponentProps<typeof Input> =
    f.fill === 'date'
      ? { inputMode: 'numeric', placeholder: 'MM/DD/YYYY', autoComplete: /birth/i.test(f.label) ? 'bday' : 'off' }
      : f.fill === 'phone'
        ? { type: 'tel', autoComplete: 'tel' }
        : f.fill === 'email'
          ? { type: 'email', autoComplete: 'email', autoCapitalize: 'none', spellCheck: false }
          : f.fill === 'signer'
            ? { autoComplete: 'name', autoCapitalize: 'words' }
            : f.fill === 'student'
              ? { autoComplete: 'off', autoCapitalize: 'words' }
              : { autoComplete: 'off' }
  return (
    <Field data-part={f.id} data-invalid={!!error} className="gap-1.5 px-3 py-3 sm:grid sm:grid-cols-[11rem_1fr] sm:items-start sm:gap-x-3">
      <FieldLabel htmlFor={id} className="sm:pt-2">
        {f.label}
      </FieldLabel>
      <div className="space-y-1">
        <Input id={id} value={value} maxLength={f.fill === 'date' ? 10 : 200} onChange={(e) => onValue(f.fill === 'date' ? typingDate(e.target.value) : e.target.value)} aria-invalid={!!error || undefined} data-testid={`contract-field-${f.id}`} {...kind} />
        {error ? <FieldError>{error}</FieldError> : null}
      </div>
    </Field>
  )
}

/**
 * Where the family signs: their name (only when the contract has no field for it), parent or legal guardian, the
 * signature drawn with a finger or a mouse, today's date, and the agreement to sign electronically.
 */
function FamilySign({ block, doc, sign, onSign, errors, studentFirst, pad, onInk, onClear, today }: ViewProps & { block: Extract<ContractBlock, { kind: 'sign' }> }) {
  const named = !!signerField(doc)
  const err = (k: keyof typeof SIGN_KEYS) => errors[SIGN_KEYS[k]]
  return (
    <section data-part={block.id} className="space-y-5 rounded-xl border-2 border-foreground/80 p-4 sm:p-5" data-testid="contract-sign-part">
      {named ? null : (
        <Field data-part={SIGN_KEYS.name} data-invalid={!!err('name')}>
          <FieldLabel htmlFor="signer-name">Your full name</FieldLabel>
          <Input id="signer-name" value={sign.name} autoComplete="name" autoCapitalize="words" maxLength={100} aria-invalid={!!err('name') || undefined} onChange={(e) => onSign({ name: e.target.value })} data-testid="signer-name" />
          {err('name') ? <FieldError>{err('name')}</FieldError> : null}
        </Field>
      )}

      <Field data-part={SIGN_KEYS.relation} data-invalid={!!err('relation')}>
        <FieldLabel id="signer-relation-label">You are {studentFirst}’s</FieldLabel>
        <RadioGroup value={sign.relation} onValueChange={(v) => onSign({ relation: v as SignerRelation })} className="grid grid-cols-2 gap-2" aria-labelledby="signer-relation-label">
          {(Object.keys(RELATION_LABELS) as SignerRelation[]).map((r) => (
            <label key={r} htmlFor={`relation-${r}`} className="flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-3 text-sm font-medium text-foreground has-data-[state=checked]:border-primary has-data-[state=checked]:bg-muted/40" data-testid={`relation-${r}`}>
              <RadioGroupItem value={r} id={`relation-${r}`} />
              {RELATION_LABELS[r]}
            </label>
          ))}
        </RadioGroup>
        {err('relation') ? <FieldError>{err('relation')}</FieldError> : null}
      </Field>

      <Field data-part={SIGN_KEYS.signature} data-invalid={!!err('signature')}>
        <div className="flex items-center justify-between gap-2">
          <FieldLabel>{block.label}</FieldLabel>
          <Button type="button" variant="ghost" size="sm" onClick={onClear}>
            <LuEraser /> Clear
          </Button>
        </div>
        <SignaturePad ref={pad} invalid={!!err('signature')} onChange={onInk} label={`${block.label}: draw it with your finger or mouse`} />
        <div className="flex justify-between gap-3 text-xs text-muted-foreground">
          <span>Sign with your finger or mouse.</span>
          <span className="font-medium text-foreground" data-testid="contract-sign-date">
            Date: {usDate(today)}
          </span>
        </div>
        {err('signature') ? <FieldError>{err('signature')}</FieldError> : null}
      </Field>

      <Field data-part={SIGN_KEYS.agree} data-invalid={!!err('agree')} orientation="horizontal" className="items-start">
        <Checkbox id="signer-agree" checked={sign.agree} className="mt-0.5" onCheckedChange={(v) => onSign({ agree: v === true })} data-testid="signer-agree" />
        <div className="space-y-1">
          <FieldLabel htmlFor="signer-agree" className="leading-snug font-medium">
            I agree to sign this contract electronically
          </FieldLabel>
          <p className="text-xs text-muted-foreground">My typed name and the signature I drew are my signature on it.</p>
          {err('agree') ? <FieldError>{err('agree')}</FieldError> : null}
        </div>
      </Field>
    </section>
  )
}

/** The academy's signature line: the academy signs it, not the family. */
function AcademySign({ label }: { label: string }) {
  return (
    <div className="grid gap-3 rounded-lg border border-dashed px-3 py-3 sm:grid-cols-[1fr_8rem]">
      <div>
        <div className="font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">Signed by the academy</div>
      </div>
      <div className="text-xs text-muted-foreground sm:text-right">Date: —</div>
    </div>
  )
}
