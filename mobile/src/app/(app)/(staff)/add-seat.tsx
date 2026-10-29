import { collection, query, where } from "@react-native-firebase/firestore";
import { COL, ROOT } from "@shared/paths";
import { gradeLabel, isInactiveStudent } from "@shared/people";
import { MAKEUP_LOOKBACK_DAYS, makeupLabel, makeupsOwed } from "@shared/schedule/classes";
import { addDays, diffDays } from "@shared/time";
import type { Session } from "@shared/types";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { CalendarDays, X } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { IconButton } from "@/components/IconButton";
import { FilterChips } from "@/components/FilterChips";
import { ListRow, ListSection } from "@/components/List";
import { Screen } from "@/components/Screen";
import { SearchField } from "@/components/SearchField";
import { SkeletonCards } from "@/components/Skeleton";
import { T } from "@/components/Text";
import { type StudentDoc, useAcademyClass, useAcademyNow, useClassesBetween, useStudentList } from "@/features/data/hooks";
import { findsStudent, goesBy } from "@/features/students/search";
import { addSeat } from "@/features/schedule/api";
import { longDay, plural, timeRange } from "@/features/schedule/format";
import { LevelChip } from "@/features/schedule/parts";
import { db } from "@/lib/firebase";
import { useQuery } from "@/lib/firestore";
import { toast } from "@/lib/toast";
import { useBranch } from "@/state/BranchProvider";
import { space, useColors } from "@/theme";

type Kind = "regular" | "practice" | "trial" | "evaluation";
const KINDS: { value: Kind; label: string; testID: string }[] = [
  { value: "regular", label: "Class", testID: "add-seat-kind-regular" },
  { value: "practice", label: "Practice", testID: "add-seat-kind-practice" },
  { value: "trial", label: "Trial", testID: "add-seat-kind-trial" },
  { value: "evaluation", label: "Evaluation", testID: "add-seat-kind-evaluation" },
];
/** Make-ups owed shown at first; the rest are a tap away. */
const OWED_SHOWN = 5;

/**
 * The office puts a student in a class's open seat, as the website's "Add a student" (web/src/features/schedule/
 * AddSeatDialog.tsx): make-ups still owed first (the absences of the last six weeks without a make-up, nearest this
 * class first), each booked with its label ("MU for 11/2"); then every active student, those at the class's levels
 * first, as a regular seat, Practice, a trial ("Trial 1", "Trial 2") or an evaluation. A tap books them for the whole
 * class (part of a class is set on the website) and comes back to the class. Opened with the class's ID.
 */
