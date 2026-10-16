import { Canvas, Circle, Group, Image as SkiaImage, type SkImage } from "@shopify/react-native-skia";
import { CARD_BULLS, bullCentreMm } from "@shared/targets/card";
import { type BullState, type CardReview, bullState } from "@shared/targets/review";
import { PELLET_MM, ringRadiusMm } from "@shared/shooting/target";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { FLAT, flatPoint } from "./photo";

/** The colours a bull's state shows in, on the photo (they sit on black and on buff paper alike). */
export const STATE_COLORS: Record<BullState, string> = { ok: "#22C55E", check: "#F59E0B", missing: "#F59E0B", unseen: "#A3A3A3" };

/** A bull's score as its badge shows it: "9", "8 · 7", "–" with no shot. */
export function scoreLabel(values: number[]): string {
  return values.length ? values.join(" · ") : "–";
}

/**
 * The scanned card, flattened as it will be saved, with what the scan found drawn on it: each record bull's outer ring
 * in its state's colour and every counted shot as a pellet-sized circle. Each bull is a button (it opens its check).
 */
export function CardView({
  image,
  width: imageWidth,
  height: imageHeight,
  review,
  viewWidth,
  onBull,
}: {
  image: SkImage;
  width: number;
  height: number;
  review: CardReview;
  viewWidth: number;
  onBull: (n: number) => void;
}) {
  const s = viewWidth / imageWidth;
  const viewHeight = imageHeight * s;
  const ring1 = ringRadiusMm(1) * FLAT.pxPerMm;
  const pellet = (PELLET_MM / 2) * FLAT.pxPerMm;
  const bulls = review.bulls.map((b) => {
    const cb = CARD_BULLS.find((x) => x.kind === "record" && x.n === b.n)!;
    const centre = bullCentreMm(cb);
    const at = flatPoint(centre.x, centre.y);
    const state = bullState(b, review.shotsPerBull);
    const shots = b.shots.filter((t) => t.x !== null && t.y !== null).map((t) => flatPoint(centre.x + (t.x as number), centre.y - (t.y as number)));
    return { b, at, state, shots };
  });
  return (
    <View style={{ width: viewWidth, height: viewHeight }}>
      <Canvas style={{ width: viewWidth, height: viewHeight }}>
        <Group transform={[{ scale: s }]}>
          <SkiaImage image={image} x={0} y={0} width={imageWidth} height={imageHeight} fit="fill" />
          {bulls.map(({ b, at, state, shots }) => (
            <Group key={b.n}>
              <Circle cx={at.x} cy={at.y} r={ring1} color={STATE_COLORS[state]} style="stroke" strokeWidth={2.5 / s} />
              {shots.map((p, i) => (
                <Group key={i}>
                  <Circle cx={p.x} cy={p.y} r={pellet} color="#22C55E" style="stroke" strokeWidth={2 / s} />
                  <Circle cx={p.x} cy={p.y} r={1.5 / s} color="#22C55E" />
                </Group>
              ))}
            </Group>
          ))}
        </Group>
      </Canvas>
      {bulls.map(({ b, at, state }) => {
        const size = ring1 * 2 * s;
        const values = b.shots.map((t) => t.value);
        return (
          <Pressable
            key={b.n}
            testID={`scan-bull-${b.n}`}
            accessibilityRole="button"
            accessibilityLabel={`Bull ${b.n}: ${values.length ? values.join(" and ") : "no shot"}${state === "ok" ? "" : ", check it"}`}
            onPress={() => onBull(b.n)}
            style={[styles.hit, { left: at.x * s - size / 2, top: at.y * s - size / 2, width: size, height: size, borderRadius: size / 2 }]}
          >
            <View style={[styles.badge, { backgroundColor: STATE_COLORS[state] }]}>
              <Text style={styles.badgeText} numberOfLines={1}>
                {b.n}: {scoreLabel(values)}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  hit: { position: "absolute", alignItems: "flex-end", justifyContent: "flex-end" },
  badge: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2, minWidth: 30, alignItems: "center" },
  badgeText: { color: "#0a0a0a", fontSize: 12, fontWeight: "700", fontVariant: ["tabular-nums"] },
});
