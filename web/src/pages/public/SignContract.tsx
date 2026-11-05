import { httpsCallable } from 'firebase/functions'
import { useEffect, useMemo, useState } from 'react'
import { LuCircleCheck, LuDownload, LuMail, LuPhone, LuRotateCw } from 'react-icons/lu'
import { useParams } from 'react-router'
import { parseContract } from '@shared/contracts/document'
import { prefillValues } from '@shared/contracts/fill'
import type { ContractSignRequest } from '@shared/contracts/types'
import { formatPhone } from '@shared/people'
import { dateKeyOf, formatInstant } from '@shared/time'
import { CompanyFooter } from '@/components/app/CompanyFooter'
import { SkyArcLogo } from '@/components/app/SkyArcMark'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { type SignOutcome, ContractSigning } from '@/features/contracts/ContractSigning'
import { pdfBytes, savePdf } from '@/features/contracts/pdf'
import { functions } from '@/lib/firebase'
import { useNow } from '@/lib/useNow'
import { cn } from '@/lib/utils'

/**
 * /sign/{token}: where a parent or guardian fills in and signs the academy's enrollment contract (docs/DECISIONS.md
 * §23, F4, and §33), from the link the office texted or emailed them. No account and no app: it works on any phone's
 * browser. The contract reads as a page with its parts to fill in (the student's name is filled in already), then
 * parent or guardian, a signature drawn with a finger or a mouse and the agreement to sign electronically. The server
 * builds the signed PDF (functions/src/contracts.ts); they can download their copy for a while. A link that expired,
 * was used or was canceled says so, with how to reach the academy.
 */

interface Academy {
  name: string
  email: string
  phone: string
  /** The academy's time zone: every date here is the academy's. */
  timezone: string
}

type Loaded =
  | { state: 'ready'; academy: Academy; firstName: string; studentName: string; expiresAt: number; contract: { title: string; text: string; version: number } }
  | { state: 'signed'; academy: Academy; firstName: string; signedAt: number; signerName: string; copyUntil: number; copy?: { name: string; data: string } }
  | { state: 'expired'; academy: Academy; firstName: string; expiresAt: number }
  | { state: 'canceled'; academy: Academy; firstName: string }
  | { state: 'invalid'; academy: Academy }

const getContract = httpsCallable<{ token: string; copy?: boolean }, Loaded>(functions, 'getContractForSigning')
const sign = httpsCallable<{ token: string } & ContractSignRequest, { ok: true; fileName: string; copyUntil: number }>(functions, 'signContract')

/** "November 27, 2026", in the academy's time zone. */
const longDate = (ms: number, academy: Academy) => formatInstant(ms, academy.timezone || 'America/New_York', { month: 'long', day: 'numeric', year: 'numeric' })

function Shell({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-svh bg-muted/40 px-4 py-8 sm:py-12">
      <div className={cn('mx-auto w-full space-y-5', wide ? 'max-w-3xl' : 'max-w-md')}>{children}</div>
      <CompanyFooter className="mt-8 text-center" />
    </div>
  )
}

/** The logo, centered over a card's content (CLAUDE.md, "Brand and logos"). */
function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-2xl border bg-card p-6 shadow-sm sm:p-8', className)}>
      <div className="mb-6 flex justify-center">
        <SkyArcLogo className="h-16" />
      </div>
      {children}
    </div>
  )
}

function Contact({ academy, lead }: { academy: Academy; lead: string }) {
  if (!academy.phone && !academy.email) return null
  return (
    <div className="mt-5 space-y-2 rounded-xl bg-muted/50 p-4 text-sm">
      <p className="text-muted-foreground">{lead}</p>
      <p className="font-medium">{academy.name}</p>
      <div className="flex flex-col gap-1.5">
        {academy.phone ? (
          <a href={`tel:${academy.phone.replace(/[^\d+]/g, '')}`} className="inline-flex items-center gap-2 font-medium underline-offset-2 hover:underline">
            <LuPhone className="size-4" aria-hidden /> {formatPhone(academy.phone)}
          </a>
        ) : null}
        {academy.email ? (
          <a href={`mailto:${academy.email}`} className="inline-flex items-center gap-2 font-medium break-all underline-offset-2 hover:underline">
            <LuMail className="size-4 shrink-0" aria-hidden /> {academy.email}
          </a>
        ) : null}
      </div>
    </div>
  )
}

function Notice({ title, children, academy, lead }: { title: string; children: React.ReactNode; academy: Academy | null; lead?: string }) {
  return (
    <Shell>
      <Card>
        <h1 className="text-xl font-semibold tracking-tight text-balance">{title}</h1>
        <div className="mt-2 space-y-3 text-sm text-muted-foreground">{children}</div>
        {academy ? <Contact academy={academy} lead={lead ?? 'Questions? Contact the academy:'} /> : null}
      </Card>
    </Shell>
  )
}

/** Their signed copy, fetched through the link (for a few days after signing). */
function CopyButton({ token, until, academy }: { token: string; until: number; academy: Academy }) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const now = useNow()
  if (now > until) return null
  const download = async () => {
    setBusy(true)
    setFailed(false)
    try {
      const r = (await getContract({ token, copy: true })).data
      if (r.state === 'signed' && r.copy) savePdf(pdfBytes(r.copy.data), r.copy.name)
      else setFailed(true)
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-2">
      <Button className="w-full" onClick={() => void download()} disabled={busy}>
        {busy ? <Spinner /> : <LuDownload />} Download your signed copy
      </Button>
      <p className="text-center text-xs text-muted-foreground">{failed ? 'The download didn’t work. Please try again.' : `This download works until ${longDate(until, academy)}.`}</p>
    </div>
  )
}

