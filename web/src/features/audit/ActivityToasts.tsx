import { limit, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { COL } from '@shared/paths'
import type { AuditEntry } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { actorLabel } from '@/lib/audit'
import { branchCol } from '@/lib/firestore'

const TITLES: Record<string, string> = {
  'session.create': 'Class created',
  'session.move': 'Class moved',
  'session.status': 'Status updated',
  'session.coach': 'Coach changed',
  'session.subject': 'Subject changed',
  'session.note': 'Note updated',
  'session.update': 'Class updated',
  'session.delete': 'Class deleted',
  'session.restore': 'Class restored',
  'schedule.duplicate_week': 'Week duplicated',
  'event.create': 'Event created',
  'event.move': 'Event moved',
  'event.update': 'Event updated',
  'event.delete': 'Event deleted',
  'dayConfig.update': 'Day updated',
  'request.offer': 'Another class suggested',
  'request.reject': 'Request declined',
}

/**
 * Collaboration awareness (True Education's schedule toasts): when another admin
 * changes the schedule, everyone with the admin portal open gets a toast.
 */
export function ActivityToasts() {
  const { branchId, actor } = useBranch()
  const mountedAt = useRef(Date.now())
  useEffect(() => {
    const q = query(branchCol(branchId, COL.auditLog), where('category', 'in', ['schedule', 'event']), orderBy('at', 'desc'), limit(5))
    return onSnapshot(
      q,
      (snap) => {
        for (const change of snap.docChanges()) {
          if (change.type !== 'added') continue
          const e = change.doc.data() as AuditEntry
          const at = e.at?.toMillis?.() ?? Date.now()
          if (at < mountedAt.current || e.actorEmail === actor.email) continue
          toast(TITLES[e.action] ?? 'Schedule update', {
            // Automatic changes already say so ("…automatically"); people are named.
            description: `${e.summary}${e.context ? ` — ${e.context}` : ''}${e.actorRole === 'system' || e.actorEmail === 'system' ? '' : ` · by ${actorLabel(e)}`}`,
            duration: 5 * 60 * 1000,
            closeButton: true,
          })
        }
      },
      () => undefined,
    )
  }, [branchId, actor.email])
  return null
}
