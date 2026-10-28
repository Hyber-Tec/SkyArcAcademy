import { type ResultKind, kindOf } from "@shared/shooting/evaluation";
import { personalBestIds } from "@shared/shooting/progress";
import { router } from "expo-router";
import { Target } from "lucide-react-native";
import { useMemo, useState } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { ListSection } from "@/components/List";
import { Screen } from "@/components/Screen";
import { SectionTitle } from "@/components/SectionTitle";
import { Skeleton, SkeletonCards } from "@/components/Skeleton";
import { T } from "@/components/Text";
import { type EvaluationDoc, useAcademyNow } from "@/features/data/hooks";
import { useFamilyEvaluations } from "@/features/family/data";
import { ChildSwitcher, NotLinked } from "@/features/family/FamilyParts";
import { ResultKindFilter } from "@/features/scores/kinds";
import { useFamily } from "@/features/family/FamilyProvider";
import { ScoreRow } from "@/features/family/ScoreRow";
import { PositionTiles, ScoresChart, ShotPattern } from "@/features/family/ScoreSummary";
import { monthYear, plural } from "@/features/schedule/format";
import { radius, space, useColors } from "@/theme";

/** Results listed at first, and added by "Show more". */
const PAGE = 30;

/**
 * Every score of the family's students (SIUS results and paper cards), as the staff see them: for one student, each
 * position's figures, the scores over time and where the latest shots went, then every result newest first, month by
 * month, "New best" on each that beat every earlier one in its position. A parent with several children picks All (each
 * child's figures and chart, then everyone's results with their names) or one child, as on the other tabs; with more
 * than one kind of result (practice, competitions, evaluations), one kind can be chosen, as on the website. A result
 * opens its own screen.
 */
export default function FamilyScoresScreen() {
  const family = useFamily();
  const colors = useColors();
  const { today } = useAcademyNow();
  const { width } = useWindowDimensions();
  const scores = useFamilyEvaluations(family.ids);
  const [count, setCount] = useState(PAGE);
  const [kind, setKind] = useState<ResultKind | "all">("all");

  // Personal bests, each student's against their own earlier results.
  const best = useMemo(() => {
    const ids = new Set<string>();
    for (const id of family.ids) for (const x of personalBestIds(scores.data.filter((e) => e.studentId === id))) ids.add(x);
    return ids;
  }, [scores.data, family.ids]);
  const theirs = useMemo(() => {
    const shown = new Set(family.shown);
    return scores.data.filter((e) => shown.has(e.studentId));
  }, [scores.data, family.shown]);
  // One kind, while the shown results have it (another child may have none: everything shows again).
  const kindNow = kind !== "all" && theirs.some((e) => kindOf(e) === kind) ? kind : "all";
  const list = useMemo(() => (kindNow === "all" ? theirs : theirs.filter((e) => kindOf(e) === kindNow)), [theirs, kindNow]);
  const months = useMemo(() => {
    const all = new Map<string, number>();
    for (const e of list) all.set(e.dateKey.slice(0, 7), (all.get(e.dateKey.slice(0, 7)) ?? 0) + 1);
    const byMonth = new Map<string, EvaluationDoc[]>();
    for (const e of list.slice(0, count)) {
      const m = e.dateKey.slice(0, 7);
      byMonth.set(m, [...(byMonth.get(m) ?? []), e]);
    }
    return [...byMonth.entries()].map(([month, rows]) => ({ month, rows, total: all.get(month) ?? rows.length }));
  }, [list, count]);
  const single = family.shown.length === 1;
  const showNames = family.several && family.child === "all";
  const target = Math.min(width - space.lg * 4, 340);
  const open = (id: string) => router.push({ pathname: "/score/[id]", params: { id } });
  const whose = family.who === "student" ? "your" : single ? `${family.firstName(family.shown[0])}’s` : "your children’s";

  return (
    <Screen title="Scores" typing={false} onRefresh={() => new Promise((r) => setTimeout(r, 600))} testID="family-scores">
      {!family.ids.length ? (
        <NotLinked />
      ) : (
        <>
          <View style={styles.controls}>
            <ChildSwitcher />
            <ResultKindFilter list={theirs} value={kindNow} onChange={setKind} testID="family-scores-kind" />
            <T tone="muted" style={styles.intro}>
              {`Every result from ${whose} classes, newest first.`}
            </T>
          </View>
          {scores.loading ? (
            <View style={styles.loading} testID="family-scores-loading">
              <Skeleton height={118} rounded={radius.lg} />
              <Skeleton height={230} rounded={radius.lg} />
              <SkeletonCards count={3} height={68} />
            </View>
          ) : scores.error && !scores.data.length ? (
            <Card>
              <T variant="label">Couldn’t load the scores</T>
              <T variant="small" tone="muted">
                Check your connection, then pull down to try again.
              </T>
            </Card>
          ) : !list.length ? (
            <EmptyState
              testID="family-scores-empty"
              icon={<Target size={26} color={colors.mutedForeground} />}
              title="No scores yet"
              text={
                family.who === "student"
                  ? "Your results show here after your classes, once your coach adds them: SIUS results and paper cards."
                  : `${single ? `${family.firstName(family.shown[0])}’s` : "Your children’s"} results show here after classes, once the coach adds them: SIUS results and paper cards.`
              }
            />
          ) : (
            <>
              {single ? (
                <View style={styles.block} testID="family-scores-summary">
                  <PositionTiles evaluations={list} onOpen={(id) => open(id)} testID="family-scores-tiles" />
                  <ScoresChart evaluations={list} to={today} testID="family-scores-trend" />
                  <ShotPattern evaluations={list} size={target} testID="family-scores-pattern" />
                </View>
              ) : (
                family.shown.map((id) => {
                  const own = list.filter((e) => e.studentId === id);
                  return (
                    <View key={id} style={styles.block} testID={`family-scores-child-${id}`}>
                      <SectionTitle title={family.firstName(id)} detail={own.length ? plural(own.length, "result") : undefined} />
                      {own.length ? (
                        <>
                          <PositionTiles evaluations={own} onOpen={(x) => open(x)} testID={`family-scores-tiles-${id}`} />
                          <ScoresChart evaluations={own} to={today} testID={`family-scores-trend-${id}`} />
                        </>
                      ) : (
                        <Card>
                          <T variant="label">No scores yet</T>
                          <T variant="small" tone="muted">
                            {`${family.firstName(id)}’s results show here after classes, once the coach adds them.`}
                          </T>
                        </Card>
                      )}
                    </View>
                  );
                })
              )}
              {months.map(({ month, rows, total }) => (
                <ListSection key={month} title={monthYear(`${month}-01`)} detail={plural(total, "result")} testID={`family-scores-month-${month}`}>
                  {rows.map((e) => (
                    <ScoreRow
                      key={e.id}
                      evaluation={e}
                      name={showNames ? family.firstName(e.studentId, e.studentName) : null}
                      best={best.has(e.id)}
                      onPress={() => open(e.id)}
                      testID={`family-score-row-${e.id}`}
                    />
                  ))}
                </ListSection>
              ))}
              {list.length > count ? (
                <Button variant="outline" onPress={() => setCount((c) => c + PAGE)} testID="family-scores-more">
                  {`Show more (${list.length - count} older)`}
                </Button>
              ) : null}
            </>
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  controls: { gap: space.md },
  intro: { paddingHorizontal: space.xs },
  loading: { gap: space.lg },
  block: { gap: space.md },
});
