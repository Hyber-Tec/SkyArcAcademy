import { getDoc, getDocs, query, where } from 'firebase/firestore'
import { useMemo, useState } from 'react'
import { LuRotateCcw, LuTrash2 } from 'react-icons/lu'
import { toast } from 'sonner'
import { COL } from '@shared/paths'
import { formatDateKey, formatInstant, formatTimeRange } from '@shared/time'
import type { AcademyClass, Session, TimestampLike, WithId } from '@shared/types'
import { ContextMenuFor, menu } from '@/components/app/ItemMenu'
import { useConfirm } from '@/components/app/useConfirm'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { branchCol, branchDocRef, useQuery } from '@/lib/firestore'
import { type ScheduleCtx, purgeSessions, restoreSession } from '../api'
import { purgeClasses, restoreClass, restoreSeat } from '../classApi'

type Row =
  | { kind: 'class'; id: string; at: number; c: WithId<AcademyClass>; seats: WithId<Session>[] }
  | { kind: 'seat'; id: string; at: number; s: WithId<Session> }

const ms = (t: TimestampLike | null | undefined) => t?.toMillis?.() ?? 0

/** The Trash: removed classes (with the students removed with them) and students taken out of a class. */
export function TrashDialog({ open, onOpenChange, ctx }: { open: boolean; onOpenChange: (o: boolean) => void; ctx: ScheduleCtx }) {
  const classQ = useMemo(() => (open ? query(branchCol(ctx.branchId, COL.classes), where('isDeleted', '==', true)) : null), [open, ctx.branchId])
  const seatQ = useMemo(() => (open ? query(branchCol(ctx.branchId, COL.sessions), where('isDeleted', '==', true)) : null), [open, ctx.branchId])
  const classes = useQuery<AcademyClass>(classQ, `trash-classes-${ctx.branchId}`)
  const seats = useQuery<Session>(seatQ, `trash-${ctx.branchId}`)
  const [busy, setBusy] = useState(false)
  const { confirm, dialog: confirmDialog } = useConfirm()

  const rows = useMemo<Row[]>(() => {
    const gone = new Set(classes.data.map((c) => c.id))
    const out: Row[] = classes.data.map((c) => ({ kind: 'class', id: c.id, at: ms(c.deletedAt), c, seats: seats.data.filter((s) => s.classId === c.id) }))
    for (const s of seats.data) if (!s.classId || !gone.has(s.classId)) out.push({ kind: 'seat', id: s.id, at: ms(s.deletedAt), s })
    return out.sort((a, b) => b.at - a.at)
  }, [classes.data, seats.data])

  async function act(fn: () => Promise<unknown>, ok: string) {
    setBusy(true)
    try {
      await fn()
      toast.success(ok)
    } catch (e) {
      toast.error((e as Error).message.includes('permission') ? 'Past classes can’t be restored.' : (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const restore = (r: Row) =>
    r.kind === 'class'
      ? act(() => restoreClass(ctx, r.c, r.seats), 'Class restored')
      : act(async () => {
          const s = r.s
          // A seat from before classes were taught together has no class: it comes back as it was.
          if (!s.classId) return restoreSession(ctx, s)
          const [c, inIt] = await Promise.all([
            getDoc(branchDocRef(ctx.branchId, COL.classes, s.classId)),
            getDocs(query(branchCol(ctx.branchId, COL.sessions), where('classId', '==', s.classId))),
          ])
          return restoreSeat(
            ctx,
            s,
            c.exists() ? ({ id: c.id, ...(c.data() as AcademyClass) } as WithId<AcademyClass>) : null,
            inIt.docs.map((d) => ({ id: d.id, ...(d.data() as Session) }) as WithId<Session>),
          )
        }, 'Student restored')
  const purge = (list: Row[]) =>
    act(async () => {
      const cls = list.flatMap((r) => (r.kind === 'class' ? [r] : []))
      if (cls.length) await purgeClasses(ctx, cls.map((r) => r.c), cls.flatMap((r) => r.seats))
      const loose = list.flatMap((r) => (r.kind === 'seat' ? [r.s] : []))
      if (loose.length) await purgeSessions(ctx, loose)
    }, list.length === 1 ? 'Deleted permanently' : 'Trash emptied')
  const purgeOne = async (r: Row) => {
    if (await confirm({ title: r.kind === 'class' ? 'Delete this class for good?' : 'Delete this for good?', description: 'This can’t be undone.', confirmLabel: 'Delete for good', destructive: true })) void purge([r])
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85svh] overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Trash <Badge variant="secondary">{rows.length}</Badge>
          </DialogTitle>
          <DialogDescription>Removed classes and students. Items older than {ctx.settings.trash.retentionDays} days are removed automatically.</DialogDescription>
        </DialogHeader>
        {rows.length > 0 ? (
          <div className="flex justify-end">
            <Button
              variant="destructive"
              size="sm"
              disabled={busy}
              onClick={async () => {
                const ok = await confirm({ title: 'Empty the Trash?', description: 'Everything in it is deleted for good. This can’t be undone.', confirmLabel: 'Empty Trash', destructive: true })
                if (ok) void purge(rows)
              }}
            >
              Empty Trash
            </Button>
          </div>
        ) : null}
        <div className="-mx-2 max-h-[60svh] divide-y overflow-y-auto">
          {rows.map((r) => {
            const t = r.kind === 'class' ? r.c : r.s
            const title = r.kind === 'class' ? `Class · ${r.seats.length} ${r.seats.length === 1 ? 'student' : 'students'}` : r.s.studentName
            return (
              <ContextMenuFor
                key={`${r.kind}-${r.id}`}
                disabled={busy}
                entries={menu(
                  { kind: 'label', label: `${title} · ${formatDateKey(t.dateKey, 'weekdayMedium')}` },
                  { label: 'Restore', icon: LuRotateCcw, onSelect: () => void restore(r) },
                  { label: 'Delete permanently', icon: LuTrash2, destructive: true, separatorBefore: true, onSelect: () => void purgeOne(r) },
                )}
              >
                <div className="flex flex-col gap-2 px-2 py-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="truncate font-semibold">{title}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatDateKey(t.dateKey, 'weekdayMedium')} · {formatTimeRange(t.startMin, t.endMin)}
                      {r.kind === 'class' && r.seats.length ? ` · ${r.seats.map((s) => s.studentName).join(', ')}` : ''}
                    </div>
                    {t.deletedAt ? (
                      <div className="text-xs text-muted-foreground">
                        Deleted {formatInstant(t.deletedAt.toDate(), ctx.timezone)}
                        {t.deletedBy ? ` by ${t.deletedBy}` : ''}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="text-destructive" disabled={busy} onClick={() => void purgeOne(r)}>
                      Delete
                    </Button>
                    <Button size="sm" disabled={busy} onClick={() => void restore(r)}>
                      Restore
                    </Button>
                  </div>
                </div>
              </ContextMenuFor>
            )
          })}
          {!classes.loading && !seats.loading && rows.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">The Trash is empty.</p> : null}
        </div>
      </DialogContent>
      {confirmDialog}
    </Dialog>
  )
}
