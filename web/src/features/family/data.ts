import { type DocumentData, type Query, onSnapshot, query, where } from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import { COL } from '@shared/paths'
import type { ProgressReportDoc } from '@shared/reports/types'
import { type DateKey, addDays, formatDateKey } from '@shared/time'
import type { BranchContact, Session, Student, WithId } from '@shared/types'
import { useAuth } from '@/auth/AuthProvider'
import { useBranch } from '@/branch/BranchProvider'
import { useInbox } from '@/features/notifications/NotificationBell'
import { reportSeenKey } from '@/features/reports/model'
import { branchCol, branchDocRef } from '@/lib/firestore'
import { usePublicProfile } from '@/lib/publicProfile'

/** Parents see their linked children; students see themselves (also while an admin previews them). */
export function useLinkedStudentIds(mode: 'parent' | 'student'): string[] {
  const { studentId, studentIds } = useBranch()
  const key = mode === 'student' ? (studentId ?? '') : studentIds.join(',')
  return useMemo(() => (key ? [...new Set(key.split(','))] : []), [key])
}

/** Live student docs by ID (one listener each; the rules allow only linked records). */
export function useStudentsById(ids: string[]) {
  const { branchId } = useBranch()
  const key = ids.join(',')
  const [state, setState] = useState<{ key: string; map: Map<string, WithId<Student>>; loading: boolean }>({ key: '', map: new Map(), loading: true })
  useEffect(() => {
    const list = key ? key.split(',') : []
    const map = new Map<string, WithId<Student>>()
    const seen = new Set<string>()
    const done = () => setState({ key, map: new Map(map), loading: seen.size < list.length })
    if (!list.length) return
    const unsubs = list.map((id) =>
      onSnapshot(
        branchDocRef(branchId, COL.students, id),
        (snap) => {
          seen.add(id)
          if (snap.exists()) map.set(id, { id, ...(snap.data() as Student) })
          else map.delete(id)
          done()
        },
        () => {
          seen.add(id)
          done()
        },
      ),
    )
    return () => unsubs.forEach((u) => u())
  }, [branchId, key])
  if (!key) return { map: new Map<string, WithId<Student>>(), loading: false }
  if (state.key !== key) return { map: new Map<string, WithId<Student>>(), loading: true }
  return state
}

/**
 * Several live queries merged into one list (de-duplicated by ID). `keepPrevious`: while changed queries load, keep
 * showing the previous results (a scrolling calendar moves its window without flashing empty).
 */