export function SignContractPage() {
  const { token = '' } = useParams()
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [failure, setFailure] = useState<'busy' | 'network' | null>(null)
  const [signed, setSigned] = useState<{ name: string; copyUntil: number } | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    document.title = 'Enrollment contract'
    let alive = true
    getContract({ token })
      .then((r) => alive && setLoaded(r.data))
      .catch((e: { code?: string }) => alive && setFailure(e?.code === 'functions/resource-exhausted' ? 'busy' : 'network'))
    return () => {
      alive = false
    }
  }, [token, attempt])

  if (signed && loaded && loaded.state === 'ready') {
    return (
      <Shell>
        <Card>
          <div className="flex flex-col items-center text-center">
            <LuCircleCheck className="size-10 text-emerald-600" aria-hidden />
            <h1 className="mt-3 text-xl font-semibold tracking-tight">Thank you, {signed.name.split(' ')[0]}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{loaded.firstName}’s enrollment contract is signed, and the academy has its copy.</p>
          </div>
          <div className="mt-6">
            <CopyButton token={token} until={signed.copyUntil} academy={loaded.academy} />
          </div>
          <Contact academy={loaded.academy} lead="Questions? Contact the academy:" />
        </Card>
      </Shell>
    )
  }
  if (failure) {
    return (
      <Notice title={failure === 'busy' ? 'Too many tries just now' : 'The contract didn’t load'} academy={null}>
        <p>{failure === 'busy' ? 'Please wait a few minutes, then try again.' : 'Check your connection, then try again.'}</p>
        <Button
          variant="outline"
          onClick={() => {
            setFailure(null)
            setAttempt((n) => n + 1)
          }}
        >
          <LuRotateCw /> Try again
        </Button>
      </Notice>
    )
  }
  if (!loaded) {
    return (
      <Shell>
        <Card>
          <div className="flex flex-col items-center gap-3 py-6 text-sm text-muted-foreground">
            <Spinner className="size-6" />
            Opening the contract…
          </div>
        </Card>
      </Shell>
    )
  }
  switch (loaded.state) {
    case 'invalid':
      return (
        <Notice title="This link doesn’t work" academy={loaded.academy} lead="Contact the academy:">
          <p>Check that you opened the whole link from the message. If it still doesn’t work, ask the academy for a new one.</p>
        </Notice>
      )
    case 'canceled':
      return (
        <Notice title="This link was canceled" academy={loaded.academy} lead="Contact the academy:">
          <p>The academy stopped this link for {loaded.firstName}’s enrollment contract, so it can’t be signed with it. If you still need to sign, ask them for a new link.</p>
        </Notice>
      )
    case 'expired':
      return (
        <Notice title="This link has expired" academy={loaded.academy} lead="Contact the academy:">
          <p>
            The link to sign {loaded.firstName}’s enrollment contract worked until {longDate(loaded.expiresAt, loaded.academy)}. Ask the academy for a new link.
          </p>
        </Notice>
      )
    case 'signed':
      return (
        <Notice title="This contract is already signed" academy={loaded.academy}>
          <p>
            {loaded.signerName || 'Someone'} signed {loaded.firstName}’s enrollment contract on {longDate(loaded.signedAt, loaded.academy)}. A link signs only once.
          </p>
          <CopyButton token={token} until={loaded.copyUntil} academy={loaded.academy} />
        </Notice>
      )
    default:
      return <SignForm token={token} loaded={loaded} onSigned={setSigned} />
  }
}

function SignForm({ token, loaded, onSigned }: { token: string; loaded: Extract<Loaded, { state: 'ready' }>; onSigned: (s: { name: string; copyUntil: number }) => void }) {
  const now = useNow()
  const doc = useMemo(() => parseContract(loaded.contract.text).doc, [loaded.contract.text])
  const initial = useMemo(() => prefillValues(doc, { studentName: loaded.studentName }), [doc, loaded.studentName])

  async function onSign(request: ContractSignRequest): Promise<SignOutcome> {
    try {
      const r = (await sign({ token, ...request })).data
      onSigned({ name: request.name ?? '', copyUntil: r.copyUntil })
      window.scrollTo({ top: 0 })
    } catch (err) {
      const f = err as { code?: string; details?: { errors?: Record<string, string>; state?: string } }
      if (f.details?.errors) return { errors: f.details.errors }
      if (f.code === 'functions/failed-precondition') return { problem: 'This link can’t be signed any more. Reload the page to see why.' }
      if (f.code === 'functions/resource-exhausted') return { problem: 'Too many tries just now. Please wait a few minutes, then sign again.' }
      return { problem: 'The contract couldn’t be signed just now. Check your connection and try again.' }
    }
  }

  return (
    <Shell wide>
      <Card>
        <h1 className="text-center text-2xl font-semibold tracking-tight text-balance">Enrollment contract for {loaded.firstName}</h1>
        <p className="mt-2 text-center text-sm text-muted-foreground">Please read the contract, fill it in and sign at the bottom of this page. It takes a few minutes.</p>
      </Card>

      <ContractSigning
        doc={doc}
        studentFirst={loaded.firstName}
        initial={initial}
        today={dateKeyOf(now, loaded.academy.timezone || 'America/New_York')}
        onSign={onSign}
        note={
          <>
            Signing makes a PDF of this contract as you filled it in, with your signature and a page recording your name, the date and time, your internet address and your browser. The link works until {longDate(loaded.expiresAt, loaded.academy)}, for one signature.
          </>
        }
      />

      <Contact academy={loaded.academy} lead="Questions about the contract? Contact the academy:" />
    </Shell>
  )
}
