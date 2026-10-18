import { collection, collectionGroup, doc, query, serverTimestamp, setDoc, where } from "@react-native-firebase/firestore";
import { type Announcement, type AnnouncementRead, isForFamilies } from "@shared/comms";
import { COL, ROOT } from "@shared/paths";
import { useCallback, useEffect, useMemo } from "react";
import { db } from "@/lib/firebase";
import { useDoc, useQuery } from "@/lib/firestore";
import { useBranch } from "@/state/BranchProvider";

/**
 * The academy's news for families (docs/DECISIONS.md §16): the announcements the academy shows to families too, as the
 * website's family pages read them. A parent or a student lists exactly the posts shown to families and not archived
 * (the rules refuse any other query whole), opens one by its ID, and leaves their own read receipt the first time they
 * open it, so "New" goes for them only. Comments stay with the staff. Everything is live: a post the academy archives
 * or stops showing to families leaves the phone at once.
 */

export type NewsPost = Announcement & { id: string };

const millis = (t: unknown) => (t as { toMillis?: () => number } | null)?.toMillis?.() ?? null;
/** A post the server hasn't stamped yet counts as the newest. */
const postedMs = (a: Pick<Announcement, "createdAt">) => millis(a.createdAt) ?? Number.MAX_SAFE_INTEGER;

/** Pinned posts first, then the newest, as the website lists them. */
export function newsOrder(a: NewsPost, b: NewsPost): number {
  if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
  return postedMs(b) - postedMs(a) || a.id.localeCompare(b.id);
}

/** The posts shown to families, pinned first, then the newest. */
export function useFamilyNews() {
  const { branchId } = useBranch();
  const state = useQuery<Announcement>(`family-news-${branchId}`, () =>
    // Exactly what the rules let a parent or a student ask for, with nothing more (the order is the phone's).
    query(collection(db, ROOT.branches, branchId, COL.announcements), where("families", "==", true), where("archived", "==", false)),
  );
  const data = useMemo<NewsPost[]>(() => state.data.filter(isForFamilies).sort(newsOrder), [state.data]);
  return { ...state, data };
}

/**
 * One post, by its ID, while the academy shows it to families: an archived, staff-only, deleted or unknown one is
 * none (the rules refuse it; a copy this phone kept from another account isn't shown either).
 */
export function useNewsPost(id: string | null): { post: NewsPost | null; loading: boolean } {
  const { branchId } = useBranch();
  const state = useDoc<Announcement>(id ? `${ROOT.branches}/${branchId}/${COL.announcements}/${id}` : null);
  return { post: state.data && isForFamilies(state.data) ? state.data : null, loading: state.loading };
}

/**
 * Whether a post is new to this person: they haven't opened it (no read receipt of theirs, one listener for them all).
 * Nothing is new until their receipts are in, nor when they can't be read (rather than everything).
 */
export function useIsNewNews(): (id: string) => boolean {
  const { branchId, actor } = useBranch();
  const state = useQuery<AnnouncementRead>(`news-reads-${actor.email}`, () => query(collectionGroup(db, "reads"), where("email", "==", actor.email)));
  const ids = useMemo(() => new Set(state.data.filter((r) => r.branchId === branchId).map((r) => r.announcementId)), [state.data, branchId]);
  const known = !state.loading && !state.error;
  return useCallback((id: string) => known && !ids.has(id), [known, ids]);
}

/** Receipts written on this phone since the app opened, so each is written once whatever the screen does. */
const written = new Set<string>();

/**
 * Opening a post leaves the person's read receipt (`announcements/{id}/reads/{email}`, as the website's portal does),
 * once: the rules keep receipts as they were first written. It stops being "New" for them only; a parent's opening
 * leaves it new for the student.
 */
export function useReadReceipt(post: NewsPost | null): void {
  const { branchId, actor } = useBranch();
  const id = post?.id ?? null;
  const path = id ? `${ROOT.branches}/${branchId}/${COL.announcements}/${id}/reads/${actor.email}` : null;
  // Their own receipt, read by its path: "none" only once the server says so.
  const mine = useDoc<AnnouncementRead>(path);
  const absent = !!path && !mine.loading && !mine.data && !mine.error;
  useEffect(() => {
    if (!id || !path || !absent || written.has(path)) return;
    written.add(path);
    setDoc(doc(db, path), { email: actor.email, name: actor.name, branchId, announcementId: id, readAt: serverTimestamp() }).catch(() => undefined);
  }, [absent, id, path, actor.email, actor.name, branchId]);
}
