import { router, useLocalSearchParams } from "expo-router";
import { FileX2 } from "lucide-react-native";
import { useEffect } from "react";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { Screen } from "@/components/Screen";
import { Skeleton } from "@/components/Skeleton";
import { recordReportView, useReport } from "@/features/family/data";
import { useFamily } from "@/features/family/FamilyProvider";
import { ReportBody } from "@/features/reports/ReportBody";
import { useBranch } from "@/state/BranchProvider";
import { radius, useColors } from "@/theme";

/**
 * A progress report, on its own screen (loaded by ID, so a link opens it too), as src/features/reports/ReportBody.tsx
 * draws it (the staff's report screen shows the same): whose it is and the period, how the scores went (when the
 * report shows it), the period's figures, the coach's words, the scores over time, the period's shots played back on
 * the target, each position's figures, the first and latest results side by side, and the goals. A family's opening is
 * recorded once, so the academy sees "Viewed".
 */
export default function FamilyReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { branchId, actor, role, name } = useBranch();
  const colors = useColors();
  const family = useFamily();
  const report = useReport(id ?? null);
  // Only the family's own students' reports (a copy this phone kept from an earlier sign-in never shows).
  const r = report.data && family.ids.includes(report.data.studentId) ? report.data : null;
  const visible = !!r && r.sharedWithParents === true;

  useEffect(() => {
    if (visible && r) void recordReportView(branchId, r.id, actor.email, role);
  }, [visible, r, branchId, actor.email, role]);

  if (report.loading) {
    return (
      <Screen typing={false} testID="report-screen">
        <Skeleton height={170} rounded={radius.lg} />
        <Skeleton height={220} rounded={radius.lg} />
        <Skeleton height={120} rounded={radius.lg} />
      </Screen>
    );
  }
  if (!r || !visible) {
    return (
      <Screen typing={false} testID="report-screen">
        <EmptyState
          icon={<FileX2 size={26} color={colors.mutedForeground} />}
          title="Report not available"
          text={`It may have been taken back to be changed. Ask ${name} if you were expecting it.`}
          action={
            <Button variant="outline" onPress={() => (router.canGoBack() ? router.back() : router.replace("/reports"))} testID="report-back">
              Back to reports
            </Button>
          }
        />
      </Screen>
    );
  }
  return <ReportBody r={r} />;
}
