import { cellsOf, seatKind } from "@shared/schedule/classes";
import { KIND_COLORS } from "@shared/schedule/seatColors";
import { SESSION_STATUS_LABELS } from "@shared/schedule/status";
import { StickyNote } from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";
import { Hatch } from "@/components/Hatch";
import { T } from "@/components/Text";
import type { SessionDoc, StudentDoc } from "@/features/data/hooks";
import { radius, space, useColors } from "@/theme";
import { type ClassView, firstName, isOnNow, ownTime, teaches } from "./classes";
import { listWords, shortRange, timeRange } from "./format";
import { CoachesIn, NowPill, SeatCount, type StaffLook, StatusMark, useLevelFill, useSeatFill } from "./parts";

/**
 * A class on the schedule as the academy's sheets lay it out (docs/DECISIONS.md §21): its time (NOW while it's on) and
 * the seats taken ("4/6"), the coaches in, then its seats two across, each student in their level's colour with their
 * rifle code (a make-up, extra practice or a trial in its label's colour, with the level as a bar at its edge) and a mark
 * once they're here, a no-show or canceled; open seats hatched; and the class's note for the coaches. For a coach, the
 * classes in their hours stand out and the others are a little faded, as on the website. Tapping it opens the class.
 */
export function ClassCard({
  v,
  today,
  nowMin,
  hour12,
  me,
  look,
  studentOf,
  onPress,
  testID,
}: {
  v: ClassView;
  today: string;
  nowMin: number;
  hour12: boolean;
  /** The coach looking (null for the office): their classes stand out. */
  me: string | null;
  look: StaffLook;
  studentOf: (id: string) => StudentDoc | undefined;
  onPress: () => void;
  testID?: string;
}) {
  const colors = useColors();
  const { c } = v;
  const { cells, open, overflow } = cellsOf(v.seats, c.seats);
  const live = isOnNow(v, today, nowMin);
  const faded = !!me && !teaches(v, me);
  const boxes: (SessionDoc | null)[] = [...cells, ...Array.from({ length: open }, () => null)];
  const rows: (SessionDoc | null)[][] = [];
  for (let i = 0; i < boxes.length; i += 2) rows.push(boxes.slice(i, i + 2));
  const coaches = v.coaches.map((k) => (k.staffId === me ? "you" : firstName(look.nameOf(k.staffId, k.name))));
  const label = [
    timeRange(c.startMin, c.endMin, hour12),
    live ? "on now" : null,
    `${v.taken} of ${c.seats} seats taken`,
    coaches.length ? `coaches in: ${listWords(coaches)}` : "no coach in",
    v.seats.length ? `students: ${v.seats.map((s) => [s.studentName, s.status === "confirmed" || s.status === "pending" ? null : SESSION_STATUS_LABELS[s.status], (s.note ?? "").trim() || null].filter(Boolean).join(" ")).join(", ")}` : "no students yet",
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Opens the class"
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: pressed ? colors.accent : colors.card, borderColor: live ? colors.brand : colors.border, opacity: faded ? 0.6 : 1 },
      ]}
    >
      <View style={styles.head}>
        <T variant="label" style={styles.time} numberOfLines={1}>
          {timeRange(c.startMin, c.endMin, hour12)}
        </T>
        {live ? <NowPill /> : null}
        <View style={styles.grow} />
        <SeatCount used={v.taken} of={c.seats} />
      </View>
      <CoachesIn v={v} look={look} me={me} hour12={hour12} />
      <View style={styles.grid}>
        {rows.map((row, i) => (
          <View key={i} style={styles.row}>
            {row.map((s, j) => (s ? <Seat key={s.id} seat={s} v={v} student={studentOf(s.studentId)} hour12={hour12} /> : <OpenSeat key={`open-${i}-${j}`} />))}
            {row.length === 1 ? <View style={styles.cell} /> : null}
          </View>
        ))}
      </View>
      {overflow.length ? (
        <T variant="tiny" tone="muted" numberOfLines={2}>
          {"Also canceled: "}
          <T variant="tiny" tone="muted" style={styles.struck}>
            {listWords(overflow.map((s) => s.studentName))}
          </T>
        </T>
      ) : null}
      {c.note?.trim() ? (
        <View style={styles.note}>
          <StickyNote size={13} color={colors.mutedForeground} />
          <T variant="small" tone="muted" style={styles.grow} numberOfLines={2}>
            {c.note.trim()}
          </T>
        </View>
      ) : null}
      {!v.seats.length ? (
        <T variant="small" tone="muted">
          No students yet
        </T>
      ) : null}
    </Pressable>
  );
}

