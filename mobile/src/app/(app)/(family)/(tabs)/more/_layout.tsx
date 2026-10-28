import { Stack } from "expo-router";
import { largeHeader } from "@/lib/pageHeader";
import { useColors } from "@/theme";

/**
 * The More tab: its title is the page's own, at the top (Screen), without the empty bar of a large header above it;
 * what opens from it (Sign-in & security, Notifications) has the standard header and Back.
 */
export default function FamilyMoreLayout() {
  const colors = useColors();
  return (
    <Stack screenOptions={largeHeader(colors)}>
      <Stack.Screen name="index" options={{ title: "More", headerShown: false }} />
      <Stack.Screen name="security" options={{ title: "Sign-in & security", headerLargeTitle: false }} />
      <Stack.Screen name="notifications" options={{ title: "Notifications", headerLargeTitle: false }} />
    </Stack>
  );
}
