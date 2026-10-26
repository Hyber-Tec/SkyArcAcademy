import { effectiveRanges } from "@shared/availability";
import { STAFF_STATUS_LABELS, formatPhone } from "@shared/people";
import { ROLE_LABELS } from "@shared/roles";
import { type DateKey, addDays } from "@shared/time";
import { router, useLocalSearchParams } from "expo-router";
import { ExternalLink, UserRoundX, X } from "lucide-react-native";
import { ScrollView, StyleSheet, View } from "react-native";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { ContactButtons } from "@/components/ContactButtons";
import { EmptyState } from "@/components/EmptyState";
import { IconButton } from "@/components/IconButton";
import { ListRow, ListSection } from "@/components/List";
import { Skeleton } from "@/components/Skeleton";
import { T } from "@/components/Text";
import { useAcademyNow, useClassesBetween, useStaff } from "@/features/data/hooks";
import { ClassRow } from "@/features/schedule/ClassRow";
import { teaches } from "@/features/schedule/classes";
import { shortDay, timeRange } from "@/features/schedule/format";
import { useStaffLook } from "@/features/schedule/parts";
import { openWebsite } from "@/lib/links";
import { useBranch } from "@/state/BranchProvider";
import { radius, space, useColors } from "@/theme";

/** The days a coach's page shows: today and the six after it. */
const DAYS = 7;

/**
 * An employee, over the screen it was opened from (a sheet; the office's): their role, phone and email, then their
 * hours each day of the coming week (who's in) and the classes in them: classes are taught together by every coach in
 * at their time, so a coach's classes are the ones in their hours. The manager, who's in without teaching, has hours
 * and no classes.
 */
export default function CoachSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { settings } = useBranch();
  const colors = useColors();
  const hour12 = settings.general.timeFormat !== "24h";
  const { today, nowMin } = useAcademyNow();
  const person = useStaff(id ?? null);
  const days: DateKey[] = Array.from({ length: DAYS }, (_, i) => addDays(today, i));
  const data = useClassesBetween(days[0], days[DAYS - 1]);
  const look = useStaffLook();
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
          {data.loading ? (
            <Skeleton height={120} rounded={radius.lg} />
          ) : (
            days.map((d) => {
              const hours = data.hoursOf(d);
              const record = data.availability.find((a) => a.staffId === s.id && a.dateKey === d);
              const ranges = record && !record.unavailable ? effectiveRanges(record.ranges ?? [], hours) : [];
              const classes = (data.byDate.get(d) ?? []).filter((v) => teaches(v, s.id));
              // A closed day with nothing on it says nothing.
              if (!hours.isOpen && !ranges.length && !classes.length) return null;
              const detail = ranges.length ? `In ${ranges.map((r) => timeRange(r.startMin, r.endMin, hour12)).join(", ")}` : record?.unavailable ? "Not available" : !hours.isOpen ? "Closed" : "No hours set";
              return (
                <ListSection key={d} title={d === today ? `Today · ${shortDay(d)}` : shortDay(d)} detail={detail} testID={`coach-day-${d}`}>
                  {classes.length
                    ? classes.map((v) => (
                        <ClassRow
                          key={v.c.id}
                          v={v}
                          today={today}
                          nowMin={nowMin}
                          hour12={hour12}
                          look={look}
                          onPress={() => router.push({ pathname: "/class/[id]", params: { id: v.c.id } })}
                          testID={`coach-class-${v.c.id}`}
                        />
                      ))
                    : [<ListRow key="none" title={<T tone="muted">{ranges.length ? "No classes in these hours" : s.role === "coach" ? "No classes" : "Not teaching"}</T>} />]}
                </ListSection>
              );
            })
          )}
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
