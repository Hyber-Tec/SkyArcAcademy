import { Stack } from "expo-router";
import { Loading } from "@/components/Loading";
import { PausedAccess } from "@/features/access/PausedAccess";
import { BranchProvider, useBranch } from "@/state/BranchProvider";
import { EnglishOnly } from "@/state/LangProvider";
import { PushProvider } from "@/state/PushProvider";
import { useColors } from "@/theme";

/**
 * The signed-in app. The academy's member doc for the person's email decides (BranchProvider): none yet → No access
 * (which first links the account by the email on file, or asks the academy: ask-access);
 * paused → paused; otherwise the part of their one role. Owners, admins and coaches get the staff's tabs (each sees what
 * the rules give their role); parents and students get the family's (their children's or their own classes and shared
 * progress reports). Push notifications (PushProvider) work in both.
 */
export default function AppLayout() {
  const colors = useColors();
  return (
    <BranchProvider
      fallback={<Loading label="Opening Sky Arc" />}
      noAccess={
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
          <Stack.Screen name="no-access" />
          <Stack.Screen
            name="ask-access"
            options={{
              headerShown: true,
              title: "Ask the academy",
              headerShadowVisible: false,
              headerBackButtonDisplayMode: "minimal",
              headerStyle: { backgroundColor: colors.grouped },
              headerTintColor: colors.foreground,
              contentStyle: { backgroundColor: colors.grouped },
            }}
          />
          {/* Without access to the academy, nothing else opens, a link included. */}
          <Stack.Protected guard={false}>
            <Stack.Screen name="(staff)" />
            <Stack.Screen name="(family)" />
          </Stack.Protected>
        </Stack>
      }
      paused={(why) => <PausedAccess why={why} />}
    >
      <RoleLang>
        <PushProvider>
          <PortalStack />
        </PushProvider>
      </RoleLang>
    </BranchProvider>
  );
}

/** A parent reads the app in their language; students and staff in English (docs/DECISIONS.md §36). */
function RoleLang({ children }: { children: React.ReactNode }) {
  const { role } = useBranch();
  return role === "parent" ? children : <EnglishOnly>{children}</EnglishOnly>;
}

function PortalStack() {
  const { isStaff } = useBranch();
  const colors = useColors();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Protected guard={isStaff}>
        <Stack.Screen name="(staff)" />
      </Stack.Protected>
      <Stack.Protected guard={!isStaff}>
        <Stack.Screen name="(family)" />
      </Stack.Protected>
      <Stack.Protected guard={false}>
        <Stack.Screen name="no-access" />
        <Stack.Screen name="ask-access" />
      </Stack.Protected>
      {/* A super admin's "View the app as": over either part, since it moves the app from one to the other. After them,
          so the app still opens on its tabs (a stack opens on its first screen). */}
      <Stack.Screen
        name="view-as"
        options={{
          presentation: "modal",
          headerShown: true,
          title: "View the app as",
          headerShadowVisible: false,
          headerStyle: { backgroundColor: colors.grouped },
          headerTintColor: colors.foreground,
          contentStyle: { backgroundColor: colors.grouped },
        }}
      />
    </Stack>
  );
}
