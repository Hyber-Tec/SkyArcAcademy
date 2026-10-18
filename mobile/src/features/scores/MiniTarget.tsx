import { Canvas } from "@shopify/react-native-skia";
import { type Evaluation, evaluationPoints } from "@shared/shooting/evaluation";
import { targetViewMm } from "@shared/shooting/target";
import { PencilLine } from "lucide-react-native";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { useColors } from "@/theme";
import { ShotDot, TargetFace } from "./Target";

/**
 * A result's shots on a small target (a list row's), in its position's colour, the whole target as a small picture
 * shows it. A typed paper card has no places for its shots: a dashed circle with a pencil says so, as on the website.
 */
export function MiniTarget({ evaluation, color, size = 44 }: { evaluation: Pick<Evaluation, "series">; color: string; size?: number }) {
  const colors = useColors();
  const points = useMemo(() => evaluationPoints(evaluation), [evaluation]);
  if (!points.length) {
    return (
      <View style={[styles.typed, { width: size, height: size, borderRadius: size / 2, borderColor: colors.border }]} accessible={false}>
        <PencilLine size={Math.round(size * 0.36)} color={colors.mutedForeground} />
      </View>
    );
  }
  const view = targetViewMm(points, size);
  return (
    <Canvas style={{ width: size, height: size }} accessible={false}>
      <TargetFace view={view} size={size}>
        {points.map((p, i) => (
          <ShotDot key={i} point={p} color={color} view={view} size={size} solid={points.length === 1} />
        ))}
      </TargetFace>
    </Canvas>
  );
}

const styles = StyleSheet.create({
  typed: { borderWidth: 1, borderStyle: "dashed", alignItems: "center", justifyContent: "center" },
});
