import { useEffect, useMemo, useState } from 'react'
import { LuCircleCheck, LuDownload } from 'react-icons/lu'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { parseContract, pricedChoice } from '@shared/contracts/document'
import { type ContractValues, carriedValues, prefillValues, presetValues } from '@shared/contracts/fill'
import { firstNames } from '@shared/contracts/gate'
import type { ContractLink, ContractPrefillResult } from '@shared/contracts/types'
import { dateKeyOf } from '@shared/time'
import type { WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { CompanyFooter } from '@/components/app/CompanyFooter'
import { FullPageSpinner } from '@/components/app/FullPage'
import { SkyArcLogo } from '@/components/app/SkyArcMark'
import { UserMenu } from '@/components/app/UserMenu'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import { useAcademyContactDetails } from '@/features/family/data'
import { useNow } from '@/lib/useNow'
import { contractPrefill, mySignedCopy, signSignedIn, useAcademySigner, useContractTemplate } from './api'
import { type SignOutcome, ContractSigning } from './ContractSigning'
import { type FamilyContract, useFamilyContract } from './family'
import { savePdf } from './pdf'

/**
 * Signing before using the website (docs/DECISIONS.md §31: "they have to sign first", and §34): once the office has
 * sent a student's contract, a parent fills it in and signs it, one child after the other (one contract per child,
 * each signed: §33), and the portal opens by itself; a student's own login waits for their parent. Nothing is asked
 * before the office sends it. Once signed, the parent is asked whether to download their copy (it stays under Profile →
 * Account). An admin looking at a family's portal isn't asked.
 */
/** A child whose contract was just signed here, and where the signer's copy was emailed. */
type SignedKid = { id: string; name: string; emailedTo: string[] }

export function RequireContract({ children }: { children: React.ReactNode }) {
  const { viewAs } = useBranch()
  const state = useFamilyContract()
  // The children signed for here, for the copy to download (shown over the portal once the last is signed).
  const [justSigned, setJustSigned] = useState<SignedKid[]>([])
  if (viewAs) return children
  if (state.loading && !justSigned.length) return <FullPageSpinner />
  const copies = justSigned.length ? <DownloadCopies kids={justSigned} onDone={() => setJustSigned([])} /> : null
  if (state.gate.open) {
    return (
      <>
        {children}
        {copies}
      </>
    )
  }
  return (
    <>
      <SignBeforeUsing state={state} onSigned={(kid) => setJustSigned((d) => [...d, kid])} />
      {copies && !state.gate.toSign.length ? copies : null}
    </>
  )
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

function SignBeforeUsing({ state, onSigned }: { state: FamilyContract; onSigned: (kid: SignedKid) => void }) {
  const { role, branchId, branch } = useBranch()
  const contact = useAcademyContactDetails()
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
            {academy} sent your enrollment contract to your parent or guardian. Once they sign it, in the app or on the website, this page opens by itself.
          </p>
          {contact.phone || contact.email ? <p className="mt-4 text-sm">Questions? {[contact.phone, contact.email].filter(Boolean).join(' · ')}</p> : null}
        </div>
      </Page>
    )
  }

  const kid = kids[0]
  const link = kid ? state.waiting.get(kid.id) : undefined
  if (!kid || !link || prefill === null) {
    return (
      <Page>
        <div className="flex items-center justify-center gap-2 rounded-2xl border bg-card p-8 text-sm text-muted-foreground">
          <Spinner /> Opening the contract…
        </div>
      </Page>
    )
  }
  const n = Math.min(Math.max(total - kids.length + 1, 1), Math.max(total, 1))
  return (
    <Page>
      <OneContract
        key={link.id}
        kid={kid}
        link={link}
        n={n}
        total={total}
        prefill={prefill === 'none' ? null : prefill}
        carry={carry}
        onSigned={(values, emailedTo) => {
          setCarry(values)
          setDone((d) => [...d, kid.id])
          onSigned({ id: kid.id, name: kid.name, emailedTo })
        }}
      />
    </Page>
  )
}

