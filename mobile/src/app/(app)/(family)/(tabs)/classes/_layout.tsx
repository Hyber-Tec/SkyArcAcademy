import { Stack } from "expo-router";
import { useT } from "@/lib/lang";
import { largeHeader } from "@/lib/pageHeader";
import { useColors } from "@/theme";

/** The Classes tab: its title is the page's own, at the top (Screen), without the empty bar of a large header above it. */
export default function FamilyClassesLayout() {
  const colors = useColors();
  const t = useT();
  return (
    <Stack screenOptions={largeHeader(colors)}>
      <Stack.Screen name="index" options={{ title: t("Classes", "수업"), headerShown: false }} />
    </Stack>
  );
}
