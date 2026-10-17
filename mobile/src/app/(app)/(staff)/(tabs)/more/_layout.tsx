import { Stack } from "expo-router";
import { largeHeader } from "@/lib/pageHeader";
import { useColors } from "@/theme";

/** The More tab: its title is the page's own (Screen); what opens from it (Coaches) has the standard header and Back. */
export default function MoreLayout() {
  const colors = useColors();
  return (
    <Stack screenOptions={largeHeader(colors)}>
      <Stack.Screen name="index" options={{ title: "More", headerShown: false }} />
      <Stack.Screen name="coaches" options={{ title: "Coaches", headerLargeTitle: false }} />
    </Stack>
  );
}
