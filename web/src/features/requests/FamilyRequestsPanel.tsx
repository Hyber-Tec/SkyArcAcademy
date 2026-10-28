import { useMemo, useState } from 'react'
import { LuCalendarPlus, LuX } from 'react-icons/lu'
import { toast } from 'sonner'
import { MAKEUP_LOOKBACK_DAYS, makeupsLost, makeupsOwed } from '@shared/schedule/classes'
import { REQUEST_STATUS_LABELS, requestHorizon, requestLine } from '@shared/schedule/requests'
import { addDays, formatDateKey, formatMinutes, todayKey } from '@shared/time'
import { useBranch } from '@/branch/BranchProvider'
import { useConfirm } from '@/components/app/useConfirm'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { type Family, useFamilySessions } from '@/features/family/data'
import { KidMark } from '@/features/family/FamilyWidgets'
import { useNow } from '@/lib/useNow'
import { cn } from '@/lib/utils'
import { requestError, withdrawRequest } from './api'
import type { AskPreset } from './AskForClassDialog'
import { useFamilyRequests } from './hooks'

const millis = (t: unknown) => (t && typeof t === 'object' && 'toMillis' in t ? (t as { toMillis: () => number }).toMillis() : 0)
/** Answered requests stay listed this long. */
const RECENT_MS = 14 * 86_400_000

const TONE = {
  pending: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  approved: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
  rejected: 'bg-muted text-muted-foreground',
  withdrawn: 'bg-muted text-muted-foreground',
} as const

/**
 * Parent and Student → Classes, at the top: makeups still owed (each with "Ask for a makeup"), makeups missed (their
 * credit is lost), and the family's requests with the academy's answers. Nothing shows when there's nothing to say.
 */
export function FamilyRequestsPanel({ family, ids, onAsk }: { family: Family; ids: string[]; onAsk: (p: AskPreset) => void }) {
  const { branchId, timezone, settings } = useBranch()
  const { confirm, dialog } = useConfirm()
  const today = todayKey(timezone)
  const since = addDays(today, -MAKEUP_LOOKBACK_DAYS)
  // Classes canceled ahead count too (a makeup is owed as soon as a class is canceled).
  const seats = useFamilySessions(ids, since, requestHorizon(today, settings))
  const requests = useFamilyRequests(ids)
  const [busy, setBusy] = useState<string | null>(null)
  const now = useNow(60_000)

  const owed = useMemo(() => makeupsOwed(seats.data, since), [seats.data, since])
  const lost = useMemo(() => makeupsLost(seats.data, since), [seats.data, since])
  const asked = new Set(requests.data.filter((r) => r.status === 'pending').map((r) => r.forSessionId))
  const shown = requests.data.filter((r) => r.status === 'pending' || now - millis(r.decidedAt ?? r.updatedAt) < RECENT_MS)
  const several = family.kids.length > 1
  if (!owed.length && !lost.length && !shown.length) return null

  async function withdraw(id: string) {
    if (!(await confirm({ title: 'Withdraw this request?', description: 'The academy won’t see it anymore. You can ask again any time.', confirmLabel: 'Withdraw' }))) return
    setBusy(id)
    try {
      await withdrawRequest(branchId, id)
      toast.success('Request withdrawn')
    } catch (e) {
      toast.error('Couldn’t withdraw it', { description: requestError(e, 'Please try again.') })
    } finally {
      setBusy(null)
    }
  }

  const kid = (studentId: string) =>
    several ? <KidMark name={family.firstName(studentId)} tint={family.tint(studentId)} className="size-5 shrink-0 text-[10px]" /> : null

  return (
    <section className="mb-4 overflow-hidden rounded-xl border bg-card" data-testid="family-requests">
      {owed.length ? (
        <div className="border-b px-4 py-3 last:border-b-0">
          <h2 className="text-sm font-semibold">Makeups to book</h2>
          <ul className="mt-2 space-y-2">
            {owed.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
                {kid(s.studentId)}
                <span className="min-w-0 flex-1">
                  {several ? `${family.firstName(s.studentId)}: ` : ''}
                  {formatDateKey(s.dateKey, 'weekdayMedium')}, {formatMinutes(s.startMin)} <span className="text-muted-foreground">({s.status === 'no_show' ? 'missed' : 'canceled'})</span>
                </span>
                {asked.has(s.id) ? (
                  <span className="text-xs text-muted-foreground">Asked, waiting for the academy</span>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => onAsk({ studentId: s.studentId, kind: 'makeup', forSessionId: s.id })}>
                    <LuCalendarPlus /> Ask for a makeup
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {shown.length ? (
        <div className="border-b px-4 py-3 last:border-b-0">
          <h2 className="text-sm font-semibold">Requests</h2>
          <ul className="mt-2 space-y-2.5">
            {shown.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start gap-x-3 gap-y-1.5 text-sm">
                {kid(r.studentId)}
                <span className="min-w-0 flex-1">
                  <span className="block">
                    {several ? `${family.firstName(r.studentId)}: ` : ''}
                    {requestLine(r)}
                  </span>
                  {r.status === 'rejected' && r.decisionNote ? <span className="mt-0.5 block text-muted-foreground">“{r.decisionNote}”</span> : null}
                </span>
                <Badge variant="secondary" className={cn('border-0', TONE[r.status])}>
                  {REQUEST_STATUS_LABELS[r.status]}
                </Badge>
                {r.status === 'pending' ? (
                  <Button size="sm" variant="ghost" className="-my-1 text-muted-foreground" disabled={busy === r.id} onClick={() => void withdraw(r.id)}>
                    <LuX /> Withdraw
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {lost.length ? (
        <div className="px-4 py-3 text-sm text-muted-foreground">
          {lost.map((s) => {
            const was = /(\d+)\/(\d+)/.exec(s.note ?? '')
            const missedOn = formatDateKey(s.dateKey, 'monthDay')
            const forDay = was ? `${was[1]}/${was[2]}` : ''
            return (
              <p key={s.id}>
                {several ? `${family.firstName(s.studentId)}: ` : ''}the makeup{forDay ? ` for ${forDay}` : ''} was missed on {missedOn}, so it counts as used.
              </p>
            )
          })}
        </div>
      ) : null}
      {dialog}
    </section>
  )
}
