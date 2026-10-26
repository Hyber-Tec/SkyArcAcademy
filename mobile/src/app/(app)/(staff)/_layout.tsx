import { Stack } from "expo-router";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { resumeUploads } from "@/features/scan/uploads";
import { useColors } from "@/theme";

/**
 * A link straight to a screen over the tabs (a day's sheet, a post) still has the tabs beneath it, so the sheet is a
 * sheet and closing it, or Back, lands on the tabs.
 */
export const unstable_settings = { anchor: "(tabs)" };

/**
 * The staff's part of the app (owners, admins and coaches, each seeing what the rules give their role): five tabs, and
 * the screens that open over them (a class, a student, a score, a file, a coach; the Scan screens add their own). Every
 * screen loads its record by ID, so links and the back gesture always work.
 */
export default function AdminLayout() {
  const colors = useColors();
  // Cards' copies that didn't reach the Drive before the app was closed go now.
  useEffect(() => resumeUploads(), []);
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
      <Stack.Screen name="coach/[id]" options={{ ...sheet, sheetAllowedDetents: [0.6, 1] }} />
      <Stack.Screen name="student/[id]" options={page} />
      <Stack.Screen name="score/[id]" options={page} />
      <Stack.Screen name="file/[id]" options={{ ...page, presentation: "modal", headerStyle: { backgroundColor: colors.background }, contentStyle: { backgroundColor: colors.background } }} />
      {/* The Drive (its top, then a folder at a time) and the progress reports (the list, one report). */}
      <Stack.Screen name="drive/index" options={{ ...page, title: "Drive" }} />
      <Stack.Screen name="drive/[id]" options={page} />
      <Stack.Screen name="reports/index" options={{ ...page, title: "Reports" }} />
      <Stack.Screen name="report/[id]" options={{ ...page, title: "Progress report" }} />
      {/* The academy's announcements (the list, a post, a post's file) and the person's notifications (Home's bell). */}
      <Stack.Screen name="news/index" options={{ ...page, title: "News" }} />
      <Stack.Screen name="news/[id]" options={page} />
      <Stack.Screen name="news/attachment" options={{ ...page, presentation: "modal", headerStyle: { backgroundColor: colors.background }, contentStyle: { backgroundColor: colors.background } }} />
      <Stack.Screen name="inbox" options={{ ...page, title: "Notifications" }} />
      {/* A day of the coach's availability: a sheet sized to what it holds, as the owner's True Education design. */}
      <Stack.Screen name="availability-day" options={{ ...sheet, sheetAllowedDetents: "fitToContents" }} />
      {/* Scanning a paper card: the camera, then the card's check. Full screen, and no swipe away from a half-checked card. */}
      <Stack.Screen name="scan/camera" options={{ presentation: "fullScreenModal", gestureEnabled: false, contentStyle: { backgroundColor: "#000" } }} />
      <Stack.Screen name="scan/review" options={{ ...page, title: "Check the card", presentation: "fullScreenModal", gestureEnabled: false }} />
    </Stack>
  );
}
