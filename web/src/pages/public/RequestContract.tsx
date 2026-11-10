import { httpsCallable } from '@/lib/callable'
import { useCallback, useEffect, useRef, useState } from 'react'
import { LuCircleCheck, LuClock, LuPlus, LuTrash2 } from 'react-icons/lu'
import { useNavigate } from 'react-router'
import { REQUEST_CHILDREN_MAX } from '@shared/contracts/request'
import type { ContractRequestResult, ContractRequestState } from '@shared/contracts/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { functions } from '@/lib/firebase'
import { cn } from '@/lib/utils'
import { Card, Shell } from './ContractFrame'

/**
 * /contract: the page the academy's sign opens (its QR code at the front desk, the owner's idea, 2026-11-08,
 * docs/DECISIONS.md §39). A parent asks for each child's enrollment contract: the children's names and birth dates, their
 * own name, email and phone. The office is told at once, chooses the program and any discounts, and sends it; this
 * page, still open, waits and then opens each contract to sign, filled in from what they typed (the email stays as
 * typed: the copy goes there). It's emailed to them too, for later. No account and no app. The requests it's waiting
 * on are kept in this browser, so coming back to the page (or from signing one) shows where each one is.
 */

const askCall = httpsCallable<Record<string, unknown>, ContractRequestResult>(functions, 'requestContract')
const statusCall = httpsCallable<{ tokens: string[] }, { requests: ContractRequestState[] }>(functions, 'contractRequestStatus')

/** What this browser waits on: each child's request, and the parent's details to start another from. */
interface Kept {
  requests: { token: string; firstName: string }[]
  parent: { name: string; email: string; phone: string }
  at: number
}
const KEY = 'skyarc:contract-requests'
const KEEP_FOR = 3 * 86_400_000

function readKept(): Kept | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Kept | null
    return v && Array.isArray(v.requests) && Date.now() - v.at < KEEP_FOR ? v : null
  } catch {
    return null
  }
}
function writeKept(v: Kept | null) {
  try {
    if (v) localStorage.setItem(KEY, JSON.stringify(v))
    else localStorage.removeItem(KEY)
  } catch {
    /* not kept: the page still works while open */
  }
}

type Child = { firstName: string; lastName: string; dob: string }
const blank = (): Child => ({ firstName: '', lastName: '', dob: '' })

export function RequestContractPage() {
  const [kept, setKept] = useState<Kept | null>(() => readKept())
  const [asking, setAsking] = useState(() => !readKept())
  useEffect(() => {
    document.title = 'Ask for the enrollment contract'
  }, [])
  if (!asking && kept?.requests.length) {
    return (
      <Waiting
        kept={kept}
        onAnother={() => setAsking(true)}
        onClear={() => {
          writeKept(null)
          setKept(null)
          setAsking(true)
        }}
      />
    )
  }
  return (
    <Ask
      parent={kept?.parent ?? null}
      onAsked={(next) => {
        const merged: Kept = { requests: [...(kept?.requests ?? []), ...next.requests], parent: next.parent, at: Date.now() }
        writeKept(merged)
        setKept(merged)
        setAsking(false)
      }}
      onBack={kept?.requests.length ? () => setAsking(false) : null}
    />
  )
}

