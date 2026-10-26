import { attendanceFacts } from "@shared/reports/facts";
import { personalBestIds } from "@shared/shooting/progress";
import { type DateKey, addDays, weekDays } from "@shared/time";
import { router } from "expo-router";
import { CalendarX2, ChartLine, Target } from "lucide-react-native";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { SkyArcLockup } from "@/components/brand/SkyArc";
import { Card } from "@/components/Card";
import { ListRow, ListSection, RowIcon } from "@/components/List";
import { Screen } from "@/components/Screen";
import { SectionTitle } from "@/components/SectionTitle";
import { SkeletonCards } from "@/components/Skeleton";
import { T } from "@/components/Text";
import { useAcademyNow } from "@/features/data/hooks";
import { FamilyClassRow, NextClassCard } from "@/features/family/ClassCards";
import { type EvaluationDoc, type SessionDoc, useFamilyEvaluations, useFamilyReports, useFamilySessions, useIsNew } from "@/features/family/data";
import { AcademyContact, ChildSwitcher, NotLinked } from "@/features/family/FamilyParts";
import { useFamily } from "@/features/family/FamilyProvider";
import { hasEnded, namesList } from "@/features/family/format";
import { useFamilyNews, useIsNewNews } from "@/features/family/news";
import { NewsRow } from "@/features/family/NewsRow";
import { ReportRow } from "@/features/family/ReportRow";
import { ScoreRow } from "@/features/family/ScoreRow";
import { familyClassId, familyClasses } from "@/features/family/classes";
import { longDay, plural } from "@/features/schedule/format";
import { useBranch } from "@/state/BranchProvider";
import { radius, space, useColors } from "@/theme";

function greeting(nowMin: number): string {
  if (nowMin < 12 * 60) return "Good morning";
  if (nowMin < 17 * 60) return "Good afternoon";
  return "Good evening";
}

/** How far ahead Home looks for each student's next class. */
const AHEAD_DAYS = 8 * 7;
/** Attendance counts the classes of the last 30 days. */
const ATTENDANCE_DAYS = 30;
/** The latest scores Home shows: one student's, or each child's when a parent's Home shows them all. */
const LATEST_ONE = 3;
const LATEST_EACH = 2;
/** The academy's latest posts Home shows (the rest are on the News page). */
const LATEST_NEWS = 3;

/**
 * The family's first page (the app opens here): a greeting with the date; each student's next class (a parent's
 * children in the same class share a card) with its status and the class's note; the rest of this week (or
 * next week's, once this one has nothing left); the academy's latest news for families (when it has any; all of it on
 * the News page); the latest scores (each opens its own screen; all of them are a tab away); the latest shared progress
 * report; attendance over the last 30 days; and how to reach the academy. A parent with several children picks All or
 * one child. Everything is live and in the academy's time zone.
 */
