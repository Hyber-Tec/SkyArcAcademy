import { Canvas, Circle } from "@shopify/react-native-skia";
import type { Evaluation } from "@shared/shooting/evaluation";
import { type ReplayShot, replayShots } from "@shared/shooting/replay";
import { PELLET_MM, type ShotPoint, offsetWords, targetViewMm } from "@shared/shooting/target";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { useMemo } from "react";
import { Modal, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { IconButton } from "@/components/IconButton";
import { SHEET_EDGES } from "@/components/Sheet";
import { T } from "@/components/Text";
import { space, useColors } from "@/theme";
import { ChosenShot, NEWEST, RingNumbers, ShotDot, TargetFace, toPoints, useTargetFont } from "./Target";

const COLUMNS = 5;
const GAP = space.sm;
/** Under each dart: its score. */
const LABEL = 22;

/** A result's shots in firing order, with the target's scale for all of them (the replay's, zoomed to the group). */
export function useShots(evaluation: Pick<Evaluation, "source" | "series">) {
  return useMemo(() => {
    const shots = replayShots(evaluation);
    const view = targetViewMm(
      shots.flatMap((s) => (s.point ? [s.point] : [])),
      300,
    );
    return { shots, view };
  }, [evaluation]);
}

const fmtScore = (e: Pick<Evaluation, "source">, v: number) => (e.source === "sius" ? v.toFixed(1) : String(Math.round(v)));

/**
 * A result's shots as darts, series by series: one small target per shot, in the order they were fired, with the shot
 * where it hit and its score under it. The shot the replay is showing (`current`) is ringed in amber; tapping a dart
 * opens it larger (`onOpen`).
 */
export function ShotDarts({ evaluation, color, width, current, onOpen }: { evaluation: Pick<Evaluation, "source" | "series">; color: string; width: number; current: number | null; onOpen: (n: number) => void }) {
  const colors = useColors();
  const { shots, view } = useShots(evaluation);
  const cell = (width - GAP * (COLUMNS - 1)) / COLUMNS;
  const dart = Math.min(cell - 6, 72);
  const series = evaluation.series.map((s) => ({ n: s.n, total: s.total, shots: shots.filter((t) => t.series === s.n || (t.series === null && evaluation.series.length === 1)) }));
  return (
    <View style={styles.wrap}>
      {series.map((s) => {
        const rows = Math.ceil(s.shots.length / COLUMNS);
        const height = rows * (dart + LABEL) + (rows - 1) * GAP;
        const placeOf = (i: number) => ({ x: (i % COLUMNS) * (cell + GAP) + (cell - dart) / 2, y: Math.floor(i / COLUMNS) * (dart + LABEL + GAP) });
        return (
          <View key={s.n} style={styles.series} testID={`darts-series-${s.n}`}>
            <View style={styles.head}>
              <T variant="label">Series {s.n}</T>
              <T variant="label" style={styles.number}>
                {fmtScore(evaluation, s.total)}
              </T>
            </View>
            <View style={{ width, height }}>
              <Canvas style={StyleSheet.absoluteFill}>
                {s.shots.map((t, i) => {
                  const at = placeOf(i);
                  return (
                    <Dart key={t.n} shot={t} x={at.x} y={at.y} size={dart} view={view} color={color} current={current === t.n} />
                  );
                })}
              </Canvas>
              <View style={[StyleSheet.absoluteFill, styles.grid]}>
                {s.shots.map((t) => (
                  <Pressable
                    key={t.n}
                    onPress={() => onOpen(t.n)}
                    accessibilityRole="button"
                    accessibilityLabel={`Shot ${t.n}: ${fmtScore(evaluation, t.value)}${t.point ? "" : ", no place on the target"}`}
                    testID={`dart-${t.n}`}
                    style={({ pressed }) => [{ width: cell, height: dart + LABEL, opacity: pressed ? 0.6 : 1 }]}
                  >
                    <View style={{ height: dart }} />
                    <T variant="small" style={[styles.score, { color: t.value >= 10 ? colors.foreground : colors.mutedForeground }, t.value >= 10 && styles.ten]}>
                      {fmtScore(evaluation, t.value)}
                    </T>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** One dart: a small target with the shot where it hit, ringed in amber while the replay shows it. */
function Dart({ shot, x, y, size, view, color, current }: { shot: ReplayShot; x: number; y: number; size: number; view: number; color: string; current: boolean }) {
  return (
    <>
      <TargetFace view={view} size={size} x={x} y={y}>
        {shot.point ? <ShotDot point={shot.point} color={current ? NEWEST : color} view={view} size={size} solid /> : null}
      </TargetFace>
      {current ? <Circle cx={x + size / 2} cy={y + size / 2} r={size / 2 + 1.5} color={NEWEST} style="stroke" strokeWidth={3} /> : null}
    </>
  );
}

/**
 * One shot, large: the target with that shot singled out in amber and the others faint, its score, how far from the
 * centre it hit and which way; the previous and next shots a tap away.
 */
export function ShotSheet({ evaluation, color, n, onChange, onClose }: { evaluation: Pick<Evaluation, "source" | "series">; color: string; n: number | null; onChange: (n: number) => void; onClose: () => void }) {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const { shots, view } = useShots(evaluation);
  const size = Math.min(width - space.lg * 2, 440);
  const labelFont = useTargetFont(17);
  const ringFont = useTargetFont(Math.round(Math.min(14, Math.max(9, (1.6 * size) / (2 * view)))), "500");
  const shot = n !== null ? shots[n - 1] : undefined;
  const count = shots.length;
  return (
    <Modal visible={!!shot} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]} edges={SHEET_EDGES}>
        {shot ? (
          <>
            <View style={styles.sheetHead}>
              <View style={styles.grow}>
                <T variant="heading">
                  Shot {shot.n} of {count}
                </T>
                {shot.series !== null ? (
                  <T variant="small" tone="muted">
                    Series {shot.series}
                  </T>
                ) : null}
              </View>
              <Button variant="ghost" size="sm" onPress={onClose} testID="shot-sheet-done">
                Done
              </Button>
            </View>
            <View style={styles.sheetBody}>
              <Canvas style={{ width: size, height: size }} accessibilityLabel={`Shot ${shot.n} on the target`} accessible>
                <TargetFace view={view} size={size}>
                  {shots.map((t) => (t.point && t.n !== shot.n ? <ShotDot key={t.n} point={t.point} color={color} view={view} size={size} faint /> : null))}
                </TargetFace>
                <RingNumbers view={view} size={size} font={ringFont} />
                <ChosenShot at={shot.point ? toPoints(shot.point, view, size) : { x: size / 2, y: size / 2 }} r={(PELLET_MM / 2) * (size / (2 * view))} n={shot.point ? shot.n : null} font={labelFont} size={size} pop={false} />
              </Canvas>
              <T variant="display" style={styles.number} testID="shot-sheet-score">
                {fmtScore(evaluation, shot.value)}
              </T>
              <T tone="muted" style={styles.center}>
                {where(shot.point)}
              </T>
              <View style={styles.steps}>
                <IconButton
                  icon={<ChevronLeft size={24} color={shot.n > 1 ? colors.foreground : colors.mutedForeground} />}
                  accessibilityLabel="Previous shot"
                  onPress={() => shot.n > 1 && onChange(shot.n - 1)}
                  size={52}
                  filled
                  testID="shot-sheet-previous"
                />
                <T variant="label" style={styles.number}>
                  {shot.n} / {count}
                </T>
                <IconButton
                  icon={<ChevronRight size={24} color={shot.n < count ? colors.foreground : colors.mutedForeground} />}
                  accessibilityLabel="Next shot"
                  onPress={() => shot.n < count && onChange(shot.n + 1)}
                  size={52}
                  filled
                  testID="shot-sheet-next"
                />
              </View>
            </View>
          </>
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}

/** Where a shot hit, in words: its distance from the centre and the direction. */
function where(p: ShotPoint | null): string {
  if (!p) return "No place on the target";
  const d = Math.hypot(p.x, p.y);
  const way = offsetWords(p, 0.5);
  return way ? `${d.toFixed(1)} mm from the centre, ${way}` : `${d.toFixed(1)} mm from the centre`;
}

const styles = StyleSheet.create({
  wrap: { gap: space.lg },
  series: { gap: space.sm },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  grid: { flexDirection: "row", flexWrap: "wrap", columnGap: GAP, rowGap: GAP },
  score: { textAlign: "center", fontVariant: ["tabular-nums"], lineHeight: LABEL },
  ten: { fontWeight: "700" },
  number: { fontVariant: ["tabular-nums"] },
  fill: { flex: 1 },
  grow: { flex: 1 },
  center: { textAlign: "center" },
  sheetHead: { flexDirection: "row", alignItems: "center", paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.sm },
  sheetBody: { alignItems: "center", gap: space.md, padding: space.lg },
  steps: { flexDirection: "row", alignItems: "center", gap: space.xl, marginTop: space.sm },
});
