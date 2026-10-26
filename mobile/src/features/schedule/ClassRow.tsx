import { takesSeat } from "@shared/schedule/classes";
import { ChevronRight } from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import { T } from "@/components/Text";
import { radius, space, useColors } from "@/theme";
import { type ClassView, firstName, isOnNow, isOver } from "./classes";
import { clock, listWords, nameList, plural, shortName, timeRange } from "./format";
import { SeatCount, type StaffLook } from "./parts";

/** How a class stands, as the website's Home says it. */
function stateOf(v: ClassView, today: string, nowMin: number): string {
  if (isOver(v, today, nowMin)) return "Done";
  if (isOnNow(v, today, nowMin)) return "In progress";
  if (!v.taken) return "No students";
  return v.taken >= v.c.seats ? "Full" : `${plural(v.c.seats - v.taken, "seat")} open`;
}

/**
 * A class in a list (Home's day, a coach's days), as the website's Home lists them: when it starts and ends, its
 * students, the seats taken ("4/6": full, or the seats still open) and the coaches in (for a coach, the others in with
 * them); "In progress" while it's on, and faded once it's done. Tapping it opens the class.
 */
export function ClassRow({
  v,
  today,
  nowMin,
  hour12,
  me = null,
  look,
  divider = false,
  onPress,
  testID,
}: {
  v: ClassView;
  today: string;
  nowMin: number;
  hour12: boolean;
  /** The coach looking (null for the office): the line names the other coaches in with them. */
  me?: string | null;
  look: StaffLook;
  /** Set by ListSection on every row after the first. */
  divider?: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const colors = useColors();
  const { c } = v;
  const names = v.seats.filter(takesSeat).map((s) => shortName(s.studentName));
  const state = stateOf(v, today, nowMin);
  const done = state === "Done";
  const others = v.coaches.filter((k) => k.staffId !== me);
  // A coach reads who else is in; the office sees each coach's initials (the class names them all).
  const withOthers = others.length ? `With ${listWords(others.map((k) => firstName(look.nameOf(k.staffId, k.name))))}` : "No other coach in";
  const coachNames = listWords(v.coaches.map((k) => firstName(look.nameOf(k.staffId, k.name))));
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={[timeRange(c.startMin, c.endMin, hour12), names.length ? nameList(names) : "no students yet", `${v.taken} of ${c.seats} seats`, me ? withOthers : v.coaches.length ? `coaches in: ${coachNames}` : "no coach in", state].join(", ")}
      onPress={onPress}
      style={({ pressed }) => [styles.row, divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, pressed && { backgroundColor: colors.accent }]}
    >
      <View style={[styles.times, done && styles.faded]}>
        <T variant="label" style={styles.figure}>
          {clock(c.startMin, hour12)}
        </T>
        <T variant="small" tone="muted" style={styles.figure}>
          {clock(c.endMin, hour12)}
        </T>
      </View>
      <View style={[styles.grow, done && styles.faded]}>
        <T variant="label" tone={names.length ? "default" : "muted"} numberOfLines={2}>
          {names.length ? nameList(names) : "No students yet"}
        </T>
        <View style={styles.meta}>
          <SeatCount used={v.taken} of={c.seats} />
          {!v.coaches.length ? (
            <T variant="small" style={[styles.shrink, { color: colors.warning, fontWeight: "600" }]} numberOfLines={1}>
              No coach in
            </T>
          ) : me ? (
            <T variant="small" tone="muted" numberOfLines={1} style={styles.shrink}>
              {withOthers}
            </T>
          ) : (
            <View style={styles.badges}>
              {v.coaches.map((k, i) => (
                <View key={k.staffId} style={[styles.badge, i > 0 && styles.overlap, { borderColor: colors.card }]}>
                  <Avatar name={look.nameOf(k.staffId, k.name)} size={20} color={look.colorOf(k.staffId)} />
                </View>
              ))}
            </View>
          )}
          {/* The seats taken say whether it's full or has room; a class on now says so. */}
          {state === "In progress" ? (
            <>
              <View style={styles.spacer} />
              <Badge tone="success">{state}</Badge>
            </>
          ) : null}
        </View>
      </View>
      <ChevronRight size={16} color={colors.mutedForeground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 60 },
  times: { width: 64, alignSelf: "flex-start" },
  figure: { fontVariant: ["tabular-nums"] },
  grow: { flex: 1, gap: 6 },
  faded: { opacity: 0.6 },
  meta: { flexDirection: "row", alignItems: "center", gap: space.sm },
  badges: { flexDirection: "row" },
  badge: { borderWidth: 1.5, borderRadius: radius.full },
  overlap: { marginLeft: -6 },
  shrink: { flexShrink: 1 },
  spacer: { flex: 1 },
});
