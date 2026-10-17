import { Circle, Group, Image as SkiaImage, RoundedRect, type SkFont, type SkImage, Text as SkiaText, matchFont } from "@shopify/react-native-skia";
import { CARD_BULLS, bullCentreMm } from "@shared/targets/card";
import { FLAT, flatPoint } from "@shared/targets/flat";
import { type BullState, type CardReview, bullState } from "@shared/targets/review";
import { PELLET_MM, ringRadiusMm } from "@shared/shooting/target";
import { useMemo } from "react";
import { Platform } from "react-native";
import { useDerivedValue } from "react-native-reanimated";
import { ZoomCanvas, type ZoomState, useZoomState } from "@/components/ZoomCanvas";

/** The colours a bull's state shows in, on the photo (they sit on black and on buff paper alike). */
export const STATE_COLORS: Record<BullState, string> = { ok: "#22C55E", check: "#F59E0B", missing: "#F59E0B", unseen: "#A3A3A3" };

/** A bull's score as its badge shows it: "9", "8 · 7", "–" with no shot. */
export function scoreLabel(values: number[]): string {
  return values.length ? values.join(" · ") : "–";
}

const FONT_FAMILY = Platform.select({ ios: "Helvetica Neue", default: "sans-serif" });

/**
 * The scanned card, flattened as it will be saved, with what the scan found drawn on it: each record bull's outer ring
 * in its state's colour and every counted shot as a pellet-sized circle, with a label of its score. Pinch to zoom in
 * (it stays sharp, and stays where it's left), drag to look around once zoomed, double-tap to zoom in or out; tapping
 * a bull opens its check.
 */
export function CardView({
  image,
  width: imageWidth,
  height: imageHeight,
  review,
  viewWidth,
  onBull,
  testID,
}: {
  image: SkImage;
  width: number;
  height: number;
  review: CardReview;
  viewWidth: number;
  onBull: (n: number) => void;
  testID?: string;
}) {
  const viewHeight = Math.round((imageHeight * viewWidth) / imageWidth);
  const zoom = useZoomState(viewWidth, viewHeight, imageWidth, imageHeight);
  const font = useMemo(() => matchFont({ fontFamily: FONT_FAMILY, fontSize: 12, fontWeight: "700" }), []);
  const ring1 = ringRadiusMm(1) * FLAT.pxPerMm;
  const pellet = (PELLET_MM / 2) * FLAT.pxPerMm;
  const line = 2.5 / zoom.fit;
  const bulls = review.bulls.map((b) => {
    const cb = CARD_BULLS.find((x) => x.kind === "record" && x.n === b.n)!;
    const centre = bullCentreMm(cb);
    const at = flatPoint(centre.x, centre.y);
    const state = bullState(b, review.shotsPerBull);
    const shots = b.shots.filter((t) => t.x !== null && t.y !== null).map((t) => flatPoint(centre.x + (t.x as number), centre.y - (t.y as number)));
    return { b, at, state, shots };
  });
  const tapped = (x: number, y: number) => {
    const hit = bulls.find(({ at }) => (at.x - x) ** 2 + (at.y - y) ** 2 <= ring1 * ring1);
    if (hit) onBull(hit.b.n);
  };
  return (
    <ZoomCanvas
      testID={testID}
      width={viewWidth}
      height={viewHeight}
      contentWidth={imageWidth}
      contentHeight={imageHeight}
      state={zoom}
      onTap={tapped}
      overlay={bulls.map(({ b, at, state }) => (
        <Badge key={b.n} zoom={zoom} x={at.x + ring1 * 0.72} y={at.y + ring1 * 0.72} text={`${b.n}: ${scoreLabel(b.shots.map((t) => t.value))}`} color={STATE_COLORS[state]} font={font} />
      ))}
    >
      <SkiaImage image={image} x={0} y={0} width={imageWidth} height={imageHeight} fit="fill" />
      {bulls.map(({ b, at, state, shots }) => (
        <Group key={b.n}>
          <Circle cx={at.x} cy={at.y} r={ring1} color={STATE_COLORS[state]} style="stroke" strokeWidth={line} />
          {shots.map((p, i) => (
            <Group key={i}>
              <Circle cx={p.x} cy={p.y} r={pellet} color="#22C55E" style="stroke" strokeWidth={line * 0.8} />
              <Circle cx={p.x} cy={p.y} r={line * 0.6} color="#22C55E" />
            </Group>
          ))}
        </Group>
      ))}
    </ZoomCanvas>
  );
}

/** A score label that keeps its size on screen whatever the zoom, its bottom-right corner at content point (x, y). */
function Badge({ zoom, x, y, text, color, font }: { zoom: ZoomState; x: number; y: number; text: string; color: string; font: SkFont }) {
  const w = font.measureText(text).width + 14;
  const h = 19;
  const transform = useDerivedValue(() => [{ translateX: zoom.tx.value + x * zoom.fit * zoom.zoom.value }, { translateY: zoom.ty.value + y * zoom.fit * zoom.zoom.value }]);
  return (
    <Group transform={transform}>
      <RoundedRect x={-w} y={-h} width={w} height={h} r={h / 2} color={color} />
      <SkiaText x={-w + 7} y={-5.5} text={text} font={font} color="#0a0a0a" />
    </Group>
  );
}
