import { COL, ROOT } from "@shared/paths";
import { type ScattSession, type ScattTraces, scattPositionWords } from "@shared/scatt/session";
import { formatDateKey, formatMinutes } from "@shared/time";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { SearchX } from "lucide-react-native";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { Screen } from "@/components/Screen";
import { Skeleton } from "@/components/Skeleton";
import { T } from "@/components/Text";
import { useDoc } from "@/lib/firestore";
import { useBranch } from "@/state/BranchProvider";
import { radius, useColors } from "@/theme";
import { ScattReplay } from "./ScattReplay";

/**
 * One SCATT session, loaded by ID (a link opens it too): its numbers and every shot's aim, played back. The staff's and
 * the family's (`allowed`: only their own students', whatever the phone's copy still holds). Nothing is added here.
 */
export function ScattScreen({ allowed, backTo, testID }: { allowed: (studentId: string) => boolean; backTo: string; testID: string }) {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { branchId } = useBranch();
  const colors = useColors();
  const sessionDoc = useDoc<ScattSession>(id ? `${ROOT.branches}/${branchId}/${COL.scattSessions}/${id}` : null);
  const tracesDoc = useDoc<ScattTraces>(id ? `${ROOT.branches}/${branchId}/${COL.scattTraces}/${id}` : null);
  const s = sessionDoc.data && allowed(sessionDoc.data.studentId) ? sessionDoc.data : null;

  if (sessionDoc.loading) {
    return (
      <Screen typing={false} testID={testID}>
        <Stack.Screen options={{ title: "" }} />
        <Skeleton height={360} rounded={radius.lg} />
      </Screen>
    );
  }
  if (!s) {
    return (
      <Screen typing={false} testID={testID}>
        <Stack.Screen options={{ title: "" }} />
        <EmptyState
          testID={`${testID}-missing`}
          icon={<SearchX size={26} color={colors.mutedForeground} />}
          title="This SCATT session isn’t available"
          text="It may have been removed."
          action={
            <Button variant="outline" onPress={() => (router.canGoBack() ? router.back() : router.replace(backTo))} testID={`${testID}-back`}>
              Back
            </Button>
          }
        />
      </Screen>
    );
  }
  const facts = [
    scattPositionWords(s.position),
    `${s.matchShots} shots${s.sighters ? `, ${s.sighters} sighter${s.sighters === 1 ? "" : "s"}` : ""}`,
    s.total !== null ? `total ${s.total.toFixed(1)} (${s.totalInt})` : null,
    s.averages ? `aiming ${s.averages.aimS.toFixed(1)} s a shot on average` : null,
  ].filter(Boolean);
  return (
    <Screen typing={false} testID={testID}>
      <Stack.Screen options={{ title: `SCATT · ${formatDateKey(s.dateKey, "monthDay")}` }} />
      <Card>
        <T variant="label">{s.studentName}</T>
        <T variant="small" tone="muted">
          {`${formatDateKey(s.dateKey, "dayLong")} · ${formatMinutes(s.timeMin)}`}
        </T>
        <T variant="small" tone="muted">
          {facts.join(" · ")}
        </T>
        {s.series.length > 1 ? (
          <T variant="small" tone="muted">
            {`Series: ${s.series.map((x) => `${x.n}: ${x.total.toFixed(1)}`).join(" · ")}`}
          </T>
        ) : null}
      </Card>
      <ScattReplay session={s} traces={tracesDoc.data} testID={`${testID}-replay`} />
    </Screen>
  );
}
