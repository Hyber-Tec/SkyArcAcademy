import { router, useLocalSearchParams } from "expo-router";
import { CalendarDays, ExternalLink, X } from "lucide-react-native";
import { useMemo } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { formatPhone, gradeLabel } from "@shared/people";
import { SESSION_STATUS_LABELS } from "@shared/schedule/status";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { ContactButtons } from "@/components/ContactButtons";
import { EmptyState } from "@/components/EmptyState";
import { IconButton } from "@/components/IconButton";
import { ListRow, ListSection } from "@/components/List";
import { Skeleton } from "@/components/Skeleton";
import { T } from "@/components/Text";
import { useSessionsBetween, useStaff, useStudentList } from "@/features/data/hooks";
import { groupClasses, parseClassId } from "@/features/schedule/classes";
import { duration, longDay, plural, timeRange } from "@/features/schedule/format";
import { studentLine } from "@/features/students/format";
import { openWebsite } from "@/lib/links";
import { useBranch } from "@/state/BranchProvider";
import { radius, space, useColors, useStatusColors } from "@/theme";

/**
 * A class, over the screen it was opened from (a sheet; loaded from its id, so a link opens it too): when, the coach
 * with a call or a text away (for the office; a coach's classes are their own), and each student with their status, the
 * class's note and their page. Changes are made on the website.
 */
export default function ClassSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const parsed = parseClassId(id ?? "");
  const { settings, isCoach } = useBranch();
  const colors = useColors();
  const statusColors = useStatusColors();
  const hour12 = settings.general.timeFormat !== "24h";
  const day = parsed?.dateKey ?? "1970-01-01";
  const sessions = useSessionsBetween(day, day);
  const coach = useStaff(parsed?.coachId ?? null);
  const students = useStudentList();
  const studentById = useMemo(() => new Map(students.data.map((s) => [s.id, s])), [students.data]);
  const group = useMemo(() => groupClasses(sessions.data).find((g) => g.id === decodeURIComponent(id ?? "")) ?? null, [sessions.data, id]);
  const close = () => (router.canGoBack() ? router.back() : router.replace("/"));

  if (parsed && sessions.loading) {
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
  if (!parsed || !group) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.grouped }]} testID="class-sheet">
        <EmptyState
          icon={<CalendarDays size={26} color={colors.mutedForeground} />}
          title="This class isn’t on the schedule"
          text="It may have been moved or deleted on the website."
          action={
            <Button variant="outline" onPress={close} testID="class-close">
              Close
            </Button>
          }
        />
      </View>
    );
  }

  const coachName = coach.data?.name || group.coachName;
  return (
    <ScrollView style={[styles.fill, { backgroundColor: colors.grouped }]} contentContainerStyle={styles.content} testID="class-sheet">
      <View style={styles.top}>
        <View style={styles.grow}>
          <T variant="title" accessibilityRole="header">
            {timeRange(group.startMin, group.endMin, hour12)}
          </T>
          <T tone="muted">
            {longDay(group.dateKey)} · {duration(group.endMin - group.startMin)}
          </T>
        </View>
        <IconButton icon={<X size={20} color={colors.foreground} />} accessibilityLabel="Close" onPress={close} filled testID="class-close" />
      </View>

      {isCoach ? null : (
        <ListSection title="Coach">
          <ListRow
            icon={<Avatar name={coachName} size={38} color={coach.data?.color} />}
            title={coachName}
            subtitle={coach.data?.phone ? formatPhone(coach.data.phone) : (coach.data?.email ?? undefined)}
            right={<ContactButtons phone={coach.data?.phone} email={coach.data?.email} name={coachName} />}
            chevron={false}
            onPress={() => router.push({ pathname: "/coach/[id]", params: { id: group.coachId } })}
            testID="class-coach"
          />
        </ListSection>
      )}

      <ListSection title="Students" detail={plural(group.active.length, "student")} testID="class-students">
        {group.sessions.map((s) => {
          const student = studentById.get(s.studentId);
          const line = [student ? studentLine(student) : s.studentGrade ? gradeLabel(s.studentGrade) : "", s.note?.trim()].filter(Boolean).join(" · ");
          const tone = statusColors[s.status];
          return (
            <ListRow
              key={s.id}
              icon={<Avatar name={s.studentName} size={38} />}
              title={s.studentName}
              subtitle={line || undefined}
              right={
                <Badge bg={tone.bg} fg={tone.text}>
                  {SESSION_STATUS_LABELS[s.status]}
                </Badge>
              }
              onPress={() => router.push({ pathname: "/student/[id]", params: { id: s.studentId } })}
              testID={`class-student-${s.studentId}`}
            />
          );
        })}
      </ListSection>

      <Button
        variant="outline"
        icon={<ExternalLink size={18} color={colors.foreground} />}
        onPress={() => void openWebsite(isCoach ? "/coach/schedule" : `/admin/schedule/day/${group.dateKey}`)}
        testID="class-open-website"
      >
        Open the day on the website
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl * 2 },
  top: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  grow: { flex: 1, gap: 2 },
});
