import { type Lang, dateText } from "@shared/i18n";
import { type DateKey, addDays, dateKeyOf, diffDays } from "@shared/time";
import { Stack } from "expo-router";
import { Bell } from "lucide-react-native";
import { useMemo } from "react";
import { Pressable, StyleSheet } from "react-native";
import { showActions } from "@/components/ActionSheet";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { ListSection } from "@/components/List";
import { Screen } from "@/components/Screen";
import { SkeletonCards } from "@/components/Skeleton";
import { T } from "@/components/Text";
import { useAcademyNow } from "@/features/data/hooks";
import { monthDay, weekdayName } from "@/features/schedule/format";
import { useLang, useT } from "@/lib/lang";
import { useBranch } from "@/state/BranchProvider";
import { space, useColors } from "@/theme";
import { type InboxItem, deleteInboxItem, markAllInboxRead, markInboxRead, useInbox } from "./inbox";
import { InboxRow, inboxText } from "./InboxRow";

const millis = (t: unknown) => (t as { toMillis?: () => number } | null)?.toMillis?.() ?? null;

/** A day's heading, as the website's bell words it: Today, Yesterday, the weekday this past week, then the date. */
function dayHeading(d: DateKey, today: DateKey, lang: Lang): string {
  if (d === today) return lang === "ko" ? "오늘" : "Today";
  if (d === addDays(today, -1)) return lang === "ko" ? "어제" : "Yesterday";
  const ago = diffDays(d, today);
  if (ago > 0 && ago < 7) return weekdayName(d, lang);
  return ago > 365 ? dateText(d, "medium", lang) : monthDay(d, lang);
}

/**
 * The person's notifications (opened from Home's bell; the website's bell shows the same ones), the staff's and the
 * family's: the newest first, grouped by day in the academy's zone, the unread ones marked. Tapping one marks it read
 * and opens what it's about (`onOpen`: a class's sheet, a post, a request; `leads` says which lead somewhere); a swipe
 * to the left deletes it; a long press offers Mark as read and Delete; "Mark all read" at the top marks them all. Live:
 * a new one shows as it comes.
 */
export function InboxScreen({ leads, onOpen, empty }: { leads: (n: InboxItem) => boolean; onOpen: (n: InboxItem) => void; empty: string }) {
  const { branchId, timezone, settings } = useBranch();
  const colors = useColors();
  const t = useT();
  const lang = useLang();
  const { today } = useAcademyNow();
  const inbox = useInbox();
  const hour12 = settings.general.timeFormat !== "24h";
  const unread = inbox.data.filter((n) => !n.readAt).length;

  // Newest first already: each day's notifications follow one another.
  const days = useMemo(() => {
    const out: { key: DateKey; label: string; items: InboxItem[] }[] = [];
    for (const n of inbox.data) {
      const ms = millis(n.createdAt);
      const key = ms === null ? today : dateKeyOf(ms, timezone);
      const last = out[out.length - 1];
      if (last?.key === key) last.items.push(n);
      else out.push({ key, label: dayHeading(key, today, lang), items: [n] });
    }
    return out;
  }, [inbox.data, timezone, today, lang]);

  const offer = (n: InboxItem) =>
    showActions(
      inboxText(n, lang).title || t("Notification", "알림"),
      [
        ...(n.readAt ? [] : [{ label: t("Mark as read", "읽음으로 표시"), onPress: () => markInboxRead(branchId, n) }]),
        { label: t("Delete", "삭제"), destructive: true, onPress: () => deleteInboxItem(branchId, n.id, lang) },
      ],
      undefined,
      { cancel: t("Cancel", "취소"), more: t("More…", "더 보기…") },
    );

  return (
    <>
      <Stack.Screen options={{ headerRight: () => (unread ? <MarkAllRead onPress={() => markAllInboxRead(branchId, inbox.data, lang)} /> : null) }} />
      <Screen typing={false} onRefresh={() => new Promise((r) => setTimeout(r, 600))} testID="inbox-screen">
        {inbox.loading ? (
          <SkeletonCards count={4} height={72} />
        ) : inbox.error && !inbox.data.length ? (
          <Card testID="inbox-error">
            <T variant="label">{t("Couldn’t load your notifications", "알림을 불러오지 못했어요")}</T>
            <T variant="small" tone="muted">
              {t("Check your connection, then pull down to try again.", "인터넷 연결을 확인한 뒤 화면을 아래로 당겨 다시 시도해 주세요.")}
            </T>
          </Card>
        ) : days.length ? (
          <>
            {days.map((d) => (
              <ListSection key={d.key} title={d.label} testID={`inbox-day-${d.key}`}>
                {d.items.map((n) => (
                  <InboxRow
                    key={n.id}
                    item={n}
                    timezone={timezone}
                    hour12={hour12}
                    leads={leads(n)}
                    onOpen={() => onOpen(n)}
                    onLongPress={() => offer(n)}
                    onDelete={() => deleteInboxItem(branchId, n.id, lang)}
                    testID={`inbox-item-${n.id}`}
                  />
                ))}
              </ListSection>
            ))}
            <T variant="small" tone="muted" style={styles.hint}>
              {t("Swipe a notification to the left to delete it.", "알림을 왼쪽으로 밀면 지울 수 있어요.")}
            </T>
          </>
        ) : (
          <EmptyState
            testID="inbox-empty"
            icon={<Bell size={26} color={colors.mutedForeground} />}
            title={t("No notifications yet", "아직 알림이 없어요")}
            text={empty}
          />
        )}
      </Screen>
    </>
  );
}

/** The header's "Mark all read", while some are unread. */
function MarkAllRead({ onPress }: { onPress: () => void }) {
  const t = useT();
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" testID="inbox-mark-all" style={({ pressed }) => [styles.markAll, pressed && styles.pressed]}>
      <T variant="label">{t("Mark all read", "모두 읽음")}</T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hint: { textAlign: "center", paddingHorizontal: space.lg },
  markAll: { paddingHorizontal: space.sm, paddingVertical: space.xs },
  pressed: { opacity: 0.6 },
});
