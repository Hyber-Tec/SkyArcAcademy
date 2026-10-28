import { Timestamp, collection, deleteDoc, doc, getDoc, limit, orderBy, query, updateDoc, where, writeBatch } from "@react-native-firebase/firestore";
import { queryParams } from "@shared/auth";
import type { AppNotification } from "@shared/comms";
import { COL, ROOT } from "@shared/paths";
import { appTargetOf } from "@shared/push";
import type { Session } from "@shared/types";
import { router } from "expo-router";
import { useEffect } from "react";
import { db } from "@/lib/firebase";
import { useQuery } from "@/lib/firestore";
import { openWebsite } from "@/lib/links";
import { toast } from "@/lib/toast";
import { useBranch } from "@/state/BranchProvider";

/**
 * The person's notifications (the inbox the website's bell opens: web/src/features/notifications/NotificationBell.tsx):
 * the items Cloud Functions write for them (`branches/{b}/notifications`, by `recipientKey`): a coach's class changes
 * and new announcements; the office's requests and cancellations from families and messages from the website; a
 * family's class changes, answers to their requests, new scores and reports, and the academy's news. People read, mark
 * read and delete their own, and nothing else (the rules). Marking read stamps the phone's time, so a row and the bell's
 * count change at once, offline too (only whether it's set counts; the server's push count reads it the same way).
 */

export type InboxItem = AppNotification & { id: string };

const items = (branchId: string) => collection(db, ROOT.branches, branchId, COL.notifications);

/** The person's newest notifications (the latest 100), newest first: the website's bell's own query (and index). */
export function useInbox(enabled = true) {
  const { branchId, actor } = useBranch();
  return useQuery<AppNotification>(enabled ? `inbox-${branchId}-${actor.email}` : null, () =>
    query(items(branchId), where("recipientKey", "==", actor.email), orderBy("createdAt", "desc"), limit(100)),
  );
}

/** How many of them are unread (the bell's badge); 0 while they load. */
export function useUnreadInboxCount(): number {
  const inbox = useInbox();
  return inbox.data.filter((n) => !n.readAt).length;
}

export function markInboxRead(branchId: string, n: Pick<InboxItem, "id" | "readAt">): void {
  if (n.readAt) return;
  updateDoc(doc(items(branchId), n.id), { readAt: Timestamp.now() }).catch(() => undefined);
}

/** Marks every unread one read, in one batch (as the website, at most 450 at a time). */
export function markAllInboxRead(branchId: string, list: readonly InboxItem[]): void {
  const unread = list.filter((n) => !n.readAt).slice(0, 450);
  if (!unread.length) return;
  const batch = writeBatch(db);
  const at = Timestamp.now();
  for (const n of unread) batch.update(doc(items(branchId), n.id), { readAt: at });
  batch.commit().catch(() => toast.error("Couldn’t mark them read", { description: "Check your connection, then try again." }));
}

export function deleteInboxItem(branchId: string, id: string): void {
  deleteDoc(doc(items(branchId), id)).catch(() => toast.error("Couldn’t delete the notification"));
}

/**
 * Where a staff member's notification leads: in the app a post, the news, a class (by its session), the schedule, a
 * family's request (to approve or decline); on the website a trial request or question sent from the public website
 * (answered in Settings → Website → Messages), and a signed enrollment contract (the student's page, where the office
 * sees it); null for nowhere.
 */
export type InboxTarget =
  | { kind: "post"; id: string }
  | { kind: "news" }
  | { kind: "class"; sessionId: string }
  | { kind: "schedule" }
  | { kind: "request"; id: string }
  | { kind: "website"; path: string }
  | null;

export function inboxTarget(n: Pick<AppNotification, "type" | "link" | "refs">): InboxTarget {
  // A class taken off the schedule, or now another coach's, has nothing left to open: its notice says it all.
  if (n.type === "session_deleted" || n.type === "session_reassigned_out") return null;
  // The message itself, as the website's bell opens it (older notices name the page only); a signed contract, the
  // student's page on the website.
  if (n.type === "website_message" || n.type === "contract_signed") return n.link ? { kind: "website", path: n.link } : null;
  // A family's request opens itself (a push carries it in its link only).
  const requestId = n.type === "class_requested" ? (n.refs?.requestId ?? queryParams(n.link ?? "").get("request") ?? null) : null;
  if (requestId) return { kind: "request", id: requestId };
  const t = appTargetOf(n.link ?? "", n.refs ?? undefined);
  if (t.screen === "announcement") return { kind: "post", id: t.announcementId };
  if (t.screen === "announcements") return { kind: "news" };
  if (t.screen === "schedule") return t.sessionId ? { kind: "class", sessionId: t.sessionId } : { kind: "schedule" };
  // Anything else (a family's progress report, or a kind the app doesn't know yet) is read here, not opened.
  return null;
}

