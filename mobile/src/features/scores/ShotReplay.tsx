import { Canvas, Circle, Group, Line, type SkFont, Text as SkiaText, matchFont, rect, rrect, vec } from "@shopify/react-native-skia";
import type { Evaluation } from "@shared/shooting/evaluation";
import { type ReplayShot, replayShots, replayStepMs } from "@shared/shooting/replay";
import { BLACK_RADIUS_MM, PELLET_MM, type ShotPoint, meanPoint, ringRadiusMm, targetViewMm } from "@shared/shooting/target";
import * as Haptics from "expo-haptics";
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { Easing, useDerivedValue, useReducedMotion, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { IconButton } from "@/components/IconButton";
import { T } from "@/components/Text";
import { space, useColors } from "@/theme";

/** The target's own colours, on light paper whatever the phone's appearance (as the website's and the reports'). */
const PAPER = "#fbfaf7";
const BLACK = "#161616";
const LINE = "#a8a59c";
const FRAME = "#d9d6cd";
/** The newest shot, in the amber the static picture gives the last shot (never a position's colour). */
const NEWEST = "#e8b100";
const NEWEST_EDGE = "#b88a00";
const NEWEST_TEXT = "#9a6f00";
const MPI = "#2f80ed";

const FONT_FAMILY = Platform.select({ ios: "Helvetica Neue", default: "sans-serif" });

type Placed = ReplayShot & { point: ShotPoint };

/**
 * A result's shots played back on one target, one by one in the order they were fired: the newest drops onto its
 * place in amber with its number, the earlier ones stay in the position's colour, and the line under it says which
 * shot it is and the running total. Before playing (and once it ends) every shot shows, with the average point, as
 * the website's picture. Shots without a place (a typed card's, a SIUS shot without an arrow) still count in the total.
 * The same playback as the website's (web/src/features/scores/ShotReplay.tsx).
 */
export function ShotReplay({ evaluation, color, size }: { evaluation: Pick<Evaluation, "source" | "series">; color: string; size: number }) {
  const colors = useColors();
  const reduced = useReducedMotion();
  const shots = useMemo(() => replayShots(evaluation), [evaluation]);
  const placed = useMemo(() => shots.filter((s): s is Placed => s.point !== null), [shots]);
  /** The shot shown as the newest (1…n); null shows them all. */
  const [step, setStep] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const count = shots.length;
  const sius = evaluation.source === "sius";

  useEffect(() => {
    if (!playing || step === null) return;
    const t = setTimeout(() => {
      if (step < count) {
        setStep(step + 1);
        void Haptics.selectionAsync().catch(() => undefined);
      } else {
        // The end: every shot again, with the average point.
        setPlaying(false);
        setStep(null);
      }
    }, replayStepMs(count));
    return () => clearTimeout(t);
  }, [playing, step, count]);

  const view = targetViewMm(
    placed.map((s) => s.point),
    size,
  );
  const k = size / (2 * view);
  const labelFont = useMemo(() => matchFont({ fontFamily: FONT_FAMILY, fontSize: 15, fontWeight: "700" }), []);
  const ringSize = Math.round(Math.min(13, Math.max(8, 1.6 * k)));
  const ringFont = useMemo(() => matchFont({ fontFamily: FONT_FAMILY, fontSize: ringSize, fontWeight: "500" }), [ringSize]);
  if (!placed.length) return null;

  const fmt = (v: number) => (sius ? v.toFixed(1) : String(Math.round(v)));
  const total = count ? shots[count - 1].running : 0;
  const current = step !== null ? shots[step - 1] : null;
  const mpi = step === null && placed.length >= 2 ? meanPoint(placed.map((s) => s.point)) : null;
  const earlier = step === null ? placed : placed.filter((s) => s.n < step);

  const play = () => {
    if (playing) return setPlaying(false);
    setStep(step === null || step >= count ? 1 : step);
    setPlaying(true);
  };
  const restart = () => {
    setStep(1);
    setPlaying(true);
  };
  const back = () => {
    setPlaying(false);
    setStep(step === null ? count : Math.max(1, step - 1));
  };
  const forward = () => {
    setPlaying(false);
    setStep(step === null ? 1 : step >= count ? null : step + 1);
  };

  const readout = current
    ? [current.series !== null ? `Series ${current.series}` : null, `Shot ${current.n} of ${count}`, `${fmt(current.value)}${current.point ? "" : " (no place on the target)"}`, `total ${fmt(current.running)}`]
        .filter(Boolean)
        .join(" · ")
    : [`${count} shots`, `total ${fmt(total)}`, placed.length < count ? `${count - placed.length} without a place` : null].filter(Boolean).join(" · ");
  // Millimetres (x right, y up) to the canvas's points.
  const px = (p: ShotPoint) => ({ x: size / 2 + p.x * k, y: size / 2 - p.y * k });

  return (
    <View style={styles.wrap} testID="replay">
      <Canvas style={{ width: size, height: size }} accessibilityLabel={current ? `Shot ${current.n} of ${count}: ${fmt(current.value)}` : `${placed.length} shots on the target`} accessible>
        <Group clip={rrect(rect(0, 0, size, size), size / 2, size / 2)}>
          <Group transform={[{ translateX: size / 2 }, { translateY: size / 2 }, { scale: k }]}>
            <Circle cx={0} cy={0} r={view} color={PAPER} />
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((ring) => (
              <Group key={ring}>
                <Circle cx={0} cy={0} r={ringRadiusMm(ring)} color={ring >= 4 ? BLACK : PAPER} />
                {ring === 4 ? null : <Circle cx={0} cy={0} r={ringRadiusMm(ring)} color={ring >= 4 ? PAPER : LINE} style="stroke" strokeWidth={view / 220} />}
              </Group>
            ))}
            <Circle cx={0} cy={0} r={BLACK_RADIUS_MM} color={BLACK} style="stroke" strokeWidth={view / 300} />
            {earlier.map((s) => (
              <Group key={s.n}>
                <Circle cx={s.point.x} cy={-s.point.y} r={PELLET_MM / 2} color={color} opacity={0.5} />
                <Circle cx={s.point.x} cy={-s.point.y} r={PELLET_MM / 2} color={color} style="stroke" strokeWidth={view / 140} />
              </Group>
            ))}
            {mpi ? (
              <Group>
                <Line p1={vec(mpi.x - 1.4, -mpi.y)} p2={vec(mpi.x + 1.4, -mpi.y)} color={MPI} strokeWidth={view / 90} strokeCap="round" />
                <Line p1={vec(mpi.x, -mpi.y - 1.4)} p2={vec(mpi.x, -mpi.y + 1.4)} color={MPI} strokeWidth={view / 90} strokeCap="round" />
              </Group>
            ) : null}
          </Group>
          <RingNumbers view={view} size={size} k={k} font={ringFont} />
          {current?.point ? <NewestShot key={current.n} at={px(current.point)} r={(PELLET_MM / 2) * k} n={current.n} font={labelFont} size={size} reduced={reduced} /> : null}
        </Group>
        <Circle cx={size / 2} cy={size / 2} r={size / 2 - 1} color={FRAME} style="stroke" strokeWidth={2} />
      </Canvas>
      <View style={styles.controls}>
        <IconButton icon={<RotateCcw size={19} color={colors.foreground} />} accessibilityLabel="Play again from the first shot" onPress={restart} testID="replay-restart" />
        <IconButton icon={<ChevronLeft size={22} color={step === 1 ? colors.mutedForeground : colors.foreground} />} accessibilityLabel="Previous shot" onPress={back} testID="replay-back" />
        <IconButton
          icon={playing ? <Pause size={22} color={colors.foreground} /> : <Play size={22} color={colors.foreground} />}
          accessibilityLabel={playing ? "Pause" : "Play the shots one by one"}
          onPress={play}
          size={52}
          filled
          testID="replay-play"
        />
        <IconButton icon={<ChevronRight size={22} color={colors.foreground} />} accessibilityLabel="Next shot" onPress={forward} testID="replay-next" />
        <View style={styles.spacer} />
      </View>
      <T variant="small" tone="muted" style={styles.readout} testID="replay-readout">
        {readout}
      </T>
    </View>
  );
}

