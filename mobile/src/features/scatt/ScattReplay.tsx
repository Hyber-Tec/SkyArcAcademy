import { Canvas, Circle, Path, Skia } from "@shopify/react-native-skia";
import { decodeTrace } from "@shared/scatt/codec";
import type { ScattSession, ScattShot, ScattTraces } from "@shared/scatt/session";
import { type Point, SCATT_ARROWS } from "@shared/scatt/trace";
import { PELLET_MM } from "@shared/shooting/target";
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { Card } from "@/components/Card";
import { IconButton } from "@/components/IconButton";
import { SegmentedControl } from "@/components/SegmentedControl";
import { T } from "@/components/Text";
import { RingNumbers, ShotDot, TargetFace, useTargetFont } from "@/features/scores/Target";
import { radius, space, useColors } from "@/theme";

/**
 * A SCATT session played back shot by shot on the phone, as on the website (web/src/features/scatt/ScattReplay.tsx):
 * the aim moving over the target in SCATT's colours (green while aiming, yellow for the last second, red after the
 * shot), the shot, and its numbers in plain words. Families watch it; nobody adds anything here.
 */

const COLORS = { aim: "#00e000", last: "#ffd400", after: "#ff2a2a", shot: "#ff00ff" };
const ARROW_GLYPH = ["•", "↑", "↗", "→", "↘", "↓", "↙", "←", "↖"];
const VIEWS = { whole: 23, centre: 8 } as const;
type Zoom = keyof typeof VIEWS;
type Speed = "0.5" | "1" | "2";

interface Track {
  t0: number;
  dt: number;
  pts: Point[];
}

const shotLabel = (s: ScattShot) => (s.sighting ? "Sighter" : `Shot ${s.n}`);
const one = (v: number | null | undefined, d = 1) => (v === null || v === undefined ? "–" : v.toFixed(d));

