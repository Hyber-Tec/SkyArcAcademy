import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { parseContract } from '@shared/contracts/document'
import { type ContractValues, carriedValues, prefillValues } from '@shared/contracts/fill'
import { firstNames } from '@shared/contracts/gate'
import type { ContractPrefillResult, ContractTemplate } from '@shared/contracts/types'
import { dateKeyOf } from '@shared/time'
import type { WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { CompanyFooter } from '@/components/app/CompanyFooter'
import { FullPageSpinner } from '@/components/app/FullPage'
import { SkyArcLogo } from '@/components/app/SkyArcMark'
import { UserMenu } from '@/components/app/UserMenu'
import { Spinner } from '@/components/ui/spinner'
import { useAcademyContactDetails } from '@/features/family/data'
import { useNow } from '@/lib/useNow'
import { contractPrefill, signSignedIn } from './api'
import { type SignOutcome, ContractSigning } from './ContractSigning'
import { type FamilyContract, useFamilyContract } from './family'

/**
 * Signing before using the website (docs/DECISIONS.md §31: "they have to sign first"): once the academy has published
 * its contract, a parent fills it in and signs it for each of their children without a signed one, one child after
 * the other (one contract per child, each signed: §33), and the portal opens by itself; a student's own login waits
 * for their parent. An admin looking at a family's portal isn't asked.
 */
export function RequireContract({ children }: { children: React.ReactNode }) {
  const { viewAs } = useBranch()
  const state = useFamilyContract()
  if (viewAs) return children
  if (state.loading) return <FullPageSpinner />
  if (state.gate.open || !state.template) return children
  return <SignBeforeUsing state={state} template={state.template} />
}

function Page({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-svh bg-muted/40">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
        <SkyArcLogo className="h-12" />
        <UserMenu />
      </header>
      <main className="mx-auto max-w-3xl space-y-5 px-4 pb-16">
        {children}
        <CompanyFooter className="text-center" />
      </main>
    </div>
  )
}

function SignBeforeUsing({ state, template }: { state: FamilyContract; template: WithId<ContractTemplate> }) {
  const { role, branchId, branch, timezone } = useBranch()
  const contact = useAcademyContactDetails()
  const now = useNow()
  const doc = useMemo(() => parseContract(template.text).doc, [template.text])
  // The children signed for here, before the records say so (the next one shows at once).
  const [done, setDone] = useState<string[]>([])
  const kids = state.gate.toSign.filter((k) => !done.includes(k.id))
  const [total] = useState(state.gate.toSign.length)
  // What the records know (the children's birth dates, the parent's own details); the form works without it.
  const [prefill, setPrefill] = useState<ContractPrefillResult | 'none' | null>(null)
  // What the parent typed about themselves on the last contract, for the next.
  const [carry, setCarry] = useState<ContractValues>({})

  useEffect(() => {
    if (role !== 'parent') return
    let alive = true
    contractPrefill(branchId)
      .then((p) => alive && setPrefill(p))
      .catch(() => alive && setPrefill('none'))
    return () => {
      alive = false
    }
  }, [branchId, role])

  const academy = branch.name
  if (role === 'student') {
    return (
      <Page>
        <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8" data-testid="contract-wait">
          <h1 className="text-xl font-semibold tracking-tight">Your parent signs first</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Before you use {academy}’s app, a parent or guardian signs the academy’s enrollment contract for you. They sign up with the email they gave the academy and sign it there, or ask the academy for a link to sign it. This page opens by itself once it’s signed.
          </p>
          {contact.phone || contact.email ? <p className="mt-4 text-sm">Questions? {[contact.phone, contact.email].filter(Boolean).join(' · ')}</p> : null}
        </div>
      </Page>
    )
  }

  const kid = kids[0]
  if (!kid || prefill === null) {
    return (
      <Page>
        <div className="flex items-center justify-center gap-2 rounded-2xl border bg-card p-8 text-sm text-muted-foreground">
          <Spinner /> Opening the contract…
        </div>
      </Page>
    )
  }

  const first = firstNames([kid.name])
  const records = prefill === 'none' ? null : prefill
  const onFile = records?.students.find((s) => s.id === kid.id)
  const initial: ContractValues = {
    ...prefillValues(doc, { studentName: kid.name, dob: onFile?.dob ?? null, signerName: records?.signer.name, phone: records?.signer.phone, email: records?.signer.email }),
    ...carry,
  }
  const n = Math.min(Math.max(total - kids.length + 1, 1), Math.max(total, 1))

  async function onSign(request: Parameters<typeof signSignedIn>[2]): Promise<SignOutcome> {
    try {
      const r = await signSignedIn(branchId, kid.id, request)
      setCarry(carriedValues(doc, request.values))
      setDone((d) => [...d, kid.id])
      const next = kids[1]
      toast.success(r.signed ? `Thank you. ${first}’s contract is signed.` : `${first}’s contract was signed already.`, { description: next ? `Next: ${firstNames([next.name])}’s contract.` : 'The academy has its copy.' })
      window.scrollTo({ top: 0 })
    } catch (err) {
      const f = err as { code?: string; message?: string; details?: { errors?: Record<string, string> } }
      if (f.details?.errors) return { errors: f.details.errors }
      if (f.code === 'functions/resource-exhausted') return { problem: 'Too many tries just now. Please wait a few minutes, then sign again.' }
      if (f.code === 'functions/failed-precondition' || f.code === 'functions/permission-denied' || f.code === 'functions/invalid-argument') return { problem: f.message || 'The contract couldn’t be signed.' }
      return { problem: 'The contract couldn’t be signed just now. Check your connection and try again.' }
    }
  }

  return (
    <Page>
      <div className="rounded-2xl border bg-card p-6 text-center shadow-sm sm:p-8">
        {total > 1 ? (
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase" data-testid="contract-count">
            Contract {n} of {total}
          </p>
        ) : null}
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-balance" data-testid="contract-child-title">
          Enrollment contract for {first}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Before you use {academy}’s app, please read the academy’s enrollment contract, fill it in for {first} and sign it at the bottom. It takes a few minutes.
          {total > 1 ? ' Each child has their own contract, so you sign each one.' : ''}
        </p>
      </div>

      <ContractSigning
        key={kid.id}
        doc={doc}
        studentFirst={first}
        initial={initial}
        today={dateKeyOf(now, timezone)}
        onSign={onSign}
        note={
          <>
            Signing makes a PDF of this contract as you filled it in, with your signature and a page recording your name, the date and time, your internet address, your browser and the email you’re signed in with. The academy keeps it, and you can download your copy from your profile.
          </>
        }
      />
    </Page>
  )
}