/** The form: each child, then the parent. Names in English letters, as the contract takes them. */
function Ask({ parent, onAsked, onBack }: { parent: Kept['parent'] | null; onAsked: (k: Omit<Kept, 'at'>) => void; onBack: (() => void) | null }) {
  const [children, setChildren] = useState<Child[]>([blank()])
  const [name, setName] = useState(parent?.name ?? '')
  const [email, setEmail] = useState(parent?.email ?? '')
  const [phone, setPhone] = useState(parent?.phone ?? '')
  const [website, setWebsite] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const setChild = (i: number, patch: Partial<Child>) => setChildren((list) => list.map((c, j) => (j === i ? { ...c, ...patch } : c)))
  const err = (key: string) => errors[key]

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setProblem(null)
    try {
      const r = (await askCall({ children, parentName: name, email, phone, website })).data
      onAsked({ requests: r.requests.map((x) => ({ token: x.token, firstName: x.firstName })), parent: { name, email, phone } })
    } catch (err) {
      const f = err as { code?: string; details?: { errors?: Record<string, string> }; message?: string }
      if (f.details?.errors) {
        setErrors(f.details.errors)
        setProblem('Some parts need another look.')
      } else if (f.code === 'functions/resource-exhausted') setProblem('Too many requests just now. Please ask at the front desk.')
      else setProblem('The request didn’t go. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Shell>
      <Card>
        <h1 className="text-center text-2xl font-semibold tracking-tight text-balance">Enrollment contract</h1>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          Tell us whose contract it is. The academy gets it ready, and it opens here for you to sign. We’ll email it to you too.
        </p>
        <form onSubmit={(e) => void submit(e)} className="mt-6 space-y-6" noValidate data-testid="contract-request-form">
          {children.map((c, i) => (
            <fieldset key={i} className="space-y-3 rounded-xl border p-4">
              <legend className="flex w-full items-center justify-between px-1 text-sm font-semibold">
                {children.length > 1 ? `Child ${i + 1}` : 'Your child'}
              </legend>
              <div className="grid grid-cols-2 gap-3">
                <TextField id={`c${i}-first`} label="First name" value={c.firstName} onChange={(v) => setChild(i, { firstName: v })} error={err(`children.${i}.firstName`)} autoComplete="off" />
                <TextField id={`c${i}-last`} label="Last name" value={c.lastName} onChange={(v) => setChild(i, { lastName: v })} error={err(`children.${i}.lastName`)} autoComplete="off" />
              </div>
              <TextField id={`c${i}-dob`} label="Date of birth (optional)" value={c.dob} onChange={(v) => setChild(i, { dob: v })} error={err(`children.${i}.dob`)} type="date" />
              {children.length > 1 ? (
                <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setChildren((list) => list.filter((_, j) => j !== i))}>
                  <LuTrash2 /> Remove
                </Button>
              ) : null}
            </fieldset>
          ))}
          {children.length < REQUEST_CHILDREN_MAX ? (
            <Button type="button" variant="outline" className="w-full" onClick={() => setChildren((list) => [...list, { ...blank(), lastName: list[0]?.lastName ?? '' }])} data-testid="add-child">
              <LuPlus /> Add another child
            </Button>
          ) : null}
          {err('children') ? <p className="text-sm text-destructive">{err('children')}</p> : null}

          <fieldset className="space-y-3 rounded-xl border p-4">
            <legend className="px-1 text-sm font-semibold">Parent or guardian</legend>
            <TextField id="parent-name" label="Your full name" value={name} onChange={setName} error={err('parentName')} autoComplete="name" />
            <TextField id="parent-email" label="Email" value={email} onChange={setEmail} error={err('email')} type="email" autoComplete="email" />
            <TextField id="parent-phone" label="Phone" value={phone} onChange={setPhone} error={err('phone')} type="tel" autoComplete="tel" />
          </fieldset>
          {/* People never see this box: a script filling in every box fills it too. */}
          <input type="text" name="website" value={website} onChange={(e) => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 opacity-0" />

          <p className="text-xs text-muted-foreground">
            Type names in English letters, as the contract writes them. What you type here fills in the contract, and you can still change it there.
          </p>
          {problem ? <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{problem}</p> : null}
          <Button type="submit" size="lg" className="w-full" disabled={busy} data-testid="ask-contract">
            {busy ? <Spinner /> : null} Ask for the contract
          </Button>
          {onBack ? (
            <Button type="button" variant="ghost" className="w-full" onClick={onBack}>
              Back to your request
            </Button>
          ) : null}
        </form>
      </Card>
    </Shell>
  )
}

function TextField({ id, label, value, onChange, error, type = 'text', autoComplete }: { id: string; label: string; value: string; onChange: (v: string) => void; error?: string; type?: string; autoComplete?: string }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} aria-invalid={!!error || undefined} autoCapitalize={type === 'email' ? 'none' : type === 'text' ? 'words' : undefined} />
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  )
}

