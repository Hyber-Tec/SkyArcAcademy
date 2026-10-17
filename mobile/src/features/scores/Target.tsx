import { Circle, Group, Line, RoundedRect, type SkFont, Text as SkiaText, matchFont, rect, rrect, vec } from "@shopify/react-native-skia";
import { BLACK_RADIUS_MM, PELLET_MM, type ShotPoint, ringRadiusMm } from "@shared/shooting/target";
import { type ReactNode, useEffect, useMemo } from "react";
import { Platform } from "react-native";
import { Easing, useDerivedValue, useSharedValue, withDelay, withTiming } from "react-native-reanimated";

/**
 * The 10 m air rifle target as the phone draws it in Skia, the same as the website's picture
 * (web/src/features/scores/TargetPlot.tsx): light paper whatever the phone's appearance, the black of rings 4 to 10,
 * pellet-sized shots. The replay, the darts of a result's shots and the enlarged shot all draw it.
 */

export const PAPER = "#fbfaf7";
export const BLACK = "#161616";
const LINE = "#a8a59c";
export const FRAME = "#d9d6cd";
/** The newest shot (and a chosen one), in the amber the website gives the last shot: never a position's colour. */
export const NEWEST = "#e8b100";
export const NEWEST_EDGE = "#b88a00";
/** A singled-out shot's number, on its amber tag. */
const TAG_TEXT = "#1f1600";
const MPI = "#2f80ed";

const FONT_FAMILY = Platform.select({ ios: "Helvetica Neue", default: "sans-serif" });

/** A font for numbers on the target. */
export function useTargetFont(size: number, weight: "500" | "700" = "700"): SkFont {
  return useMemo(() => matchFont({ fontFamily: FONT_FAMILY, fontSize: size, fontWeight: weight }), [size, weight]);
}

/**
 * The target `size` points across with its top-left corner at (x, y), showing `view` mm around the centre. What's
 * drawn on it (`children`, in millimetres: x right, y down; a shot at (p.x, -p.y)) is clipped to it.
 */
export function TargetFace({ view, size, x = 0, y = 0, children }: { view: number; size: number; x?: number; y?: number; children?: ReactNode }) {
  const k = size / (2 * view);
  // Lines stay visible on a small target.
  const line = Math.max(view / 220, 0.6 / k);
  return (
    <>
      <Group clip={rrect(rect(x, y, size, size), size / 2, size / 2)}>
        <Group transform={[{ translateX: x + size / 2 }, { translateY: y + size / 2 }, { scale: k }]}>
          <Circle cx={0} cy={0} r={view} color={PAPER} />
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((ring) => (
            <Group key={ring}>
              <Circle cx={0} cy={0} r={ringRadiusMm(ring)} color={ring >= 4 ? BLACK : PAPER} />
              {ring === 4 ? null : <Circle cx={0} cy={0} r={ringRadiusMm(ring)} color={ring >= 4 ? PAPER : LINE} style="stroke" strokeWidth={line} />}
            </Group>
          ))}
          <Circle cx={0} cy={0} r={BLACK_RADIUS_MM} color={BLACK} style="stroke" strokeWidth={line} />
          {children}
        </Group>
      </Group>
      <Circle cx={x + size / 2} cy={y + size / 2} r={size / 2 - 0.75} color={FRAME} style="stroke" strokeWidth={1.5} />
    </>
  );
}

/**
 * One shot, in millimetres on a TargetFace: a pellet-sized circle, see-through with a solid edge so overlaps still read;
 * `solid` (a target with one shot on it) fills it and edges it in white, so a small one stands out on the black.
 */
export function ShotDot({ point, color, view, size, faint = false, solid = false }: { point: ShotPoint; color: string; view: number; size: number; faint?: boolean; solid?: boolean }) {
  const k = size / (2 * view);
  const edge = Math.max(view / 140, 1 / k);
  return (
    <Group opacity={faint ? 0.35 : 1}>
      <Circle cx={point.x} cy={-point.y} r={PELLET_MM / 2} color={color} opacity={solid ? 0.95 : 0.5} />
      <Circle cx={point.x} cy={-point.y} r={PELLET_MM / 2} color={solid ? "#ffffff" : color} style="stroke" strokeWidth={edge} />
    </Group>
  );
}

