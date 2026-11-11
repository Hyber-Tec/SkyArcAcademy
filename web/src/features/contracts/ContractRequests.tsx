import { doc } from 'firebase/firestore'
import { useMemo, useState } from 'react'
import { LuInbox, LuSearch, LuSend, LuUserPlus, LuX } from 'react-icons/lu'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { isLinkable } from '@shared/access/onFile'
import { childName } from '@shared/contracts/request'
import type { ContractRequest } from '@shared/contracts/types'
import { COL, DOC, ROOT, emailKey } from '@shared/paths'
import { findStudent } from '@shared/studentList'
import { formatDateKey, formatInstant, todayKey } from '@shared/time'
import type { Student, StudentPrivateProfile, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { useConfirm } from '@/components/app/useConfirm'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Spinner } from '@/components/ui/spinner'
import { useStudentList } from '@/features/data/hooks'
import { createStudent, saveStudentInfo } from '@/features/students/api'
import { db } from '@/lib/firebase'
import { useDoc } from '@/lib/firestore'
import { useNow } from '@/lib/useNow'
import { cn } from '@/lib/utils'
import { closeContractRequest, useContractRequests } from './api'
import { SendContractDialog } from './SendContractDialog'

const ms = (t: unknown) => (t as { toMillis?: () => number } | null)?.toMillis?.() ?? 0
const NEW = '__new'

/**
 * Families' requests from the academy's sign (the owner, 2026-11-08, docs/DECISIONS.md §39): the QR code at the front
 * desk opens a page where a parent types each child's name and their own details. Each request waits here (and the
 * office is told at once): the office opens it, picks the student it's for (the one the records suggest, another, or a
 * new one made from it), then sends the contract as it always does (the program, the discounts). The family's phone,
 * still on the page, opens it, filled in from what they typed. A request that isn't a family's is closed.
 */
