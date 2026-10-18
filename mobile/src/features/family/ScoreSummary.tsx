import { reportFacts, toPoint } from "@shared/reports/facts";
import { POSITIONS, POSITION_COLORS, POSITION_LABELS, type Position, inOrder } from "@shared/shooting/evaluation";
import { positionProgress } from "@shared/shooting/progress";
import { canReplay } from "@shared/shooting/replay";
import { meanPoint, offsetWords } from "@shared/shooting/target";
import type { DateKey } from "@shared/time";
import { Trophy } from "lucide-react-native";
import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Card } from "@/components/Card";
import { SegmentedControl } from "@/components/SegmentedControl";
import { T } from "@/components/Text";
import type { EvaluationDoc } from "@/features/data/hooks";
import { DistributionBar, INK, TrendChart, trendSeries } from "@/features/reports/charts";
import { one } from "@/features/reports/format";
import { monthDay, plural } from "@/features/schedule/format";
import { playPoints } from "@/features/scores/playback";
import { ShotReplay } from "@/features/scores/ShotReplay";
import { radius, space, useColors, useIsDark } from "@/theme";

/**
 * A student's scores at a glance, for the family's Scores tab, as the website's family Scores page shows them
 * (web/src/features/family/ScoreWidgets.tsx): each position's figures, the scores over time, and where the shots land.
 * Scores are per 10 shots in whole numbers (a paper card's scale, where SIUS results and paper cards compare), as the
 * reports give them (shared/src/shooting/progress.ts). Every figure here is also in the list of results.
 */

/**
 * Each position's average per 10 shots, its best with the day it was shot (a trophy, as the "New best" badges have), and
 * how many results: a tile each, which opens that best result (a position's only result, when it has one).
 */
export function PositionTiles({ evaluations, onOpen, testID }: { evaluations: readonly EvaluationDoc[]; onOpen: (id: string) => void; testID?: string }) {
  const colors = useColors();
  const progress = useMemo(() => positionProgress(evaluations), [evaluations]);
  if (!progress.length) return null;
  return (
    <View style={styles.tiles} testID={testID}>
      {progress.map((p) => {
        const name = POSITION_LABELS[p.position];
        const only = p.results === 1;
        const mark = p.best ?? p.latest;
        return (
          <Card
            key={p.position}
            style={styles.tile}
            onPress={mark ? () => onOpen(mark.id) : undefined}
            testID={testID ? `${testID}-${p.position}` : undefined}
            accessibilityLabel={[
              name,
              p.average !== null ? `average ${one(p.average)} per 10 shots` : null,
              mark ? `${only ? "one result" : "best"} ${one(mark.per10)} on ${monthDay(mark.dateKey)}` : null,
              only ? null : plural(p.results, "result"),
              mark ? `Opens the ${only ? "" : "best "}${name.toLowerCase()} result` : null,
            ]
              .filter(Boolean)
              .join(", ")}
          >
            <View style={styles.tileHead}>
              <View style={[styles.dot, { backgroundColor: POSITION_COLORS[p.position] }]} />
              <T variant="small" style={styles.tileLabel} numberOfLines={1}>
                {name}
              </T>
            </View>
            <T variant="stat" numberOfLines={1} adjustsFontSizeToFit>
              {p.average !== null ? one(p.average) : "–"}
            </T>
            <T variant="tiny" tone="muted">
              average
            </T>
            {mark ? (
              <>
                <View style={styles.bestLine}>
                  {only ? null : <Trophy size={12} color={colors.warning} />}
                  <T variant="small" style={styles.best} numberOfLines={1}>
                    {only ? "1 result" : `Best ${one(mark.per10)}`}
                  </T>
                </View>
                <T variant="tiny" tone="muted" numberOfLines={1}>
                  {monthDay(mark.dateKey)}
                  {only ? "" : ` · ${plural(p.results, "result")}`}
                </T>
              </>
            ) : null}
          </Card>
        );
      })}
    </View>
  );
}

/** The light paper the charts sit on in both appearances (their colours are checked against it), as the reports'. */
function usePaper() {
  const colors = useColors();
  const dark = useIsDark();
  return { backgroundColor: INK.paper, borderColor: dark ? "transparent" : colors.border };
}

/** The scores over time, a line per position (whole scores per 10 shots), from the first result to `to` (today). */
export function ScoresChart({ evaluations, to, testID }: { evaluations: readonly EvaluationDoc[]; to: DateKey; testID?: string }) {
  const paper = usePaper();
  const points = useMemo(() => inOrder(evaluations.filter((e) => e.shots > 0)).map(toPoint), [evaluations]);
  if (points.length < 2) return null;
  const from = points[0].dateKey;
  return (
    <Card style={styles.gap} testID={testID}>
      <View style={styles.cardHead}>
        <T variant="label" style={styles.grow}>
          Scores over time
        </T>
        <T variant="small" tone="muted">
          per 10 shots
        </T>
      </View>
      <View style={[styles.paper, paper]}>
        <TrendChart series={trendSeries(points)} from={from} to={to > from ? to : from} testID={testID ? `${testID}-chart` : undefined} />
      </View>
      <T variant="tiny" tone="muted">
        Tap the chart to read a day’s scores. Higher is better; 100 is every shot a 10.
      </T>
    </Card>
  );
}

