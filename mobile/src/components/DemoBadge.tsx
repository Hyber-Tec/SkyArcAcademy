import { router } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { T } from "@/components/Text";
import { useT } from "@/lib/lang";
import { useOptionalBranch } from "@/state/BranchProvider";
import { VIEW_AS_ROLE_LABELS } from "@/state/viewAs";
import { radius, useAccents, useColors } from "@/theme";

/**
 * "Demo" beside the lockup and each tab's title while the app shows the demo academy (docs/DECISIONS.md §22), as the
 * website's top bar marks it (web/src/components/app/DemoBadge.tsx), so its made-up people are never taken for the
 * academy's own. While a super admin views the app as someone, "As Jiyeon" beside it too; tapping it opens View as.
 * Nothing otherwise.
 */
export function DemoBadge() {
  const branch = useOptionalBranch();
  const colors = useColors();
  const t = useT();
  const violet = useAccents().violet;
  const person = branch?.viewAs?.person ?? null;
  if (!branch?.isDemo && !person) return null;
  return (
    <>
      {branch?.isDemo ? (
        <View style={[styles.pill, { backgroundColor: colors.demoTint }]} accessible accessibilityLabel={t("Demo data: made-up students and classes", "데모 데이터: 가상의 학생과 수업이에요")} testID="demo-badge">
          <T style={[styles.text, { color: colors.demo }]}>{t("Demo", "데모")}</T>
        </View>
      ) : null}
      {person ? (
        <Pressable
          onPress={() => router.push("/view-as")}
          style={[styles.pill, { backgroundColor: violet.bg }]}
          accessibilityRole="button"
          accessibilityLabel={t(`Viewing the app as ${person.name}, ${VIEW_AS_ROLE_LABELS[person.role]}. Change or stop.`, `${person.name}님 화면으로 보고 있어요. 누르면 바꾸거나 끝낼 수 있어요.`)}
          hitSlop={8}
          testID="view-as-badge"
        >
          <T style={[styles.text, { color: violet.fg }]} numberOfLines={1}>
            {t(`As ${person.name.split(/\s+/)[0]}`, `${person.name.split(/\s+/)[0]}님 화면`)}
          </T>
        </Pressable>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  pill: { borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 2, alignSelf: "center" },
  text: { fontSize: 11, lineHeight: 15, fontWeight: "600", letterSpacing: 0.5, textTransform: "uppercase" },
});
