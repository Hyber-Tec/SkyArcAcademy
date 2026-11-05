import { useMemo, useState } from 'react'
import { LuSend } from 'react-icons/lu'
import { Link } from 'react-router'
import { isLinkable } from '@shared/access/onFile'
import { studentContract } from '@shared/contracts/signing'
import { SIGNED_VIA_LABELS } from '@shared/contracts/types'
import { formatInstant } from '@shared/time'
import type { Student, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useStudentList } from '@/features/data/hooks'
import { cn } from '@/lib/utils'
import { useContractLinks, useContractTemplates, useSignedContracts } from './api'
import { SendContractDialog } from './SendContractDialog'

type RowState = 'signed' | 'waiting' | 'not_sent'
type Row = { student: WithId<Student>; state: RowState; detail: string }

const BADGE: Record<RowState, { label: string; className: string }> = {
  signed: { label: 'Signed', className: 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700/60 dark:bg-emerald-950/40 dark:text-emerald-200' },
  waiting: { label: 'Waiting to sign', className: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200' },
  not_sent: { label: 'Not sent', className: 'border-border text-muted-foreground' },
}

type Show = 'not_sent' | 'waiting' | 'all'

/**
 * Every student's contract (owners and admins; docs/DECISIONS.md §31 and §34): signed (how and when), sent and waiting
 * for a signature (since when), or not sent yet, each with Send, which opens the same dialog as the student's page
 * (the program, the discounts, the email). Every family signs again once the app replaces paper (the manager,
 * 2026-11-04): the office goes down the list.
 */
export function ContractsList() {
  const { timezone } = useBranch()
  const students = useStudentList()
  const links = useContractLinks()
  const signed = useSignedContracts()
  const { current } = useContractTemplates()
  const [show, setShow] = useState<Show>('not_sent')
  const [sending, setSending] = useState<WithId<Student> | null>(null)
  const day = (ms: number) => formatInstant(ms, timezone, { month: 'short', day: 'numeric', year: 'numeric' })

  const rows = useMemo<Row[]>(() => {
    const byStudent = new Map(signed.data.map((s) => [s.id, s]))
    return students.data
      .filter((s) => isLinkable(s.status))
      .map((s): Row => {
        const c = studentContract(links.data.filter((l) => l.studentId === s.id))
        if (c.waiting) return { student: s, state: 'waiting', detail: `Sent ${c.waiting.createdAt?.toMillis ? day(c.waiting.createdAt.toMillis()) : 'today'} by ${c.waiting.createdBy?.name?.split(' ')[0] || 'the office'}` }
        const sc = byStudent.get(s.id)
        if (sc) {
          const when = sc.signedAt?.toMillis ? day(sc.signedAt.toMillis()) : 'just now'
          return { student: s, state: 'signed', detail: `${SIGNED_VIA_LABELS[sc.via][0].toUpperCase()}${SIGNED_VIA_LABELS[sc.via].slice(1)}, ${when}${sc.signerName ? `, by ${sc.signerName}` : ''}` }
        }
        return { student: s, state: 'not_sent', detail: c.withdrawn ? 'Withdrawn: send it again' : 'Not sent yet' }
      })
    // `day` reads the time zone, which the deps hold.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students.data, links.data, signed.data, timezone])

  const count = (st: RowState) => rows.filter((r) => r.state === st).length
  const shown = show === 'all' ? rows : rows.filter((r) => r.state === show)
  const loading = students.loading || links.loading || signed.loading
  const SHOW: { key: Show; label: string }[] = [
    { key: 'not_sent', label: `Not sent (${count('not_sent')})` },
    { key: 'waiting', label: `Waiting (${count('waiting')})` },
    { key: 'all', label: 'Everyone' },
  ]

  return (
    <Card data-testid="contracts-list">
      <CardHeader>
        <CardTitle>Families’ contracts</CardTitle>
        <CardDescription>
          {loading ? 'Counting…' : `${count('signed')} of ${rows.length} students signed · ${count('waiting')} sent and waiting · ${count('not_sent')} not sent yet.`} Send each family their contract here or from the student’s page.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show">
          {SHOW.map((k) => (
            <button
              key={k.key}
              type="button"
              onClick={() => setShow(k.key)}
              aria-pressed={show === k.key}
              className={cn('h-7 rounded-full border px-3 text-xs font-medium', show === k.key ? 'border-foreground bg-foreground text-background' : 'text-muted-foreground hover:bg-muted')}
            >
              {k.label}
            </button>
          ))}
        </div>
        {loading ? (
          <Skeleton className="h-24 w-full" />
        ) : shown.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
            {!rows.length ? 'No students yet.' : show === 'not_sent' ? 'Every family has their contract.' : show === 'waiting' ? 'No contract is waiting for a signature.' : 'No students yet.'}
          </p>
        ) : (
          <ul className="divide-y rounded-lg border text-sm">
            {shown.map((r) => (
              <li key={r.student.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2" data-testid={`contracts-row-${r.student.id}`}>
                <Link to={`/admin/students/${r.student.id}`} className="min-w-0 flex-1 truncate font-medium underline-offset-2 hover:underline sm:w-44 sm:flex-none">
                  {r.student.name}
                </Link>
                <span className="order-last min-w-0 basis-full truncate text-xs text-muted-foreground sm:order-none sm:flex-1 sm:basis-auto" title={r.detail}>
                  {r.detail}
                </span>
                <span className={cn('inline-flex h-6 shrink-0 items-center rounded-full border px-2.5 text-xs font-medium', BADGE[r.state].className)}>{BADGE[r.state].label}</span>
                {r.state !== 'waiting' && current ? (
                  <Button size="sm" variant={r.state === 'not_sent' ? 'default' : 'ghost'} className="h-7" onClick={() => setSending(r.student)} data-testid={`contracts-send-${r.student.id}`}>
                    <LuSend /> {r.state === 'signed' ? 'New' : 'Send'}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      {sending ? <SendContractDialog student={sending} onClose={() => setSending(null)} /> : null}
    </Card>
  )
}
