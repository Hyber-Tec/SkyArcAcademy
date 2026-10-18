import { reportName } from "@shared/reports/compose";
import { evaluationsFingerprint } from "@shared/reports/facts";
import { router, useLocalSearchParams } from "expo-router";
import { FileX2 } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Button } from "@/components/Button";
import { confirmAsync } from "@/components/Confirm";
import { EmptyState } from "@/components/EmptyState";
import { Screen } from "@/components/Screen";
import { Skeleton } from "@/components/Skeleton";
import { useStudentEvaluations } from "@/features/data/hooks";
import { ReportBody } from "@/features/reports/ReportBody";
import { ShareDialog } from "@/features/reports/ShareDialog";
import { type StaffReport, unshareReport, useStaffReport } from "@/features/reports/staff";
import { ReportStaffFacts, ReportStatus } from "@/features/reports/StaffReportParts";
import { toast } from "@/lib/toast";
import { useBranch } from "@/state/BranchProvider";
import { radius, useColors } from "@/theme";

/**
 * A progress report for the staff (loaded by ID, so a link opens it too), as the website's report page: the report as
 * the family sees it (src/features/reports/ReportBody.tsx), with its state above it, Share with the family for a draft
 * (coaches and the office alike; an admin can stop sharing one), what to check first, and below it how the trend was
 * worked out and the results it's built from. Changing a report stays on the website.
 */
export default function StaffReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const report = useStaffReport(id ?? null);
  if (report.loading) {
    return (
      <Screen typing={false} testID="report-screen">
        <Skeleton height={150} rounded={radius.lg} />
        <Skeleton height={170} rounded={radius.lg} />
        <Skeleton height={220} rounded={radius.lg} />
      </Screen>
    );
  }
  if (!report.data) {
    return (
      <Screen typing={false} testID="report-screen">
        <EmptyState
          testID="report-gone"
          icon={<FileX2 size={26} color={colors.mutedForeground} />}
          title="Report not found"
          text="It may have been deleted on the website."
          action={
            <Button variant="outline" onPress={() => (router.canGoBack() ? router.back() : router.replace("/(app)/(staff)/reports"))} testID="report-back">
              Back to reports
            </Button>
          }
        />
      </Screen>
    );
  }
  return <StaffReportView key={report.data.id} report={report.data} />;
}

function StaffReportView({ report: r }: { report: StaffReport }) {
  const { branchId, actor } = useBranch();
  const [sharing, setSharing] = useState(false);
  // What the report would be built from now, to say when it has fallen behind its evaluations (as the website does).
  const evaluations = useStudentEvaluations(r.studentId);
  const inPeriod = useMemo(() => evaluations.data.filter((e) => e.dateKey >= r.startDate && e.dateKey <= r.endDate && e.shots > 0), [evaluations.data, r.startDate, r.endDate]);
  const stale = !evaluations.loading && !evaluations.error && evaluationsFingerprint(inPeriod) !== r.source?.fingerprint;
  const problems = inPeriod.filter((e) => e.problems?.length).length;

  const unshare = async () => {
    if (!(await confirmAsync({ title: "Stop sharing this report?", message: "The family won’t see it in the app or on the website until it’s shared again.", confirmLabel: "Stop sharing" }))) return;
    void unshareReport(branchId, actor, r).catch((e: unknown) => toast.error("Couldn’t change the report", { description: e instanceof Error ? e.message : String(e) }));
    toast.success(`${reportName(r)} is a draft again`);
  };

  return (
    <>
      <ReportBody
        r={r}
        top={<ReportStatus report={r} stale={stale} problems={problems} onShare={() => setSharing(true)} onUnshare={() => void unshare()} />}
        bottom={<ReportStaffFacts report={r} />}
      />
      {sharing ? <ShareDialog report={r} stale={stale} onClose={() => setSharing(false)} /> : null}
    </>
  );
}
