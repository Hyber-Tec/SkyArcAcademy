import { familyNote } from "@shared/schedule/family";
import { router, useLocalSearchParams } from "expo-router";
import { CalendarDays, X } from "lucide-react-native";
import { useMemo } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { IconButton } from "@/components/IconButton";
import { ListRow, ListSection } from "@/components/List";
import { Skeleton } from "@/components/Skeleton";
import { T } from "@/components/Text";
import { useAcademyNow } from "@/features/data/hooks";
import { useAcademyContact, useFamilySession, useFamilySessions } from "@/features/family/data";
import { AcademyContact } from "@/features/family/FamilyParts";
import { useFamily } from "@/features/family/FamilyProvider";
import { FamilyStatus } from "@/features/family/FamilyStatus";
import { hasEnded, isOnNow, relativeDay } from "@/features/family/format";
import { classIdOf, groupClasses } from "@/features/schedule/classes";
import { duration, longDay, startsIn, timeLeft, timeRange } from "@/features/schedule/format";
import { useBranch } from "@/state/BranchProvider";
import { radius, space, useColors } from "@/theme";

/**
 * A class, over the screen it was opened from (a sheet; loaded from its id, so a link opens it too): when, the coach,
 * and each of the family's students in it with their status and the class's note, then how to reach the academy for a
 * change (families don't change classes in the app).
 */
export default function FamilyClassSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { settings, name } = useBranch();
  const colors = useColors();
  const family = useFamily();
  const { today, nowMin } = useAcademyNow();
  const hour12 = settings.general.timeFormat !== "24h";
  const session = useFamilySession(id ?? null);
  const s = session.data;
  // The family's classes that day: brothers and sisters in the same class show together.
  const day = useFamilySessions(s ? family.ids : [], s?.dateKey ?? today, s?.dateKey ?? today);
  const group = useMemo(() => {
    if (!s) return null;
    const same = day.data.filter((x) => classIdOf(x) === classIdOf(s));
    return groupClasses(same.length ? same : [s])[0] ?? null;
  }, [s, day.data]);
  const contact = useAcademyContact();
  const close = () => (router.canGoBack() ? router.back() : router.replace("/"));

  if (session.loading) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.grouped }]} testID="family-session-sheet">
        <View style={styles.content}>
          <Skeleton width="60%" height={28} />
          <Skeleton width="40%" height={18} />
          <Skeleton height={64} rounded={radius.lg} />
          <Skeleton height={64} rounded={radius.lg} />
        </View>
      </View>
    );
  }
  if (!s || !group || s.isDeleted) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.grouped }]} testID="family-session-sheet">
        <EmptyState
          icon={<CalendarDays size={26} color={colors.mutedForeground} />}
          title="This class isn’t on the schedule any more"
          text={`It may have been moved or canceled. Ask ${name} if you’re not sure.`}
          action={
            <Button variant="outline" onPress={close} testID="family-session-close">
              Close
            </Button>
          }
        />
      </View>
    );
  }

  const ended = hasEnded(group, today, nowMin);
  const live = isOnNow(group, today, nowMin);
  const near = relativeDay(group.dateKey, today);
  const soon = group.dateKey === today && !ended ? (live ? timeLeft(group.endMin - nowMin) : startsIn(group.startMin - nowMin)) : null;
  const shown = family.who === "parent" ? group.sessions : group.sessions.filter((x) => x.id === s.id);

  return (
    <ScrollView style={[styles.fill, { backgroundColor: colors.grouped }]} contentContainerStyle={styles.content} testID="family-session-sheet">
      <View style={styles.top}>
        <View style={styles.grow}>
          <T variant="title" accessibilityRole="header" testID="family-session-time">
            {timeRange(group.startMin, group.endMin, hour12)}
          </T>
          <T tone="muted">
            {near ? `${near}, ` : ""}
            {longDay(group.dateKey)} · {duration(group.endMin - group.startMin)}
          </T>
          {soon ? (
            <T variant="small" style={{ color: colors.brandText, fontWeight: "600" }}>
              {live ? `On now · ${soon}` : `Starts ${soon}`}
            </T>
          ) : null}
        </View>
        <IconButton icon={<X size={20} color={colors.foreground} />} accessibilityLabel="Close" onPress={close} filled testID="family-session-close" />
      </View>

      <ListSection title="Coach">
        <ListRow icon={<Avatar name={group.coachName} size={38} />} title={<T variant="label">{group.coachName}</T>} testID="family-session-coach" />
      </ListSection>

      <ListSection title={family.who === "parent" ? (shown.length > 1 ? "Your children" : "Your child") : "You"} testID="family-session-students">
        {shown.map((x) => {
          const note = familyNote(x.note);
          return (
            <ListRow
              key={x.id}
              icon={<Avatar name={x.studentName} size={38} />}
              title={<T variant="label">{family.firstName(x.studentId, x.studentName)}</T>}
              subtitle={
                note ? (
                  <T variant="small" tone="muted">
                    {note}
                  </T>
                ) : undefined
              }
              right={<FamilyStatus status={x.status} ended={ended} />}
              testID={`family-session-student-${x.studentId}`}
            />
          );
        })}
      </ListSection>

      {contact?.phone?.trim() || contact?.email?.trim() ? (
        <AcademyContact title="Need a change?" footer={`To change or cancel a class, contact ${name}.`} reachOnly />
      ) : (
        <T variant="small" tone="muted" style={styles.note}>
          To change or cancel a class, contact {name}.
        </T>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl },
  top: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  grow: { flex: 1, gap: 2 },
  note: { paddingHorizontal: space.xs },
});
