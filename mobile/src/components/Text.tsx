import { Text as RNText, type TextProps } from "react-native";
import { keepWordsIn, lineBreakProps } from "@/lib/lineBreaks";
import { type, useColors, type Colors } from "@/theme";

type Variant = keyof typeof type;
export type Tone = "default" | "muted" | "destructive" | "success" | "warning" | "info" | "inverse";

export const toneColor = (colors: Colors, tone: Tone): string =>
  tone === "muted"
    ? colors.mutedForeground
    : tone === "destructive"
      ? colors.destructive
      : tone === "success"
        ? colors.success
        : tone === "warning"
          ? colors.warning
          : tone === "info"
            ? colors.info
            : tone === "inverse"
              ? colors.primaryForeground
              : colors.foreground;

/** Text in one of the app's type sizes and tones, its lines wrapping between words (`@/lib/lineBreaks`). */
export function T({ variant = "body", tone = "default", style, children, ...props }: TextProps & { variant?: Variant; tone?: Tone }) {
  const colors = useColors();
  return (
    <RNText {...lineBreakProps(props.numberOfLines)} {...props} style={[type[variant], { color: toneColor(colors, tone) }, style]}>
      {keepWordsIn(children, !props.selectable)}
    </RNText>
  );
}
