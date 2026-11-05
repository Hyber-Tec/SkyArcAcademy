import { LANGS, LANG_NAMES } from "@shared/i18n";
import { Fragment } from "react";
import { StyleSheet, View } from "react-native";
import { T } from "@/components/Text";
import { useLangChoice } from "@/lib/lang";
import { space } from "@/theme";

/**
 * English · 한국어: the screens' language, each name in its own language (docs/DECISIONS.md §36). On the sign-in
 * screen and the contracts to sign before the app opens; a parent also has More → Language. Remembered on this phone.
 */
export function LangSwitch() {
  const { lang, setLang } = useLangChoice();
  return (
    <View style={styles.row} accessibilityLabel="Language · 언어" testID="lang-switch">
      {LANGS.map((l, i) => (
        <Fragment key={l}>
          {i ? (
            <T variant="small" tone="muted">
              ·
            </T>
          ) : null}
          <T
            variant="small"
            tone={lang === l ? undefined : "muted"}
            style={[styles.option, lang === l && styles.on]}
            onPress={() => setLang(l)}
            accessibilityRole="button"
            accessibilityState={{ selected: lang === l }}
            testID={`lang-${l}`}
          >
            {LANG_NAMES[l]}
          </T>
        </Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: space.sm },
  option: { paddingVertical: space.xs, paddingHorizontal: space.xs },
  on: { fontWeight: "600" },
});