export function ContractRequests() {
  const { timezone } = useBranch()
  const requests = useContractRequests()
  const now = useNow(60_000)
  // The request open is in the address (`?request=`), so a notice's link opens it.
  const [params, setParams] = useSearchParams()
  const open = params.get('request')
  const setOpen = (id: string | null) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p)
        if (id) next.set('request', id)
        else next.delete('request')
        return next
      },
      { replace: true },
    )
  const waiting = requests.data.filter((r) => r.status === 'waiting').sort((a, b) => ms(a.createdAt) - ms(b.createdAt))
  const recent = requests.data
    .filter((r) => r.status !== 'waiting' && now - ms(r.sentAt ?? r.closedAt ?? r.createdAt) < 14 * 86_400_000)
    .sort((a, b) => ms(b.sentAt ?? b.closedAt) - ms(a.sentAt ?? a.closedAt))
  const opened = requests.data.find((r) => r.id === open) ?? null
  if (!waiting.length && !recent.length && !opened) return null
  const when = (t: unknown) => (ms(t) ? formatInstant(ms(t), timezone, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'just now')
  return (
    <Card data-testid="contract-requests">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LuInbox className="size-4" /> Requests from the academy’s sign
          {waiting.length ? <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-semibold text-white">{waiting.length}</span> : null}
        </CardTitle>
        <CardDescription>
          A parent who scans the sign’s QR code asks for each child’s contract here. Send it, and it opens on their phone, filled in from what they typed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {waiting.length ? (
          <ul className="divide-y rounded-lg border">
            {waiting.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5 text-sm" data-testid="contract-request">
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{childName({ firstName: r.studentFirstName, lastName: r.studentLastName })}</span>
                  <span className="text-muted-foreground"> · asked by {r.parentName}, {when(r.createdAt)}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {r.matchedStudentName ? `On the records: ${r.matchedStudentName}` : 'Not on the records: a new family?'} · {r.email}
                  </span>
                </span>
                <Button size="sm" onClick={() => setOpen(r.id)} data-testid={`open-request-${r.id}`}>
                  <LuSend /> Send the contract
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No request is waiting.</p>
        )}
        {recent.length ? (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">Answered in the last two weeks ({recent.length})</summary>
            <ul className="mt-2 space-y-1 text-muted-foreground">
              {recent.map((r) => (
                <li key={r.id}>
                  {childName({ firstName: r.studentFirstName, lastName: r.studentLastName })}, asked by {r.parentName}: {r.status === 'sent' ? `sent ${when(r.sentAt)} by ${r.sentBy?.name?.split(' ')[0] ?? 'the office'}` : `closed ${when(r.closedAt)}`}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </CardContent>
      {opened ? <RequestDialog key={opened.id} request={opened} onClose={() => setOpen(null)} /> : null}
    </Card>
  )
}

/**
 * One request: who asked, for whom, and the student it's for (the records' suggestion, another student, or a new one
 * made from it, with the parent and the birth date), then the usual Send. The parent goes on the student's record when
 * the record doesn't have their email, so their account finds the child later (§31).
 */
function RequestDialog({ request: r, onClose }: { request: WithId<ContractRequest>; onClose: () => void }) {
  const { branchId, actor, timezone } = useBranch()
  const { confirm, dialog } = useConfirm()
  const students = useStudentList()
  const name = childName({ firstName: r.studentFirstName, lastName: r.studentLastName })
  const [pick, setPick] = useState<string>(r.matchedStudentId ?? NEW)
  const [q, setQ] = useState('')
  const [addParent, setAddParent] = useState(true)
  const [busy, setBusy] = useState(false)
  const [sending, setSending] = useState<WithId<Student> | null>(null)
  const chosen = pick === NEW ? null : (students.data.find((s) => s.id === pick) ?? null)
  const priv = useDoc<StudentPrivateProfile>(chosen ? doc(db, ROOT.branches, branchId, COL.students, chosen.id, 'private', DOC.privateProfile) : null)
  const onRecord = (priv.data?.parents ?? []).some((p) => emailKey(p.email ?? '') === emailKey(r.email))
  const needle = q.trim().toLowerCase()
  const found = useMemo(
    () => (needle.length < 2 ? [] : students.data.filter((s) => isLinkable(s.status) && s.id !== r.matchedStudentId && findStudent(s, needle).found).slice(0, 6)),
    [needle, students.data, r.matchedStudentId],
  )
  const matched = r.matchedStudentId ? students.data.find((s) => s.id === r.matchedStudentId) : null
  const parent = { name: r.parentName, email: r.email, phone: r.phone, relation: '' }

  if (r.status === 'sent' && !sending) {
    return (
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{name}’s contract is sent</DialogTitle>
            <DialogDescription>{`Sent by ${r.sentBy?.name ?? 'the office'}. It opened on ${r.parentName.split(' ')[0]}’s phone and went to ${r.email}.`}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={onClose}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  async function next() {
    setBusy(true)
    try {
      if (pick === NEW) {
        // A new student from the request: their name, the parent, the birth date.
        const id = await createStudent(
          branchId,
          actor,
          { firstName: r.studentFirstName, lastName: r.studentLastName, grade: '', level: null, program: null, signUpDate: todayKey(timezone) },
          { parents: [parent], dob: r.studentDob },
        )
        toast.success(`${name} added to the students`)
        const made = { id, firstName: r.studentFirstName, lastName: r.studentLastName, name } as WithId<Student>
        setSending(made)
        return
      }
      if (!chosen) return
      if (!onRecord && addParent && priv.data) {
        await saveStudentInfo(branchId, actor, chosen, {}, { ...priv.data, parents: [...(priv.data.parents ?? []), parent], dob: priv.data.dob ?? r.studentDob })
      }
      setSending(chosen)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function close() {
    const ok = await confirm({
      title: 'Close this request?',
      description: `No contract is sent. ${r.parentName.split(' ')[0]}’s page says to ask at the front desk. Close requests that aren’t a family’s, or one asked twice.`,
      confirmLabel: 'Close the request',
      destructive: true,
    })
    if (!ok) return
    try {
      await closeContractRequest(branchId, r.id)
      toast.success('Request closed')
      onClose()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  if (sending) return <SendContractDialog student={sending} request={r} onClose={onClose} />

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-lg" data-testid="contract-request-dialog">
        <DialogHeader>
          <DialogTitle>{name}’s contract</DialogTitle>
          <DialogDescription>Asked from the academy’s sign. Check whose it is, then choose the program and any discounts on the next step.</DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[7.5rem_1fr] gap-x-3 gap-y-1.5 rounded-lg border px-3 py-2.5 text-sm">
          <dt className="text-muted-foreground">Student</dt>
          <dd className="font-medium">{name}</dd>
          <dt className="text-muted-foreground">Date of birth</dt>
          <dd>{r.studentDob ? formatDateKey(r.studentDob, 'medium') : '—'}</dd>
          <dt className="text-muted-foreground">Parent</dt>
          <dd>{r.parentName}</dd>
          <dt className="text-muted-foreground">Email</dt>
          <dd className="break-all">{r.email}</dd>
          <dt className="text-muted-foreground">Phone</dt>
          <dd>{r.phone}</dd>
        </dl>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Whose contract is it?</h3>
          <RadioGroup value={pick} onValueChange={setPick} className="gap-1.5" aria-label="Student">
            {matched ? (
              <label htmlFor="req-matched" className="flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm has-data-[state=checked]:border-foreground has-data-[state=checked]:bg-muted/50">
                <RadioGroupItem value={matched.id} id="req-matched" />
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{matched.name}</span>
                  <span className="block text-xs text-muted-foreground">On the academy’s records{matched.grade ? ` · grade ${matched.grade}` : ''}</span>
                </span>
              </label>
            ) : null}
            {chosen && chosen.id !== matched?.id ? (
              <label htmlFor="req-chosen" className="flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm has-data-[state=checked]:border-foreground has-data-[state=checked]:bg-muted/50">
                <RadioGroupItem value={chosen.id} id="req-chosen" />
                <span className="font-medium">{chosen.name}</span>
              </label>
            ) : null}
            <label htmlFor="req-new" className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed px-3 py-2 text-sm has-data-[state=checked]:border-foreground has-data-[state=checked]:bg-muted/50">
              <RadioGroupItem value={NEW} id="req-new" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 font-medium">
                  <LuUserPlus className="size-4" /> Add {name} as a new student
                </span>
                <span className="block text-xs text-muted-foreground">With {r.parentName} as the parent{r.studentDob ? ' and the birth date' : ''}.</span>
              </span>
            </label>
          </RadioGroup>
          <div className="relative">
            <LuSearch className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Someone else? Search the students" className="pl-8" />
          </div>
          {found.length ? (
            <ul className="divide-y rounded-lg border text-sm">
              {found.map((s) => (
                <li key={s.id}>
                  <button type="button" className={cn('w-full px-3 py-2 text-left hover:bg-muted/60', pick === s.id && 'font-semibold')} onClick={() => setPick(s.id)}>
                    {s.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {chosen && priv.data && !onRecord ? (
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-sm">
              <Checkbox checked={addParent} onCheckedChange={(v) => setAddParent(v === true)} className="mt-0.5" />
              <span>
                Add {r.parentName} ({r.email}) to {chosen.firstName || chosen.name}’s parents
                <span className="block text-xs text-muted-foreground">Then their account finds {chosen.firstName || chosen.name} when they sign in to the app.</span>
              </span>
            </label>
          ) : null}
        </section>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" className="text-destructive" onClick={() => void close()}>
            <LuX /> Close the request
          </Button>
          <Button onClick={() => void next()} disabled={busy || (pick !== NEW && !chosen)} data-testid="request-next">
            {busy ? <Spinner /> : null} Next: the program
          </Button>
        </DialogFooter>
        {dialog}
      </DialogContent>
    </Dialog>
  )
}