/** The average point of impact, as a blue cross (millimetres on a TargetFace). */
export function MpiMark({ point, view }: { point: ShotPoint; view: number }) {
  return (
    <Group>
      <Line p1={vec(point.x - 1.4, -point.y)} p2={vec(point.x + 1.4, -point.y)} color={MPI} strokeWidth={view / 90} strokeCap="round" />
      <Line p1={vec(point.x, -point.y - 1.4)} p2={vec(point.x, -point.y + 1.4)} color={MPI} strokeWidth={view / 90} strokeCap="round" />
    </Group>
  );
}

/** The ring numbers left and right of the centre where they fit, drawn at the screen's size so they stay crisp. */
export function RingNumbers({ view, size, font }: { view: number; size: number; font: SkFont }) {
  const k = size / (2 * view);
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
 * A shot singled out (the newest while playing, or the one chosen): amber, with its number beside it, in points on a
 * target `size` across. With `pop` it drops onto its place (it starts large and see-through), within the shortest
 * step of the replay. It stays drawn and is hidden when there's no shot (`n` null): taking it away in the middle of
 * its drop could leave its last frame on the canvas.
 */
export function ChosenShot({ at, r, n, font, size, pop }: { at: { x: number; y: number }; r: number; n: number | null; font: SkFont; size: number; pop: boolean }) {
  const grow = useSharedValue(1);
  const shown = useSharedValue(1);
  const visible = n !== null;
  useEffect(() => {
    if (!pop || n === null) {
      grow.set(1);
      shown.set(1);
      return;
    }
    grow.set(0);
    shown.set(0);
    grow.set(withTiming(1, { duration: 220, easing: Easing.bezier(0.2, 0.8, 0.2, 1) }));
    shown.set(withDelay(60, withTiming(1, { duration: 160, easing: Easing.out(Easing.quad) })));
  }, [grow, shown, pop, n]);
  const radius = useDerivedValue(() => r * (1 + 1.6 * (1 - grow.value)));
  const opacity = useDerivedValue(() => (visible ? Math.min(1, grow.value / 0.55) : 0));
  const labelOpacity = useDerivedValue(() => (visible ? shown.value : 0));
  // Its number on an amber tag, so it can't be read as one of the ring numbers beside it.
  const text = n === null ? "" : String(n);
  const pad = 5;
  const h = Math.round(font.getSize() * 1.3);
  const w = font.measureText(text).width + pad * 2;
  const tag = numberPlace(at, r, w, h, size);
  return (
    <Group>
      <Group opacity={opacity}>
        <Circle cx={at.x} cy={at.y} r={radius} color={NEWEST} opacity={0.85} />
        <Circle cx={at.x} cy={at.y} r={radius} color={NEWEST_EDGE} style="stroke" strokeWidth={2} />
      </Group>
      <Group opacity={labelOpacity}>
        <RoundedRect x={tag.x} y={tag.y - h} width={w} height={h} r={h / 2} color={NEWEST} />
        <RoundedRect x={tag.x} y={tag.y - h} width={w} height={h} r={h / 2} color={NEWEST_EDGE} style="stroke" strokeWidth={1} />
        <SkiaText x={tag.x + pad} y={tag.y - h / 2 + font.getSize() * 0.36} text={text} font={font} color={TAG_TEXT} />
      </Group>
    </Group>
  );
}

/**
 * Where a singled-out shot's number tag goes (its left end and its bottom, in points): up and to the right of the shot,
 * or on the first other side that keeps the whole tag on the target when the shot sits near its edge.
 */
function numberPlace(at: { x: number; y: number }, r: number, width: number, height: number, size: number) {
  const gap = 4;
  const c = size / 2;
  const place = (right: boolean, up: boolean) => ({ x: right ? at.x + r + gap : at.x - r - gap - width, y: up ? at.y - r : at.y + r + height });
  const onTarget = ({ x, y }: { x: number; y: number }) => [x, x + width].every((px) => [y - height, y].every((py) => Math.hypot(px - c, py - c) < c * 0.93));
  return [place(true, true), place(false, true), place(true, false), place(false, false)].find(onTarget) ?? place(true, true);
}

/** Millimetres on the target (x right, y up) to points on a target `size` across, showing `view` mm around the centre. */
export function toPoints(p: ShotPoint, view: number, size: number): { x: number; y: number } {
  const k = size / (2 * view);
  return { x: size / 2 + p.x * k, y: size / 2 - p.y * k };
}
