import { gradeLabel } from "@shared/people";
import { SESSION_STATUS_LABELS } from "@shared/schedule/status";
import type { SessionStatus } from "@shared/settings/defaults";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { Ban, CalendarDays, Check, ChevronRight, Ellipsis, ExternalLink, Plus, StickyNote, UserX, X } from "lucide-react-native";
import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { showActions } from "@/components/ActionSheet";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { confirmAsync } from "@/components/Confirm";
import { EmptyState } from "@/components/EmptyState";
import { Hatch } from "@/components/Hatch";
import { IconButton } from "@/components/IconButton";
import { ListRow, ListSection } from "@/components/List";
import { Skeleton } from "@/components/Skeleton";
import { T } from "@/components/Text";
import { ToastHost } from "@/components/ToastHost";
import { type SessionDoc, type StudentDoc, useAcademyClass, useAcademyNow, useClassesBetween, useStudentList } from "@/features/data/hooks";
import { removeSeat, setSeatStatus } from "@/features/schedule/api";
import { type ClassView, isOnNow, isOver, levelsOf, ownTime } from "@/features/schedule/classes";
import { duration, longDay, plural, startsIn, timeLeft, timeRange } from "@/features/schedule/format";
import { KindTag, LevelChip, SeatCount, plainNote, useStaffLook } from "@/features/schedule/parts";
import { openWebsite } from "@/lib/links";
import { toast } from "@/lib/toast";
import { useBranch } from "@/state/BranchProvider";
import { radius, space, useColors } from "@/theme";

/**
 * The marks, in the sheets' words (the shared labels, with "Coming" for a student expected): here and no-show belong to
 * the day of the class (a class next week has nothing to mark yet).
 */
const MARK: Record<SessionStatus, string> = { ...SESSION_STATUS_LABELS, pending: "Coming", confirmed: "Coming" };
const ALL_MARKS: SessionStatus[] = ["confirmed", "present", "no_show", "canceled"];
const AHEAD_MARKS: SessionStatus[] = ["confirmed", "canceled"];

/**
 * A class, over the screen it was opened from (a sheet, loaded by the class's ID, so a link opens it too), as the
 * website's class sheet: when, its levels and seats taken; the coaches in at its time (who's in, every one of them
 * teaching it; the office opens a coach's page from here); the note for the coaches; and its students in their level's
 * colour with the rifle code and their label. The office marks each student as the website does (Coming, Here and
 * No-show from the day on, Canceled), on any day, past ones too (to put the record right), adds a student to an open
 * seat (a make-up, a trial, practice: /add-seat), and moves a student to another class or takes them out (each
 * student's ⋯); the class itself (its time, seats, note, who's in) changes on the website.
 */
