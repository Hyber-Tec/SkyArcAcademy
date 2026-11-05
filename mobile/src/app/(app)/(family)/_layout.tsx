import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ContractGate } from "@/features/contracts/SignContract";
import { FamilyProvider } from "@/features/family/FamilyProvider";
import { useT } from "@/lib/lang";
import { useColors } from "@/theme";

/**
 * A link straight to a screen over the tabs (a day's sheet, a post) still has the tabs beneath it, so the sheet is a
 * sheet and closing it, or Back, lands on the tabs.
 */
export const unstable_settings = { anchor: "(tabs)" };

/**
 * The family's part of the app (parents and students, who see much the same: a parent their children, a student
 * themself), once the academy's enrollment contract is signed for them (ContractGate: docs/DECISIONS.md §31): five tabs,
 * and what opens over them (a day of the months' and a class's sheets, asking for a class, a score, its original file,
 * a progress report, the academy's news, a post and its attachments, and their notifications). Every screen loads its
 * record by ID, so links and the back gesture always work.
 */
export default function FamilyLayout() {
  const colors = useColors();
  const t = useT();
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
      <ContractGate>
        <Stack
          screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}
          // A screen the phone presents over the app (a sheet) is outside the root's gesture handling: each gets its own
          // root, so gestures work in it too.
          screenLayout={({ route, children }) => (route.name === "(tabs)" ? children : <GestureHandlerRootView style={{ flex: 1 }}>{children}</GestureHandlerRootView>)}
        >
          <Stack.Screen name="(tabs)" />
          {/* A day tapped on Classes' months, and a class: sheets sized to what they hold. */}
          <Stack.Screen name="day" options={{ ...sheet, sheetAllowedDetents: "fitToContents" }} />
          <Stack.Screen name="session/[id]" options={{ ...sheet, sheetAllowedDetents: "fitToContents" }} />
          <Stack.Screen name="ask" options={{ ...page, title: t("Ask for a class", "수업 신청") }} />
          <Stack.Screen name="another" options={{ ...page, title: t("Ask for another time", "다른 시간 요청") }} />
          <Stack.Screen name="score/[id]" options={page} />
          <Stack.Screen name="file/[id]" options={{ ...page, presentation: "modal", headerStyle: { backgroundColor: colors.background }, contentStyle: { backgroundColor: colors.background } }} />
          <Stack.Screen name="report/[id]" options={{ ...page, title: t("Progress report", "성장 리포트") }} />
          <Stack.Screen name="news/index" options={{ ...page, title: t("News", "소식") }} />
          <Stack.Screen name="news/[id]" options={page} />
          <Stack.Screen name="news/attachment" options={{ ...page, presentation: "modal", headerStyle: { backgroundColor: colors.background }, contentStyle: { backgroundColor: colors.background } }} />
          <Stack.Screen name="inbox" options={{ ...page, title: t("Notifications", "알림함") }} />
        </Stack>
      </ContractGate>
    </FamilyProvider>
  );
}
