import { effectiveRanges } from "@shared/availability";
import { takesSeat } from "@shared/schedule/classes";
import { type DateKey, addDays } from "@shared/time";
import { router } from "expo-router";
import { CalendarCheck, Camera, ChevronRight, Coffee } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SkyArcLockup } from "@/components/brand/SkyArc";
import { Card } from "@/components/Card";
import { DemoBadge } from "@/components/DemoBadge";
import { SkeletonCards } from "@/components/Skeleton";
import { StatusBarScrim } from "@/components/TabHeader";
import { ListRow, ListSection } from "@/components/List";
import { T } from "@/components/Text";
import { useAcademyNow, useClassesBetween, useRecentEvaluations } from "@/features/data/hooks";
import { ScoreRow } from "@/features/family/ScoreRow";
import { ToDoCard } from "@/features/home/ToDoCard";
import { InboxBell } from "@/features/notifications/InboxBell";
import { RequestsCard } from "@/features/requests/RequestsCard";
import { ClassRow } from "@/features/schedule/ClassRow";
import { teaches } from "@/features/schedule/classes";
import { clock, longDay, plural, shortDay, timeRange } from "@/features/schedule/format";
import { useStaffLook } from "@/features/schedule/parts";
import { useBranch } from "@/state/BranchProvider";
import { radius, space, useColors } from "@/theme";

function greeting(nowMin: number): string {
  if (nowMin < 12 * 60) return "Good morning";
  if (nowMin < 17 * 60) return "Good afternoon";
  return "Good evening";
}

/** How far ahead a coach's Home looks for their next class, on a day without one (two weeks, as the website's). */
const AHEAD_DAYS = 14;

/**
 * The day at a glance (the app opens here): the lockup with the bell (the person's notifications) beside it, a greeting
 * with the date, today's numbers (a coach's are their classes and students: their clock and pay are in More, not here,
 * the owner's call), a coach's to-do (availability to set, posts to read), the
 * office's requests from families waiting for an answer, the way to scan targets, today's classes in time order with the coaches in (for a coach, the classes in their hours, with the
 * other coaches in with them, and their hours), and the latest scores. Everything is live and in the academy's time
 * zone.
 */
export default function TodayScreen() {
  const { actor, staff, settings, isCoach, staffId } = useBranch();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const hour12 = settings.general.timeFormat !== "24h";
  const { today, nowMin } = useAcademyNow();
  // A coach's Home also looks ahead, for their next class on a day without one.
  const data = useClassesBetween(today, isCoach ? addDays(today, AHEAD_DAYS) : today);
  const look = useStaffLook();
  const hours = data.hoursOf(today);
  const me = isCoach ? staffId : null;

  const todays = data.byDate.get(today) ?? [];
  // A coach's day is the classes in their hours: every coach in at a class's time teaches it.
  const classes = me ? todays.filter((v) => teaches(v, me)) : todays;
  const students = new Set(classes.flatMap((v) => v.seats.filter(takesSeat).map((s) => s.studentId))).size;
  const coaches = new Set(classes.flatMap((v) => v.coaches.map((k) => k.staffId))).size;
  // A coach's hours in today (inside its opening hours; an hour and a half reads 1.5).
  const mine = me ? data.availability.find((a) => a.staffId === me && a.dateKey === today) : undefined;
  const myRanges = mine && !mine.unavailable ? effectiveRanges(mine.ranges ?? [], hours) : [];
  // On a day without a class in their hours, when the next one is.
  const nextDay: DateKey | null = me && !classes.length ? ([...data.byDate.keys()].sort().find((d) => d > today && (data.byDate.get(d) ?? []).some((v) => teaches(v, me))) ?? null) : null;
  const nextClass = nextDay ? (data.byDate.get(nextDay) ?? []).find((v) => teaches(v, me)) : undefined;
  const first = (staff?.firstName || actor.name.split(/\s+/)[0] || "").trim();

  const contentStyle = Platform.OS === "android" ? { paddingTop: insets.top + space.lg } : undefined;
  // A coach's own to-do (a coach not linked to a staff record has none).
  const coach = isCoach && !!staffId;

  return (
    <TodayScroll contentStyle={contentStyle}>
      <View style={styles.header}>
        <View style={styles.top}>
          <View style={styles.brand}>
            <SkyArcLockup size="sm" testID="today-lockup" />
            <DemoBadge />
          </View>
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

      <Card style={styles.stats} testID="today-stats">
        <Stat value={classes.length} label={classes.length === 1 ? "class" : "classes"} />
        <View style={[styles.rule, { backgroundColor: colors.border }]} />
        <Stat value={students} label={students === 1 ? "student" : "students"} />
        {isCoach ? null : (
          <>
            <View style={[styles.rule, { backgroundColor: colors.border }]} />
            <Stat value={coaches} label={coaches === 1 ? "coach" : "coaches"} />
          </>
        )}
      </Card>

      {coach ? <ToDoCard /> : null}

      <RequestsCard />

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
            {me ? "YOUR CLASSES TODAY" : "TODAY’S CLASSES"}
          </T>
          {me && myRanges.length ? (
            <T variant="small" tone="muted" style={styles.sectionDetail} testID="today-my-hours">
              {`You’re in ${myRanges.map((r) => timeRange(r.startMin, r.endMin, hour12)).join(", ")}`}
            </T>
          ) : classes.length ? (
            <T variant="small" tone="muted" style={styles.sectionDetail}>
              {plural(classes.length, "class", "classes")}
            </T>
          ) : null}
        </View>
        {data.loading ? (
          <SkeletonCards count={3} height={64} />
        ) : data.error ? (
          <Card>
            <T variant="label">Couldn’t load today’s classes</T>
            <T variant="small" tone="muted">
              Check your connection, then pull down to try again.
            </T>
          </Card>
        ) : classes.length ? (
          <ListSection testID="today-classes">
            {classes.map((v) => (
              <ClassRow
                key={v.c.id}
                v={v}
                today={today}
                nowMin={nowMin}
                hour12={hour12}
                me={me}
                look={look}
                onPress={() => router.push({ pathname: "/class/[id]", params: { id: v.c.id } })}
                testID={`today-class-${v.c.id}`}
              />
            ))}
          </ListSection>
        ) : (
          <Card style={styles.free} testID="today-free">
            <View style={[styles.freeIcon, { backgroundColor: colors.secondary }]}>
              {hours.isOpen ? <CalendarCheck size={20} color={colors.mutedForeground} /> : <Coffee size={20} color={colors.mutedForeground} />}
            </View>
            <View style={styles.grow}>
              <T variant="label">{!hours.isOpen ? "Closed today" : me ? "No classes in your hours today" : "No classes today"}</T>
              <T variant="small" tone="muted">
                {!hours.isOpen
                  ? "The academy is closed today."
                  : me
                    ? nextDay && nextClass
                      ? `Your next class is ${nextDay === addDays(today, 1) ? "tomorrow" : shortDay(nextDay)} at ${clock(nextClass.c.startMin, hour12)}.${todays.length ? ` The academy’s ${plural(todays.length, "class", "classes")} today are on the Schedule.` : ""}`
                      : todays.length
                        ? `The academy’s ${plural(todays.length, "class", "classes")} today are on the Schedule.`
                        : "Nothing is on the schedule today."
                    : "Nothing is on the schedule today."}
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
  brand: { flexDirection: "row", alignItems: "center", gap: space.sm },
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
  free: { flexDirection: "row", alignItems: "center", gap: space.md },
  freeIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
});
