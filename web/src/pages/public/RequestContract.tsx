import { httpsCallable } from 'firebase/functions'
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
import { useLang, useT } from '@/lib/lang'
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
  const lang = useLang()
  const t = useT()
  const [kept, setKept] = useState<Kept | null>(() => readKept())
  const [asking, setAsking] = useState(() => !readKept())
  useEffect(() => {
    document.title = lang === 'ko' ? '등록 계약서 요청' : 'Ask for the enrollment contract'
  }, [lang])
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
      t={t}
    />
  )
}

/** The form: each child, then the parent. Names in English letters, as the contract takes them. */
function Ask({ parent, onAsked, onBack, t }: { parent: Kept['parent'] | null; onAsked: (k: Omit<Kept, 'at'>) => void; onBack: (() => void) | null; t: ReturnType<typeof useT> }) {
  const lang = useLang()
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
      const r = (await askCall({ children, parentName: name, email, phone, lang, website })).data
      onAsked({ requests: r.requests.map((x) => ({ token: x.token, firstName: x.firstName })), parent: { name, email, phone } })
    } catch (err) {
      const f = err as { code?: string; details?: { errors?: Record<string, string> }; message?: string }
      if (f.details?.errors) {
        setErrors(f.details.errors)
        setProblem(t('Some parts need another look.', '다시 확인할 항목이 있어요.'))
      } else if (f.code === 'functions/resource-exhausted') setProblem(t('Too many requests just now. Please ask at the front desk.', '요청이 너무 많았어요. 데스크에 문의해 주세요.'))
      else setProblem(t('The request didn’t go. Check your connection and try again.', '요청을 보내지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Shell>
      <Card>
        <h1 className="text-center text-2xl font-semibold tracking-tight text-balance">{t('Enrollment contract', '등록 계약서')}</h1>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          {t(
            'Tell us whose contract it is. The academy gets it ready, and it opens here for you to sign. We’ll email it to you too.',
            '누구의 계약서인지 알려 주세요. 아카데미가 준비하면 이 화면에서 바로 서명할 수 있어요. 이메일로도 보내 드려요.',
          )}
        </p>
        <form onSubmit={(e) => void submit(e)} className="mt-6 space-y-6" noValidate data-testid="contract-request-form">
          {children.map((c, i) => (
            <fieldset key={i} className="space-y-3 rounded-xl border p-4">
              <legend className="flex w-full items-center justify-between px-1 text-sm font-semibold">
                {children.length > 1 ? t(`Child ${i + 1}`, `자녀 ${i + 1}`) : t('Your child', '자녀')}
              </legend>
              <div className="grid grid-cols-2 gap-3">
                <TextField id={`c${i}-first`} label={t('First name', '이름 (영문)')} value={c.firstName} onChange={(v) => setChild(i, { firstName: v })} error={err(`children.${i}.firstName`)} autoComplete="off" />
                <TextField id={`c${i}-last`} label={t('Last name', '성 (영문)')} value={c.lastName} onChange={(v) => setChild(i, { lastName: v })} error={err(`children.${i}.lastName`)} autoComplete="off" />
              </div>
              <TextField id={`c${i}-dob`} label={t('Date of birth (optional)', '생년월일 (선택)')} value={c.dob} onChange={(v) => setChild(i, { dob: v })} error={err(`children.${i}.dob`)} type="date" />
              {children.length > 1 ? (
                <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setChildren((list) => list.filter((_, j) => j !== i))}>
                  <LuTrash2 /> {t('Remove', '삭제')}
                </Button>
              ) : null}
            </fieldset>
          ))}
          {children.length < REQUEST_CHILDREN_MAX ? (
            <Button type="button" variant="outline" className="w-full" onClick={() => setChildren((list) => [...list, { ...blank(), lastName: list[0]?.lastName ?? '' }])} data-testid="add-child">
              <LuPlus /> {t('Add another child', '자녀 추가')}
            </Button>
          ) : null}
          {err('children') ? <p className="text-sm text-destructive">{err('children')}</p> : null}

          <fieldset className="space-y-3 rounded-xl border p-4">
            <legend className="px-1 text-sm font-semibold">{t('Parent or guardian', '부모 또는 보호자')}</legend>
            <TextField id="parent-name" label={t('Your full name', '이름과 성 (영문)')} value={name} onChange={setName} error={err('parentName')} autoComplete="name" />
            <TextField id="parent-email" label={t('Email', '이메일')} value={email} onChange={setEmail} error={err('email')} type="email" autoComplete="email" />
            <TextField id="parent-phone" label={t('Phone', '전화번호')} value={phone} onChange={setPhone} error={err('phone')} type="tel" autoComplete="tel" />
          </fieldset>
          {/* People never see this box: a script filling in every box fills it too. */}
          <input type="text" name="website" value={website} onChange={(e) => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 opacity-0" />

          <p className="text-xs text-muted-foreground">
            {t(
              'Type names in English letters, as the contract writes them. What you type here fills in the contract, and you can still change it there.',
              '이름은 계약서에 적히는 대로 영문으로 입력해 주세요. 여기 적은 내용은 계약서에 미리 채워지고, 서명하기 전에 고칠 수 있어요.',
            )}
          </p>
          {problem ? <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{problem}</p> : null}
          <Button type="submit" size="lg" className="w-full" disabled={busy} data-testid="ask-contract">
            {busy ? <Spinner /> : null} {t('Ask for the contract', '계약서 요청하기')}
          </Button>
          {onBack ? (
            <Button type="button" variant="ghost" className="w-full" onClick={onBack}>
              {t('Back to your request', '요청 화면으로 돌아가기')}
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
  const lang = useLang()
  const t = useT()
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
        navigate(`${r[0].path}?lang=${lang}&from=request`)
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
  }, [check, navigate, lang])

  const rows = kept.requests.map((r, i) => ({ firstName: r.firstName, s: states?.[i] ?? null }))
  const allDone = !!states && states.every((s) => s.state === 'signed' || s.state === 'closed' || s.state === 'unknown')
  return (
    <Shell>
      <Card>
        <h1 className="text-center text-xl font-semibold tracking-tight text-balance">
          {allDone ? t('All done', '모두 마쳤어요') : t('Your request is with the academy', '아카데미에 요청을 보냈어요')}
        </h1>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          {allDone
            ? t('Thank you. The academy has your signed contract, and your copy is in your email.', '감사합니다. 서명한 계약서는 아카데미에 전달됐고, 사본은 이메일로 보내 드렸어요.')
            : t(
                `Keep this page open: each contract opens here as soon as the academy sends it. It’s emailed to ${kept.parent.email} too.`,
                `이 화면을 열어 두세요. 아카데미가 계약서를 보내면 여기서 바로 열려요. ${kept.parent.email} 주소로도 보내 드려요.`,
              )}
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
                <span className="block font-medium">{t(`${firstName}’s contract`, `${firstName} 학생 계약서`)}</span>
                <span className="block text-xs text-muted-foreground">
                  {!s || s.state === 'waiting'
                    ? t('The academy is getting it ready…', '아카데미가 준비하고 있어요…')
                    : s.state === 'ready'
                      ? t('Ready to sign', '서명할 수 있어요')
                      : s.state === 'signed'
                        ? t('Signed', '서명했어요')
                        : t('Please ask at the front desk.', '데스크에 문의해 주세요.')}
                </span>
              </span>
              {s?.state === 'ready' ? (
                <Button size="sm" onClick={() => navigate(`${s.path}?lang=${lang}&from=request`)} data-testid={`sign-${i}`}>
                  {t('Sign', '서명하기')}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
        {offline ? <p className="mt-3 text-center text-xs text-muted-foreground">{t('Checking again as soon as you’re back online…', '인터넷에 다시 연결되면 바로 확인할게요…')}</p> : null}
        <div className="mt-6 grid gap-2">
          <Button variant="outline" onClick={onAnother} data-testid="ask-another">
            <LuPlus /> {t('Ask for another child’s contract', '다른 자녀 계약서 요청하기')}
          </Button>
          {allDone ? (
            <Button variant="ghost" onClick={onClear}>
              {t('Start over', '처음부터 다시')}
            </Button>
          ) : null}
        </div>
      </Card>
    </Shell>
  )
}
