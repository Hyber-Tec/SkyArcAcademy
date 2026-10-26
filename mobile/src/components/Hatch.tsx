import { useState } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useColors } from "@/theme";

/**
 * Thin diagonal lines over a box, as the website hatches a class's open seats (the sheets blacken them): place it first
 * inside a box with `overflow: "hidden"`, under the box's content. The lines are drawn for the box's size once it's
 * laid out (an SVG pattern turned on its side clips them on iPhone).
 */
export function Hatch({ gap = 7, opacity = 0.08 }: { gap?: number; opacity?: number }) {
  const colors = useColors();
  const [size, setSize] = useState({ width: 0, height: 0 });
  let d = "";
  for (let x = -size.height; x < size.width; x += gap) d += `M${x} ${size.height}L${x + size.height} 0`;
  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={(e) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
    >
      {d ? (
        <Svg width={size.width} height={size.height}>
          <Path d={d} stroke={colors.foreground} strokeOpacity={opacity} strokeWidth={1} />
        </Svg>
      ) : null}
    </View>
  );
}
