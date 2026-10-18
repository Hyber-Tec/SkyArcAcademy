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
      <Stack.Screen name="account" options={{ title: "Account", headerLargeTitle: false }} />
      <Stack.Screen name="notifications" options={{ title: "Notifications", headerLargeTitle: false }} />
      <Stack.Screen name="security" options={{ title: "Sign-in & security", headerLargeTitle: false }} />
      <Stack.Screen name="students" options={{ title: "Students", headerLargeTitle: false }} />
      <Stack.Screen name="payroll" options={{ title: "Payroll", headerLargeTitle: false }} />
    </Stack>
  );
}