/**
 * Opens what a notification is about, and marks it read: a post opens on its own page; a class opens its sheet, the
 * class the student's seat is in now (its time or day may have changed since); a seat no longer there says so; a
 * message from the public website opens on the website. A tapped push opens the same way (its inbox item's id, when it
 * names one).
 */
export async function openInboxItem(branchId: string, n: Pick<InboxItem, "type" | "link" | "refs"> & { id: string | null; readAt?: InboxItem["readAt"] }): Promise<void> {
  if (n.id) markInboxRead(branchId, { id: n.id, readAt: n.readAt ?? null });
  const target = inboxTarget(n);
  if (!target) return;
  if (target.kind === "website") return openWebsite(target.path);
  if (target.kind === "post") return void router.push({ pathname: "/news/[id]", params: { id: target.id } });
  if (target.kind === "news") return void router.push("/news");
  if (target.kind === "schedule") return void router.navigate("/schedule");
  if (target.kind === "request") return void router.push({ pathname: "/request/[id]", params: { id: target.id } });
  try {
    const snap = await getDoc(doc(db, ROOT.branches, branchId, COL.sessions, target.sessionId));
    const s = snap.exists() ? (snap.data() as Session) : null;
    if (s && !s.isDeleted && s.classId) router.push({ pathname: "/class/[id]", params: { id: s.classId } });
    else if (s && !s.isDeleted) router.navigate("/schedule");
    else toast("This class was taken off the schedule");
  } catch {
    toast.error("Couldn’t open the class", { description: "Check your connection, then try again." });
  }
}

/**
 * Where a family's notification leads, in their own screens: a post or the news, a class's sheet (by its seat) or
 * Classes (a class taken off the schedule, a request declined), a score or Scores, a progress report or Reports; null
 * for a kind the app doesn't know yet (read here, not opened).
 */
export type FamilyTarget =
  | { kind: "post"; id: string }
  | { kind: "news" }
  | { kind: "class"; sessionId: string }
  | { kind: "classes" }
  | { kind: "score"; id: string }
  | { kind: "scores" }
  | { kind: "report"; id: string }
  | { kind: "reports" }
  | null;

export function familyTarget(n: Pick<AppNotification, "type" | "link" | "refs">): FamilyTarget {
  const t = appTargetOf(n.link ?? "", n.refs ?? undefined);
  if (t.screen === "announcement") return { kind: "post", id: t.announcementId };
  if (t.screen === "announcements") return { kind: "news" };
  if (t.screen === "report") return { kind: "report", id: t.reportId };
  if (t.screen === "scores") return t.evaluationId ? { kind: "score", id: t.evaluationId } : { kind: "scores" };
  if (t.screen === "classes" || t.screen === "schedule") return t.sessionId && n.type !== "session_deleted" ? { kind: "class", sessionId: t.sessionId } : { kind: "classes" };
  if (n.type === "report_shared") return { kind: "reports" };
  return null;
}

/** Opens what a family's notification is about, as a tapped push does, and marks it read. */
export function openFamilyItem(branchId: string, n: Pick<InboxItem, "type" | "link" | "refs"> & { id: string | null; readAt?: InboxItem["readAt"] }): void {
  if (n.id) markInboxRead(branchId, { id: n.id, readAt: n.readAt ?? null });
  const t = familyTarget(n);
  if (!t) return;
  if (t.kind === "post") return void router.push({ pathname: "/news/[id]", params: { id: t.id } });
  if (t.kind === "news") return void router.push("/news");
  if (t.kind === "class") return void router.push({ pathname: "/session/[id]", params: { id: t.sessionId } });
  if (t.kind === "classes") return void router.navigate("/classes");
  if (t.kind === "score") return void router.push({ pathname: "/score/[id]", params: { id: t.id } });
  if (t.kind === "scores") return void router.navigate("/scores");
  if (t.kind === "report") return void router.push({ pathname: "/report/[id]", params: { id: t.id } });
  router.navigate("/reports");
}

/**
 * Opening a post reads this person's notifications about it (its "New announcement"), so the bell doesn't still count
 * what they've just read, as a family's opening of a report reads theirs. Live: one that arrives while it's open is read
 * too.
 */
export function useReadNoticesAbout(announcementId: string | null): void {
  const { branchId } = useBranch();
  const inbox = useInbox(!!announcementId);
  useEffect(() => {
    if (!announcementId) return;
    for (const n of inbox.data) if (!n.readAt && n.refs?.announcementId === announcementId) markInboxRead(branchId, n);
  }, [announcementId, inbox.data, branchId]);
}