export default function ClassSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { settings, isAdmin, isCoach, staffId, branchId, actor } = useBranch();
  const colors = useColors();
  const hour12 = settings.general.timeFormat !== "24h";
  const { today, nowMin } = useAcademyNow();
  const record = useAcademyClass(id ?? null);
  const day = record.data?.dateKey ?? null;
  const data = useClassesBetween(day);
  const look = useStaffLook();
  const students = useStudentList();
  const studentById = useMemo(() => new Map(students.data.map((s) => [s.id, s])), [students.data]);
  const v = day ? ((data.byDate.get(day) ?? []).find((x) => x.c.id === id) ?? null) : null;
  const close = () => (router.canGoBack() ? router.back() : router.replace("/"));

  if (record.loading || (day && data.loading)) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.grouped }]} testID="class-sheet">
        <View style={styles.content}>
          <Skeleton width="60%" height={28} />
          <Skeleton width="35%" height={18} />
          <Skeleton height={96} rounded={radius.lg} />
          <Skeleton height={64} rounded={radius.lg} />
        </View>
      </View>
    );
  }
  if (!v) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.grouped }]} testID="class-sheet">
        <EmptyState
          icon={<CalendarDays size={26} color={colors.mutedForeground} />}
          title="This class isn’t on the schedule"
          text="It may have been removed on the website."
          action={
            <Button variant="outline" onPress={close} testID="class-close">
              Close
            </Button>
          }
        />
      </View>
    );
  }

  const { c } = v;
  const me = isCoach ? staffId : null;
  // The office changes any class, a day that's over too, to put the record right (the owner, 2026-10-28).
  const editable = isAdmin;
  const marks = c.dateKey <= today ? ALL_MARKS : AHEAD_MARKS;
  // Canceled students last: they free their seat.
  const seats = [...v.seats].sort((a, b) => Number(a.status === "canceled") - Number(b.status === "canceled"));
  const levels = levelsOf(v, (sid) => studentById.get(sid)?.level);
  const live = isOnNow(v, today, nowMin);
  const soon = c.dateKey === today && !isOver(v, today, nowMin) ? (live ? `On now · ${timeLeft(c.endMin - nowMin)}` : `Starts ${startsIn(c.startMin - nowMin)}`) : null;
  const open = Math.max(0, c.seats - v.taken);
  // A student's other changes, as the website's seat menu: another class this week, or out of this one (to the Trash).
  const seatActions = (s: SessionDoc) =>
    showActions(s.studentName, [
      ...(s.status === "canceled" ? [] : [{ label: "Move to another class", onPress: () => router.push({ pathname: "/move-seat", params: { sessionId: s.id } }) }]),
      {
        label: "Take out of this class",
        destructive: true,
        onPress: () =>
          void confirmAsync({
            title: `Take ${s.studentName} out of this class?`,
            message: "It goes to the Trash, from where the website brings it back. To mark an absence, use Canceled instead.",
            confirmLabel: "Take out",
            destructive: true,
          }).then((ok) => {
            if (!ok) return;
            removeSeat(branchId, actor, s);
            toast.success(`${s.studentName} taken out of the class`);
          }),
      },
    ]);

  return (
    <>
      <ScrollView style={[styles.fill, { backgroundColor: colors.grouped }]} contentContainerStyle={styles.content} testID="class-sheet">
        <View style={styles.top}>
          <View style={styles.grow}>
            <T variant="title" accessibilityRole="header" testID="class-time">
              {timeRange(c.startMin, c.endMin, hour12)}
            </T>
            <T tone="muted">
              {longDay(c.dateKey)} · {duration(c.endMin - c.startMin)}
            </T>
            {soon ? (
              <T variant="small" style={{ color: colors.brandText, fontWeight: "600" }}>
                {soon}
              </T>
            ) : null}
          </View>
          <IconButton icon={<X size={20} color={colors.foreground} />} accessibilityLabel="Close" onPress={close} filled testID="class-close" />
        </View>
        <View style={styles.levels}>
          {levels.map((l) => (
            <LevelChip key={l} level={l} />
          ))}
          <View style={styles.grow} />
          <SeatCount used={v.taken} of={c.seats} />
        </View>

        {v.coaches.length ? (
          <ListSection title="Coaches" detail={plural(v.coaches.length, "coach", "coaches")} testID="class-coaches">
            {v.coaches.map((k) => {
              const name = look.nameOf(k.staffId, k.name);
              const r = k.ranges;
              const sub = k.partial
                ? `Only ${timeRange(Math.max(r[0].startMin, c.startMin), Math.min(r[r.length - 1].endMin, c.endMin), hour12)}`
                : `In ${r.map((x) => timeRange(x.startMin, x.endMin, hour12)).join(", ")}`;
              return (
                <ListRow
                  key={k.staffId}
                  icon={<Avatar name={name} size={36} color={look.colorOf(k.staffId)} />}
                  title={k.staffId === me ? `${name} (you)` : name}
                  subtitle={
                    <T variant="small" style={{ color: k.partial ? colors.warning : colors.mutedForeground, fontWeight: k.partial ? "600" : "400" }}>
                      {sub}
                    </T>
                  }
                  // The office opens a coach's page (their phone and email); coaches can't read each other's records.
                  onPress={isAdmin ? () => router.push({ pathname: "/coach/[id]", params: { id: k.staffId } }) : undefined}
                  testID={`class-coach-${k.staffId}`}
                />
              );
            })}
          </ListSection>
        ) : (
          <Card style={[styles.warn, { backgroundColor: colors.warningTint, borderColor: colors.warningTint }]} testID="class-no-coach">
            <T variant="label" style={{ color: colors.warning }}>
              No coach is in at this time
            </T>
            <T variant="small" tone="muted">
              {isAdmin ? "Set who’s in on the website’s schedule." : "The office sets who’s in; your own hours are on the Availability tab."}
            </T>
          </Card>
        )}

        {c.note?.trim() ? (
          <ListSection title="Note for the coaches" testID="class-note">
            <View style={styles.noteRow}>
              <StickyNote size={16} color={colors.mutedForeground} />
              <T style={styles.grow}>{c.note.trim()}</T>
            </View>
          </ListSection>
        ) : null}

        <ListSection
          title="Students"
          detail={`${v.taken} of ${plural(c.seats, "seat")}`}
          footer={editable ? "Changes save at once, as on the website. A student’s ⋯ moves them or takes them out." : undefined}
          testID="class-students"
        >
          {[
            ...seats.map((s) => (
              <SeatRow
                key={s.id}
                seat={s}
                v={v}
                student={studentById.get(s.studentId)}
                hour12={hour12}
                marks={editable ? marks : null}
                onMark={(status) => setSeatStatus(branchId, actor, s, status)}
                onMore={editable ? () => seatActions(s) : undefined}
              />
            )),
            ...(open ? [<OpenSeats key="open" count={open} onAdd={editable ? () => router.push({ pathname: "/add-seat", params: { classId: c.id } }) : undefined} />] : []),
            ...(!seats.length && !open ? [<ListRow key="none" title="No students" />] : []),
          ]}
        </ListSection>

        <Button
          variant="outline"
          icon={<ExternalLink size={18} color={colors.foreground} />}
          onPress={() => void openWebsite(`/${isAdmin ? "admin" : "coach"}/schedule/day/${c.dateKey}?class=${c.id}`)}
          testID="class-open-website"
        >
          {isAdmin ? "Change the class on the website" : "Open on the website"}
        </Button>
      </ScrollView>
      {/* A sheet is drawn above the app's toasts: its own layer shows them over it, whatever is scrolled. */}
      <ToastHost />
    </>
  );
}

