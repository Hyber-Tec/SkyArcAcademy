import { router } from "expo-router";
import { CalendarCheck, Camera, ChevronRight, Coffee } from "lucide-react-native";
import { useMemo, useState, type ReactNode } from "react";
import { Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SkyArcLockup } from "@/components/brand/SkyArc";
import { Card } from "@/components/Card";
import { SkeletonCards } from "@/components/Skeleton";
import { StatusBarScrim } from "@/components/TabHeader";
import { ListRow, ListSection } from "@/components/List";
import { T } from "@/components/Text";
import { useAcademyNow, useHoursOf, useRecentEvaluations, useSessionsBetween, useStaffList } from "@/features/data/hooks";
import { ScoreRow } from "@/features/family/ScoreRow";
import { ClockCard } from "@/features/home/ClockCard";
import { ToDoCard } from "@/features/home/ToDoCard";
import { InboxBell } from "@/features/notifications/InboxBell";
import { ClassRow } from "@/features/schedule/ClassRow";
import { groupClasses } from "@/features/schedule/classes";
import { longDay, plural, timeRange } from "@/features/schedule/format";
import { useBranch } from "@/state/BranchProvider";
import { radius, space, useColors } from "@/theme";

function greeting(nowMin: number): string {
  if (nowMin < 12 * 60) return "Good morning";
  if (nowMin < 17 * 60) return "Good afternoon";
  return "Good evening";
}

/**
 * The day at a glance (the app opens here): the lockup with the bell (the person's notifications) beside it, a greeting
 * with the date, a coach's time clock, today's numbers, a coach's to-do (classes waiting for the admin, availability to
 * set, posts to read), the way to scan targets, today's classes in time order (a coach's own, for a coach), and the
 * latest scores. Everything is live and in the academy's time zone.
 */