/** How many of a position's latest results play together on the target. */
const RECENT = 5;

/**
 * Where the shots land, as on the website: the latest results of one position (those with shots placed on the target:
 * SIUS, and cards scanned with the app), their shots together on one target, played back result after result; where
 * they land on average, in words; their group against the results before; and each shot's score. One position at a
 * time, chosen above it; the latest result's first.
 */
export function ShotPattern({ evaluations, size, testID }: { evaluations: readonly EvaluationDoc[]; size: number; testID?: string }) {
  const paper = usePaper();
  // Newest first, as the list gives them.
  const placed = useMemo(() => evaluations.filter(canReplay), [evaluations]);
  const positions = POSITIONS.filter((p) => placed.some((e) => e.position === p));
  const [chosen, setChosen] = useState<Position | null>(null);
  const pos = chosen && positions.includes(chosen) ? chosen : (placed[0]?.position ?? null);
  const recent = useMemo(() => (pos ? inOrder(placed.filter((e) => e.position === pos).slice(0, RECENT)) : []), [placed, pos]);
  const shots = useMemo(() => playPoints(recent.map(toPoint)), [recent]);
  const counts = useMemo(() => reportFacts(recent, [], null).facts.distribution, [recent]);
  // Their average point in words, and their group against the position's results before them.
  const facts = useMemo(() => {
    const points = shots.flatMap((s) => (s.point ? [s.point] : []));
    const mpi = points.length >= 2 ? meanPoint(points) : null;
    const earlier = inOrder(placed.filter((e) => e.position === pos)).slice(0, -recent.length || undefined);
    const groups = (list: readonly EvaluationDoc[]) => list.map((e) => e.groupMm).filter((g): g is number => typeof g === "number" && g > 0);
    const avg = (v: number[]) => (v.length ? Math.round((v.reduce((n, x) => n + x, 0) / v.length) * 10) / 10 : null);
    return { onTarget: points.length, mpi, group: avg(groups(recent)), before: recent.length < placed.filter((e) => e.position === pos).length ? avg(groups(earlier)) : null };
  }, [shots, placed, pos, recent]);
  if (!pos || !recent.length) return null;
  const { onTarget, mpi, group, before } = facts;
  const which = recent.length === 1 ? "the latest result" : `the last ${recent.length} results`;
  const where = mpi ? offsetWords(mpi) : null;
  return (
    <Card style={styles.gap} testID={testID}>
      <View style={styles.cardHead}>
        <T variant="label" style={styles.grow}>
          Where the shots land
        </T>
        <View style={[styles.dot, { backgroundColor: POSITION_COLORS[pos] }]} />
      </View>
      {positions.length > 1 ? (
        <SegmentedControl<Position> value={pos} onChange={setChosen} options={positions.map((p) => ({ value: p, label: POSITION_LABELS[p] }))} testID={testID ? `${testID}-position` : undefined} />
      ) : null}
      <View style={styles.center}>
        <ShotReplay key={pos} shots={shots} color={POSITION_COLORS[pos]} size={size} caption={`${POSITION_LABELS[pos]} · ${onTarget} shots in ${which}`} />
      </View>
      {mpi || group !== null ? (
        <View style={styles.words} testID={testID ? `${testID}-words` : undefined}>
          {mpi ? (
            <T variant="small" tone="muted">
              {where
                ? `On average they land ${where} of the centre (the blue cross), ${one(Math.round(Math.hypot(mpi.x, mpi.y) * 10) / 10)} mm away.`
                : "On average they land right on the centre (the blue cross)."}
            </T>
          ) : null}
          {group !== null ? (
            <T variant="small" tone="muted">
              {`Group size ${one(group)} mm on average${before !== null ? `, ${group < before ? "tighter than" : group > before ? "wider than" : "the same as"} the ${one(before)} mm of the results before` : ""}. Smaller is tighter.`}
            </T>
          ) : null}
        </View>
      ) : null}
      <View style={[styles.paper, paper]}>
        <T variant="small" style={[styles.paperTitle, { color: INK.secondary }]}>
          Each shot’s score
        </T>
        <DistributionBar {...counts} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  gap: { gap: space.md },
  center: { alignItems: "center" },
  cardHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  paper: { borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, padding: space.md },
  paperTitle: { fontWeight: "600", marginBottom: space.sm },
  words: { gap: space.xs },
  tiles: { flexDirection: "row", gap: space.sm },
  tile: { flex: 1, gap: 2, padding: space.md },
  tileHead: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  tileLabel: { fontWeight: "600", flexShrink: 1 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  bestLine: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: space.xs },
  best: { fontWeight: "600", flexShrink: 1 },
});