/**
 * A student in the class: their name and grade, their level in its colour with the rifle code, the label ("MU for
 * 10/13", "Trial 1") and their own time when they're in for part of it; then their mark: buttons for the office, or
 * what it is. Tapping the name opens the student.
 */
function SeatRow({
  seat,
  v,
  student,
  hour12,
  marks,
  onMark,
  onMore,
  divider = false,
}: {
  seat: SessionDoc;
  v: ClassView;
  student: StudentDoc | undefined;
  hour12: boolean;
  /** The marks the office can set; null: read-only. */
  marks: SessionStatus[] | null;
  onMark: (status: SessionStatus) => void;
  /** The office's other changes to the seat (move, take out). */
  onMore?: () => void;
  divider?: boolean;
}) {
  const colors = useColors();
  const canceled = seat.status === "canceled";
  const grade = student?.grade ?? seat.studentGrade;
  const note = plainNote(seat.note);
  const own = ownTime(seat, v) ? timeRange(seat.startMin, seat.endMin, hour12) : null;
  const shown: SessionStatus = seat.status === "pending" ? "confirmed" : seat.status;
  return (
    <View style={[styles.seat, divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]} testID={`class-student-${seat.studentId}`}>
      <View style={styles.headLine}>
        <Pressable
          onPress={() => router.push({ pathname: "/student/[id]", params: { id: seat.studentId } })}
          accessibilityRole="button"
          accessibilityLabel={[seat.studentName, grade ? gradeLabel(grade) : null, student?.level ?? "no level yet", student?.rifle ? `rifle ${student.rifle}` : null, (seat.note ?? "").trim() || null, own, MARK[seat.status]].filter(Boolean).join(", ")}
          accessibilityHint="Opens the student"
          style={({ pressed }) => [styles.seatHead, styles.fill, pressed && styles.pressed]}
        >
          <View style={[styles.grow, canceled && styles.faded]}>
            <View style={styles.nameLine}>
              <T variant="label" style={[styles.shrink, canceled && styles.struck]} numberOfLines={1}>
                {seat.studentName}
              </T>
              {grade ? (
                <T variant="small" tone="muted">
                  {gradeLabel(grade)}
                </T>
              ) : null}
            </View>
            <View style={styles.tags}>
              <LevelChip level={student?.level} rifle={student?.rifle} />
              <KindTag note={seat.note} />
              {own ? (
                <T variant="tiny" tone="muted" style={styles.figure}>
                  {own}
                </T>
              ) : null}
              {note ? (
                <T variant="tiny" tone="muted" numberOfLines={1} style={styles.shrink}>
                  {note}
                </T>
              ) : null}
            </View>
          </View>
          {!marks ? <MarkShown status={seat.status} /> : null}
          {onMore ? null : <ChevronRight size={16} color={colors.mutedForeground} />}
        </Pressable>
        {onMore ? (
          <IconButton icon={<Ellipsis size={18} color={colors.mutedForeground} />} size={34} accessibilityLabel={`More for ${seat.studentName}`} onPress={onMore} testID={`class-more-${seat.studentId}`} />
        ) : null}
      </View>
      {marks ? (
        <View style={styles.marks} accessibilityRole="radiogroup" accessibilityLabel={`Mark ${seat.studentName}`}>
          {marks.map((m) => {
            const on = shown === m;
            const tone = m === "canceled" ? { bg: colors.destructiveTint, fg: colors.destructive } : m === "present" ? { bg: colors.successTint, fg: colors.success } : { bg: colors.secondary, fg: colors.foreground };
            return (
              <Pressable
                key={m}
                onPress={() => {
                  if (on) return;
                  void Haptics.selectionAsync().catch(() => undefined);
                  onMark(m);
                }}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={MARK[m]}
                style={({ pressed }) => [styles.mark, { borderColor: on ? tone.fg : colors.border, backgroundColor: on ? tone.bg : "transparent" }, pressed && !on && { backgroundColor: colors.accent }]}
                testID={`class-mark-${seat.studentId}-${m}`}
              >
                <T variant="small" style={{ color: on ? tone.fg : colors.mutedForeground, fontWeight: on ? "700" : "500" }} numberOfLines={1}>
                  {MARK[m]}
                </T>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

/**
 * A mark already set, when it can't be changed here (a coach's view, a past day), as the website's day shows it: here in
 * green, a no-show quiet, canceled in red; nothing while the student is coming.
 */
function MarkShown({ status }: { status: SessionStatus }) {
  const colors = useColors();
  if (status !== "present" && status !== "no_show" && status !== "canceled") return null;
  const Icon = status === "present" ? Check : status === "no_show" ? UserX : Ban;
  const color = status === "present" ? colors.success : status === "no_show" ? colors.mutedForeground : colors.destructive;
  return (
    <View style={styles.shown} testID={`class-mark-shown-${status}`}>
      <Icon size={14} color={color} strokeWidth={2.5} />
      <T variant="small" style={{ color, fontWeight: "600" }}>
        {MARK[status]}
      </T>
    </View>
  );
}

/** The seats still free, hatched as the sheets blacken them; for the office, a tap adds a student to one. */
function OpenSeats({ count, onAdd, divider = false }: { count: number; onAdd?: () => void; divider?: boolean }) {
  const colors = useColors();
  const line = divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border };
  const box = (
    <View style={[styles.openBox, { borderColor: colors.border }]}>
      <Hatch />
      <View style={styles.openLine}>
        {onAdd ? <Plus size={15} color={colors.foreground} strokeWidth={2.5} /> : null}
        <T variant="small" tone={onAdd ? "default" : "muted"} style={styles.openText}>
          {onAdd ? `Add a student · ${plural(count, "open seat")}` : plural(count, "open seat")}
        </T>
      </View>
    </View>
  );
  if (!onAdd)
    return (
      <View style={[styles.openRow, line]} testID="class-open-seats">
        {box}
      </View>
    );
  return (
    <Pressable
      onPress={onAdd}
      accessibilityRole="button"
      accessibilityLabel={`Add a student, ${plural(count, "open seat")}`}
      style={({ pressed }) => [styles.openRow, line, pressed && styles.pressed]}
      testID="class-add-student"
    >
      {box}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl * 2 },
  top: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  grow: { flex: 1, gap: 2 },
  shrink: { flexShrink: 1 },
  levels: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: -space.sm },
  warn: { gap: 2 },
  noteRow: { flexDirection: "row", alignItems: "flex-start", gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.md },
  seat: { paddingHorizontal: space.lg, paddingVertical: space.md, gap: space.sm },
  headLine: { flexDirection: "row", alignItems: "center", gap: space.sm },
  seatHead: { flexDirection: "row", alignItems: "center", gap: space.md },
  pressed: { opacity: 0.6 },
  faded: { opacity: 0.6 },
  nameLine: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  struck: { textDecorationLine: "line-through" },
  tags: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 5, marginTop: 3 },
  figure: { fontVariant: ["tabular-nums"] },
  marks: { flexDirection: "row", gap: 6 },
  shown: { flexDirection: "row", alignItems: "center", gap: 4 },
  mark: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 34, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: 4 },
  openRow: { padding: space.md },
  openBox: { height: 40, borderRadius: radius.md, borderWidth: 1, borderStyle: "dashed", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  openLine: { flexDirection: "row", alignItems: "center", gap: 4 },
  openText: { fontWeight: "500" },
});
