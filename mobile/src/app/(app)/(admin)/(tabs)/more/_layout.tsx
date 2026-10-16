import { Stack } from "expo-router";
import { largeHeader } from "@/lib/pageHeader";
import { useColors } from "@/theme";

export default function MoreLayout() {
  const colors = useColors();
  return (
    <Stack screenOptions={largeHeader(colors)}>
      <Stack.Screen name="index" options={{ title: "More" }} />
      <Stack.Screen name="coaches" options={{ title: "Coaches", headerLargeTitle: false }} />
    </Stack>
  );
}