/** One child's contract, as the office sent it (its version, the program it suggested, its discounts). */
function OneContract({
  kid,
  link,
  n,
  total,
  prefill,
  carry,
  onSigned,
}: {
  kid: { id: string; name: string }
  link: WithId<ContractLink>
  n: number
  total: number
  prefill: ContractPrefillResult | null
  carry: ContractValues
  onSigned: (carried: ContractValues, emailedTo: string[]) => void
}) {
  const { branchId, branch, timezone, isDemo } = useBranch()
  const now = useNow()
  const template = useContractTemplate(link.templateId)
  const signer = useAcademySigner()
  const text = template.data?.text ?? ''
  const doc = useMemo(() => parseContract(text).doc, [text])
  if (template.loading || signer.loading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-2xl border bg-card p-8 text-sm text-muted-foreground">
        <Spinner /> Opening the contract…
      </div>
    )
  }
  if (!text) {
    return (
      <div className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground shadow-sm">
        {firstNames([kid.name])}’s contract couldn’t be opened. Please reload the page, or ask {branch.name} to send it again.
      </div>
    )
  }
  const first = firstNames([kid.name])
  const onFile = prefill?.students.find((s) => s.id === kid.id)
  const initial: ContractValues = {
    ...prefillValues(doc, { studentName: kid.name, dob: onFile?.dob ?? null, signerName: prefill?.signer.name, phone: prefill?.signer.phone, email: prefill?.signer.email }),
    ...presetValues(doc, link.preset ?? {}),
    ...carry,
  }
  const choice = pricedChoice(doc)
  const suggested = choice && typeof link.preset?.[choice.id] === 'string' ? (link.preset[choice.id] as string) : null

  async function onSign(request: Parameters<typeof signSignedIn>[3]): Promise<SignOutcome> {
    try {
      const r = await signSignedIn(branchId, kid.id, link.id, request)
      if (!r.signed) toast.message(`${first}’s contract was signed already`, { description: 'Another parent signed it a moment ago.' })
      onSigned(carriedValues(doc, request.values), r.emailedTo ?? [])
      window.scrollTo({ top: 0 })
    } catch (err) {
      const f = err as { code?: string; message?: string; details?: { errors?: Record<string, string> } }
      if (f.details?.errors) return { errors: f.details.errors }
      if (f.code === 'functions/resource-exhausted') return { problem: 'Too many tries just now. Please wait a few minutes, then sign again.' }
      if (f.code === 'functions/failed-precondition' || f.code === 'functions/not-found' || f.code === 'functions/permission-denied' || f.code === 'functions/invalid-argument') return { problem: f.message || 'The contract couldn’t be signed.' }
      return { problem: 'The contract couldn’t be signed just now. Check your connection and try again.' }
    }
  }

  return (
    <>
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
          {branch.name} sent you {first}’s enrollment contract. Please read it, check the program, fill it in and sign it at the bottom. It takes a few minutes.
          {total > 1 ? ' Each child has their own contract, so you sign each one.' : ''}
        </p>
      </div>

      <ContractSigning
        doc={doc}
        studentFirst={first}
        initial={initial}
        today={dateKeyOf(now, timezone)}
        onSign={onSign}
        signLabel={`Sign ${first}’s contract`}
        suggested={suggested}
        academySigner={signer.data ? { name: signer.data.name, title: signer.data.title, image: signer.data.image ?? null } : null}
        note={
          <>
            Signing makes a PDF of this contract as you filled it in, with your signature and a page recording your name, the date and time, your internet address, your browser and the email you’re signed in with. The academy keeps it,{' '}
            {isDemo ? 'and you can download your copy.' : 'and you get your copy by email and can download it.'}
          </>
        }
      />
    </>
  )
}

/**
 * Once signed: their copy to download now, or later from Profile → Account, where each child's signed contract is
 * (the owner, 2026-11-05: "ask, hey, you want to download the contract or not").
 */
function DownloadCopies({ kids, onDone }: { kids: SignedKid[]; onDone: () => void }) {
  const { branchId, role } = useBranch()
  const [busy, setBusy] = useState<string | null>(null)
  async function download(kid: { id: string; name: string }) {
    setBusy(kid.id)
    try {
      const { name, bytes } = await mySignedCopy(branchId, kid.id)
      savePdf(bytes, name)
    } catch (e) {
      toast.error('Couldn’t download the signed copy', { description: (e as Error).message })
    } finally {
      setBusy(null)
    }
  }
  const one = kids.length === 1
  const emailed = [...new Set(kids.flatMap((k) => k.emailedTo))]
  return (
    <Dialog open onOpenChange={(o) => !o && onDone()}>
      <DialogContent className="sm:max-w-md" data-testid="contract-signed-dialog">
        <DialogHeader className="items-center text-center sm:text-center">
          <LuCircleCheck className="size-10 text-emerald-600" aria-hidden />
          <DialogTitle>{one ? `${firstNames([kids[0].name])}’s contract is signed` : 'Your contracts are signed'}</DialogTitle>
          <DialogDescription>
            {emailed.length ? (
              <>
                Thank you. The academy has its copy, and yours is on its way to <span className="font-medium [overflow-wrap:anywhere] text-foreground">{emailed.join(', ')}</span>. Would you like to download it too?
              </>
            ) : (
              'Thank you. The academy has its copy. Would you like to download yours?'
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {kids.map((k) => (
            <Button key={k.id} className="w-full" variant={one ? 'default' : 'outline'} onClick={() => void download(k)} disabled={busy !== null} data-testid={`download-copy-${k.id}`}>
              {busy === k.id ? <Spinner /> : <LuDownload />} {one ? 'Download the contract (PDF)' : `${firstNames([k.name])}’s contract (PDF)`}
            </Button>
          ))}
        </div>
        <p className="text-center text-xs text-muted-foreground">
          You can download it any time from{' '}
          <Link to={`/${role === 'student' ? 'student' : 'parent'}/profile/account`} className="font-medium text-foreground underline underline-offset-2" onClick={onDone}>
            Profile → Account
          </Link>
          .
        </p>
        <DialogFooter>
          <Button variant="ghost" className="w-full" onClick={onDone} data-testid="contract-signed-later">
            Not now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
