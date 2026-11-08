import { LuCheck, LuEraser } from 'react-icons/lu'
import { type ContractBlock, type ContractDocument, type ContractField, type Line, dollarsText, pricedChoice, signerField } from '@shared/contracts/document'
import { type ContractValues, RELATION_LABELS, SIGN_KEYS, optionHeading, optionPrices, relationLabel, tuitionOf, tuitionText, typingDate, usDate } from '@shared/contracts/fill'
import type { ShownSigner, SignerRelation } from '@shared/contracts/types'
import { dateText } from '@shared/i18n'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useLang, useT } from '@/lib/lang'
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
  /** The option the office suggested, marked so (the family may choose another). */
  suggested?: string | null
  /** The academy's signature on file, shown on its line. */
  academySigner?: ShownSigner | null
}

/**
 * The academy's contract as a page (docs/DECISIONS.md §33 and §34): its own words, top to bottom, with the parts the
 * family fills in where the paper has them (the program they choose, a card each, with the office's suggestion marked
 * and each price after the discounts; the boxes they check, their initials, the student's and their own details), the
 * academy's parts shown as the academy's (the discounts the office checked, its signature), and the family's
 * signature at the end. Every part carries `data-part` (its field ID, or a `SIGN_KEYS` key), so the form can take the
 * family to what's missing.
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
  const t = useT()
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
    case 'choose':
      return <Choose block={b} {...props} />
    case 'check': {
      const list = Array.isArray(values[b.id]) ? (values[b.id] as string[]) : []
      if (b.by === 'academy') {
        // The office checked these as it sent the contract: the family reads them, and asks the office about a change.
        const chosen = pricedChoice(props.doc)
        const option = chosen ? (values[chosen.id] as string | undefined) : undefined
        return (
          <section data-part={b.id} className="overflow-hidden rounded-lg border" data-testid="contract-academy-check">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 bg-brand-solid px-3 py-2 text-white">
              <h4 className="text-xs font-bold tracking-wide">{b.label}</h4>
              <span className="text-xs">{t('Set by the academy', '아카데미 적용')}</span>
            </div>
            <ul className="divide-y">
              {b.options.map((o) => {
                const on = list.includes(o.id)
                const left = on && !!option && o.except.includes(option)
                return (
                  <li key={o.id} className={cn('flex items-start gap-3 px-3 py-2.5', !on && 'text-muted-foreground')} data-testid={`contract-discount-${o.id}`}>
                    <span className={cn('mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-[4px] border', on ? 'border-foreground bg-foreground text-background' : 'border-muted-foreground/40')} aria-hidden>
                      {on ? <LuCheck className="size-3" strokeWidth={3} /> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      {o.text}
                      {left ? <span className="block text-xs text-muted-foreground">{t('Doesn’t apply to the program chosen.', '고른 프로그램에는 적용되지 않아요.')}</span> : null}
                    </span>
                    {on && o.amount !== null && !left ? <span className="font-semibold whitespace-nowrap tabular-nums">−{dollarsText(o.amount)}</span> : null}
                    <span className="sr-only">{on ? t('Applied', '적용됨') : t('Not applied', '적용 안 됨')}</span>
                  </li>
                )
              })}
            </ul>
            <p className="border-t bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              {list.length ? t('The academy applied these.', '아카데미가 적용한 항목이에요.') : t('None applied.', '적용된 항목이 없어요.')}{' '}
              {t('Ask the academy if one should change.', '바꿔야 할 항목이 있으면 아카데미에 문의해 주세요.')}
            </p>
          </section>
        )
      }
      return (
        <fieldset data-part={b.id} className="space-y-2">
          <legend className="text-sm font-semibold">{b.label}</legend>
          <p className="text-xs text-muted-foreground">{t('Check any that apply.', '해당하는 항목을 모두 골라 주세요.')}</p>
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
            <span className="text-xs">{t('Filled in by the academy', '아카데미 작성')}</span>
          </div>
          <dl className="divide-y">
            {b.fields.map((f) => (
              <Row key={f.id} label={f.label} value="" />
            ))}
          </dl>
        </section>
      )
    case 'sign':
      return b.by === 'family' ? <FamilySign block={b} {...props} /> : <AcademySign label={b.label} signer={props.academySigner ?? null} today={props.today} />
  }
}

/**
 * The programs to choose from, a card each: its name over the rest of it, its price after the discounts the office
 * checked (the price before them struck through), the office's suggestion marked; the one chosen opens to its
 * details. Under them, what was chosen and its price, as the paper's boxes have them.
 */
