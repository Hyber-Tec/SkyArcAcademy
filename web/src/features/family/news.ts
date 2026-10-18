import { query, where } from 'firebase/firestore'
import { useMemo } from 'react'
import { type Announcement, isForFamilies } from '@shared/comms'
import { COL } from '@shared/paths'
import { type DateKey, dateKeyOf, formatDateKey } from '@shared/time'
import { useBranch } from '@/branch/BranchProvider'
import { useMyReadIds } from '@/features/announcements/api'
import { branchCol, useQuery } from '@/lib/firestore'
import { dayTitle } from './data'

/** A post still being saved has no time yet: it counts as the newest. */
const postedMs = (a: Pick<Announcement, 'createdAt'>) => a.createdAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER

/** Pinned posts first, then the newest. */
function newsOrder(a: Announcement, b: Announcement) {
  return Number(b.pinned) - Number(a.pinned) || postedMs(b) - postedMs(a)
}

/**
 * The academy's posts shown to families, pinned first and then newest, live. The query asks for exactly what the rules
 * let a parent or a student read (shown to families, and not archived): any other query is refused whole. An owner or
 * admin previewing a family ("View as") gets the same posts.
 */
export function useFamilyNews() {
  const { branchId } = useBranch()
  const q = useMemo(() => query(branchCol(branchId, COL.announcements), where('families', '==', true), where('archived', '==', false)), [branchId])
  const res = useQuery<Announcement>(q, `family-news-${branchId}`)
  const data = useMemo(() => res.data.filter(isForFamilies).sort(newsOrder), [res.data])
  return { data, loading: res.loading }
}

/**
 * Whether a post is new to the person signed in: they haven't opened it yet (no read receipt of theirs), so a parent
 * opening it doesn't clear it for the student or the other parent. Nothing counts as new until their receipts are in. A
 * preview ("View as") can't see the previewed person's receipts: every post shows as new, and opening one records
 * nothing.
 */
export function useIsNewNews(): (id: string) => boolean {
  const { viewAs } = useBranch()
  const { ids, loading } = useMyReadIds(!viewAs)
  return useMemo(() => (id: string) => !loading && !ids.has(id), [ids, loading])
}

/** How many of the posts shown to families this person hasn't opened (the sidebar's News count). */
export function useUnreadNewsCount(enabled: boolean): number {
  const { branchId, viewAs } = useBranch()
  const q = useMemo(() => (enabled ? query(branchCol(branchId, COL.announcements), where('families', '==', true), where('archived', '==', false)) : null), [branchId, enabled])
  const res = useQuery<Announcement>(q, `family-news-${branchId}`)
  const { ids, loading } = useMyReadIds(enabled && !viewAs)
  if (!enabled || viewAs || loading) return 0
  return res.data.filter((a) => isForFamilies(a) && !ids.has(a.id)).length
}

/** When a post went up, in the academy's time zone: "Today", "Yesterday", "Fri, Oct 16", or "Oct 16, 2025" in another year. */
export function postedOn(a: Pick<Announcement, 'createdAt'>, timezone: string, today: DateKey): string {
  const at = a.createdAt?.toDate?.()
  if (!at) return 'Just now'
  const key = dateKeyOf(at, timezone)
  return key.slice(0, 4) === today.slice(0, 4) ? dayTitle(key, today, false) : formatDateKey(key, 'medium')
}

/** The pictures in a post: those in its text, and attached ones. */
export function pictureCount(a: Pick<Announcement, 'contentHtml' | 'attachments'>): number {
  const inText = (a.contentHtml ?? '').match(/<img\b/gi)?.length ?? 0
  return inText + (a.attachments ?? []).filter(isPicture).length
}

/** An attachment shown as a picture (anything else is a file to open or download). */
export function isPicture(f: { contentType?: string }): boolean {
  return (f.contentType ?? '').startsWith('image/')
}
