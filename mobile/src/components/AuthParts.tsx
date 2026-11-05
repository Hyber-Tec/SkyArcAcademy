import { PASSWORD_STRENGTH_LABELS, PASSWORD_STRENGTH_LABELS_KO, passwordStrength } from "@shared/auth";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { SkyArcLogo } from "@/components/brand/SkyArc";
import { T } from "@/components/Text";
import { useLang, useT } from "@/lib/lang";
import { openWebsite } from "@/lib/links";
import { radius, space, useColors } from "@/theme";

/** The top of every sign-in screen: the full logo, centred as on the website's cards, a title and a line under it. */
export function AuthHeader({ title, subtitle }: { title: string; subtitle?: ReactNode }) {
  return (
    <View style={styles.head}>
      <SkyArcLogo height={64} />
      <T variant="title" style={styles.center}>
        {title}
      </T>
      {subtitle ? (
        typeof subtitle === "string" ? (
          <T tone="muted" style={styles.center}>
            {subtitle}
          </T>
        ) : (
          subtitle
        )
      ) : null}
    </View>
  );
}

/** "or" between Google and the email form. */
export function OrDivider({ label }: { label?: string }) {
  const colors = useColors();
  const t = useT();
  return (
    <View style={styles.divider}>
      <View style={[styles.line, { backgroundColor: colors.border }]} />
      <T variant="small" tone="muted">
        {label ?? t("or", "또는")}
      </T>
      <View style={[styles.line, { backgroundColor: colors.border }]} />
    </View>
  );
}

const STRENGTH = ["#d4d4d4", "#ef4444", "#f59e0b", "#10b981", "#059669"];

/** Four bars and a word under a new password. */
export function StrengthMeter({ password }: { password: string }) {
  const colors = useColors();
  const lang = useLang();
  if (!password) return null;
  const s = passwordStrength(password);
  const word = lang === "ko" ? PASSWORD_STRENGTH_LABELS_KO[s] : PASSWORD_STRENGTH_LABELS[s];
  return (
    <View style={styles.meter} accessibilityLabel={lang === "ko" ? `비밀번호 강도: ${word}` : `Password strength: ${word}`}>
      <View style={styles.bars}>
        {[1, 2, 3, 4].map((n) => (
          <View key={n} style={[styles.bar, { backgroundColor: n <= s ? STRENGTH[s] : colors.secondary }]} />
        ))}
      </View>
      <T variant="tiny" tone="muted" style={styles.meterLabel}>
        {word}
      </T>
    </View>
  );
}

/**
 * Help and the privacy policy, before anyone signs in (the stores ask that both be reachable from the app): the
 * website's pages, in the phone's in-app browser.
 */
export function HelpLinks() {
  const t = useT();
  const lang = useLang();
  // The website's Korean pages for a parent reading Korean (the privacy policy's text in force stays English there).
  const site = lang === "ko" ? "/ko" : "";
  return (
    <View style={styles.links}>
      <T variant="small" tone="muted" style={styles.link} onPress={() => void openWebsite(`${site}/help`, lang)} accessibilityRole="link" testID="help-link">
        {t("Help", "도움말")}
      </T>
      <T variant="small" tone="muted">
        ·
      </T>
      <T variant="small" tone="muted" style={styles.link} onPress={() => void openWebsite(`${site}/privacy`, lang)} accessibilityRole="link" testID="privacy-link">
        {t("Privacy policy", "개인정보 처리방침")}
      </T>
    </View>
  );
}

/** A tinted box with an error in words. */
export function ErrorBox({ children }: { children: ReactNode }) {
  const colors = useColors();
  return (
    <View style={[styles.error, { backgroundColor: colors.destructiveTint }]} accessibilityRole="alert">
      <T variant="small" tone="destructive">
        {children}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { alignItems: "center", gap: space.sm, marginBottom: space.md },
  center: { textAlign: "center" },
  links: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: space.sm },
  link: { textDecorationLine: "underline", paddingVertical: space.xs },
  divider: { flexDirection: "row", alignItems: "center", gap: space.md, marginVertical: space.xs },
  line: { flex: 1, height: StyleSheet.hairlineWidth },
  meter: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: -space.xs },
  bars: { flex: 1, flexDirection: "row", gap: 4 },
  bar: { flex: 1, height: 4, borderRadius: radius.full },
  meterLabel: { width: 64, textAlign: "right" },
  error: { borderRadius: radius.md, padding: space.md },
});