function Choose({ block: b, values, onValue, errors, doc, suggested }: ViewProps & { block: Extract<ContractBlock, { kind: 'choose' }> }) {
  const chosen = typeof values[b.id] === 'string' ? (values[b.id] as string) : ''
  const option = b.options.find((o) => o.id === chosen)
  const error = errors[b.id]
  const priced = pricedChoice(doc) === b
  const prices = priced ? optionPrices(doc, values) : null
  const tuition = priced ? tuitionOf(doc, values) : null
  const lang = useLang()
  const t = useT()
  return (
    <div data-part={b.id} className="space-y-3">
      <div className={cn('text-sm font-semibold', error && 'text-destructive')}>{t(`${b.label}: choose one`, `${b.label} (하나 선택)`)}</div>
      <RadioGroup value={chosen} onValueChange={(v) => onValue(b.id, v)} className="grid gap-2 sm:grid-cols-2" aria-label={b.label} aria-invalid={!!error || undefined}>
        {b.options.map((o) => {
          const { name, sub } = optionHeading(o.title)
          const price = prices?.get(o.id)
          const on = o.id === chosen
          return (
            <label
              key={o.id}
              htmlFor={`contract-${b.id}-${o.id}`}
              className={cn(
                'flex cursor-pointer gap-3 rounded-xl border bg-card p-3.5 transition-colors hover:bg-muted/40 has-data-[state=checked]:border-foreground has-data-[state=checked]:ring-1 has-data-[state=checked]:ring-foreground',
                error && 'border-destructive/60',
              )}
              data-testid={`contract-choose-${o.id}`}
            >
              <RadioGroupItem value={o.id} id={`contract-${b.id}-${o.id}`} className="mt-1" />
              <span className="min-w-0 flex-1">
                <span className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block leading-tight font-semibold tracking-tight">{name}</span>
                    {sub ? <span className="mt-0.5 block text-[11px] font-medium tracking-wider text-muted-foreground">{sub}</span> : null}
                  </span>
                  {o.price ? (
                    <span className="shrink-0 text-right leading-tight">
                      {price?.was ? <span className="block text-xs text-muted-foreground line-through tabular-nums">{price.was}</span> : null}
                      <span className="block text-base font-bold tabular-nums">{price ? price.now : o.price}</span>
                      {price?.per ? <span className="block text-[11px] text-muted-foreground">{price.per}</span> : null}
                    </span>
                  ) : null}
                </span>
                {suggested === o.id ? (
                  <span className="mt-2 inline-flex h-5 items-center rounded-full bg-brand/10 px-2 text-[11px] font-semibold text-brand-text" data-testid="contract-suggested">
                    {t('Suggested by the academy', '아카데미 추천')}
                  </span>
                ) : null}
                {on && o.lines.length ? (
                  <span className="mt-2 block space-y-0.5 border-t pt-2">
                    {o.lines.map((l, i) => (
                      <span key={i} className="block text-xs leading-snug text-muted-foreground">
                        {l}
                      </span>
                    ))}
                  </span>
                ) : null}
              </span>
            </label>
          )
        })}
      </RadioGroup>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {option ? (
        <dl className="divide-y rounded-lg border" data-testid="contract-chosen">
          <Row label={b.label} value={option.title} />
          {b.priceLabel ? <Row label={b.priceLabel} value={tuition ? tuitionText(tuition, lang) : option.price} /> : null}
        </dl>
      ) : null}
    </div>
  )
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
      ? { inputMode: 'numeric', placeholder: 'MM/DD/YYYY', autoComplete: /birth|생년월일|생일/i.test(f.label) ? 'bday' : 'off' }
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
  const lang = useLang()
  const t = useT()
  return (
    <section data-part={block.id} className="space-y-5 rounded-xl border-2 border-foreground/80 p-4 sm:p-5" data-testid="contract-sign-part">
      {named ? null : (
        <Field data-part={SIGN_KEYS.name} data-invalid={!!err('name')}>
          <FieldLabel htmlFor="signer-name">{t('Your full name', '이름 (영문)')}</FieldLabel>
          <Input id="signer-name" value={sign.name} autoComplete="name" autoCapitalize="words" maxLength={100} aria-invalid={!!err('name') || undefined} onChange={(e) => onSign({ name: e.target.value })} data-testid="signer-name" />
          {err('name') ? <FieldError>{err('name')}</FieldError> : null}
        </Field>
      )}

      <Field data-part={SIGN_KEYS.relation} data-invalid={!!err('relation')}>
        <FieldLabel id="signer-relation-label">{t(`You are ${studentFirst}’s`, `${studentFirst} 학생과의 관계`)}</FieldLabel>
        <RadioGroup value={sign.relation} onValueChange={(v) => onSign({ relation: v as SignerRelation })} className="grid grid-cols-2 gap-2" aria-labelledby="signer-relation-label">
          {(Object.keys(RELATION_LABELS) as SignerRelation[]).map((r) => (
            <label key={r} htmlFor={`relation-${r}`} className="flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-3 text-sm font-medium text-foreground has-data-[state=checked]:border-primary has-data-[state=checked]:bg-muted/40" data-testid={`relation-${r}`}>
              <RadioGroupItem value={r} id={`relation-${r}`} />
              {relationLabel(r, lang)}
            </label>
          ))}
        </RadioGroup>
        {err('relation') ? <FieldError>{err('relation')}</FieldError> : null}
      </Field>

      <Field data-part={SIGN_KEYS.signature} data-invalid={!!err('signature')}>
        <div className="flex items-center justify-between gap-2">
          <FieldLabel>{block.label}</FieldLabel>
          <Button type="button" variant="ghost" size="sm" onClick={onClear}>
            <LuEraser /> {t('Clear', '지우기')}
          </Button>
        </div>
        <SignaturePad ref={pad} invalid={!!err('signature')} onChange={onInk} label={t(`${block.label}: draw it with your finger or mouse`, `${block.label}: 손가락이나 마우스로 그려 주세요`)} />
        <div className="flex justify-between gap-3 text-xs text-muted-foreground">
          <span className="min-w-0">{t('Sign with your finger or mouse.', '손가락이나 마우스로 서명해 주세요.')}</span>
          <span className="shrink-0 font-medium whitespace-nowrap text-foreground" data-testid="contract-sign-date">
            {lang === 'ko' ? `날짜: ${dateText(today, 'long', 'ko')}` : `Date: ${usDate(today)}`}
          </span>
        </div>
        {err('signature') ? <FieldError>{err('signature')}</FieldError> : null}
      </Field>

      <Field data-part={SIGN_KEYS.agree} data-invalid={!!err('agree')} orientation="horizontal" className="items-start">
        <Checkbox id="signer-agree" checked={sign.agree} className="mt-0.5" onCheckedChange={(v) => onSign({ agree: v === true })} data-testid="signer-agree" />
        <div className="space-y-1">
          <FieldLabel htmlFor="signer-agree" className="leading-snug font-medium">
            {t('I agree to sign this contract electronically', '이 계약서의 전자 서명에 동의합니다')}
          </FieldLabel>
          <p className="text-xs text-muted-foreground">{t('My typed name and the signature I drew are my signature on it.', '입력한 이름과 직접 그린 서명을 이 계약서의 제 서명으로 인정합니다.')}</p>
          {err('agree') ? <FieldError>{err('agree')}</FieldError> : null}
        </div>
      </Field>
    </section>
  )
}

