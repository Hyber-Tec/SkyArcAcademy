import { ACADEMY_NAME } from "@shared/brand";
import { StyleSheet, View } from "react-native";
import { SvgXml } from "react-native-svg";
import { useIsDark } from "@/theme";
import { BRAND_FILES } from "./files";

/**
 * The academy's official logos (CLAUDE.md, "Brand and logos"), drawn from the official files as they are
 * (./files.ts): never redrawn, recoloured or retyped. The website's versions are web/src/components/app/SkyArcMark.tsx.
 */

type Tone = "auto" | "black" | "white";

/** White on a dark background: `auto` follows the appearance. */
function useWhite(tone: Tone): boolean {
  const dark = useIsDark();
  return tone === "white" || (tone === "auto" && dark);
}

/**
 * The square icon: the white reticle and red dot on black (`black`, the app icon's), or the black reticle on white
 * (`white`). Rounded like an app icon.
 */
export function SkyArcMark({ size = 32, tone = "black" }: { size?: number; tone?: "black" | "white" }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.22, overflow: "hidden" }} accessible={false} importantForAccessibility="no-hide-descendants">
      <SvgXml xml={tone === "black" ? BRAND_FILES.iconBlack : BRAND_FILES.iconWhite} width={size} height={size} />
    </View>
  );
}

/** The wordmark alone ("SKY ARC" over "SPORTS ACADEMY"), only ever beside the square icon. Sized by height. */
function Wordmark({ height, white }: { height: number; white: boolean }) {
  return <SvgXml xml={white ? BRAND_FILES.wordmarkWhite : BRAND_FILES.wordmark} width={(height * 360) / 83} height={height} />;
}

/**
 * The square icon with the wordmark beside it: the top of the app's navigation (the owner's layout). `md`: the icon
 * 44 and the wordmark 28 tall, as the website's sidebar; `sm`: 28 and 18, for a bar.
 */
export function SkyArcLockup({ size = "md", tone = "auto", testID }: { size?: "md" | "sm"; tone?: Tone; testID?: string }) {
  const white = useWhite(tone);
  const md = size === "md";
  return (
    <View style={[styles.row, { gap: md ? 12 : 8 }]} accessible accessibilityRole="image" accessibilityLabel={ACADEMY_NAME} testID={testID}>
      <SkyArcMark size={md ? 44 : 28} />
      <Wordmark height={md ? 28 : 18} white={white} />
    </View>
  );
}

/**
 * The full logo, the academy's name included (so no name in text beside it): black, white, or following the
 * appearance. Sized by height; it needs room ("SPORTS ACADEMY" is small): 36 at the least, 64 on sign-in screens.
 */
export function SkyArcLogo({ height = 64, tone = "auto", testID }: { height?: number; tone?: Tone; testID?: string }) {
  const white = useWhite(tone);
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={ACADEMY_NAME} testID={testID}>
      <SvgXml xml={white ? BRAND_FILES.logoWhite : BRAND_FILES.logo} width={(height * 1128) / 541} height={height} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
});
