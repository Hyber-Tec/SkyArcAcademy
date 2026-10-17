import { router } from "expo-router";
import { UsersRound } from "lucide-react-native";
import { useMemo, useState } from "react";
import { FlatList, Platform, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { STUDENT_STATUS_LABELS, isInactiveStudent, studentLabel } from "@shared/people";
import { Avatar } from "@/components/Avatar";
import { EmptyState } from "@/components/EmptyState";
import { FilterChips } from "@/components/FilterChips";
import { SearchField } from "@/components/SearchField";
import { SkeletonCards } from "@/components/Skeleton";
import { StatusBarScrim, TabHeader } from "@/components/TabHeader";
import { T } from "@/components/Text";
import { useStudentList, useTaughtStudentIds } from "@/features/data/hooks";
import { useBranch } from "@/state/BranchProvider";
import { studentLine } from "@/features/students/format";
import { space, useColors } from "@/theme";

type Show = "mine" | "active" | "all";

/**
 * Every student, by name, with a search field at the top: the current ones by default, everyone with "All". A coach
 * starts with their own students (classes in the last 90 days or coming), as on the website. A student opens their
 * page: classes, scores and Drive files (and, for the office, the family's contacts).
 */
export default function StudentsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isCoach } = useBranch();
  const students = useStudentList();
  const taught = useTaughtStudentIds();
  const [query, setQuery] = useState("");
  const [show, setShow] = useState<Show>(isCoach ? "mine" : "active");
  const current = useMemo(() => students.data.filter((s) => !isInactiveStudent(s.status)), [students.data]);
  const mine = useMemo(() => (taught ? students.data.filter((s) => taught.has(s.id)) : []), [students.data, taught]);
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = show === "mine" ? mine : show === "active" ? current : students.data;
    return q ? base.filter((s) => (s.nameLower ?? s.name.toLowerCase()).includes(q) || s.name.toLowerCase().includes(q)) : base;
  }, [students.data, current, mine, show, query]);
  const loading = students.loading || (show === "mine" && !taught);

  return (
    <View style={[styles.fill, { backgroundColor: colors.grouped }]}>
      <FlatList
        testID="students-screen"
        data={loading ? [] : list}
        keyExtractor={(s) => s.id}
        style={{ backgroundColor: colors.grouped }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={[styles.content, Platform.OS === "android" && { paddingTop: insets.top + space.lg }]}
        ListHeaderComponent={
          <View style={styles.head}>
            <TabHeader title="Students" testID="students-screen-title" />
            <SearchField value={query} onChangeText={setQuery} placeholder="Search students" testID="student-search-tab" />
            <FilterChips
              value={show}
              onChange={setShow}
              options={[
                ...(isCoach ? [{ value: "mine" as const, label: "Mine", count: mine.length, testID: "students-filter-mine" }] : []),
                { value: "active", label: "Current", count: current.length, testID: "students-filter-active" },
                { value: "all", label: "All", count: students.data.length, testID: "students-filter-all" },
              ]}
              testID="students-filter"
            />
          </View>
        }
        ListHeaderComponentStyle={styles.chips}
        ListEmptyComponent={
          loading ? (
            <SkeletonCards count={6} height={60} />
          ) : (
            <EmptyState
              testID="students-empty"
              icon={<UsersRound size={26} color={colors.mutedForeground} />}
              title={query ? "No student by that name" : show === "mine" ? "No classes yet" : "No students yet"}
              text={
                query
                  ? show === "all"
                    ? "Check the spelling."
                    : "Try “All” to include everyone."
                  : show === "mine"
                    ? "Students show here once you have classes with them. “All” shows every student."
                    : "Students are added on the website."
              }
            />
          )
        }
        ItemSeparatorComponent={() => (
          <View style={[styles.between, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.separator, { backgroundColor: colors.border }]} />
          </View>
        )}
        renderItem={({ item: s, index }) => (
          <Pressable
            testID={`student-row-${s.id}`}
            accessibilityRole="button"
            accessibilityLabel={studentLabel(s.name, s.grade)}
            onPress={() => router.push({ pathname: "/student/[id]", params: { id: s.id } })}
            style={({ pressed }) => [
              styles.row,
              { backgroundColor: pressed ? colors.accent : colors.card, borderColor: colors.border },
              index === 0 && styles.first,
              index === list.length - 1 && styles.last,
            ]}
          >
            <Avatar name={s.name} size={38} />
            <View style={styles.grow}>
              <T variant="label" numberOfLines={1}>
                {s.name}
              </T>
              {studentLine(s) ? (
                <T variant="small" tone="muted" numberOfLines={1}>
                  {studentLine(s)}
                </T>
              ) : null}
            </View>
            {s.status !== "enrolled" ? (
              <T variant="small" tone="muted">
                {STUDENT_STATUS_LABELS[s.status]}
              </T>
            ) : null}
          </Pressable>
        )}
      />
      <StatusBarScrim color={colors.grouped} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: space.lg, paddingBottom: space.xxl * 2 },
  head: { gap: space.md },
  chips: { marginBottom: space.md },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, borderLeftWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth },
  first: { borderTopWidth: StyleSheet.hairlineWidth, borderTopLeftRadius: 14, borderTopRightRadius: 14 },
  last: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomLeftRadius: 14, borderBottomRightRadius: 14 },
  between: { borderLeftWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: space.lg + 38 + space.md },
  grow: { flex: 1, gap: 2 },
});
