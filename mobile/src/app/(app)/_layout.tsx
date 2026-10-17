import { Stack } from "expo-router";
import { Loading } from "@/components/Loading";
import { PausedAccess } from "@/features/access/PausedAccess";
import { BranchProvider, useBranch } from "@/state/BranchProvider";
import { useColors } from "@/theme";

/**
 * The signed-in app. The academy's member doc for the person's email decides (BranchProvider): none yet → No access;
 * paused → paused; otherwise the part of their one role. Owners, admins and coaches get the staff's tabs (each sees what
 * the rules give their role); parents and students get the family's (their children's or their own classes and shared
 * progress reports).
 */
export default function AppLayout() {
  const colors = useColors();
  return (
    <BranchProvider
      fallback={<Loading label="Opening Sky Arc" />}
      noAccess={
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
          <Stack.Screen name="no-access" />
          {/* Without access to the academy, nothing else opens, a link included. */}
          <Stack.Protected guard={false}>
            <Stack.Screen name="(staff)" />
            <Stack.Screen name="(family)" />
          </Stack.Protected>
        </Stack>
      }
      paused={(why) => <PausedAccess why={why} />}
    >
      <PortalStack />
    </BranchProvider>
  );
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
      </Stack.Protected>
    </Stack>
  );
}
