import { type DateKey, addDays, dateKeyOf, diffDays, formatDateKey } from "@shared/time";
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
import { type InboxItem, deleteInboxItem, markAllInboxRead, markInboxRead, openInboxItem, useInbox } from "@/features/notifications/inbox";
import { InboxRow } from "@/features/notifications/InboxRow";
import { monthDay, weekdayName } from "@/features/schedule/format";
import { useBranch } from "@/state/BranchProvider";
import { space, useColors } from "@/theme";

const millis = (t: unknown) => (t as { toMillis?: () => number } | null)?.toMillis?.() ?? null;

/** A day's heading, as the website's bell words it: Today, Yesterday, the weekday this past week, then the date. */
function dayHeading(d: DateKey, today: DateKey): string {
  if (d === today) return "Today";
  if (d === addDays(today, -1)) return "Yesterday";
  const ago = diffDays(d, today);
  if (ago > 0 && ago < 7) return weekdayName(d);
  return ago > 365 ? formatDateKey(d, "medium") : monthDay(d);
}

/**
 * The person's notifications (opened from Home's bell; the website's bell shows the same ones): the newest first,
 * grouped by day in the academy's zone, the unread ones marked. Tapping one marks it read and opens what it's about (a
 * class's sheet, a post); a swipe to the left deletes it; a long press offers Mark as read and Delete; "Mark all read"
 * at the top marks them all. Live: a new one shows as it comes.
 */
export default function InboxScreen() {
  const { branchId, timezone, settings } = useBranch();
  const colors = useColors();
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
      else out.push({ key, label: dayHeading(key, today), items: [n] });
    }
    return out;
  }, [inbox.data, timezone, today]);

  const offer = (n: InboxItem) =>
    showActions(n.title || "Notification", [
      ...(n.readAt ? [] : [{ label: "Mark as read", onPress: () => markInboxRead(branchId, n) }]),
      { label: "Delete", destructive: true, onPress: () => deleteInboxItem(branchId, n.id) },
    ]);

  return (
    <>
      <Stack.Screen options={{ headerRight: () => (unread ? <MarkAllRead onPress={() => markAllInboxRead(branchId, inbox.data)} /> : null) }} />
      <Screen typing={false} onRefresh={() => new Promise((r) => setTimeout(r, 600))} testID="inbox-screen">
        {inbox.loading ? (
          <SkeletonCards count={4} height={72} />
        ) : inbox.error && !inbox.data.length ? (
          <Card testID="inbox-error">
            <T variant="label">Couldn’t load your notifications</T>
            <T variant="small" tone="muted">
              Check your connection, then pull down to try again.
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
                    onOpen={() => void openInboxItem(branchId, n)}
                    onLongPress={() => offer(n)}
                    onDelete={() => deleteInboxItem(branchId, n.id)}
                    testID={`inbox-item-${n.id}`}
                  />
                ))}
              </ListSection>
            ))}
            <T variant="small" tone="muted" style={styles.hint}>
              Swipe a notification to the left to delete it.
            </T>
          </>
        ) : (
          <EmptyState
            testID="inbox-empty"
            icon={<Bell size={26} color={colors.mutedForeground} />}
            title="No notifications yet"
            text="Changes to your classes and new announcements show here as they come."
          />
        )}
      </Screen>
    </>
  );
}

/** The header's "Mark all read", while some are unread. */
function MarkAllRead({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" testID="inbox-mark-all" style={({ pressed }) => [styles.markAll, pressed && styles.pressed]}>
      <T variant="label">Mark all read</T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hint: { textAlign: "center", paddingHorizontal: space.lg },
  markAll: { paddingHorizontal: space.sm, paddingVertical: space.xs },
  pressed: { opacity: 0.6 },
});
