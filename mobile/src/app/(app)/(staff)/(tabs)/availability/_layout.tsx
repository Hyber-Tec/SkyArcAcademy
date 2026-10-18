import { Stack } from "expo-router";
import { largeHeader } from "@/lib/pageHeader";
import { useColors } from "@/theme";

/** The Availability tab: its title and buttons are the page's own, at the top, without an empty bar above (as Schedule). */
export default function AvailabilityLayout() {
  const colors = useColors();
  return (
    <Stack screenOptions={largeHeader(colors)}>
      <Stack.Screen name="index" options={{ title: "Availability", headerShown: false }} />
    </Stack>
  );
}
