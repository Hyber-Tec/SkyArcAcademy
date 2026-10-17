import { type CardReview, bullState } from "@shared/targets/review";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { T } from "@/components/Text";
import { radius, space, useColors } from "@/theme";
import { STATE_COLORS, scoreLabel } from "./CardView";

const GAP = space.sm;

/** The ten record bulls as tiles: each one's score, coloured by whether it's worth a look. Tapping opens its check. */
export function BullTiles({ review, onBull }: { review: CardReview; onBull: (n: number) => void }) {
  const colors = useColors();
  // Five to a row, sized from the width there is (a percentage width leaves the rows' height to guesswork).
  const [width, setWidth] = useState(0);
  const tile = width ? (width - GAP * 4) / 5 : 0;
  return (
    <View style={styles.grid} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {review.bulls.map((b) => {
        const state = bullState(b, review.shotsPerBull);
        const values = b.shots.map((s) => s.value);
        return (
          <Pressable
            key={b.n}
            testID={`scan-tile-${b.n}`}
            accessibilityRole="button"
            accessibilityLabel={`Bull ${b.n}: ${values.length ? values.join(" and ") : "no shot"}`}
            onPress={() => onBull(b.n)}
            style={({ pressed }) => [
              styles.tile,
              { width: tile, height: tile / 0.9, backgroundColor: pressed ? colors.accent : colors.card, borderColor: state === "ok" ? colors.border : STATE_COLORS[state] },
            ]}
          >
            <T variant="tiny" tone="muted">
              {b.n}
            </T>
            <T variant="subheading" style={styles.score} numberOfLines={1} adjustsFontSizeToFit>
              {scoreLabel(values)}
            </T>
            <View style={[styles.dot, { backgroundColor: STATE_COLORS[state] }]} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", columnGap: GAP, rowGap: GAP },
  tile: { borderRadius: radius.md, borderWidth: 1.5, alignItems: "center", justifyContent: "center", gap: 2 },
  score: { fontVariant: ["tabular-nums"], paddingHorizontal: 2 },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
