import { collection, collectionGroup, query, where } from "@react-native-firebase/firestore";
import { type Announcement, type AnnouncementRead, isInAudience } from "@shared/comms";
import { COL, ROOT } from "@shared/paths";
import { useCallback, useMemo } from "react";
import { type NewsPost, newsOrder } from "@/features/family/news";
import { db } from "@/lib/firebase";
import { useDoc, useQuery } from "@/lib/firestore";
import { useBranch } from "@/state/BranchProvider";

/**
 * The academy's announcements for the staff, read as the website's Announcements page reads them
 * (web/src/features/announcements/api.ts). A coach asks for the posts for everyone and the posts addressed to them: the
 * two queries the rules can check (`staffSeesAnnouncement`; a query they'd refuse fails whole), merged. Owners and
 * admins read every post that isn't archived. Archived posts are left out (the website keeps them in its Archive);
 * pinned ones come first, then the newest. A coach leaves their read receipt the first time they open a post
 * (`useReadReceipt`, as families do), so "New" goes for them only; owners and admins don't, as on the website, so
 * nothing is new to them. The comments are in comments.ts.
 */

const posts = (branchId: string) => collection(db, ROOT.branches, branchId, COL.announcements);

/** The posts the person may read, pinned first, then the newest. With `enabled` false it asks for nothing. */
export function useStaffNews(enabled = true): { data: NewsPost[]; loading: boolean; error: Error | null } {
  const { branchId, actor, isAdmin } = useBranch();
  const coach = enabled && !isAdmin;
  const office = enabled && isAdmin;
  const all = useQuery<Announcement>(coach ? `staff-news-all-${branchId}` : null, () => query(posts(branchId), where("audienceType", "==", "all")));
  const mine = useQuery<Announcement>(coach ? `staff-news-mine-${branchId}-${actor.email}` : null, () =>
    query(posts(branchId), where("audienceKeys", "array-contains", actor.email)),
  );
  const every = useQuery<Announcement>(office ? `staff-news-office-${branchId}` : null, () => query(posts(branchId), where("archived", "==", false)));
  const data = useMemo(() => {
    const byId = new Map<string, NewsPost>();
    for (const a of [...all.data, ...mine.data, ...every.data]) if (!a.archived) byId.set(a.id, a);
    return [...byId.values()].sort(newsOrder);
  }, [all.data, mine.data, every.data]);
  // A coach's list is there once the posts for everyone are; the few addressed to them alone join it as they come
  // (offline, the phone's copy may have none of those to answer with).
  const loading = coach ? all.loading : office ? every.loading : false;
  const error = coach ? (all.error ?? mine.error) : every.error;
  return { data, loading, error };
}

/**
 * One post, by its ID, when the person may read it: owners and admins any post, a coach one for everyone or addressed
 * to them, archived or not (a link or a notification still opens it, marked Archived, as on the website). A deleted,
 * unknown or someone else's post is none: the rules refuse it, and a copy this phone kept from another account isn't
 * shown either.
 */
export function useStaffPost(id: string | null): { post: NewsPost | null; loading: boolean } {
  const { branchId, actor, isAdmin } = useBranch();
  const state = useDoc<Announcement>(id ? `${ROOT.branches}/${branchId}/${COL.announcements}/${id}` : null);
  const a = state.data;
  return { post: a && (isAdmin || isInAudience(a, actor.email)) ? a : null, loading: state.loading };
}

/**
 * Whether a post is new to this person: a coach who hasn't opened it (no read receipt of theirs: one collection-group
 * listener for them all). Nothing is new until their receipts are in, nor when they can't be read (rather than
 * everything), and nothing is ever new to owners and admins.
 */
export function useNewsReads(): { isNew: (id: string) => boolean; loading: boolean } {
  const { branchId, actor, isCoach } = useBranch();
  const state = useQuery<AnnouncementRead>(isCoach ? `staff-news-reads-${actor.email}` : null, () => query(collectionGroup(db, "reads"), where("email", "==", actor.email)));
  const ids = useMemo(() => new Set(state.data.filter((r) => r.branchId === branchId).map((r) => r.announcementId)), [state.data, branchId]);
  const known = isCoach && !state.loading && !state.error;
  const isNew = useCallback((id: string) => known && !ids.has(id), [known, ids]);
  return { isNew, loading: state.loading };
}

/**
 * A coach's posts not opened yet, pinned first, then the newest (Home's to-do lists them). None until both the posts
 * and the receipts are in, and none for owners and admins.
 */
export function useUnreadNews(): { data: NewsPost[]; loading: boolean } {
  const { isCoach } = useBranch();
  const news = useStaffNews(isCoach);
  const { isNew, loading: readsLoading } = useNewsReads();
  const loading = isCoach && (news.loading || readsLoading);
  const data = useMemo(() => (isCoach && !loading ? news.data.filter((a) => isNew(a.id)) : []), [isCoach, loading, news.data, isNew]);
  return { data, loading };
}

/** How many posts a coach hasn't opened yet (for a badge, More's News); always 0 for owners and admins. */
export function useUnreadNewsCount(): number {
  return useUnreadNews().data.length;
}

/** Who a post is for, as the website words it: "For all coaches" or "For 3 people", and families when they see it too. */
export function audienceLabel(a: Pick<Announcement, "audienceType" | "audienceKeys" | "families">): string {
  const n = a.audienceKeys?.length ?? 0;
  const staff = a.audienceType === "all" ? "all coaches" : n === 1 ? "1 person" : `${n} people`;
  return `For ${staff}${a.families ? " and families" : ""}`;
}
