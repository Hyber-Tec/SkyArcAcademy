import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useColors } from "@/theme";

/**
 * The office's part of the app (owners and admins): five tabs, and the screens that open over them (a class, a
 * student, a file, a coach; the Scan screens add their own). Every screen loads its record by ID, so links and the
 * back gesture always work.
 */
export default function AdminLayout() {
  const colors = useColors();
  const sheet = { presentation: "formSheet", sheetGrabberVisible: true, sheetCornerRadius: 24, contentStyle: { backgroundColor: colors.background } } as const;
  const page = {
    headerShown: true,
    title: "",
    headerShadowVisible: false,
    headerStyle: { backgroundColor: colors.grouped },
    headerTintColor: colors.foreground,
    headerBackButtonDisplayMode: "minimal",
    contentStyle: { backgroundColor: colors.grouped },
  } as const;
  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}
      // A screen the phone presents over the app (a sheet, a modal) is outside the root's gesture handling: each gets
      // its own root, so swipes and other gestures work in it too.
      screenLayout={({ route, children }) => (route.name === "(tabs)" ? children : <GestureHandlerRootView style={{ flex: 1 }}>{children}</GestureHandlerRootView>)}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="class/[id]" options={{ ...sheet, sheetAllowedDetents: [0.6, 1] }} />
      <Stack.Screen name="coach/[id]" options={{ ...sheet, sheetAllowedDetents: "fitToContents" }} />
      <Stack.Screen name="student/[id]" options={page} />
      <Stack.Screen name="file/[id]" options={{ ...page, presentation: "modal", headerStyle: { backgroundColor: colors.background }, contentStyle: { backgroundColor: colors.background } }} />
      {/* Scanning a paper card: the camera, then the card's check. Full screen, and no swipe away from a half-checked card. */}
      <Stack.Screen name="scan/camera" options={{ presentation: "fullScreenModal", gestureEnabled: false, contentStyle: { backgroundColor: "#000" } }} />
      <Stack.Screen name="scan/review" options={{ ...page, title: "Check the card", presentation: "fullScreenModal", gestureEnabled: false }} />
    </Stack>
  );
}
