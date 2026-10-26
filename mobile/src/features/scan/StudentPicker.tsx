import { studentLabel } from "@shared/people";
import { takesSeat } from "@shared/schedule/classes";
import { formatTimeRange } from "@shared/time";
import { Search } from "lucide-react-native";
import { useMemo, useState } from "react";
import { FlatList, Modal, StyleSheet, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { ListRow, ListSection } from "@/components/List";
import { T } from "@/components/Text";
import { type StudentDoc, useAcademyNow, useClassesBetween, useStudentList } from "@/features/data/hooks";
import { firstName } from "@/features/schedule/classes";
import { listWords } from "@/features/schedule/format";
import { useStaffLook } from "@/features/schedule/parts";
import { radius, space, useColors } from "@/theme";

export interface PickedStudent {
  id: string;
  name: string;
}

/**
 * Who shot the card: today's classes first (the one on now, or that just ended, at the top), each with its time, the
 * coaches in and its students, then everyone, with a search. Finished students show only when searched for.
 */
export function StudentPicker({
  open,
  recent = null,
  onPick,
  onClose,
}: {
  open: boolean;
  /** The last card's student, offered first (the same student's next position often follows). */
  recent?: PickedStudent | null;
  onPick: (s: PickedStudent) => void;
  onClose: () => void;
}) {
  const colors = useColors();
  const { today, nowMin } = useAcademyNow();
  const { data: students } = useStudentList();
  const day = useClassesBetween(today);
  const look = useStaffLook();
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();

  const classes = useMemo(() => {
    const list = (day.byDate.get(today) ?? []).map((v) => ({ c: v.c, coaches: v.coaches, here: v.seats.filter(takesSeat) })).filter((x) => x.here.length);
    // The class on now or the latest one that ended, then the rest in time order.
    const score = (x: (typeof list)[number]) => (x.c.startMin <= nowMin && x.c.endMin + 60 >= nowMin ? 0 : x.c.endMin < nowMin ? 1 : 2);
    return list.sort((a, b) => score(a) - score(b) || (score(a) === 1 ? b.c.endMin - a.c.endMin : a.c.startMin - b.c.startMin));
  }, [day.byDate, today, nowMin]);

  const everyone = useMemo(
    () => students.filter((s) => (q ? s.nameLower.includes(q) || s.name.toLowerCase().includes(q) : s.status !== "finished")),
    [students, q],
  );
  const pick = (s: Pick<StudentDoc, "id" | "name">) => {
    onPick({ id: s.id, name: s.name });
    setSearch("");
  };

  return (
    <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={[styles.fill, { backgroundColor: colors.grouped }]} edges={["bottom"]}>
        <View style={styles.head}>
          <T variant="heading">Who shot this card?</T>
          <Button variant="ghost" size="sm" onPress={onClose} testID="student-picker-close">
            Cancel
          </Button>
        </View>
        <View style={[styles.search, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Search size={16} color={colors.mutedForeground} />
          <TextInput
            testID="student-search"
            value={search}
            onChangeText={setSearch}
            placeholder="Search students"
            placeholderTextColor={colors.mutedForeground}
            autoCorrect={false}
            clearButtonMode="while-editing"
            style={[styles.input, { color: colors.foreground }]}
          />
        </View>
        <FlatList
          data={everyone}
          keyExtractor={(s) => s.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            !q && (classes.length || recent) ? (
              <View style={styles.classes}>
                {recent ? (
                  <ListSection title="The last card’s student">
                    <ListRow title={recent.name} onPress={() => pick(recent)} testID={`pick-recent-${recent.id}`} />
                  </ListSection>
                ) : null}
                {classes.slice(0, 4).map(({ c, coaches, here }) => (
                  <ListSection key={c.id} title={[formatTimeRange(c.startMin, c.endMin), coaches.length ? listWords(coaches.map((k) => firstName(look.nameOf(k.staffId, k.name)))) : null].filter(Boolean).join(" · ")}>
                    {here.map((s) => (
                      <ListRow
                        key={s.id}
                        title={s.studentName}
                        subtitle={s.studentGrade ? `Grade ${s.studentGrade}` : undefined}
                        onPress={() => pick({ id: s.studentId, name: s.studentName })}
                        testID={`pick-${s.studentId}`}
                      />
                    ))}
                  </ListSection>
                ))}
                <T variant="small" tone="muted" style={styles.all}>
                  ALL STUDENTS
                </T>
              </View>
            ) : null
          }
          renderItem={({ item, index }) => (
            <View
              style={[
                styles.row,
                { backgroundColor: colors.card, borderColor: colors.border },
                index === 0 && styles.first,
                index === everyone.length - 1 && styles.last,
              ]}
            >
              <ListRow
                divider={index > 0}
                title={studentLabel(item.name, item.grade)}
                subtitle={[item.level, item.program].filter(Boolean).join(" · ") || undefined}
                onPress={() => pick(item)}
                testID={`pick-${item.id}`}
              />
            </View>
          )}
          ListEmptyComponent={
            <T tone="muted" style={styles.empty}>
              {q ? "No student by that name." : "No students yet."}
            </T>
          }
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.sm,
  },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    marginHorizontal: space.lg,
    marginBottom: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  input: { flex: 1, paddingVertical: 10, fontSize: 16 },
  list: { padding: space.lg, paddingBottom: space.xxl * 2 },
  classes: { gap: space.lg, marginBottom: space.sm },
  all: { fontWeight: "600", letterSpacing: 0.5, paddingHorizontal: space.xs },
  row: { borderLeftWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  first: { borderTopWidth: StyleSheet.hairlineWidth, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  last: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg },
  empty: { textAlign: "center", paddingVertical: space.xxl },
});
