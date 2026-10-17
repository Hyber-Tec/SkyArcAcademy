import { Canvas } from "@shopify/react-native-skia";
import type { Evaluation } from "@shared/shooting/evaluation";
import { type ReplayShot, replayShots, replayStepMs } from "@shared/shooting/replay";
import { PELLET_MM, type ShotPoint, meanPoint, targetViewMm } from "@shared/shooting/target";
import * as Haptics from "expo-haptics";
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { IconButton } from "@/components/IconButton";
import { T } from "@/components/Text";
import { space, useColors } from "@/theme";
import { ChosenShot, MpiMark, RingNumbers, ShotDot, TargetFace, toPoints, useTargetFont } from "./Target";

type Placed = ReplayShot & { point: ShotPoint };

/**
 * A result's shots played back on one target, one by one in the order they were fired: the newest drops onto its
 * place in amber with its number, the earlier ones stay in the position's colour, and the line under it says which
 * shot it is and the running total. Before playing (and once it ends) every shot shows, with the average point, as
 * the website's picture. Shots without a place (a typed card's, a SIUS shot without an arrow) still count in the total.
 * The same playback as the website's (web/src/features/scores/ShotReplay.tsx).
 *
 * `autoPlay` plays it once as it opens (a card just scanned); `onStep` hears which shot is showing (null: all of them),
 * for what follows along (the darts of a result's shots).
 */
export function ShotReplay({
  evaluation,
  color,
  size,
  autoPlay = false,
  onStep,
}: {
  evaluation: Pick<Evaluation, "source" | "series">;
  color: string;
  size: number;
  autoPlay?: boolean;
  onStep?: (n: number | null) => void;
}) {
  const colors = useColors();
  const reduced = useReducedMotion();
  const shots = useMemo(() => replayShots(evaluation), [evaluation]);
  const placed = useMemo(() => shots.filter((s): s is Placed => s.point !== null), [shots]);
  const count = shots.length;
  /** The shot shown as the newest (1…n); null shows them all. */
  const [step, setStep] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const sius = evaluation.source === "sius";
  const labelFont = useTargetFont(15);
  const view = targetViewMm(
    placed.map((s) => s.point),
    size,
  );
  const ringFont = useTargetFont(Math.round(Math.min(13, Math.max(8, (1.6 * size) / (2 * view)))), "500");

  useEffect(() => {
    if (!autoPlay) return;
    // A moment to see the whole card first, then the shots one by one.
    const t = setTimeout(() => {
      setStep(1);
      setPlaying(true);
    }, 500);
    return () => clearTimeout(t);
  }, [autoPlay]);

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

  // The shown shot, kept within the result when it changes (a shot taken off a card while it plays).
  const at = step !== null && step <= count ? step : null;
  useEffect(() => {
    onStep?.(at);
  }, [at, onStep]);

  if (!placed.length) return null;

  const fmt = (v: number) => (sius ? v.toFixed(1) : String(Math.round(v)));
  const total = count ? shots[count - 1].running : 0;
  const current = at !== null ? shots[at - 1] : null;
  const mpi = at === null && placed.length >= 2 ? meanPoint(placed.map((s) => s.point)) : null;
  const earlier = at === null ? placed : placed.filter((s) => s.n < at);

  const play = () => {
    if (playing) return setPlaying(false);
    setStep(at === null || at >= count ? 1 : at);
    setPlaying(true);
  };
  const restart = () => {
    setStep(1);
    setPlaying(true);
  };
  const back = () => {
    setPlaying(false);
    setStep(at === null ? count : Math.max(1, at - 1));
  };
  const forward = () => {
    setPlaying(false);
    setStep(at === null ? 1 : at >= count ? null : at + 1);
  };

  const readout = current
    ? [current.series !== null ? `Series ${current.series}` : null, `Shot ${current.n} of ${count}`, `${fmt(current.value)}${current.point ? "" : " (no place on the target)"}`, `total ${fmt(current.running)}`]
        .filter(Boolean)
        .join(" · ")
    : [`${count} shots`, `total ${fmt(total)}`, placed.length < count ? `${count - placed.length} without a place` : null].filter(Boolean).join(" · ");

  return (
    <View style={styles.wrap} testID="replay">
      <Canvas style={{ width: size, height: size }} accessibilityLabel={current ? `Shot ${current.n} of ${count}: ${fmt(current.value)}` : `${placed.length} shots on the target`} accessible>
        <TargetFace view={view} size={size}>
          {earlier.map((s) => (
            <ShotDot key={s.n} point={s.point} color={color} view={view} size={size} />
          ))}
          {mpi ? <MpiMark point={mpi} view={view} /> : null}
        </TargetFace>
        <RingNumbers view={view} size={size} font={ringFont} />
        <ChosenShot
          at={current?.point ? toPoints(current.point, view, size) : { x: size / 2, y: size / 2 }}
          r={(PELLET_MM / 2) * (size / (2 * view))}
          n={current?.point ? current.n : null}
          font={labelFont}
          size={size}
          pop={!reduced}
        />
      </Canvas>
      <View style={styles.controls}>
        <IconButton icon={<RotateCcw size={19} color={colors.foreground} />} accessibilityLabel="Play again from the first shot" onPress={restart} testID="replay-restart" />
        <IconButton icon={<ChevronLeft size={22} color={at === 1 ? colors.mutedForeground : colors.foreground} />} accessibilityLabel="Previous shot" onPress={back} testID="replay-back" />
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

const styles = StyleSheet.create({
  wrap: { alignItems: "center", gap: space.sm },
  controls: { flexDirection: "row", alignItems: "center", gap: space.sm },
  spacer: { width: 40 },
  readout: { textAlign: "center", fontVariant: ["tabular-nums"] },
});
