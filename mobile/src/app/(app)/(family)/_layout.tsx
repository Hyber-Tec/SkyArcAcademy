import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { FamilyProvider } from "@/features/family/FamilyProvider";
import { useColors } from "@/theme";

/**
 * The family's part of the app (parents and students, who see much the same: a parent their children, a student
 * themself): five tabs, and what opens over them (a class's sheet, a score, its original file, a progress report, the
 * academy's news, a post and its attachments). Every screen loads its record by ID, so links and the back gesture
 * always work.
 */
export default function FamilyLayout() {
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
    <FamilyProvider>
      <Stack
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}
        // A screen the phone presents over the app (a sheet) is outside the root's gesture handling: each gets its own
        // root, so gestures work in it too.
        screenLayout={({ route, children }) => (route.name === "(tabs)" ? children : <GestureHandlerRootView style={{ flex: 1 }}>{children}</GestureHandlerRootView>)}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="session/[id]" options={{ ...sheet, sheetAllowedDetents: "fitToContents" }} />
        <Stack.Screen name="score/[id]" options={page} />
        <Stack.Screen name="file/[id]" options={{ ...page, presentation: "modal", headerStyle: { backgroundColor: colors.background }, contentStyle: { backgroundColor: colors.background } }} />
        <Stack.Screen name="report/[id]" options={{ ...page, title: "Progress report" }} />
        <Stack.Screen name="news/index" options={{ ...page, title: "News" }} />
        <Stack.Screen name="news/[id]" options={page} />
        <Stack.Screen name="news/attachment" options={{ ...page, presentation: "modal", headerStyle: { backgroundColor: colors.background }, contentStyle: { backgroundColor: colors.background } }} />
      </Stack>
    </FamilyProvider>
  );
}
