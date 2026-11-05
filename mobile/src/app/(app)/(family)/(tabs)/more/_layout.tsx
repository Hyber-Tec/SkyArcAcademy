import { Stack } from "expo-router";
import { useT } from "@/lib/lang";
import { largeHeader } from "@/lib/pageHeader";
import { useColors } from "@/theme";

/**
 * The More tab: its title is the page's own, at the top (Screen), without the empty bar of a large header above it;
 * what opens from it (Sign-in & security, Notifications, Language) has the standard header and Back.
 */
export default function FamilyMoreLayout() {
  const colors = useColors();
  const t = useT();
  return (
    <Stack screenOptions={largeHeader(colors)}>
      <Stack.Screen name="index" options={{ title: t("More", "더보기"), headerShown: false }} />
      <Stack.Screen name="security" options={{ title: t("Sign-in & security", "로그인과 보안"), headerLargeTitle: false }} />
      <Stack.Screen name="notifications" options={{ title: t("Notifications", "알림"), headerLargeTitle: false }} />
      <Stack.Screen name="language" options={{ title: t("Language", "언어"), headerLargeTitle: false }} />
    </Stack>
  );
}