export function useMergedQueries<T>(queries: Query<DocumentData>[], key: string, opts?: { keepPrevious?: boolean }) {
  const keep = opts?.keepPrevious ?? false
  const [state, setState] = useState<{ key: string; data: WithId<T>[]; loading: boolean }>({ key: '', data: [], loading: true })
  useEffect(() => {
    if (!queries.length) return
    const parts = new Map<number, WithId<T>[]>()
    const emit = () => {
      // Keeping the previous results: swap them only once every query has answered, never for a part of the new ones.
      if (keep && parts.size < queries.length) return
      const byId = new Map<string, WithId<T>>()
      for (const list of parts.values()) for (const d of list) byId.set(d.id, d)
      setState({ key, data: [...byId.values()], loading: parts.size < queries.length })
    }
    const unsubs = queries.map((q, i) =>
      onSnapshot(
        q,
        (snap) => {
          parts.set(i, snap.docs.map((d) => ({ id: d.id, ...(d.data() as T) }) as WithId<T>))
          emit()
        },
        () => {
          parts.set(i, [])
          emit()
        },
      ),
    )
    return () => unsubs.forEach((u) => u())
    // The key identifies the queries.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  if (!queries.length) return { data: [] as WithId<T>[], loading: false }
  if (state.key !== key) return { data: keep ? state.data : ([] as WithId<T>[]), loading: true }
  return state
}

/** Sessions of the given students between two dates (one query per student, as the rules require). */
export function useFamilySessions(ids: string[], from: DateKey, to: DateKey, opts?: { keepPrevious?: boolean }) {
  const { branchId } = useBranch()
  const queries = useMemo(
    () => ids.map((id) => query(branchCol(branchId, COL.sessions), where('studentId', '==', id), where('dateKey', '>=', from), where('dateKey', '<=', to))),
    [branchId, ids, from, to],
  )
  const res = useMergedQueries<Session>(queries, `family-sessions-${branchId}-${ids.join(',')}-${from}-${to}`, opts)
  const data = useMemo(
    // In time order; brothers and sisters at the same time, A to Z.
    () => res.data.filter((s) => !s.isDeleted).sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.startMin - b.startMin || a.endMin - b.endMin || a.studentName.localeCompare(b.studentName)),
    [res.data],
  )
  return { data, loading: res.loading }
}

/**
 * Each child's tint, in the order the children are listed, so a parent tells them apart at a glance (their initial,
 * their classes on the month calendar). Light and dark versions.
 */
const KID_TINTS = [
  'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200',
  'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200',
  'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200',
]

export interface Family {
  /** Who is signed in (or previewed): a parent, or the student themself. */
  who: 'parent' | 'student'
  /** The linked records' IDs (a student: their own). */
  ids: string[]
  /** The linked students that exist, A to Z by first name. */
  kids: WithId<Student>[]
  loading: boolean
  /** Nobody to show: no record linked, or the linked records are gone. */
  notLinked: boolean
  /** "Jiwoo" ("Student" until the record loads). */
  firstName: (id: string) => string
  /** The child's tint classes (parents with more than one child; otherwise a neutral one). */
  tint: (id: string) => string
  /** The signed-in person's name ("" when unknown, as for an admin previewing "Parent of …"). */
  personName: string
}

/** The family portal's people: the person signed in and the students they see. */
export function useFamily(): Family {
  const { portal, member, viewAs } = useBranch()
  const { user } = useAuth()
  const who = portal === 'student' ? 'student' : 'parent'
  const ids = useLinkedStudentIds(who)
  const { map, loading } = useStudentsById(ids)
  const kids = useMemo(
    () => ids.flatMap((id) => (map.has(id) ? [map.get(id)!] : [])).sort((a, b) => (a.firstName || a.name).localeCompare(b.firstName || b.name) || a.name.localeCompare(b.name)),
    [ids, map],
  )
  const order = useMemo(() => new Map(kids.map((k, i) => [k.id, i])), [kids])
  const previewName = viewAs && (viewAs.role === 'parent' || viewAs.role === 'student') ? viewAs.name : null
  const personName =
    who === 'student'
      ? (kids[0]?.name ?? previewName ?? member?.displayName ?? '')
      : previewName !== null
        ? previewName.startsWith('Parent of ')
          ? ''
          : previewName
        : member?.displayName || user?.displayName || ''
  return {
    who,
    ids,
    kids,
    loading,
    notLinked: !ids.length || (!loading && !kids.length),
    firstName: (id) => {
      const s = map.get(id)
      return s?.firstName || s?.name.split(' ')[0] || 'Student'
    },
    tint: (id) => (kids.length > 1 ? KID_TINTS[(order.get(id) ?? 0) % KID_TINTS.length] : 'bg-muted text-foreground'),
    personName,
  }
}

/** "Jiwoo", "Jiwoo and Minjun", "Ana, Jiwoo and Minjun". */
export function andList(names: string[]): string {
  return names.length > 2 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names.join(' and ')
}

/** The first word of a name ("" for none). */
export function firstWord(name: string): string {
  return name.trim().split(/\s+/)[0] ?? ''
}

/**
 * Whether a shared report is new to the person signed in. Each family member gets their own "report ready" inbox item
 * when it's shared, read once they open the report (ReportPage), so a parent opening it doesn't clear it for the
 * student. A report without such an item (shared before their account existed, say) is new until anyone in the
 * family opens it (`firstViewedAt`) or this browser has.
 */
export function useIsNewReport(): (r: Pick<ProgressReportDoc, 'firstViewedAt'> & { id: string }) => boolean {
  const { actor, viewAs } = useBranch()
  const email = actor.email
  // A preview would read the admin's own inbox.
  const { data } = useInbox(!viewAs)
  return useMemo(() => {
    const told = new Map<string, boolean>()
    for (const n of data) {
      const id = n.type === 'report_shared' ? n.refs?.reportId : null
      if (id) told.set(id, (told.get(id) ?? false) || !n.readAt)
    }
    return (r) => {
      const unread = told.get(r.id)
      if (unread !== undefined) return unread
      if (r.firstViewedAt) return false
      try {
        return !localStorage.getItem(reportSeenKey(r.id, email))
      } catch {
        return true
      }
    }
  }, [data, email])
}

/** A class has ended (by its absolute end, so a class later today is still to come). */
export const hasEnded = (s: Pick<Session, 'endAt'>, now: number) => (s.endAt?.toMillis?.() ?? 0) <= now

/** "Today", "Tomorrow" or "Tue, Oct 20" (with the weekday after Today and Tomorrow when asked). */
export function dayTitle(d: DateKey, today: DateKey, withDate = true) {
  const label = formatDateKey(d, 'weekdayMedium')
  if (d === today) return withDate ? `Today · ${label}` : 'Today'
  if (d === addDays(today, 1)) return withDate ? `Tomorrow · ${label}` : 'Tomorrow'
  if (d === addDays(today, -1)) return withDate ? `Yesterday · ${label}` : 'Yesterday'
  return label
}

/** The academy's contact details (Settings → Academy), from its public profile; the academy's own doc before that. */
export function useAcademyContactDetails(): BranchContact {
  const { branch } = useBranch()
  const { data: profile } = usePublicProfile()
  const c = profile?.contact ?? branch.contact
  return { phone: c?.phone?.trim() ?? '', email: c?.email?.trim() ?? '', address: c?.address?.trim() ?? '', website: c?.website?.trim() ?? '' }
}