export default function FamilyHomeScreen() {
  const { settings, member, actor, name: academy } = useBranch();
  const colors = useColors();
  const family = useFamily();
  const { today, nowMin } = useAcademyNow();
  const hour12 = settings.general.timeFormat !== "24h";
  const when = { today, nowMin, hour12 };
  const from = addDays(today, -ATTENDANCE_DAYS);
  const sessions = useFamilySessions(family.ids, from, addDays(today, AHEAD_DAYS));
  const reports = useFamilyReports(family.ids);
  const scores = useFamilyEvaluations(family.ids);
  const isNew = useIsNew();
  const first = (member.displayName || actor.name).trim().split(/\s+/)[0] ?? "";
  const parent = family.who === "parent";

  const shown = new Set(family.shown);
  const mine = sessions.data.filter((s) => shown.has(s.studentId));
  const coming = mine.filter((s) => !hasEnded(s, today, nowMin));

  // Each student's next class: the first one coming that isn't canceled. A child's brothers and sisters in the same
  // class join its card.
  const nextOf = new Map<string, SessionDoc>();
  for (const s of coming) if (s.status !== "canceled" && !nextOf.has(s.studentId)) nextOf.set(s.studentId, s);
  const nextClassIds = new Set([...nextOf.values()].map(familyClassId));
  const nextGroups = familyClasses(coming.filter((s) => nextClassIds.has(familyClassId(s))));
  const nothingFor = family.shown.filter((id) => !nextOf.has(id));

  // The rest of this week after those, or next week's once this one has nothing left.
  const weekEnd = weekDays(today, settings.general.weekStartsOn)[6];
  const after = coming.filter((s) => !nextClassIds.has(familyClassId(s)));
  const thisWeek = familyClasses(after.filter((s) => s.dateKey <= weekEnd));
  const nextWeek = familyClasses(after.filter((s) => s.dateKey > weekEnd && s.dateKey <= addDays(weekEnd, 7)));
  const week = thisWeek.length ? { title: "Rest of this week", list: thisWeek } : nextWeek.length ? { title: "Next week", list: nextWeek } : null;

  // The newest shared report of each student shown.
  const latest = family.shown.flatMap((id) => reports.data.find((r) => r.studentId === id) ?? []);

  // The latest scores of each student shown (newest first), and which were a personal best when they were shot.
  const latestScores = useMemo(() => {
    const each = family.shown.length > 1 ? LATEST_EACH : LATEST_ONE;
    const rows: EvaluationDoc[] = family.shown.flatMap((id) => scores.data.filter((e) => e.studentId === id).slice(0, each));
    const best = new Set(family.shown.flatMap((id) => [...personalBestIds(scores.data.filter((e) => e.studentId === id))]));
    // Newest first across the children, in the order the lists give them.
    const order = new Map(scores.data.map((e, i) => [e.id, i]));
    // A parent's children who have none yet, said so beside the others'.
    const none = family.shown.filter((id) => !scores.data.some((e) => e.studentId === id));
    return { rows: rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)), best, none };
  }, [scores.data, family.shown]);

  const openClass = (s: Pick<SessionDoc, "id">) => router.push({ pathname: "/session/[id]", params: { id: s.id } });

  return (
    <Screen tab typing={false} onRefresh={() => new Promise((r) => setTimeout(r, 600))} testID="family-home">
      <View style={styles.header}>
        <SkyArcLockup size="sm" testID="family-home-lockup" />
        <T variant="title" accessibilityRole="header" style={styles.greeting} testID="family-home-greeting">
          {greeting(nowMin)}
          {first ? `, ${first}` : ""}
        </T>
        <T tone="muted" testID="family-home-date">
          {longDay(today)}
        </T>
      </View>

      {!family.ids.length ? (
        <>
          <Card>
            <NotLinked />
          </Card>
          <AcademyNews today={today} />
          <AcademyContact />
        </>
      ) : (
        <>
          <ChildSwitcher />

          <View style={styles.section}>
            <SectionTitle title={nextGroups.length > 1 ? "Next classes" : "Next class"} />
            {sessions.loading ? (
              <SkeletonCards count={1} height={150} />
            ) : sessions.error ? (
              <Card>
                <T variant="label">Couldn’t load the classes</T>
                <T variant="small" tone="muted">
                  Check your connection, then pull down to try again.
                </T>
              </Card>
            ) : (
              <View style={styles.list} testID="family-next">
                {nextGroups.map((g) => (
                  <NextClassCard key={g.id} group={g} when={when} onPress={() => openClass(g.sessions[0])} testID={`family-next-${g.sessions[0].id}`} />
                ))}
                {nothingFor.length ? (
                  <Card style={styles.quiet} testID="family-next-none">
                    <View style={[styles.quietIcon, { backgroundColor: colors.secondary }]}>
                      <CalendarX2 size={20} color={colors.mutedForeground} />
                    </View>
                    <View style={styles.grow}>
                      <T variant="label">{parent ? `Nothing booked for ${namesList(nothingFor.map((id) => family.firstName(id)))}` : "Nothing booked yet"}</T>
                      <T variant="small" tone="muted">
                        {parent ? "Classes the academy books show here." : "Your classes show here once the academy books them."}
                      </T>
                    </View>
                  </Card>
                ) : null}
              </View>
            )}
          </View>

          {week && !sessions.loading ? (
            <ListSection title={week.title} detail={plural(week.list.length, "class", "classes")} testID="family-week">
              {week.list.map((g) => (
                <FamilyClassRow key={g.id} group={g} when={when} showDate onPress={() => openClass(g.sessions[0])} testID={`family-week-${g.sessions[0].id}`} />
              ))}
            </ListSection>
          ) : null}

          <AcademyNews today={today} />

          <ListSection title="Latest scores" testID="family-home-scores">
            {scores.loading ? (
              <ListRow title="Loading scores…" />
            ) : latestScores.rows.length ? (
              [
                ...latestScores.rows.map((e) => (
                  <ScoreRow
                    key={e.id}
                    evaluation={e}
                    name={parent && family.shown.length > 1 ? family.firstName(e.studentId, e.studentName) : null}
                    best={latestScores.best.has(e.id)}
                    onPress={() => router.push({ pathname: "/score/[id]", params: { id: e.id } })}
                    testID={`family-home-score-${e.id}`}
                  />
                )),
                ...(latestScores.none.length
                  ? [
                      <ListRow
                        key="none"
                        icon={
                          <RowIcon>
                            <Target size={17} color={colors.mutedForeground} />
                          </RowIcon>
                        }
                        title={`No scores yet for ${namesList(latestScores.none.map((id) => family.firstName(id)))}`}
                        testID="family-home-scores-none"
                      />,
                    ]
                  : []),
                <ListRow key="all" title="All scores" onPress={() => router.navigate("/scores")} testID="family-home-all-scores" />,
              ]
            ) : (
              <ListRow
                icon={
                  <RowIcon>
                    <Target size={17} color={colors.mutedForeground} />
                  </RowIcon>
                }
                title="No scores yet"
                subtitle="Results show here after classes, once the coach adds them."
                testID="family-home-no-scores"
              />
            )}
          </ListSection>

          <ListSection title={latest.length > 1 ? "Latest reports" : "Latest report"} testID="family-home-reports">
            {reports.loading ? (
              <ListRow title="Loading reports…" />
            ) : latest.length ? (
              latest.map((r) => (
                <ReportRow
                  key={r.id}
                  report={r}
                  name={parent ? family.firstName(r.studentId, r.student?.firstName) : null}
                  isNew={isNew(r)}
                  onPress={() => router.push({ pathname: "/report/[id]", params: { id: r.id } })}
                  testID={`family-home-report-${r.id}`}
                />
              ))
            ) : (
              <ListRow
                icon={
                  <RowIcon>
                    <ChartLine size={17} color={colors.mutedForeground} />
                  </RowIcon>
                }
                title="No report yet"
                subtitle={`${academy} shares progress reports here when they’re ready.`}
                testID="family-home-no-report"
              />
            )}
          </ListSection>

          <ListSection title="Attendance" detail="Last 30 days" testID="family-attendance">
            {family.shown.map((id) => (
              <Attendance key={id} name={parent ? family.firstName(id) : null} sessions={mine.filter((s) => s.studentId === id)} from={from} today={today} nowMin={nowMin} loading={sessions.loading} />
            ))}
          </ListSection>

          <AcademyContact />
        </>
      )}
    </Screen>
  );
}

