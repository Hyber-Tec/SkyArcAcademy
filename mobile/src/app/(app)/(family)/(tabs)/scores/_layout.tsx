import { Stack } from "expo-router";
import { largeHeader } from "@/lib/pageHeader";
import { useColors } from "@/theme";

/** The Scores tab: its title is the page's own, at the top (Screen), without the empty bar of a large header above it. */
export default function FamilyScoresLayout() {
  const colors = useColors();
  return (
    <Stack screenOptions={largeHeader(colors)}>
      <Stack.Screen name="index" options={{ title: "Scores", headerShown: false }} />
    </Stack>
  );
}
