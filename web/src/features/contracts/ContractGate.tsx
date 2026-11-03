import { getBytes, ref as storageRef } from 'firebase/storage'
import { useEffect, useState } from 'react'
import { LuFileText, LuRotateCw } from 'react-icons/lu'
import { toast } from 'sonner'
import { firstNames } from '@shared/contracts/gate'
import type { SigningField } from '@shared/contracts/signing'
import { useBranch } from '@/branch/BranchProvider'
import { CompanyFooter } from '@/components/app/CompanyFooter'
import { FullPageSpinner } from '@/components/app/FullPage'
import { SkyArcLogo } from '@/components/app/SkyArcMark'
import { UserMenu } from '@/components/app/UserMenu'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldLabel } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import { useAcademyContactDetails } from '@/features/family/data'
import { storage } from '@/lib/firebase'
import { signSignedIn } from './api'
import { ContractPages } from './ContractPages'
import { type FamilyContract, useFamilyContract } from './family'
import { type SignOutcome, SigningForm } from './SigningForm'

/**
 * Signing before using the website (docs/DECISIONS.md §31: "they have to sign first"): once the academy has a contract,
 * a parent reads it and signs it for each of their children without a signed one, all at once (each child gets their
 * own signed copy), and the portal opens by itself; a student's own login waits for their parent. An admin looking at
 * a family's portal isn't asked.
 */
export function RequireContract({ children }: { children: React.ReactNode }) {
  const { viewAs } = useBranch()
  const state = useFamilyContract()
  if (viewAs) return children
  if (state.loading) return <FullPageSpinner />
  if (state.gate.open || !state.template) return children
  return <SignBeforeUsing state={state} />
}

function Page({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-svh bg-muted/40">
      <header className="mx-auto flex max-w-2xl items-center justify-between px-4 py-4">
        <SkyArcLogo className="h-12" />
        <UserMenu />
      </header>
      <main className="mx-auto max-w-2xl space-y-5 px-4 pb-16">
        {children}
        <CompanyFooter className="text-center" />
      </main>
    </div>
  )
}

function SignBeforeUsing({ state }: { state: FamilyContract }) {
  const { role, branchId, branch } = useBranch()
  const contact = useAcademyContactDetails()
  const kids = state.gate.toSign
  const [chosen, setChosen] = useState<string[]>(() => kids.map((k) => k.id))
  const [pdf, setPdf] = useState<Uint8Array | null>(null)
  const [failed, setFailed] = useState(false)
  const [showPages, setShowPages] = useState(true)
  const [attempt, setAttempt] = useState(0)
  const path = state.template?.path ?? null

  useEffect(() => {
    if (!path || role !== 'parent') return
    let alive = true
    getBytes(storageRef(storage, path))
      .then((b) => alive && setPdf(new Uint8Array(b)))
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [path, role, attempt])

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

  // A child signed for meanwhile (by the other parent) leaves the list.
  const ids = chosen.filter((id) => kids.some((k) => k.id === id))
  const names = kids.filter((k) => ids.includes(k.id)).map((k) => k.name)
  async function onSign(signing: Parameters<typeof signSignedIn>[2]): Promise<SignOutcome> {
    try {
      const r = await signSignedIn(branchId, ids, signing)
      const count = r.signed.length
      toast.success(count ? 'Thank you. The contract is signed.' : 'It was signed already.', { description: count ? `The academy has ${count === 1 ? 'its copy' : 'a copy for each child'}.` : undefined })
      window.scrollTo({ top: 0 })
    } catch (err) {
      const f = err as { code?: string; message?: string; details?: { errors?: Partial<Record<SigningField, string>> } }
      if (f.details?.errors) return { errors: f.details.errors }
      if (f.code === 'functions/resource-exhausted') return { problem: 'Too many tries just now. Please wait a few minutes, then sign again.' }
      if (f.code === 'functions/failed-precondition' || f.code === 'functions/permission-denied' || f.code === 'functions/invalid-argument') return { problem: f.message || 'The contract couldn’t be signed.' }
      return { problem: 'The contract couldn’t be signed just now. Check your connection and try again.' }
    }
  }

  return (
    <Page>
      <div className="rounded-2xl border bg-card p-6 text-center shadow-sm sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">Sign the enrollment contract</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Before you use {academy}’s app, please read the academy’s enrollment contract and sign it for {firstNames(kids.map((k) => k.name))}. It takes a few minutes.
        </p>
      </div>

      <section className="space-y-3" aria-label="The contract">
        {failed ? (
          <div className="space-y-3 rounded-xl border bg-card p-4 text-sm">
            <p className="text-muted-foreground">The contract didn’t load. Check your connection, then try again.</p>
            <Button
              variant="outline"
              onClick={() => {
                setFailed(false)
                setAttempt((n) => n + 1)
              }}
            >
              <LuRotateCw /> Try again
            </Button>
          </div>
        ) : !pdf ? (
          <div className="flex items-center justify-center gap-2 rounded-xl border bg-card p-8 text-sm text-muted-foreground">
            <Spinner /> Opening the contract…
          </div>
        ) : showPages ? (
          <ContractPages data={pdf} onFail={() => setShowPages(false)} />
        ) : (
          <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">The contract can’t be shown on this page. Download it to read it.</p>
        )}
        {pdf ? (
          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              const url = URL.createObjectURL(new Blob([pdf.slice()], { type: 'application/pdf' }))
              const a = document.createElement('a')
              a.href = url
              a.download = state.template?.name ?? 'Enrollment contract.pdf'
              a.click()
              setTimeout(() => URL.revokeObjectURL(url), 60_000)
            }}
          >
            <LuFileText /> Download the contract (PDF)
          </Button>
        ) : null}
      </section>

      <SigningForm
        who={firstNames(names.length ? names : kids.map((k) => k.name))}
        check={() => (ids.length ? null : 'Choose the child or children you sign for.')}
        before={
          kids.length > 1 ? (
            <Field>
              <FieldLabel>You sign for</FieldLabel>
              <div className="grid gap-2" data-testid="sign-for">
                {kids.map((k) => (
                  <label key={k.id} className="flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-3 text-sm font-medium has-data-[state=checked]:border-primary has-data-[state=checked]:bg-muted/40">
                    <Checkbox checked={chosen.includes(k.id)} onCheckedChange={(v) => setChosen((c) => (v === true ? [...new Set([...c, k.id])] : c.filter((x) => x !== k.id)))} />
                    {k.name}
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">One signature, and a signed copy for each child.</p>
            </Field>
          ) : null
        }
        note={<>Signing adds a page to the contract with your name, the date and time, your internet address, your browser and the email you’re signed in with. The academy keeps the signed copy, and you can download yours from your profile.</>}
        onSign={onSign}
      />
    </Page>
  )
}
