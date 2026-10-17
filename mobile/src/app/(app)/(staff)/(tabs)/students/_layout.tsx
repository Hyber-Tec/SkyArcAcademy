import { Stack } from "expo-router";
import { largeHeader } from "@/lib/pageHeader";
import { useColors } from "@/theme";

/** The Students tab: its title and search field are the page's own, at the top, without the empty bar of a large header. */
export default function StudentsLayout() {
  const colors = useColors();
  return (
    <Stack screenOptions={largeHeader(colors)}>
      <Stack.Screen name="index" options={{ title: "Students", headerShown: false }} />
    </Stack>
  );
}