/** The ring numbers left and right of the centre, where they fit (drawn at the screen's size, so they stay crisp). */
function RingNumbers({ view, size, k, font }: { view: number; size: number; k: number; font: SkFont }) {
  const h = font.getSize();
  return (
    <>
      {[1, 2, 3, 4, 5, 6, 7, 8].flatMap((ring) => {
        const r = ringRadiusMm(ring) - 1.25;
        if (r > view - 1) return [];
        const text = String(ring);
        const w = font.measureText(text).width;
        const fill = ring >= 4 ? "#e9e7e0" : "#7d7a72";
        return [-r, r].map((x) => <SkiaText key={`${ring}${x}`} x={size / 2 + x * k - w / 2} y={size / 2 + h * 0.36} text={text} font={font} color={fill} />);
      })}
    </>
  );
}

/**
 * The newest shot: amber, dropping onto its place within the shortest step (it starts large and see-through; at once
 * with reduced motion), with its number beside it, as the website's.
 */
function NewestShot({ at, r, n, font, size, reduced }: { at: { x: number; y: number }; r: number; n: number; font: SkFont; size: number; reduced: boolean }) {
  const pop = useSharedValue(reduced ? 1 : 0);
  const shown = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) return;
    pop.set(withTiming(1, { duration: 220, easing: Easing.bezier(0.2, 0.8, 0.2, 1) }));
    shown.set(withDelay(60, withTiming(1, { duration: 160, easing: Easing.out(Easing.quad) })));
  }, [pop, shown, reduced]);
  const radius = useDerivedValue(() => r * (1 + 1.6 * (1 - pop.value)));
  const opacity = useDerivedValue(() => Math.min(1, pop.value / 0.55));
  const text = String(n);
  const label = numberPlace(at, r, font.measureText(text).width, font.getSize() * 0.72, size);
  return (
    <Group>
      <Group opacity={opacity}>
        <Circle cx={at.x} cy={at.y} r={radius} color={NEWEST} opacity={0.85} />
        <Circle cx={at.x} cy={at.y} r={radius} color={NEWEST_EDGE} style="stroke" strokeWidth={2} />
      </Group>
      <Group opacity={shown}>
        <SkiaText x={label.x} y={label.y} text={text} font={font} color="#ffffff" style="stroke" strokeWidth={4} strokeJoin="round" />
        <SkiaText x={label.x} y={label.y} text={text} font={font} color={NEWEST_TEXT} />
      </Group>
    </Group>
  );
}

/**
 * Where the newest shot's number goes (its left end and baseline, in points): up and to the right of the shot, or on
 * the first other side that keeps the whole number on the target when the shot sits near its edge.
 */
function numberPlace(at: { x: number; y: number }, r: number, width: number, height: number, size: number) {
  const gap = 4;
  const c = size / 2;
  const place = (right: boolean, up: boolean) => ({ x: right ? at.x + r + gap : at.x - r - gap - width, y: up ? at.y - r : at.y + r + height });
  const onTarget = ({ x, y }: { x: number; y: number }) => [x, x + width].every((px) => [y - height, y].every((py) => Math.hypot(px - c, py - c) < c * 0.93));
  return [place(true, true), place(false, true), place(true, false), place(false, false)].find(onTarget) ?? place(true, true);
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", gap: space.sm },
  controls: { flexDirection: "row", alignItems: "center", gap: space.sm },
  spacer: { width: 40 },
  readout: { textAlign: "center", fontVariant: ["tabular-nums"] },
});