export function ScattReplay({ session, traces, testID = "scatt-replay" }: { session: ScattSession; traces: ScattTraces | null; testID?: string }) {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const size = Math.min(width - space.lg * 2, 420);
  const tracks = useMemo<(Track | null)[]>(
    () => session.shots.map((_, i) => (traces?.shots[i] ? { t0: traces.shots[i].t0, dt: 1000 / (traces.rateHz || 50), pts: decodeTrace(traces.shots[i].xy) } : null)),
    [session.shots, traces],
  );
  const [cur, setCur] = useState(() => Math.max(0, session.shots.findIndex((s) => !s.sighting)));
  const [time, setTime] = useState<number | null>(null);
  const timeRef = useRef<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>("1");
  const [zoom, setZoom] = useState<Zoom>("whole");
  const shot = session.shots[cur];
  const track = tracks[cur];
  const tStart = track ? track.t0 : 0;
  const tEnd = track ? track.t0 + (track.pts.length - 1) * track.dt : 0;
  const t = time ?? tStart;
  const view = VIEWS[zoom];
  const ringFont = useTargetFont(Math.round(Math.min(13, Math.max(8, (1.6 * size) / (2 * view)))), "500");

  const setT = useCallback((v: number | null) => {
    timeRef.current = v;
    setTime(v);
  }, []);
  const select = (k: number, play: boolean) => {
    const n = (k + session.shots.length) % session.shots.length;
    setCur(n);
    setT(null);
    setPlaying(play && !!tracks[n]);
  };

  // Playback: the time moves on with the clock, at the chosen speed, until the trace ends.
  useEffect(() => {
    if (!playing || !track) return;
    let last = Date.now();
    let id = 0;
    const tick = () => {
      const now = Date.now();
      const next = Math.min(tEnd, (timeRef.current ?? track.t0) + (now - last) * Number(speed));
      last = now;
      setT(next);
      if (next >= tEnd) setPlaying(false);
      else id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [playing, speed, tEnd, track, setT]);

  // The trace so far, in three colours (in millimetres on the target: y down, as TargetFace draws).
  const paths = useMemo(() => {
    if (!track || !track.pts.length) return null;
    const idxAt = (ms: number) => Math.max(0, Math.min(track.pts.length - 1, Math.floor((ms - track.t0) / track.dt)));
    const k = idxAt(t);
    const yellow = idxAt(-1000);
    const at = idxAt(0);
    const part = (a: number, b: number) => {
      if (b <= a) return null;
      const p = Skia.Path.Make();
      p.moveTo(track.pts[a][0], -track.pts[a][1]);
      for (let i = a + 1; i <= b; i++) p.lineTo(track.pts[i][0], -track.pts[i][1]);
      return p;
    };
    return { aim: part(0, Math.min(k, yellow)), last: k > yellow ? part(yellow, Math.min(k, at)) : null, after: k > at ? part(at, k) : null, dot: track.pts[k] };
  }, [track, t]);

  const togglePlay = () => {
    if (!track) return;
    if (!playing && t >= tEnd) setT(tStart);
    setPlaying((p) => !p);
  };
  const stroke = view / 70;
  const when = !track ? "Loading the traces…" : Math.abs(t) < 15 ? "The shot" : t < 0 ? `${(Math.abs(t) / 1000).toFixed(2)} s before the shot` : `${(t / 1000).toFixed(2)} s after the shot`;
  const rows: [string, string][] = [
    ["Score", one(shot.score)],
    ["Direction", `${ARROW_GLYPH[shot.dir] ?? ""} ${SCATT_ARROWS[shot.dir] ?? ""}`],
    ["Aiming time", `${one(shot.aimS)} s`],
    ["Movement, last second", `${one(shot.s1)} mm/s`],
    ["Movement, last quarter second", `${one(shot.s2)} mm/s`],
    ["Inside the 10, last second", shot.in10 === null ? "–" : `${shot.in10}%`],
    ["Steady hold, last second", shot.steady === null ? "–" : `${shot.steady}%`],
    ["Shot vs. average aim", `${one(shot.da)} mm`],
  ];
  const others = session.shots.filter((o, k) => k !== cur && o.series === shot.series && o.sighting === shot.sighting);

  return (
    <View style={styles.wrap} testID={testID}>
      <View style={styles.canvas}>
      <Canvas style={{ width: size, height: size }} accessible accessibilityLabel={`${shotLabel(shot)}: ${one(shot.score)}, ${SCATT_ARROWS[shot.dir]}. ${when}.`}>
        <TargetFace view={view} size={size}>
          {others.map((o, k) => (
            <ShotDot key={k} point={{ x: o.x, y: o.y }} color="#9a9a80" view={view} size={size} faint />
          ))}
          {paths?.aim ? <Path path={paths.aim} color={COLORS.aim} style="stroke" strokeWidth={stroke} strokeJoin="round" strokeCap="round" /> : null}
          {paths?.last ? <Path path={paths.last} color={COLORS.last} style="stroke" strokeWidth={stroke} strokeJoin="round" strokeCap="round" /> : null}
          {paths?.after ? <Path path={paths.after} color={COLORS.after} style="stroke" strokeWidth={stroke} strokeJoin="round" strokeCap="round" /> : null}
          {t >= 0 || !track ? <Circle cx={shot.x} cy={-shot.y} r={PELLET_MM / 2} color={COLORS.shot} opacity={0.9} /> : null}
          {paths?.dot ? <Circle cx={paths.dot[0]} cy={-paths.dot[1]} r={view / 40} color="#ff0000" /> : null}
          {paths?.dot ? <Circle cx={paths.dot[0]} cy={-paths.dot[1]} r={view / 40} color="#ffffff" style="stroke" strokeWidth={view / 160} /> : null}
        </TargetFace>
        <RingNumbers view={view} size={size} font={ringFont} />
      </Canvas>
      </View>

      <View style={styles.controls}>
        <IconButton icon={<ChevronLeft size={22} color={colors.foreground} />} accessibilityLabel="Previous shot" onPress={() => select(cur - 1, true)} testID={`${testID}-prev`} />
        <IconButton
          icon={playing ? <Pause size={22} color={colors.foreground} /> : t >= tEnd && track ? <RotateCcw size={20} color={colors.foreground} /> : <Play size={22} color={colors.foreground} />}
          accessibilityLabel={playing ? "Pause" : "Play"}
          onPress={togglePlay}
          size={52}
          filled
          testID={`${testID}-play`}
        />
        <IconButton icon={<ChevronRight size={22} color={colors.foreground} />} accessibilityLabel="Next shot" onPress={() => select(cur + 1, true)} testID={`${testID}-next`} />
      </View>
      <T variant="small" tone="muted" style={styles.center}>
        {`${shotLabel(shot)} · ${one(shot.score)} ${ARROW_GLYPH[shot.dir] ?? ""} · ${when}`}
      </T>
      <View style={styles.legend}>
        {(
          [
            [COLORS.aim, "Aiming"],
            [COLORS.last, "Last second"],
            [COLORS.after, "After the shot"],
          ] as const
        ).map(([c, label]) => (
          <View key={label} style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: c }]} />
            <T variant="tiny" tone="muted">
              {label}
            </T>
          </View>
        ))}
      </View>
      <SegmentedControl<Speed>
        value={speed}
        onChange={setSpeed}
        options={[
          { value: "0.5", label: "0.5×" },
          { value: "1", label: "1×" },
          { value: "2", label: "2×" },
        ]}
        testID={`${testID}-speed`}
      />
      <SegmentedControl<Zoom>
        value={zoom}
        onChange={setZoom}
        options={[
          { value: "whole", label: "Whole target" },
          { value: "centre", label: "Centre" },
        ]}
        testID={`${testID}-zoom`}
      />

      <Card style={styles.card}>
        <T variant="label">{shotLabel(shot)}</T>
        {rows.map(([label, value]) => (
          <View key={label} style={styles.row}>
            <T variant="small" tone="muted" style={styles.grow}>
              {label}
            </T>
            <T variant="small" style={styles.value}>
              {value}
            </T>
          </View>
        ))}
      </Card>

      <View style={styles.chips}>
        {session.shots.map((s, k) => {
          const on = k === cur;
          return (
            <Pressable
              key={k}
              onPress={() => select(k, true)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${shotLabel(s)}: ${one(s.score)}, ${SCATT_ARROWS[s.dir]}`}
              style={[styles.chip, { backgroundColor: on ? colors.foreground : colors.card, borderColor: on ? colors.foreground : colors.border }]}
              testID={`${testID}-shot-${k}`}
            >
              <T variant="tiny" style={{ color: on ? colors.background : colors.mutedForeground }}>
                {s.sighting ? "S" : String(s.n)}
              </T>
              <T variant="label" style={{ color: on ? colors.background : colors.foreground }}>
                {one(s.score)}
              </T>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "stretch", gap: space.sm },
  canvas: { alignItems: "center" },
  controls: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm },
  center: { textAlign: "center", fontVariant: ["tabular-nums"] },
  legend: { flexDirection: "row", justifyContent: "center", gap: space.md, flexWrap: "wrap" },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  swatch: { width: 16, height: 3, borderRadius: 2 },
  card: { gap: 6 },
  row: { flexDirection: "row", alignItems: "baseline", gap: space.sm },
  grow: { flex: 1 },
  value: { fontVariant: ["tabular-nums"], fontWeight: "600" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { minWidth: 44, height: 46, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
});