/** The academy's signature line: the academy's signature on file, put on as the family signs (or left for the academy). */
/** A name typed as a signature (the academy's, until it has an image: §35), in a serif italic as the PDF prints it. */
export function TypedName({ name, className }: { name: string; className?: string }) {
  return (
    <div className={cn('rounded-md bg-white px-2 py-1 font-serif text-2xl text-zinc-900 italic', className)} data-testid="typed-signature">
      {name}
    </div>
  )
}

function AcademySign({ label, signer, today }: { label: string; signer: ShownSigner | null; today: string }) {
  const lang = useLang()
  const t = useT()
  const date = (key: string) => (lang === 'ko' ? dateText(key, 'long', 'ko') : usDate(key))
  return (
    <div className="grid gap-3 rounded-lg border border-dashed px-3 py-3 sm:grid-cols-[1fr_8rem] sm:items-end" data-testid="contract-academy-sign">
      <div className="min-w-0">
        {signer?.image ? (
          <div className="mb-1 rounded-md bg-white px-2 py-1">
            <img src={signer.image} alt={t(`${signer.name}’s signature`, `${signer.name} 서명`)} className="h-12 w-auto max-w-full object-contain" />
          </div>
        ) : signer ? (
          <TypedName name={signer.name} className="mb-1" />
        ) : null}
        <div className="font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">
          {signer
            ? t(`Signed for the academy by ${[signer.name, signer.title].filter(Boolean).join(', ')}, as you sign`, `아카데미 서명: ${[signer.name, signer.title].filter(Boolean).join(', ')} (서명할 때 함께 들어가요)`)
            : t('Signed by the academy', '아카데미가 서명해요')}
        </div>
      </div>
      <div className="text-xs text-muted-foreground sm:text-right">
        {t('Date:', '날짜:')} {signer ? date(today) : '—'}
      </div>
    </div>
  )
}