export default function TodayScreen() {
  const { actor, staff, settings, isCoach, staffId } = useBranch();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const hour12 = settings.general.timeFormat !== "24h";
  const { today, nowMin } = useAcademyNow();
  const sessions = useSessionsBetween(today, today);
  const staffList = useStaffList();
  const { hoursOf } = useHoursOf(today, today);
  const hours = hoursOf(today);

  const classes = useMemo(() => groupClasses(sessions.data), [sessions.data]);
  const colorOf = useMemo(() => new Map(staffList.data.map((s) => [s.id, s.color ?? null])), [staffList.data]);
  const active = classes.filter((c) => c.active.length > 0);
  const students = new Set(active.flatMap((c) => c.active.map((s) => s.studentId))).size;
  const coaches = new Set(active.map((c) => c.coachId)).size;
  // A coach's own day: how long they teach (an hour and a half reads 1.5).
  const teaching = Math.round(active.reduce((m, c) => m + (c.endMin - c.startMin), 0) / 6) / 10;
  const first = (staff?.firstName || actor.name.split(/\s+/)[0] || "").trim();

  const contentStyle = Platform.OS === "android" ? { paddingTop: insets.top + space.lg } : undefined;
  // A coach's own day: their time clock and what they still have to do (a coach not linked to a staff record has none).
  const coach = isCoach && !!staffId;

  return (
    <TodayScroll contentStyle={contentStyle}>
      <View style={styles.header}>
        <View style={styles.top}>
          <SkyArcLockup size="sm" testID="today-lockup" />
          <View style={styles.bell}>
            <InboxBell />
          </View>
        </View>
        <T variant="title" testID="today-greeting" accessibilityRole="header" style={styles.greeting}>
          {greeting(nowMin)}
          {first ? `, ${first}` : ""}
        </T>
        <T tone="muted" testID="today-date">
          {longDay(today)}
          {hours.isOpen ? ` · open ${timeRange(hours.openMin, hours.closeMin, hour12)}` : " · closed"}
        </T>
      </View>

      {coach ? <ClockCard todays={sessions.data} loading={sessions.loading} today={today} nowMin={nowMin} hour12={hour12} /> : null}

      <Card style={styles.stats} testID="today-stats">
        <Stat value={active.length} label={active.length === 1 ? "class" : "classes"} />
        <View style={[styles.rule, { backgroundColor: colors.border }]} />
        <Stat value={students} label={students === 1 ? "student" : "students"} />
        <View style={[styles.rule, { backgroundColor: colors.border }]} />
        {isCoach ? <Stat value={teaching} label={teaching === 1 ? "hour" : "hours"} /> : <Stat value={coaches} label={coaches === 1 ? "coach" : "coaches"} />}
      </Card>

      {coach ? <ToDoCard /> : null}

      <Pressable
        testID="today-scan"
        accessibilityRole="button"
        accessibilityLabel="Scan targets"
        onPress={() => router.navigate("/scan")}
        style={({ pressed }) => [styles.scan, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
      >
        <View style={[styles.scanIcon, { backgroundColor: colors.brand }]}>
          <Camera size={22} color="#ffffff" />
        </View>
        <View style={styles.grow}>
          <T variant="subheading" style={{ color: colors.primaryForeground }}>
            Scan targets
          </T>
          <T variant="small" style={{ color: colors.primaryForeground, opacity: 0.75 }}>
            Photograph a paper target: it&apos;s scored and filed in the student&apos;s Drive.
          </T>
        </View>
        <ChevronRight size={20} color={colors.primaryForeground} />
      </Pressable>

      <View style={styles.section}>
        <View style={styles.sectionHead}>
          <T variant="small" tone="muted" style={styles.sectionTitle}>
            TODAY&apos;S CLASSES
          </T>
          {active.length ? (
            <T variant="small" tone="muted" style={styles.sectionDetail}>
              {plural(active.length, "class", "classes")}
            </T>
          ) : null}
        </View>
        {sessions.loading ? (
          <SkeletonCards count={3} height={92} />
        ) : sessions.error ? (
          <Card>
            <T variant="label">Couldn’t load today’s classes</T>
            <T variant="small" tone="muted">
              Check your connection, then pull down to try again.
            </T>
          </Card>
        ) : classes.length ? (
          <View style={styles.list} testID="today-classes">
            {classes.map((c) => (
              <ClassRow
                key={c.id}
                group={c}
                color={colorOf.get(c.coachId) ?? null}
                hour12={hour12}
                live={c.active.length > 0 && c.startMin <= nowMin && nowMin < c.endMin}
                onPress={() => router.push({ pathname: "/class/[id]", params: { id: c.id } })}
                testID={`today-class-${c.id}`}
              />
            ))}
          </View>
        ) : (
          <Card style={styles.free} testID="today-free">
            <View style={[styles.freeIcon, { backgroundColor: colors.secondary }]}>
              {hours.isOpen ? <CalendarCheck size={20} color={colors.mutedForeground} /> : <Coffee size={20} color={colors.mutedForeground} />}
            </View>
            <View style={styles.grow}>
              <T variant="label">{hours.isOpen ? "No classes today" : "Closed today"}</T>
              <T variant="small" tone="muted">
                {hours.isOpen ? "Nothing is booked for today." : "The academy is closed today."}
              </T>
            </View>
          </Card>
        )}
      </View>

      <LatestScores today={today} />
    </TodayScroll>
  );
}

/** The newest scores of the last two weeks across the academy, each opening its score, as on the website's Home. */
function LatestScores({ today }: { today: string }) {
  const recent = useRecentEvaluations(today);
  if (!recent.loading && !recent.data.length) return null;
  return (
    <ListSection title="Latest scores" detail={recent.loading ? undefined : `${recent.data.length} in ${recent.days} days`} testID="today-latest-scores">
      {recent.loading ? (
        <ListRow title="Loading scores…" />
      ) : (
        recent.data
          .slice(0, 6)
          .map((e) => (
            <ScoreRow key={e.id} evaluation={e} who={e.studentName} best={false} onPress={() => router.push({ pathname: "/score/[id]", params: { id: e.id } })} testID={`today-score-${e.id}`} />
          ))
      )}
    </ListSection>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <T variant="stat">{value}</T>
      <T variant="small" tone="muted">
        {label}
      </T>
    </View>
  );
}

/**
 * Home's scrolling page, on the grouped background, with pull to refresh (everything is live; pulling just shows it's
 * current). It is the first view of the screen, so tapping the Home tab again scrolls back to the top, as the phone's
 * own apps do (the native tabs follow the first views down to a scroll view; Home has no header around it), with the
 * status bar's strip over it.
 */
function TodayScroll({ children, contentStyle }: { children: ReactNode; contentStyle?: { paddingTop: number } }) {
  const colors = useColors();
  const [refreshing, setRefreshing] = useState(false);
  return (
    <View style={styles.fill}>
      <ScrollView
        testID="today-screen"
        style={[styles.fill, { backgroundColor: colors.grouped }]}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.content, contentStyle]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              setTimeout(() => setRefreshing(false), 600);
            }}
          />
        }
      >
        {children}
      </ScrollView>
      <StatusBarScrim color={colors.grouped} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl * 2 },
  header: { gap: 2 },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 28 },
  // The bell is a little taller than the lockup: it overhangs rather than pushing the greeting down.
  bell: { marginVertical: -4 },
  greeting: { marginTop: space.md },
  grow: { flex: 1, gap: 2 },
  stats: { flexDirection: "row", alignItems: "center", paddingVertical: space.md },
  stat: { flex: 1, alignItems: "center", gap: 2 },
  rule: { width: StyleSheet.hairlineWidth, alignSelf: "stretch" },
  scan: { flexDirection: "row", alignItems: "center", gap: space.md, borderRadius: radius.xl, padding: space.lg },
  scanIcon: { width: 44, height: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  section: { gap: space.sm },
  sectionHead: { flexDirection: "row", alignItems: "baseline", paddingHorizontal: space.xs },
  sectionTitle: { flex: 1, fontWeight: "600", letterSpacing: 0.5 },
  sectionDetail: { fontWeight: "600", fontVariant: ["tabular-nums"] },
  list: { gap: space.md },
  free: { flexDirection: "row", alignItems: "center", gap: space.md },
  freeIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
});
