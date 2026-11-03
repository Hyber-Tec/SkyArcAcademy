import { useCallback, useRef, useState } from 'react'
import { LuEraser } from 'react-icons/lu'
import { type Signing, type SigningField, checkSigning } from '@shared/contracts/signing'
import { SIGNER_RELATIONS, type SignerRelation } from '@shared/contracts/types'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Spinner } from '@/components/ui/spinner'
import { SignaturePad, type SignaturePadHandle } from './SignaturePad'

/** What signing came back with: field errors to show, or a problem in a sentence (nothing: it's signed). */
export type SignOutcome = { errors?: Partial<Record<SigningField, string>>; problem?: string } | void

/**
 * The signature, as both signing pages ask it (with a link, /sign/{token}, and signed in, before using the website):
 * the signer's full name, parent or guardian, the signature drawn with a finger or a mouse, and the agreement to sign
 * electronically, each checked as the server checks it (shared/src/contracts/signing.ts). `before` goes above the
 * fields (the children a parent signs for), `check` is asked first, and `note` goes under the button.
 */
export function SigningForm({
  who,
  before,
  check,
  note,
  onSign,
}: {
  /** "Ava", "Ava and Leo": whose parent or guardian signs. */
  who: string
  before?: React.ReactNode
  check?: () => string | null
  note: React.ReactNode
  onSign: (signing: Signing) => Promise<SignOutcome>
}) {
  const [name, setName] = useState('')
  const [relation, setRelation] = useState<SignerRelation | ''>('')
  const [agree, setAgree] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<SigningField, string>>>({})
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const pad = useRef<SignaturePadHandle>(null)
  const clearError = useCallback((field: SigningField) => setErrors((e) => (e[field] ? { ...e, [field]: undefined } : e)), [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setProblem(null)
    const first = check?.() ?? null
    if (first) return setProblem(first)
    const signature = pad.current?.toPng() ?? ''
    const checked = checkSigning({ name, relation, signature, agree })
    if (!checked.ok) {
      setErrors(checked.errors)
      document.querySelector('[data-invalid="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    setErrors({})
    setBusy(true)
    try {
      const outcome = await onSign(checked.value)
      if (outcome?.errors) setErrors(outcome.errors)
      if (outcome?.problem) setProblem(outcome.problem)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-5 rounded-2xl border bg-card p-6 shadow-sm sm:p-8" noValidate data-testid="signing-form">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Sign the contract</h2>
        <p className="mt-1 text-sm text-muted-foreground">As {who}’s parent or guardian.</p>
      </div>

      {before}

      <Field data-invalid={!!errors.name}>
        <FieldLabel htmlFor="signer-name">Your full name</FieldLabel>
        <Input
          id="signer-name"
          value={name}
          autoComplete="name"
          autoCapitalize="words"
          maxLength={100}
          aria-invalid={!!errors.name || undefined}
          onChange={(e) => {
            setName(e.target.value)
            clearError('name')
          }}
        />
        {errors.name ? <FieldError>{errors.name}</FieldError> : null}
      </Field>

      <Field data-invalid={!!errors.relation}>
        <FieldLabel id="signer-relation-label">You are {who}’s</FieldLabel>
        <RadioGroup
          value={relation}
          onValueChange={(v) => {
            setRelation(v as SignerRelation)
            clearError('relation')
          }}
          className="grid grid-cols-2 gap-2"
          aria-labelledby="signer-relation-label"
        >
          {(Object.keys(SIGNER_RELATIONS) as SignerRelation[]).map((r) => (
            <label key={r} htmlFor={`relation-${r}`} className="flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-3 text-sm font-medium has-data-[state=checked]:border-primary has-data-[state=checked]:bg-muted/40">
              <RadioGroupItem value={r} id={`relation-${r}`} />
              {SIGNER_RELATIONS[r]}
            </label>
          ))}
        </RadioGroup>
        {errors.relation ? <FieldError>{errors.relation}</FieldError> : null}
      </Field>

      <Field data-invalid={!!errors.signature}>
        <div className="flex items-center justify-between gap-2">
          <FieldLabel>Your signature</FieldLabel>
          <Button type="button" variant="ghost" size="sm" onClick={() => pad.current?.clear()}>
            <LuEraser /> Clear
          </Button>
        </div>
        <SignaturePad ref={pad} invalid={!!errors.signature} onChange={(ink) => ink && clearError('signature')} label="Your signature: draw it with your finger or mouse" />
        {errors.signature ? <FieldError>{errors.signature}</FieldError> : null}
      </Field>

      <Field data-invalid={!!errors.agree} orientation="horizontal" className="items-start">
        <Checkbox
          id="signer-agree"
          checked={agree}
          className="mt-0.5"
          onCheckedChange={(v) => {
            setAgree(v === true)
            clearError('agree')
          }}
        />
        <div className="space-y-1">
          <FieldLabel htmlFor="signer-agree" className="leading-snug font-medium">
            I agree to sign this contract electronically
          </FieldLabel>
          <p className="text-xs text-muted-foreground">My typed name and the signature I drew are my signature on it.</p>
          {errors.agree ? <FieldError>{errors.agree}</FieldError> : null}
        </div>
      </Field>

      {problem ? <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{problem}</p> : null}

      <Button type="submit" size="lg" className="w-full" disabled={busy} data-testid="sign-contract">
        {busy ? <Spinner /> : null} Sign the contract
      </Button>
      <p className="text-xs text-muted-foreground">{note}</p>
    </form>
  )
}
