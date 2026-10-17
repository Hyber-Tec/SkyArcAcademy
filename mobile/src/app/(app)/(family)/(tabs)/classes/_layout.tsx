import { Stack } from "expo-router";
import { largeHeader } from "@/lib/pageHeader";
import { useColors } from "@/theme";

/** The Classes tab: its title is the page's own, at the top (Screen), without the empty bar of a large header above it. */
export default function FamilyClassesLayout() {
  const colors = useColors();
  return (
    <Stack screenOptions={largeHeader(colors)}>
      <Stack.Screen name="index" options={{ title: "Classes", headerShown: false }} />
    </Stack>
  );
}
