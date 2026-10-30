import { personalBestIds } from "@shared/shooting/progress";
import { type DateKey, addDays } from "@shared/time";
import { router } from "expo-router";
import { CalendarDays, CalendarX2, Megaphone, Target } from "lucide-react-native";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { SkyArcLockup } from "@/components/brand/SkyArc";
import { Card } from "@/components/Card";
import { DemoBadge } from "@/components/DemoBadge";
import { ListRow, ListSection, ToneIcon } from "@/components/List";
import { Screen } from "@/components/Screen";
import { SectionTitle } from "@/components/SectionTitle";
import { SkeletonCards } from "@/components/Skeleton";
import { T } from "@/components/Text";
import { useAcademyNow } from "@/features/data/hooks";
import { NextClassCard } from "@/features/family/ClassCards";
import { type EvaluationDoc, type SessionDoc, useFamilyEvaluations, useFamilySessions } from "@/features/family/data";
import { AcademyContact, ChildSwitcher, NotLinked } from "@/features/family/FamilyParts";
import { useFamily } from "@/features/family/FamilyProvider";
import { hasEnded, namesList } from "@/features/family/format";
import { useFamilyNews, useIsNewNews } from "@/features/family/news";
import { InboxBell } from "@/features/notifications/InboxBell";
import { NewsRow } from "@/features/family/NewsRow";
import { ScoreRow } from "@/features/family/ScoreRow";
import { scoreTones } from "@/features/scores/format";
import { familyClassId, familyClasses } from "@/features/family/classes";
import { longDay } from "@/features/schedule/format";
import { useBranch } from "@/state/BranchProvider";
import { space, useColors } from "@/theme";

function greeting(nowMin: number): string {
  if (nowMin < 12 * 60) return "Good morning";
  if (nowMin < 17 * 60) return "Good afternoon";
  return "Good evening";
}

/** How far ahead Home looks for each student's next class. */
const AHEAD_DAYS = 8 * 7;
/** The latest scores Home shows: one student's, or each child's when a parent's Home shows them all. */
const LATEST_ONE = 2;
const LATEST_EACH = 1;
/** The academy's latest posts Home shows (the rest are on the News page). */
const LATEST_NEWS = 2;

/**
 * The family's first page (the app opens here), kept short (the owner, 2026-10-28): a greeting with the date; each
 * student's next class (a parent's children in the same class share a card) with its status and the class's note; the
 * academy's latest news for families (when it has any; all of it on the News page); and the latest scores (each opens
 * its own screen; all of them are a tab away). The week is on Classes, and reports (attendance in each) on Reports. A
 * parent with several children picks All or one child. Everything is live and in the academy's time zone.
 */
export default function FamilyHomeScreen() {
  const { settings, member, actor } = useBranch();
  const colors = useColors();
  const family = useFamily();
  const { today, nowMin } = useAcademyNow();
  const hour12 = settings.general.timeFormat !== "24h";
  const when = { today, nowMin, hour12 };
  const sessions = useFamilySessions(family.ids, today, addDays(today, AHEAD_DAYS));
  const scores = useFamilyEvaluations(family.ids);
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

  // The latest scores of each student shown (newest first), and which were a personal best when they were shot.
  // Each result's number against its student's usual in that position.
  const tones = useMemo(() => scoreTones(scores.data), [scores.data]);
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
        <View style={styles.top}>
          <View style={styles.brand}>
            <SkyArcLockup size="sm" testID="family-home-lockup" />
            <DemoBadge />
          </View>
          <View style={styles.bell}>
            <InboxBell testID="family-home-notifications" />
          </View>
        </View>
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
            <SectionTitle title={nextGroups.length > 1 ? "Next classes" : "Next class"} icon={CalendarDays} tone="red" />
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

          <AcademyNews today={today} />

          <ListSection title="Latest scores" icon={Target} tone="blue" testID="family-home-scores">
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
                    tone={tones.get(e.id)}
                    onPress={() => router.push({ pathname: "/score/[id]", params: { id: e.id } })}
                    testID={`family-home-score-${e.id}`}
                  />
                )),
                ...(latestScores.none.length
                  ? [
                      <ListRow
                        key="none"
                        icon={<ToneIcon icon={Target} tone="blue" />}
                        title={`No scores yet for ${namesList(latestScores.none.map((id) => family.firstName(id)))}`}
                        testID="family-home-scores-none"
                      />,
                    ]
                  : []),
                <ListRow key="all" title="All scores" onPress={() => router.navigate("/scores")} testID="family-home-all-scores" />,
              ]
            ) : (
              <ListRow
                icon={<ToneIcon icon={Target} tone="blue" />}
                title="No scores yet"
                subtitle="Results show here after classes, once the coach adds them."
                testID="family-home-no-scores"
              />
            )}
          </ListSection>
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
    <ListSection title="From the academy" icon={Megaphone} tone="teal" detail={fresh ? `${fresh} new` : undefined} testID="family-home-news">
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

const styles = StyleSheet.create({
  header: { gap: 2 },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 28 },
  brand: { flexDirection: "row", alignItems: "center", gap: space.sm },
  // The bell is a little taller than the lockup: it overhangs rather than pushing the greeting down.
  bell: { marginVertical: -4 },
  greeting: { marginTop: space.md },
  section: { gap: space.sm },
  list: { gap: space.md },
  grow: { flex: 1, gap: 2 },
  quiet: { flexDirection: "row", alignItems: "center", gap: space.md },
  quietIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
});
