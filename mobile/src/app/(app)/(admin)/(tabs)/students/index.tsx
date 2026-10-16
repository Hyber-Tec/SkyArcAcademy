import { Stack, router } from "expo-router";
import { UsersRound } from "lucide-react-native";
import { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { STUDENT_STATUS_LABELS, isInactiveStudent, studentLabel } from "@shared/people";
import { Avatar } from "@/components/Avatar";
import { EmptyState } from "@/components/EmptyState";
import { FilterChips } from "@/components/FilterChips";
import { SkeletonCards } from "@/components/Skeleton";
import { T } from "@/components/Text";
import { useStudentList } from "@/features/data/hooks";
import { studentLine } from "@/features/students/format";
import { space, useColors } from "@/theme";

type Show = "active" | "all";

/**
 * Every student, searchable by name (the header's search field): the current ones by default, everyone with "All".
 * A student opens their page: contacts, classes, scores and Drive files.
 */
export default function StudentsScreen() {
  const colors = useColors();
  const students = useStudentList();
  const [query, setQuery] = useState("");
  const [show, setShow] = useState<Show>("active");
  const current = useMemo(() => students.data.filter((s) => !isInactiveStudent(s.status)), [students.data]);
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = show === "active" ? current : students.data;
    return q ? base.filter((s) => (s.nameLower ?? s.name.toLowerCase()).includes(q) || s.name.toLowerCase().includes(q)) : base;
  }, [students.data, current, show, query]);

  return (
    <>
      <Stack.Screen
        options={{
          headerSearchBarOptions: {
            placeholder: "Search students",
            hideWhenScrolling: false,
            autoCapitalize: "none",
            onChangeText: (e) => setQuery(e.nativeEvent.text),
            onCancelButtonPress: () => setQuery(""),
          },
        }}
      />
      <FlatList
        testID="students-screen"
        data={students.loading ? [] : list}
        keyExtractor={(s) => s.id}
        style={{ backgroundColor: colors.grouped }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <FilterChips
            value={show}
            onChange={setShow}
            options={[
              { value: "active", label: "Current", count: current.length, testID: "students-filter-active" },
              { value: "all", label: "All", count: students.data.length, testID: "students-filter-all" },
            ]}
            testID="students-filter"
          />
        }
        ListHeaderComponentStyle={styles.chips}
        ListEmptyComponent={
          students.loading ? (
            <SkeletonCards count={6} height={60} />
          ) : (
            <EmptyState
              testID="students-empty"
              icon={<UsersRound size={26} color={colors.mutedForeground} />}
              title={query ? "No student by that name" : "No students yet"}
              text={query ? (show === "active" ? "Try “All” to include former students." : "Check the spelling.") : "Students are added on the website."}
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
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: space.xxl * 2 },
  chips: { marginBottom: space.md },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, borderLeftWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth },
  first: { borderTopWidth: StyleSheet.hairlineWidth, borderTopLeftRadius: 14, borderTopRightRadius: 14 },
  last: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomLeftRadius: 14, borderBottomRightRadius: 14 },
  between: { borderLeftWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: space.lg + 38 + space.md },
  grow: { flex: 1, gap: 2 },
});
