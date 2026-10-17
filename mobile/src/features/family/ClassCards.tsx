import { familyNote } from "@shared/schedule/family";
import { type DateKey, parseDateKey } from "@shared/time";
import { ChevronRight } from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";
import { Avatar } from "@/components/Avatar";
import { Card } from "@/components/Card";
import { T } from "@/components/Text";
import type { ClassGroup } from "@/features/schedule/classes";
import { duration, longDay, shortDay, startsIn, timeLeft, timeRange } from "@/features/schedule/format";
import { radius, space, useColors } from "@/theme";
import { FamilyStatus } from "./FamilyStatus";
import { useFamily } from "./FamilyProvider";
import { hasEnded, isOnNow, namesList, relativeDay } from "./format";

/**
 * A family's classes, as cards and rows. A class is one coach's students at one time (ClassGroup): a parent's children
 * in the same class share one row, each with their own status and note; a student sees their own.
 */

interface When {
  today: DateKey;
  nowMin: number;
  hour12: boolean;
}

/** The weekday and the day of the month, in a small tile at a row's left (today's in the brand's red). */
function DateTile({ dateKey, today }: { dateKey: DateKey; today: DateKey }) {
  const colors = useColors();
  const on = dateKey === today;
  const fg = on ? colors.brandText : colors.foreground;
  return (
    <View style={[styles.tile, { backgroundColor: on ? colors.brandTint : colors.secondary }]} accessible={false}>
      <T variant="tiny" style={[styles.tileDay, { color: on ? colors.brandText : colors.mutedForeground }]}>
        {shortDay(dateKey).slice(0, 3).toUpperCase()}
      </T>
      <T style={[styles.tileDate, { color: fg }]}>{parseDateKey(dateKey).day}</T>
    </View>
  );
}

/** "NOW", on a class that's on. */
function NowPill() {
  const colors = useColors();
  return (
    <View style={[styles.now, { backgroundColor: colors.brandTint }]}>
      <View style={[styles.nowDot, { backgroundColor: colors.brand }]} />
      <T variant="tiny" style={{ color: colors.brandText, fontWeight: "700" }}>
        NOW
      </T>
    </View>
  );
}

/**
 * One class in a list: its time (and the day in a tile, where the list has no day headings), the coach, and each of
 * the family's students in it with their status and the class's note ("Makeup for 10/12"). Tapping it opens the class.
 */
export function FamilyClassRow({ group, when, showDate = false, divider = false, onPress, testID }: { group: ClassGroup; when: When; showDate?: boolean; divider?: boolean; onPress: () => void; testID?: string }) {
  const colors = useColors();
  const { who, firstName, shown } = useFamily();
  // A child's name where more than one child shows.
  const named = who === "parent" && shown.length > 1;
  const ended = hasEnded(group, when.today, when.nowMin);
  const live = isOnNow(group, when.today, when.nowMin) && group.active.length > 0;
  const single = group.sessions.length === 1;
  const only = group.sessions[0];
  const names = group.sessions.map((s) => firstName(s.studentId, s.studentName));
  const off = group.active.length === 0;
  const note = single ? familyNote(only.note) : "";
  const label = [shortDay(group.dateKey), timeRange(group.startMin, group.endMin, when.hour12), who === "parent" ? namesList(names) : null, `with ${group.coachName}`].filter(Boolean).join(", ");
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.row, divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, pressed && { backgroundColor: colors.accent }]}
    >
      {showDate ? <DateTile dateKey={group.dateKey} today={when.today} /> : null}
      <View style={styles.grow}>
        <View style={styles.line}>
          <T variant="label" numberOfLines={1} style={[styles.shrink, off && { color: colors.mutedForeground, textDecorationLine: "line-through" }]}>
            {timeRange(group.startMin, group.endMin, when.hour12)}
          </T>
          {live ? <NowPill /> : null}
          <View style={styles.grow} />
          {single ? <FamilyStatus status={only.status} ended={ended} /> : null}
        </View>
        <T variant="small" tone="muted">
          {[single && named ? names[0] : null, `with ${group.coachName}`].filter(Boolean).join(" · ")}
        </T>
        {note ? (
          <T variant="small" tone="muted">
            {note}
          </T>
        ) : null}
        {single
          ? null
          : group.sessions.map((s, i) => {
              const n = familyNote(s.note);
              return (
                <View key={s.id} style={styles.child}>
                  <View style={styles.line}>
                    <T variant="small" style={styles.childName}>
                      {names[i]}
                    </T>
                    <FamilyStatus status={s.status} ended={ended} />
                  </View>
                  {n ? (
                    <T variant="small" tone="muted">
                      {n}
                    </T>
                  ) : null}
                </View>
              );
            })}
      </View>
      <ChevronRight size={16} color={colors.mutedForeground} />
    </Pressable>
  );
}