export default function AddSeatScreen() {
  const { classId } = useLocalSearchParams<{ classId: string }>();
  const { branchId, actor, timezone, settings, isAdmin } = useBranch();
  const colors = useColors();
  const hour12 = settings.general.timeFormat !== "24h";
  const { today } = useAcademyNow();
  const record = useAcademyClass(classId ?? null);
  const day = record.data?.dateKey ?? null;
  const data = useClassesBetween(day);
  const v = day ? ((data.byDate.get(day) ?? []).find((x) => x.c.id === classId) ?? null) : null;
  const students = useStudentList();
  // The academy's absences of the last six weeks (and those planned in the next four) without a make-up yet.
  const since = addDays(today, -MAKEUP_LOOKBACK_DAYS);
  const recent = useQuery<Session>(isAdmin ? `owed-${branchId}-${since}` : null, () =>
    query(collection(db, ROOT.branches, branchId, COL.sessions), where("dateKey", ">=", since), where("dateKey", "<=", addDays(today, 28))),
  );
  const owed = useMemo(() => makeupsOwed(recent.data, since), [recent.data, since]);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<Kind>("regular");
  const [trial, setTrial] = useState<"1" | "2">("1");
  const [allOwed, setAllOwed] = useState(false);

  if (record.loading || (day && data.loading) || students.loading) {
    return (
      <Screen typing={false} testID="add-seat-screen">
        <SkeletonCards count={5} height={56} />
      </Screen>
    );
  }
  if (!v || !isAdmin || v.c.dateKey < today) {
    return (
      <Screen typing={false} testID="add-seat-screen">
        <EmptyState
          icon={<CalendarDays size={26} color={colors.mutedForeground} />}
          title={v && v.c.dateKey < today ? "This class is over" : "This class isn’t on the schedule"}
          text={v && v.c.dateKey < today ? "A class’s students can be changed until its day is over." : "It may have been removed on the website."}
          action={
            <Button variant="outline" onPress={() => router.back()} testID="add-seat-back">
              Back
            </Button>
          }
        />
      </Screen>
    );
  }

  const { c } = v;
  const byId = new Map(students.data.map((s) => [s.id, s]));
  const here = new Set(v.seats.filter((s) => s.status !== "canceled").map((s) => s.studentId));
  const levels = new Set(v.seats.map((s) => byId.get(s.studentId)?.level).filter(Boolean));
  const needle = q.trim().toLowerCase();
  const list = students.data
    .filter((s) => !here.has(s.id) && !isInactiveStudent(s.status) && findsStudent(s, needle))
    .sort((a, b) => Number(levels.has(b.level)) - Number(levels.has(a.level)) || a.name.localeCompare(b.name));
  const owedNear = owed.filter((o) => !here.has(o.studentId) && o.classId !== c.id && byId.has(o.studentId)).sort((a, b) => Math.abs(diffDays(a.dateKey, c.dateKey)) - Math.abs(diffDays(b.dateKey, c.dateKey)));
  const owedShown = allOwed ? owedNear : owedNear.slice(0, OWED_SHOWN);
  const open = c.seats - v.taken;
  const order = Math.max(-1, ...v.seats.map((s) => s.visualOrder ?? 0)) + 1;
  const label = kind === "practice" ? "Practice" : kind === "trial" ? `Trial ${trial}` : kind === "evaluation" ? "Evaluation" : "";

  const pick = (st: StudentDoc, as: string) => {
    if (open <= 0) return;
    addSeat(branchId, actor, timezone, c, { student: st, label: as }, order);
    toast.success(`${st.name} added${as ? ` (${as})` : ""}`, { description: `${longDay(c.dateKey)}, ${timeRange(c.startMin, c.endMin, hour12)}` });
    router.back();
  };

  return (
    <>
      <CloseOnIPhone />
      <Screen testID="add-seat-screen">
        <View style={styles.head}>
          <T variant="label">
            {longDay(c.dateKey)} · {timeRange(c.startMin, c.endMin, hour12)}
          </T>
          <T variant="small" tone={open > 0 ? "muted" : "destructive"} testID="add-seat-open">
            {open > 0 ? `${plural(open, "open seat")} of ${c.seats}` : "The class is full: take a student out or move one first."}
          </T>
        </View>

        {owedShown.length ? (
          <ListSection title="Make-ups owed" footer="Booked with the class they make up as the label." testID="add-seat-owed">
            {[
              ...owedShown.map((o) => {
                const st = byId.get(o.studentId)!;
                const mu = makeupLabel(o.dateKey);
                return (
                  <ListRow
                    key={o.id}
                    title={st.name}
                    subtitle={<LevelChip level={st.level} rifle={st.rifle} />}
                    right={
                      <T variant="small" style={{ color: colors.destructive, fontWeight: "600" }}>
                        {mu}
                      </T>
                    }
                    onPress={open > 0 ? () => pick(st, mu) : undefined}
                    testID={`add-seat-owed-${o.id}`}
                  />
                );
              }),
              ...(owedNear.length > owedShown.length ? [<ListRow key="more" title={`${owedNear.length - owedShown.length} more`} onPress={() => setAllOwed(true)} testID="add-seat-owed-more" />] : []),
            ]}
          </ListSection>
        ) : null}

        <View style={styles.kinds}>
          <FilterChips value={kind} onChange={setKind} options={KINDS} testID="add-seat-kind" />
          {kind === "trial" ? (
            <FilterChips
              value={trial}
              onChange={setTrial}
              options={[
                { value: "1", label: "Trial 1", testID: "add-seat-trial-1" },
                { value: "2", label: "Trial 2", testID: "add-seat-trial-2" },
              ]}
              testID="add-seat-trial"
            />
          ) : null}
        </View>
        <SearchField value={q} onChangeText={setQ} placeholder="Search students" testID="add-seat-search" />

        {list.length ? (
          <ListSection title={label ? `Add as ${label}` : "Students"} testID="add-seat-students">
            {list.map((st) => (
              <ListRow
                key={st.id}
                title={st.name}
                subtitle={[goesBy(st, needle), st.grade ? gradeLabel(st.grade) : null].filter(Boolean).join(" · ") || undefined}
                right={<LevelChip level={st.level} rifle={st.rifle} />}
                onPress={open > 0 ? () => pick(st, label) : undefined}
                testID={`add-seat-student-${st.id}`}
              />
            ))}
          </ListSection>
        ) : (
          <Card>
            <T tone="muted">No student matches.</T>
          </Card>
        )}
      </Screen>
    </>
  );
}

/** The iPhone opens this over the class's sheet, where it has no back button: a Close in its place. */
function CloseOnIPhone() {
  const colors = useColors();
  if (Platform.OS !== "ios") return null;
  return (
    <Stack.Screen
      options={{
        headerLeft: () => <IconButton icon={<X size={22} color={colors.foreground} />} accessibilityLabel="Close" onPress={() => router.back()} testID="add-seat-close" />,
      }}
    />
  );
}

const styles = StyleSheet.create({
  head: { gap: 2, paddingHorizontal: space.xs },
  kinds: { gap: space.sm },
});
