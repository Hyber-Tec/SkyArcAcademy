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
import { useStudentList } from "@/features/data/hooks";
import { studentLine } from "./format";
import { space, useColors } from "@/theme";

type Show = "all" | "active";

/**
 * Every student, by name, with a search field at the top: everyone at first ("All", for the office and coaches alike:
 * the owner, 2026-10-17), the current ones with "Current". A student opens their page: classes, scores and Drive files
 * (and, for the office, the family's contacts). The office's Students tab shows it with its own title (`titled`);
 * coaches open it from More, under the standard header.
 */
export function StudentsList({ titled }: { titled: boolean }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const students = useStudentList();
  const [query, setQuery] = useState("");
  const [show, setShow] = useState<Show>("all");
  const current = useMemo(() => students.data.filter((s) => !isInactiveStudent(s.status)), [students.data]);
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = show === "active" ? current : students.data;
    return q ? base.filter((s) => (s.nameLower ?? s.name.toLowerCase()).includes(q) || s.name.toLowerCase().includes(q)) : base;
  }, [students.data, current, show, query]);
  const loading = students.loading;

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
        contentContainerStyle={[styles.content, titled && Platform.OS === "android" && { paddingTop: insets.top + space.lg }]}
        ListHeaderComponent={
          <View style={styles.head}>
            {titled ? <TabHeader title="Students" testID="students-screen-title" /> : null}
            <SearchField value={query} onChangeText={setQuery} placeholder="Search students" testID="student-search-tab" />
            <FilterChips
              value={show}
              onChange={setShow}
              options={[
                { value: "all", label: "All", count: students.data.length, testID: "students-filter-all" },
                { value: "active", label: "Current", count: current.length, testID: "students-filter-active" },
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
              title={query ? "No student by that name" : "No students yet"}
              text={query ? (show === "all" ? "Check the spelling." : "Try “All” to include former students.") : "Students are added on the website."}
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
      {titled ? <StatusBarScrim color={colors.grouped} /> : null}
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