const POLL_MS = 4000

/**
 * Waiting for the office, then each contract to sign: the page asks every few seconds while it's open. With one child,
 * it opens their contract as soon as it's sent; with more, each has its button.
 */
function Waiting({ kept, onAnother, onClear }: { kept: Kept; onAnother: () => void; onClear: () => void }) {
  const navigate = useNavigate()
  const [states, setStates] = useState<ContractRequestState[] | null>(null)
  const [offline, setOffline] = useState(false)
  const opened = useRef(false)
  const tokens = kept.requests.map((r) => r.token)
  const check = useCallback(async () => {
    try {
      const r = (await statusCall({ tokens })).data.requests
      setStates(r)
      setOffline(false)
      return r
    } catch {
      setOffline(true)
      return null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokens.join(',')])
  useEffect(() => {
    let alive = true
    const tick = async () => {
      if (document.visibilityState !== 'visible') return
      const r = await check()
      // One child, sent: their contract opens by itself (once).
      if (alive && r && r.length === 1 && r[0].state === 'ready' && !opened.current) {
        opened.current = true
        navigate(`${r[0].path}?from=request`)
      }
    }
    void tick()
    const timer = setInterval(() => void tick(), POLL_MS)
    const onShow = () => void tick()
    document.addEventListener('visibilitychange', onShow)
    return () => {
      alive = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onShow)
    }
  }, [check, navigate])

  const rows = kept.requests.map((r, i) => ({ firstName: r.firstName, s: states?.[i] ?? null }))
  const allDone = !!states && states.every((s) => s.state === 'signed' || s.state === 'closed' || s.state === 'unknown')
  return (
    <Shell>
      <Card>
        <h1 className="text-center text-xl font-semibold tracking-tight text-balance">
          {allDone ? 'All done' : 'Your request is with the academy'}
        </h1>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          {allDone
            ? 'Thank you. The academy has your signed contract, and your copy is in your email.'
            : `Keep this page open: each contract opens here as soon as the academy sends it. It’s emailed to ${kept.parent.email} too.`}
        </p>
        <ul className="mt-6 space-y-2" data-testid="request-states">
          {rows.map(({ firstName, s }, i) => (
            <li key={kept.requests[i].token} className={cn('flex items-center gap-3 rounded-xl border px-4 py-3 text-sm', s?.state === 'ready' && 'border-foreground')}>
              {s?.state === 'signed' ? (
                <LuCircleCheck className="size-5 shrink-0 text-emerald-600" />
              ) : s?.state === 'ready' ? (
                <LuClock className="size-5 shrink-0" />
              ) : (
                <Spinner className="size-5 shrink-0 text-muted-foreground" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{`${firstName}’s contract`}</span>
                <span className="block text-xs text-muted-foreground">
                  {!s || s.state === 'waiting'
                    ? 'The academy is getting it ready…'
                    : s.state === 'ready'
                      ? 'Ready to sign'
                      : s.state === 'signed'
                        ? 'Signed'
                        : 'Please ask at the front desk.'}
                </span>
              </span>
              {s?.state === 'ready' ? (
                <Button size="sm" onClick={() => navigate(`${s.path}?from=request`)} data-testid={`sign-${i}`}>
                  Sign
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
        {offline ? <p className="mt-3 text-center text-xs text-muted-foreground">Checking again as soon as you’re back online…</p> : null}
        <div className="mt-6 grid gap-2">
          <Button variant="outline" onClick={onAnother} data-testid="ask-another">
            <LuPlus /> Ask for another child’s contract
          </Button>
          {allDone ? (
            <Button variant="ghost" onClick={onClear}>
              Start over
            </Button>
          ) : null}
        </div>
      </Card>
    </Shell>
  )
}