/** A seat as the sheet colours it: the level (or the label's colour), the rifle code, the name, the mark. */
function Seat({ seat, v, student, hour12 }: { seat: SessionDoc; v: ClassView; student: StudentDoc | undefined; hour12: boolean }) {
  const seatFill = useSeatFill();
  const levelFill = useLevelFill();
  const level = student?.level ?? null;
  const kind = seatKind(seat.note);
  const special = kind !== "regular";
  const fill = special ? seatFill(KIND_COLORS[kind]) : levelFill(level);
  const canceled = seat.status === "canceled";
  const top = special ? (seat.note ?? "").trim() || KIND_COLORS[kind].name : level || "New";
  const own = ownTime(seat, v) ? shortRange(seat.startMin, seat.endMin, hour12) : null;
  return (
    <View style={[styles.cell, styles.seat, { backgroundColor: fill.bg, opacity: canceled ? 0.45 : seat.status === "no_show" ? 0.7 : 1 }]}>
      {special && level ? <View style={[styles.edge, { backgroundColor: levelFill(level).dot }]} /> : null}
      <View style={styles.seatTop}>
        <T style={[styles.seatLabel, { color: fill.ink }, special && styles.strong]} numberOfLines={1}>
          {top}
        </T>
        {student?.rifle ? <T style={[styles.rifle, { color: fill.ink }]}>{student.rifle}</T> : null}
        <View style={styles.grow} />
        {own ? <T style={[styles.own, { color: fill.ink }]}>{own}</T> : null}
        <StatusMark status={seat.status} size={14} />
      </View>
      <T style={[styles.seatName, { color: fill.ink }, canceled && styles.struck]} numberOfLines={1}>
        {seat.studentName}
      </T>
    </View>
  );
}

/** An unused seat, hatched as the sheets blacken them. */
function OpenSeat() {
  const colors = useColors();
  return (
    <View style={[styles.cell, styles.seat, styles.open, { borderColor: colors.border }]} accessibilityLabel="Open seat">
      <Hatch />
    </View>
  );
}

const SEAT_HEIGHT = 44;

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: space.md, gap: space.sm },
  head: { flexDirection: "row", alignItems: "center", gap: space.sm },
  time: { fontSize: 16, fontVariant: ["tabular-nums"] },
  grow: { flex: 1 },
  grid: { gap: 4 },
  row: { flexDirection: "row", gap: 4 },
  cell: { flex: 1, minWidth: 0 },
  seat: { height: SEAT_HEIGHT, borderRadius: 7, paddingHorizontal: 8, justifyContent: "center", overflow: "hidden" },
  edge: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3 },
  seatTop: { flexDirection: "row", alignItems: "center", gap: 5 },
  seatLabel: { fontSize: 11, fontWeight: "500", flexShrink: 1 },
  strong: { fontWeight: "700" },
  rifle: { fontSize: 11, fontWeight: "800", fontVariant: ["tabular-nums"] },
  own: { fontSize: 10, fontWeight: "600", fontVariant: ["tabular-nums"] },
  seatName: { fontSize: 13, fontWeight: "600", marginTop: 1 },
  struck: { textDecorationLine: "line-through" },
  open: { borderWidth: 1, borderStyle: "dashed" },
  note: { flexDirection: "row", alignItems: "flex-start", gap: 6, paddingTop: 2 },
});
