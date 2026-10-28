import { type ClassRequest, type ClassRequestKind, REQUEST_KIND_LABELS } from "@shared/schedule/requests";
import { addDays, dateKeyOf, formatDateKey, formatInstant, minutesOf, todayKey } from "@shared/time";
import { ArrowRightLeft, CalendarPlus, ChevronRight, type LucideIcon, RotateCcw } from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";
import { T } from "@/components/Text";
import { clock, shortDay, timeRange } from "@/features/schedule/format";
import { space, useColors } from "@/theme";
import { type RequestDoc, millis } from "./data";

/** Each kind's picture and colour, as the website's office requests show them. */
const KIND: Record<ClassRequestKind, { Icon: LucideIcon; color: string }> = {
  makeup: { Icon: RotateCcw, color: "#D97706" },
  reschedule: { Icon: ArrowRightLeft, color: "#7C3AED" },
  extra: { Icon: CalendarPlus, color: "#0284C7" },
};

/** "Makeup for Oct 26", "Move from Nov 2", "Extra class". */
export function whatFor(r: Pick<ClassRequest, "kind" | "forDateKey">): string {
  if (r.kind === "makeup" && r.forDateKey) return `Makeup for ${formatDateKey(r.forDateKey, "monthDay")}`;
  if (r.kind === "reschedule" && r.forDateKey) return `Move from ${formatDateKey(r.forDateKey, "monthDay")}`;
  return REQUEST_KIND_LABELS[r.kind];
}

/** When it was asked, mid-sentence: "today, 12:29 PM", "yesterday, …", "Oct 26, 2026, 12:29 PM". */
export function askedWhen(t: unknown, timezone: string, hour12: boolean): string {
  const ms = millis(t);
  if (!ms) return "just now";
  const day = dateKeyOf(ms, timezone);
  const today = todayKey(timezone);
  const at = clock(minutesOf(ms, timezone), hour12);
  if (day === today) return `today, ${at}`;
  if (day === addDays(today, -1)) return `yesterday, ${at}`;
  return formatInstant(ms, timezone, { dateStyle: "medium", timeStyle: "short" });
}

/** A family's request in the office's lists: its kind, the student, what it's for and when, and when it was asked. */
export function RequestRow({ r, timezone, hour12, onPress, divider = false }: { r: RequestDoc; timezone: string; hour12: boolean; onPress: () => void; divider?: boolean }) {
  const colors = useColors();
  const { Icon, color } = KIND[r.kind];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${r.studentName}: ${whatFor(r)}, ${shortDay(r.dateKey)}, ${timeRange(r.startMin, r.endMin, hour12)}. Asked ${askedWhen(r.createdAt, timezone, hour12)}`}
      style={({ pressed }) => [styles.row, divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, pressed && { backgroundColor: colors.accent }]}
      testID={`request-${r.id}`}
    >
      <View style={[styles.icon, { backgroundColor: `${color}1f` }]}>
        <Icon size={17} color={color} />
      </View>
      <View style={styles.grow}>
        <T variant="label" numberOfLines={1}>
          {r.studentName}
        </T>
        <T variant="small" tone="muted" numberOfLines={2}>
          {whatFor(r)} · {shortDay(r.dateKey)}, {timeRange(r.startMin, r.endMin, hour12)}
        </T>
        <T variant="tiny" tone="muted">
          Asked {askedWhen(r.createdAt, timezone, hour12)}
        </T>
      </View>
      <ChevronRight size={16} color={colors.mutedForeground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 64 },
  icon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  grow: { flex: 1, gap: 2 },
});
