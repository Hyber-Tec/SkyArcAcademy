import { appTargetOf } from "@shared/push";
import type * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { type InboxItem, markInboxRead, openInboxItem } from "./inbox";

/**
 * What a push asks the app to open, from the data it carries (all strings, `PushData` in shared/src/push.ts), read the
 * same whichever library hands it over: React Native Firebase, or expo-notifications on the phone that gives it to that
 * one instead (src/state/PushProvider.tsx listens to both, and opens each push once).
 */
export interface PushOpen {
  /** The inbox item it repeats (`branches/{b}/notifications/{id}`). */
  id: string | null;
  type: string;
  branchId: string | null;
  link: string;
  refs: { sessionId: string | null; announcementId: string | null; dateKey: string | null };
}

export function pushOpenOf(data: Record<string, unknown> | undefined | null): PushOpen | null {
  if (!data) return null;
  const s = (key: string) => (typeof data[key] === "string" && data[key] ? (data[key] as string) : null);
  if (!s("notificationId") && !s("link") && !s("type")) return null;
  return {
    id: s("notificationId"),
    type: s("type") ?? "",
    branchId: s("branchId"),
    link: s("link") ?? "",
    refs: { sessionId: s("sessionId"), announcementId: s("announcementId"), dateKey: s("dateKey") },
  };
}

/** A push's data as expo-notifications gives it: the iPhone's whole payload, or Android's message from Firebase. */
export function dataOfNotification(n: Notifications.Notification): Record<string, unknown> | null {
  const trigger = n.request.trigger as { payload?: Record<string, unknown>; remoteMessage?: { data?: Record<string, unknown> } } | null;
  return trigger?.remoteMessage?.data ?? trigger?.payload ?? (n.request.content.data as Record<string, unknown> | null) ?? null;
}

/** Pushes already acted on (both libraries may hand over the same one, and the one that opened the app comes again). */
const handled = new Set<string>();

/** True the first time a push is seen (by its inbox item), so each opens its screen, or its toast shows, once. */
export function firstTime(kind: "tap" | "shown", key: string | null | undefined): boolean {
  if (!key) return true;
  const k = `${kind}:${key}`;
  if (handled.has(k)) return false;
  handled.add(k);
  return true;
}

/** Opens what a staff member's notice is about, exactly as tapping it in the inbox does, and marks it read. */
export function openStaffNotice(branchId: string, push: PushOpen): void {
  void openInboxItem(branchId, { id: push.id, type: push.type as InboxItem["type"], link: push.link, refs: push.refs, readAt: null });
}

/**
 * Opens what a family's notice is about, and marks it read: a post, the news, a class's sheet (by its seat), the
 * shared reports (a new one shows at the top), or Home for a kind the app doesn't know yet.
 */
export function openFamilyNotice(branchId: string, push: PushOpen): void {
  if (push.id) markInboxRead(branchId, { id: push.id, readAt: null });
  if (push.type === "report_shared") return void router.navigate("/reports");
  const t = appTargetOf(push.link, push.refs);
  if (t.screen === "announcement") return void router.push({ pathname: "/news/[id]", params: { id: t.announcementId } });
  if (t.screen === "announcements") return void router.push("/news");
  if (t.screen === "schedule") {
    if (t.sessionId) return void router.push({ pathname: "/session/[id]", params: { id: t.sessionId } });
    return void router.navigate("/classes");
  }
  router.navigate("/");
}
