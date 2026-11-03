import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { isLinkable } from '@shared/access/onFile'
import { SIGNED_VIA_LABELS } from '@shared/contracts/types'
import { formatInstant } from '@shared/time'
import { useBranch } from '@/branch/BranchProvider'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useMembers, useStudentList } from '@/features/data/hooks'
import { cn } from '@/lib/utils'
import { useSignedContracts } from './api'

type Row = { id: string; name: string; state: 'signed' | 'waiting' | 'no_app'; detail: string }

const BADGE: Record<Row['state'], { label: string; className: string }> = {
  signed: { label: 'Signed', className: 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700/60 dark:bg-emerald-950/40 dark:text-emerald-200' },
  waiting: { label: 'Not signed', className: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200' },
  no_app: { label: 'No parent in the app', className: 'border-border text-muted-foreground' },
}

/**
 * Who has signed the enrollment contract (owners and admins; docs/DECISIONS.md §31): every student at the academy,
 * signed (how and when), not signed though a parent has the app (they're asked to sign before using it), or with no
 * parent in the app yet (the office sends a link, or marks one signed on paper, from the student's page).
 */
export function ContractsList() {
  const { timezone } = useBranch()
  const students = useStudentList()
  const members = useMembers()
  const signed = useSignedContracts()
  const [show, setShow] = useState<'all' | 'unsigned'>('unsigned')

  const rows = useMemo<Row[]>(() => {
    const byStudent = new Map(signed.data.map((s) => [s.id, s]))
    const inApp = new Map<string, string[]>()
    for (const m of members.data) {
      if (m.status !== 'active') continue
      const ids = m.role === 'parent' ? (m.studentIds ?? []) : m.role === 'student' && m.studentId ? [m.studentId] : []
      for (const id of ids) inApp.set(id, [...(inApp.get(id) ?? []), m.email])
    }
    return students.data
      .filter((s) => isLinkable(s.status))
      .map((s): Row => {
        const sc = byStudent.get(s.id)
        if (sc) {
          const when = sc.signedAt?.toMillis ? formatInstant(sc.signedAt.toMillis(), timezone, { month: 'short', day: 'numeric', year: 'numeric' }) : 'just now'
          return { id: s.id, name: s.name, state: 'signed', detail: `${SIGNED_VIA_LABELS[sc.via][0].toUpperCase()}${SIGNED_VIA_LABELS[sc.via].slice(1)}, ${when}${sc.signerName ? `, by ${sc.signerName}` : ''}` }
        }
        const emails = inApp.get(s.id) ?? []
        return emails.length ? { id: s.id, name: s.name, state: 'waiting', detail: `In the app: ${emails.join(', ')}` } : { id: s.id, name: s.name, state: 'no_app', detail: 'Send a link from their page, or mark a paper one signed' }
      })
  }, [students.data, members.data, signed.data, timezone])

  const count = (st: Row['state']) => rows.filter((r) => r.state === st).length
  const shown = show === 'all' ? rows : rows.filter((r) => r.state !== 'signed')
  const loading = students.loading || members.loading || signed.loading

  return (
    <Card data-testid="contracts-list">
      <CardHeader>
        <CardTitle>Who has signed</CardTitle>
        <CardDescription>
          {loading ? 'Counting…' : `${count('signed')} of ${rows.length} students signed · ${count('waiting')} not signed though a parent has the app · ${count('no_app')} with no parent in the app yet.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-1.5" role="group" aria-label="Show">
          {(['unsigned', 'all'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setShow(k)}
              aria-pressed={show === k}
              className={cn('h-7 rounded-full border px-3 text-xs font-medium', show === k ? 'border-foreground bg-foreground text-background' : 'text-muted-foreground hover:bg-muted')}
            >
              {k === 'unsigned' ? 'Not signed' : 'Everyone'}
            </button>
          ))}
        </div>
        {loading ? (
          <Skeleton className="h-24 w-full" />
        ) : shown.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">{rows.length ? 'Every student’s contract is signed.' : 'No students yet.'}</p>
        ) : (
          <ul className="divide-y rounded-lg border text-sm">
            {shown.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                <Link to={`/admin/students/${r.id}`} className="min-w-0 flex-1 truncate font-medium underline-offset-2 hover:underline sm:w-44 sm:flex-none">
                  {r.name}
                </Link>
                <span className="order-last min-w-0 basis-full truncate text-xs text-muted-foreground sm:order-none sm:flex-1 sm:basis-auto" title={r.detail}>
                  {r.detail}
                </span>
                <span className={cn('inline-flex h-6 shrink-0 items-center rounded-full border px-2.5 text-xs font-medium', BADGE[r.state].className)}>{BADGE[r.state].label}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
