import { Stack } from "expo-router";
import { largeHeader } from "@/lib/pageHeader";
import { useColors } from "@/theme";

/** The Schedule tab: its title and the date button are the page's own, at the top (Screen), without an empty bar above. */
export default function ScheduleLayout() {
  const colors = useColors();
  return (
    <Stack screenOptions={largeHeader(colors)}>
      <Stack.Screen name="index" options={{ title: "Schedule", headerShown: false }} />
    </Stack>
  );
}
