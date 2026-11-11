import { useState } from 'react'
import { LuTrash2 } from 'react-icons/lu'
import { toast } from 'sonner'
import { type ScattSession, scattPositionWords } from '@shared/scatt/session'
import { formatDateKey, formatMinutes } from '@shared/time'
import type { WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { useConfirm } from '@/components/app/useConfirm'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { deleteScattSession, useScattTraces } from './api'
import { ScattReplay } from './ScattReplay'

/**
 * A student's SCATT sessions, newest first, one opened at a time with its replay. Staff may delete one filed in the
 * wrong student's folder; families only watch (Goo, 2026-11-10).
 */
export function ScattSessions({ sessions, loading, canDelete }: { sessions: WithId<ScattSession>[]; loading: boolean; canDelete: boolean }) {
  const { branchId, actor } = useBranch()
  const { confirm, dialog } = useConfirm()
  const [openId, setOpenId] = useState<string | null>(null)
  const open = sessions.find((s) => s.id === openId) ?? sessions[0] ?? null
  const traces = useScattTraces(branchId, open?.id ?? null)

  if (loading) return <Skeleton className="h-40 rounded-xl" />
  if (!sessions.length) return null

  async function remove(s: WithId<ScattSession>) {
    const ok = await confirm({
      title: `Delete the SCATT session of ${formatDateKey(s.dateKey, 'medium')}?`,
      description: `Its ${s.matchShots} shots and their traces leave ${s.studentName}'s scores. The SCATT file stays in the Drive; dropping it in again brings the session back.`,
      confirmLabel: 'Delete the session',
      destructive: true,
    })
    if (!ok) return
    try {
      await deleteScattSession(branchId, actor, s)
      toast.success('SCATT session deleted')
      setOpenId(null)
    } catch (e) {
      toast.error('Couldn’t delete the session', { description: (e as Error).message })
    }
  }

  return (
    <div className="space-y-4" data-testid="scatt-sessions">
      <ul className="flex flex-wrap gap-2">
        {sessions.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => setOpenId(s.id)}
              aria-pressed={open?.id === s.id}
              className={cn('rounded-lg border px-3 py-2 text-left text-sm', open?.id === s.id ? 'border-foreground bg-foreground text-background' : 'bg-card hover:bg-muted/60')}
            >
              <span className="block font-medium">
                {formatDateKey(s.dateKey, 'medium')} <span className="font-normal opacity-75">{formatMinutes(s.timeMin)}</span>
              </span>
              <span className="block text-xs opacity-75">
                {s.matchShots} shots{s.total !== null ? ` · ${s.total.toFixed(1)}` : ''}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {open ? (
        <div className="@container space-y-3">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 className="text-base font-semibold">
              {formatDateKey(open.dateKey, 'dayLong')} · {formatMinutes(open.timeMin)}
            </h3>
            <span className="text-sm text-muted-foreground">
              {[
                scattPositionWords(open.position),
                `${open.matchShots} shots${open.sighters ? `, ${open.sighters} sighter${open.sighters === 1 ? '' : 's'}` : ''}`,
                open.total !== null ? `total ${open.total.toFixed(1)} (${open.totalInt})` : null,
                open.averages ? `aiming ${open.averages.aimS.toFixed(1)} s a shot on average` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
            {canDelete ? (
              <Button size="sm" variant="ghost" className="ml-auto text-destructive" onClick={() => void remove(open)}>
                <LuTrash2 /> Delete
              </Button>
            ) : null}
          </div>
          {open.series.length > 1 ? (
            <p className="text-xs text-muted-foreground">
              Series: {open.series.map((x) => `${x.n}: ${x.total.toFixed(1)}`).join(' · ')}
            </p>
          ) : null}
          <ScattReplay key={open.id} session={open} traces={traces.data} loading={traces.loading} />
        </div>
      ) : null}
      {dialog}
    </div>
  )
}
