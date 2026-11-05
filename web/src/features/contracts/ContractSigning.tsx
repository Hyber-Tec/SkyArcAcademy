import { useCallback, useRef, useState } from 'react'
import { LuCircleAlert } from 'react-icons/lu'
import type { ContractDocument } from '@shared/contracts/document'
import { type ContractValues, SIGN_KEYS, checkContractSigning, missingParts } from '@shared/contracts/fill'
import type { ContractSignRequest } from '@shared/contracts/types'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { ContractView, type SignState } from './ContractView'
import type { SignaturePadHandle } from './SignaturePad'

/** What signing came back with: field errors to show (keyed as `checkContractSigning`'s), or a problem in a sentence (nothing: it's signed). */
export type SignOutcome = { errors?: Record<string, string>; problem?: string } | void

/**
 * One child's contract, filled in and signed (docs/DECISIONS.md §33 and §34), as every signing page asks it: signed in
 * before using the website, with a link (/sign/{token}), and the office's preview in Settings. The contract reads as a
 * page with its parts to fill in; signing checks them as the server does (shared/src/contracts/fill.ts) and lists
 * what's missing by the button, each a step back to it.
 */
export function ContractSigning({
  doc,
  studentFirst,
  initial,
  today,
  note,
  onSign,
  signLabel = 'Sign the contract',
  suggested = null,
  academySigner = null,
}: {
  doc: ContractDocument
  /** "Ava": whose contract it is. */
  studentFirst: string
  /** What the form starts with (prefillValues, and what carries over from a brother's or sister's contract). */
  initial: ContractValues
  /** Today (YYYY-MM-DD) in the academy's time zone. */
  today: string
  note: React.ReactNode
  onSign: (request: ContractSignRequest) => Promise<SignOutcome>
  signLabel?: string
  /** The program the office suggested (the family may choose another). */
  suggested?: string | null
  /** The academy's signature on file, shown on its line. */
  academySigner?: { name: string; title: string; image: string } | null
}) {
  const [values, setValues] = useState<ContractValues>(initial)
  const [sign, setSign] = useState<SignState>({ name: '', relation: '', agree: false })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const pad = useRef<SignaturePadHandle>(null)
  const drop = useCallback((key: string) => setErrors((e) => (e[key] ? Object.fromEntries(Object.entries(e).filter(([k]) => k !== key)) : e)), [])

  /** Takes the family to a part: it scrolls into view, and its first box takes the typing. */
  function goTo(id: string) {
    const el = document.querySelector<HTMLElement>(`[data-part="${CSS.escape(id)}"]`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.querySelector<HTMLElement>('input:not([type=hidden]), button[role=radio], button[role=checkbox], canvas')?.focus({ preventScroll: true })
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setProblem(null)
    const request: ContractSignRequest = { values, name: sign.name, relation: sign.relation, signature: pad.current?.toPng() ?? '', agree: sign.agree }
    const checked = checkContractSigning(doc, request)
    if (!checked.ok) {
      setErrors(checked.errors)
      const first = missingParts(doc, checked.errors)[0]
      if (first) goTo(first.id)
      return
    }
    setErrors({})
    setBusy(true)
    try {
      const { values: clean, name, relation, signature } = checked.value
      const outcome = await onSign({ values: clean, name, relation, signature, agree: true })
      if (outcome?.errors) setErrors(outcome.errors)
      if (outcome?.problem) setProblem(outcome.problem)
    } finally {
      setBusy(false)
    }
  }

  const missing = missingParts(doc, errors)
  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-5" noValidate data-testid="contract-sign">
      <div className="rounded-2xl border bg-card p-5 shadow-sm sm:p-8">
        <ContractView
          doc={doc}
          values={values}
          onValue={(id, v) => {
            setValues((old) => ({ ...old, [id]: v }))
            drop(id)
          }}
          sign={sign}
          onSign={(patch) => {
            setSign((old) => ({ ...old, ...patch }))
            if ('name' in patch) drop(SIGN_KEYS.name)
            if ('relation' in patch) drop(SIGN_KEYS.relation)
            if ('agree' in patch) drop(SIGN_KEYS.agree)
          }}
          errors={errors}
          studentFirst={studentFirst}
          pad={pad}
          onInk={(ink) => ink && drop(SIGN_KEYS.signature)}
          onClear={() => pad.current?.clear()}
          today={today}
          suggested={suggested}
          academySigner={academySigner}
        />
      </div>

      <div className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
        {missing.length ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm" data-testid="contract-missing" role="alert">
            <p className="flex items-center gap-2 font-medium text-destructive">
              <LuCircleAlert className="size-4 shrink-0" aria-hidden /> Still to fill in
            </p>
            <ul className="mt-2 space-y-1">
              {missing.map((m) => (
                <li key={m.id}>
                  <button type="button" className="text-left underline underline-offset-2 hover:text-destructive" onClick={() => goTo(m.id)}>
                    {m.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {problem ? <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{problem}</p> : null}
        <Button type="submit" size="lg" className="w-full" disabled={busy} data-testid="sign-contract">
          {busy ? <Spinner /> : null} {signLabel}
        </Button>
        <p className="text-xs text-muted-foreground">{note}</p>
      </div>
    </form>
  )
}
