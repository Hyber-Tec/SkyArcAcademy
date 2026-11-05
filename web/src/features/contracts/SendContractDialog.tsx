import { doc } from 'firebase/firestore'
import { useMemo, useState } from 'react'
import { LuCheck, LuMail, LuSend, LuSmartphone } from 'react-icons/lu'
import { academyChecks, dollarsText, parseContract, pricedChoice } from '@shared/contracts/document'
import { type ContractValues, optionHeading, optionPrices, suggestedOption, tuitionOf, tuitionText } from '@shared/contracts/fill'
import type { ContractSendResult } from '@shared/contracts/types'
import { COL, DOC, ROOT, emailKey } from '@shared/paths'
import type { Student, StudentPrivateProfile, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { useMembers } from '@/features/data/hooks'
import { db } from '@/lib/firebase'
import { useDoc } from '@/lib/firestore'
import { cn } from '@/lib/utils'
import { sendContract, useContractTemplates, useSignedContract } from './api'
import { ContractQr } from './ContractQr'
import { linkHere } from './links'

/** Why a contract wasn't emailed, and what to do instead. */
const NOT_EMAILED: Record<Exclude<ContractSendResult['emailed'], 'sent' | 'off'>, string> = {
  demo: 'The demo academy doesn’t send email.',
  test_address: 'Those are test addresses, which never get email.',
  not_configured: 'Email isn’t set up yet, so it wasn’t emailed.',
  failed: 'The email didn’t go. Show them the QR code, or copy the link and text it.',
  no_address: 'There’s no email on the student’s record.',
}

/** A student's parents as the office knows them, and whether each has the app (signs in to it). */
function useRecipients(student: WithId<Student>) {
  const { branchId } = useBranch()
  const priv = useDoc<StudentPrivateProfile>(doc(db, ROOT.branches, branchId, COL.students, student.id, 'private', DOC.privateProfile))
  const members = useMembers()
  return useMemo(() => {
    const inApp = new Map(members.data.filter((m) => m.status === 'active' && m.role === 'parent' && (m.studentIds ?? []).includes(student.id)).map((m) => [emailKey(m.email), m]))
    const parents = (priv.data?.parents ?? []).filter((p) => p.name.trim() || p.email.trim())
    const rows = parents.map((p) => ({ name: p.name.trim() || p.email, relation: p.relation, email: emailKey(p.email ?? ''), inApp: inApp.has(emailKey(p.email ?? '')) }))
    // A parent in the app the record doesn't list (given access by hand).
    for (const [email, m] of inApp) if (!rows.some((r) => r.email === email)) rows.push({ name: m.displayName || email, relation: '', email, inApp: true })
    return { loading: priv.loading || members.loading, rows, studentEmail: priv.data?.email?.trim() ?? '' }
  }, [priv.data, priv.loading, members.data, members.loading, student.id])
}

/**
 * "Send the contract" (owners and admins, docs/DECISIONS.md §34): the office picks the program it suggests (the
 * family can choose another) and checks the discounts (only the office can), sees the price after them and who gets
 * it (the parents on the record, whether each has the app), and whether to email them too (off at first: the parents
 * in the app are told there). Sending withdraws a contract still waiting. Then its QR code, for a parent at the front
 * desk to scan.
 */
export function SendContractDialog({ student, start = null, onClose }: { student: WithId<Student>; start?: ContractValues | null; onClose: () => void }) {
  const { branchId, isDemo } = useBranch()
  const { current, loading } = useContractTemplates()
  const signed = useSignedContract(student.id)
  const recipients = useRecipients(student)
  const text = current?.text ?? ''
  const contract = useMemo(() => parseContract(text).doc, [text])
  const choice = pricedChoice(contract)
  const boxes = academyChecks(contract)
  const first = student.firstName || student.name.split(' ')[0]
  const lastChosen = choice && typeof signed.data?.values?.[choice.id] === 'string' ? (signed.data.values[choice.id] as string) : null
  // Sending again starts from what was sent: its program (or the family's choice) and its discounts.
  const [program, setProgram] = useState<string | null>(() => (start ? (Object.values(start).find((v): v is string => typeof v === 'string') ?? '') : null))
  const [discounts, setDiscounts] = useState<Record<string, string[]>>(() => Object.fromEntries(Object.entries(start ?? {}).filter((e): e is [string, string[]] => Array.isArray(e[1]))))
  const [email, setEmail] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ContractSendResult | null>(null)

  const picked = program ?? (choice ? suggestedOption(contract, [lastChosen, student.level, student.program]) : '')
  const preset: ContractValues = { ...(choice && picked ? { [choice.id]: picked } : {}), ...discounts }
  const prices = optionPrices(contract, preset)
  const tuition = tuitionOf(contract, preset)
  const inApp = recipients.rows.filter((r) => r.inApp)
  const emails = recipients.rows.map((r) => r.email).filter((e) => e.includes('@'))
  const ready = !loading && !signed.loading && !recipients.loading

  async function send() {
    setBusy(true)
    setError(null)
    try {
      setResult(await sendContract({ branchId, studentId: student.id, preset, email }))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (result) {
    const url = linkHere(result.url)
    return (
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-md" data-testid="contract-sent">
          <DialogHeader>
            <DialogTitle>{first}’s contract is sent</DialogTitle>
            <DialogDescription>It waits for a parent’s signature in the app, on the website, or with this QR code.</DialogDescription>
          </DialogHeader>
          <ul className="space-y-1.5 text-sm">
            <li className="flex items-start gap-2">
              <LuSmartphone className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              {result.told.length ? `In the app: ${result.told.join(', ')} ${result.told.length > 1 ? 'were' : 'was'} told.` : 'No parent has the app yet: show them the QR code, or send the email.'}
            </li>
            {result.emailed !== 'off' ? (
              <li className="flex items-start gap-2">
                {result.emailed === 'sent' ? <LuCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" /> : <LuMail className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
                {result.emailed === 'sent' ? `Emailed to ${result.emailedTo.join(', ')}.` : NOT_EMAILED[result.emailed]}
              </li>
            ) : null}
          </ul>
          <ContractQr url={url} firstName={first} />
          <DialogFooter>
            <Button className="w-full sm:w-auto" onClick={onClose}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-lg" data-testid="contract-send">
        <DialogHeader>
          <DialogTitle>{start ? `Change ${first}’s contract and send it again` : `Send ${first}’s enrollment contract`}</DialogTitle>
          <DialogDescription>
            {start ? 'The one waiting is withdrawn as this one goes. ' : ''}Choose the program and the discounts. {first}’s parent reads the contract, can pick another program, and signs it in the app, on the website, or by scanning its QR code here.
          </DialogDescription>
        </DialogHeader>

        {!ready ? (
          <Skeleton className="h-64 w-full" />
        ) : !current ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">The academy’s contract isn’t set up yet.</p>
        ) : (
          <div className="space-y-5">
            {choice ? (
              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Program</h3>
                <RadioGroup value={picked} onValueChange={setProgram} className="gap-1.5" aria-label="Program">
                  {choice.options.map((o) => {
                    const { name, sub } = optionHeading(o.title)
                    const p = prices.get(o.id)
                    return (
                      <label key={o.id} htmlFor={`send-${o.id}`} className="flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 hover:bg-muted/40 has-data-[state=checked]:border-foreground has-data-[state=checked]:bg-muted/50" data-testid={`send-program-${o.id}`}>
                        <RadioGroupItem value={o.id} id={`send-${o.id}`} />
                        <span className="min-w-0 flex-1 leading-tight">
                          <span className="block text-sm font-semibold">{name}</span>
                          {sub ? <span className="block text-[11px] tracking-wider text-muted-foreground">{sub}</span> : null}
                        </span>
                        <span className="text-right text-sm leading-tight tabular-nums">
                          {p?.was ? <span className="block text-xs text-muted-foreground line-through">{p.was}</span> : null}
                          <span className="font-semibold">{p?.now ?? o.price}</span>
                        </span>
                      </label>
                    )
                  })}
                  <label htmlFor="send-none" className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed px-3 py-2 text-sm hover:bg-muted/40 has-data-[state=checked]:border-foreground">
                    <RadioGroupItem value="" id="send-none" />
                    Let the family choose
                  </label>
                </RadioGroup>
              </section>
            ) : null}

            {boxes.map((b) => (
              <section key={b.id} className="space-y-2">
                <h3 className="text-sm font-semibold">{b.label}</h3>
                <div className="divide-y rounded-lg border">
                  {b.options.map((o) => {
                    const list = discounts[b.id] ?? []
                    const left = !!picked && o.except.includes(picked)
                    return (
                      <label key={o.id} className={cn('flex cursor-pointer items-start gap-3 px-3 py-2.5 text-sm hover:bg-muted/40', left && 'text-muted-foreground')} data-testid={`send-discount-${o.id}`}>
                        <Checkbox checked={list.includes(o.id)} className="mt-0.5" onCheckedChange={(v) => setDiscounts((d) => ({ ...d, [b.id]: v === true ? [...list, o.id] : list.filter((x) => x !== o.id) }))} />
                        <span className="min-w-0 flex-1">
                          {o.text}
                          {left ? <span className="block text-xs">Doesn’t apply to the program chosen.</span> : null}
                        </span>
                        {o.amount !== null ? <span className="whitespace-nowrap tabular-nums">−{dollarsText(o.amount)}</span> : null}
                      </label>
                    )
                  })}
                </div>
                <p className="text-xs text-muted-foreground">Only the office checks these: the family sees them, and can’t change them.</p>
              </section>
            ))}

            {tuition ? (
              <div className="flex items-baseline justify-between gap-3 rounded-lg bg-muted/60 px-3 py-2.5 text-sm" data-testid="send-tuition">
                <span className="font-medium">{tuition.label.replace(/\s*\(\$\)\s*$/, '')}</span>
                <span className="text-right font-semibold tabular-nums">{tuitionText(tuition)}</span>
              </div>
            ) : null}

            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Goes to</h3>
              {recipients.rows.length ? (
                <ul className="divide-y rounded-lg border text-sm">
                  {recipients.rows.map((r) => (
                    <li key={r.email || r.name} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2">
                      <span className="min-w-0 flex-1">
                        <span className="font-medium">{r.name}</span>
                        {r.relation ? <span className="text-muted-foreground"> ({r.relation.toLowerCase()})</span> : null}
                        {r.email ? <span className="block truncate text-xs text-muted-foreground">{r.email}</span> : null}
                      </span>
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', r.inApp ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200' : 'bg-muted text-muted-foreground')}>
                        {r.inApp ? 'Has the app' : 'Not in the app yet'}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No parent on {first}’s record. Show the QR code after sending, or add a parent on the Info tab first.</p>
              )}
              <label className="flex cursor-pointer items-start justify-between gap-4 rounded-lg border px-3 py-2.5" data-testid="send-email">
                <span className="text-sm">
                  <span className="block font-medium">Also email them the link</span>
                  <span className="block text-xs text-muted-foreground">
                    {!emails.length && !recipients.studentEmail
                      ? 'There’s no email on the record.'
                      : !inApp.length
                        ? 'No parent has the app yet: turn this on, or show them the QR code.'
                        : 'The parents in the app are told there either way.'}
                    {isDemo ? ' The demo academy doesn’t send email.' : ''}
                  </span>
                </span>
                <Switch checked={email} onCheckedChange={setEmail} disabled={!emails.length && !recipients.studentEmail} aria-label="Also email them the link" />
              </label>
            </section>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void send()} disabled={busy || !ready || !current} data-testid="send-contract">
            {busy ? <Spinner /> : <LuSend />} {start ? 'Send it again' : 'Send the contract'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