/**
 * "From the academy": the academy's latest posts for families (pinned first, then the newest), each "New" until this
 * person opens it, and All news (the News page) when there are more than these, as on the website. Nothing while they
 * load, or when the academy has none for families.
 */
function AcademyNews({ today }: { today: DateKey }) {
  const news = useFamilyNews();
  const isNew = useIsNewNews();
  if (!news.data.length) return null;
  const fresh = news.data.filter((a) => isNew(a.id)).length;
  const shown = news.data.slice(0, LATEST_NEWS);
  return (
    <ListSection title="From the academy" detail={fresh ? `${fresh} new` : undefined} testID="family-home-news">
      {[
        ...shown.map((a) => (
          <NewsRow key={a.id} post={a} isNew={isNew(a.id)} today={today} onPress={() => router.push({ pathname: "/news/[id]", params: { id: a.id } })} testID={`family-home-news-${a.id}`} />
        )),
        ...(news.data.length > shown.length
          ? [<ListRow key="all" title="All news" right={String(news.data.length)} onPress={() => router.push("/news")} testID="family-home-all-news" />]
          : []),
      ]}
    </ListSection>
  );
}

/**
 * A student's attendance over the last 30 days, as the reports count it (shared/src/reports/facts.ts): attended
 * against missed, canceled classes counting neither way, and classes not marked yet said so.
 */
function Attendance({ name, sessions, from, today, nowMin, loading, divider }: { name: string | null; sessions: SessionDoc[]; from: DateKey; today: DateKey; nowMin: number; loading: boolean; divider?: boolean }) {
  const colors = useColors();
  const done = sessions.filter((s) => s.dateKey >= from && hasEnded(s, today, nowMin));
  const a = attendanceFacts(done.map((s) => ({ dateKey: s.dateKey, status: s.status, past: true })));
  const marked = a.attended + a.missed;
  const line = loading
    ? "Loading…"
    : !done.length
      ? "No classes in the last 30 days."
      : [
          marked ? `${a.attended} of ${marked} ${marked === 1 ? "class" : "classes"} attended` : "No classes marked yet",
          a.canceled ? `${a.canceled} canceled` : null,
          a.unmarked && marked ? `${a.unmarked} not marked yet` : null,
        ]
          .filter(Boolean)
          .join(" · ");
  return (
    <View style={[styles.attendance, divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]} testID="family-attendance-row" accessible accessibilityLabel={[name, a.percent !== null ? `${a.percent}% attended` : null, line].filter(Boolean).join(", ")}>
      <View style={styles.attendanceTop}>
        <View style={styles.grow}>
          {name ? (
            <T variant="label" numberOfLines={1}>
              {name}
            </T>
          ) : null}
          <T variant="small" tone="muted">
            {line}
          </T>
        </View>
        {a.percent !== null && !loading ? <T variant="stat">{a.percent}%</T> : null}
      </View>
      {a.percent !== null && !loading ? (
        <View style={[styles.track, { backgroundColor: colors.secondary }]}>
          <View style={[styles.fill, { width: `${a.percent}%`, backgroundColor: colors.primary }]} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: 2 },
  greeting: { marginTop: space.md },
  section: { gap: space.sm },
  list: { gap: space.md },
  grow: { flex: 1, gap: 2 },
  quiet: { flexDirection: "row", alignItems: "center", gap: space.md },
  quietIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  attendance: { paddingHorizontal: space.lg, paddingVertical: space.md, gap: space.sm },
  attendanceTop: { flexDirection: "row", alignItems: "center", gap: space.md },
  track: { height: 6, borderRadius: radius.full, overflow: "hidden" },
  fill: { height: 6, borderRadius: radius.full },
});