/**
 * The next class, large: when (today's with how long until it starts, or how long is left), the time, the coach, and
 * each of the family's students in it with their status and the class's note. Tapping it opens the class.
 */
export function NextClassCard({ group, when, onPress, testID }: { group: ClassGroup; when: When; onPress: () => void; testID?: string }) {
  const colors = useColors();
  const { who, firstName } = useFamily();
  const near = relativeDay(group.dateKey, when.today);
  const live = isOnNow(group, when.today, when.nowMin);
  const label = near ? `${near} · ${shortDay(group.dateKey)}` : longDay(group.dateKey);
  const soon = group.dateKey === when.today ? (live ? timeLeft(group.endMin - when.nowMin) : startsIn(group.startMin - when.nowMin)) : null;
  const names = group.sessions.map((s) => firstName(s.studentId, s.studentName));
  const time = timeRange(group.startMin, group.endMin, when.hour12);
  return (
    <Card onPress={onPress} testID={testID} accessibilityLabel={[label, time, who === "parent" ? namesList(names) : null, `with ${group.coachName}`, soon].filter(Boolean).join(", ")} style={styles.card}>
      <View style={styles.line}>
        <T variant="small" numberOfLines={1} style={[styles.when, { color: group.dateKey === when.today ? colors.brandText : colors.mutedForeground }]}>
          {label.toUpperCase()}
        </T>
        {live ? <NowPill /> : soon ? (
          <T variant="small" tone="muted">
            {soon}
          </T>
        ) : null}
      </View>
      <T variant="title" style={styles.time} numberOfLines={1} adjustsFontSizeToFit>
        {time}
      </T>
      <T tone="muted">
        with {group.coachName} · {duration(group.endMin - group.startMin)}
      </T>
      {who === "student" ? (
        group.sessions.map((s) => {
          const note = familyNote(s.note);
          return (
            <View key={s.id} style={styles.studentLine}>
              <FamilyStatus status={s.status} ended={false} />
              {note ? (
                <T variant="small" tone="muted" style={styles.grow}>
                  {note}
                </T>
              ) : null}
            </View>
          );
        })
      ) : (
        <View style={[styles.children, { borderTopColor: colors.border }]}>
          {group.sessions.map((s, i) => {
            const note = familyNote(s.note);
            return (
              <View key={s.id} style={styles.kid}>
                <Avatar name={s.studentName} size={30} />
                <View style={styles.grow}>
                  <T variant="label">{names[i]}</T>
                  {note ? (
                    <T variant="small" tone="muted">
                      {note}
                    </T>
                  ) : null}
                </View>
                <FamilyStatus status={s.status} ended={false} />
              </View>
            );
          })}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  shrink: { flexShrink: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 60 },
  line: { flexDirection: "row", alignItems: "center", gap: space.sm },
  tile: { width: 46, paddingVertical: 6, borderRadius: radius.md, alignItems: "center", alignSelf: "flex-start" },
  tileDay: { fontWeight: "700", letterSpacing: 0.5 },
  tileDate: { fontSize: 19, fontWeight: "700", fontVariant: ["tabular-nums"] },
  child: { marginTop: 4, gap: 1 },
  childName: { flex: 1, fontWeight: "600" },
  now: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.full },
  nowDot: { width: 6, height: 6, borderRadius: 3 },
  card: { gap: 2 },
  when: { flex: 1, fontWeight: "700", letterSpacing: 0.5 },
  time: { fontSize: 26, marginTop: 2 },
  studentLine: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.sm },
  children: { marginTop: space.md, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth, gap: space.md },
  kid: { flexDirection: "row", alignItems: "center", gap: space.md },
});
