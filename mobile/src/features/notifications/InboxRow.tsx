import { notificationMeta } from "@shared/comms";
import { minutesOf } from "@shared/time";
import { Bell, CalendarCheck, CalendarDays, CalendarMinus, CalendarPlus, CalendarX2, ChartLine, ChevronRight, Clock, type LucideIcon, Mail, Megaphone, UserMinus, UserPlus, UserX } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { SwipeToDelete } from "@/components/SwipeToDelete";
import { T } from "@/components/Text";
import { clock } from "@/features/schedule/format";
import { space, useColors } from "@/theme";
import { type InboxItem, inboxTarget } from "./inbox";

/** A picture for each kind of notification (its colour is the website's: `notificationMeta`). */
const ICONS: Record<string, LucideIcon> = {
  announcement: Megaphone,
  announcement_updated: Megaphone,
  session_created: CalendarPlus,
  session_canceled: CalendarX2,
  session_restored: CalendarCheck,
  session_deleted: CalendarMinus,
  session_time_changed: Clock,
  session_date_changed: CalendarDays,
  session_reassigned_in: UserPlus,
  session_reassigned_out: UserMinus,
  session_no_show: UserX,
  report_shared: ChartLine,
  website_message: Mail,
};

const millis = (t: unknown) => (t as { toMillis?: () => number } | null)?.toMillis?.() ?? null;

/** "Class Canceled" → "Class canceled": the app's words are in sentence case. */
const sentence = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

/**
 * One notification in the list: its kind as a picture in the website's colour (a dot on it while it's unread), its
 * title (bold while unread), the time it came (its day is the list's heading) and what it says. Tapping it opens what
 * it's about (a chevron says it leads somewhere) and marks it read; a swipe to the left deletes it; a long press offers
 * both.
 */
export function InboxRow({
  item: n,
  timezone,
  hour12,
  divider = false,
  onOpen,
  onLongPress,
  onDelete,
  testID,
}: {
  item: InboxItem;
  timezone: string;
  hour12: boolean;
  /** Set by ListSection on every row after the first. */
  divider?: boolean;
  onOpen: () => void;
  onLongPress: () => void;
  onDelete: () => void;
  testID?: string;
}) {
  const colors = useColors();
  const meta = notificationMeta(n.type);
  const Icon = ICONS[n.type] ?? Bell;
  const ms = millis(n.createdAt);
  const time = ms === null ? "Just now" : clock(minutesOf(ms, timezone), hour12);
  const unread = !n.readAt;
  const leads = inboxTarget(n) !== null;
  const label = [unread ? "Unread" : null, sentence(meta.label), n.title, n.body, time].filter(Boolean).join(", ");
  return (
    <SwipeToDelete divider={divider} onPress={onOpen} onLongPress={onLongPress} onDelete={onDelete} accessibilityLabel={label} testID={testID}>
      <View style={styles.row}>
        <View>
          <View style={[styles.icon, { backgroundColor: `${meta.color}1f` }]}>
            <Icon size={18} color={meta.color} />
          </View>
          {unread ? <View style={[styles.dot, { backgroundColor: colors.brand, borderColor: colors.card }]} /> : null}
        </View>
        <View style={styles.grow}>
          <View style={styles.top}>
            <T variant="label" style={[styles.title, !unread && styles.read]}>
              {n.title || sentence(meta.label)}
            </T>
            <T variant="small" tone="muted" style={styles.time}>
              {time}
            </T>
          </View>
          {n.body ? (
            <T variant="small" tone="muted" numberOfLines={4}>
              {n.body}
            </T>
          ) : null}
        </View>
        {leads ? <ChevronRight size={16} color={colors.mutedForeground} style={styles.chevron} /> : null}
      </View>
    </SwipeToDelete>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 64 },
  icon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  dot: { position: "absolute", top: -3, right: -3, width: 12, height: 12, borderRadius: 6, borderWidth: 2 },
  grow: { flex: 1, gap: 2 },
  top: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
  title: { flex: 1 },
  read: { fontWeight: "500" },
  time: { fontVariant: ["tabular-nums"], marginTop: 1 },
  chevron: { alignSelf: "center" },
});
