import { router, useLocalSearchParams } from "expo-router";
import { ExternalLink, UserRoundX, X } from "lucide-react-native";
import { useMemo } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { STAFF_STATUS_LABELS, formatPhone } from "@shared/people";
import { ROLE_LABELS } from "@shared/roles";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { ContactButtons } from "@/components/ContactButtons";
import { EmptyState } from "@/components/EmptyState";
import { IconButton } from "@/components/IconButton";
import { ListRow, ListSection } from "@/components/List";
import { Skeleton } from "@/components/Skeleton";
import { T } from "@/components/Text";
import { useAcademyNow, useSessionsBetween, useStaff } from "@/features/data/hooks";
import { groupClasses } from "@/features/schedule/classes";
import { plural, timeRange } from "@/features/schedule/format";
import { openWebsite } from "@/lib/links";
import { useBranch } from "@/state/BranchProvider";
import { radius, space, useColors } from "@/theme";

/** An employee, over the screen it was opened from (a sheet): their role, phone and email, and their classes today. */
export default function CoachSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { settings } = useBranch();
  const colors = useColors();
  const hour12 = settings.general.timeFormat !== "24h";
  const { today } = useAcademyNow();
  const person = useStaff(id ?? null);
  const sessions = useSessionsBetween(today, today);
  const classes = useMemo(() => groupClasses(sessions.data.filter((s) => s.coachId === id)).filter((c) => c.active.length > 0), [sessions.data, id]);
  const close = () => (router.canGoBack() ? router.back() : router.replace("/"));
  const s = person.data;

  return (
    <ScrollView style={[styles.fill, { backgroundColor: colors.grouped }]} contentContainerStyle={styles.content} testID="coach-sheet">
      <View style={styles.top}>
        {person.loading ? (
          <View style={styles.grow}>
            <Skeleton width="55%" height={28} />
            <Skeleton width="30%" height={18} />
          </View>
        ) : s ? (
          <View style={[styles.grow, styles.who]}>
            <Avatar name={s.name} size={52} color={s.color} />
            <View style={styles.grow}>
              <T variant="heading" accessibilityRole="header">
                {s.name}
              </T>
              <T tone="muted">{[ROLE_LABELS[s.role], s.status !== "active" ? STAFF_STATUS_LABELS[s.status] : null].filter(Boolean).join(" · ")}</T>
            </View>
          </View>
        ) : (
          <View style={styles.grow} />
        )}
        <IconButton icon={<X size={20} color={colors.foreground} />} accessibilityLabel="Close" onPress={close} filled testID="coach-close" />
      </View>
      {!person.loading && !s ? (
        <EmptyState icon={<UserRoundX size={26} color={colors.mutedForeground} />} title="Not an employee any more" text="This person isn’t in the academy’s employees." />
      ) : s ? (
        <>
          <ListSection title="Contact">
            {s.phone ? <ListRow title={formatPhone(s.phone)} subtitle="Phone" right={<ContactButtons phone={s.phone} name={s.name} />} testID="coach-phone" /> : null}
            {s.email ? <ListRow title={s.email} subtitle="Email" right={<ContactButtons email={s.email} name={s.name} />} testID="coach-email" /> : null}
            {!s.phone && !s.email ? <ListRow title="No phone or email" subtitle="Add them on the website." /> : null}
          </ListSection>
          <ListSection title="Today" detail={classes.length ? plural(classes.length, "class", "classes") : undefined}>
            {classes.length ? (
              classes.map((c) => (
                <ListRow
                  key={c.id}
                  title={timeRange(c.startMin, c.endMin, hour12)}
                  subtitle={c.active.map((x) => x.studentName).join(", ")}
                  onPress={() => router.push({ pathname: "/class/[id]", params: { id: c.id } })}
                />
              ))
            ) : (
              <ListRow title="No classes today" />
            )}
          </ListSection>
          <Button variant="outline" icon={<ExternalLink size={18} color={colors.foreground} />} onPress={() => void openWebsite(`/admin/employees/directory/${s.id}`)} testID="coach-open-website">
            Open on the website
          </Button>
        </>
      ) : (
        <Skeleton height={96} rounded={radius.lg} />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl },
  top: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  who: { flexDirection: "row", alignItems: "center", gap: space.md },
  grow: { flex: 1, gap: 2 },
});
