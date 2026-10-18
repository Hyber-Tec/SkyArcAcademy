import { router } from "expo-router";
import { ChartLine, ChevronDown, SearchX } from "lucide-react-native";
import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { FilterChips } from "@/components/FilterChips";
import { ListRow, ListSection } from "@/components/List";
import { Screen } from "@/components/Screen";
import { SearchField } from "@/components/SearchField";
import { SkeletonCards } from "@/components/Skeleton";
import { T } from "@/components/Text";
import { useAllReports } from "@/features/reports/staff";
import { StaffReportRow } from "@/features/reports/StaffReportRow";
import { openWebsite } from "@/lib/links";
import { useBranch } from "@/state/BranchProvider";
import { space, useColors } from "@/theme";

type Tab = "all" | "draft" | "shared";

/** Reports shown before "Show all". */
const SHOWN = 40;

const fold = (s: string) => (s ?? "").normalize("NFKC").toLowerCase();

/**
 * Every student's progress reports, newest first, as the website's Reports page: All, Drafts or Shared, and a search by
 * student. Coaches see them all and share a draft with the family from its screen (docs/DECISIONS.md §6, Q11); the
 * office prepares, changes and deletes them on the website.
 */
export default function StaffReportsScreen() {
  const colors = useColors();
  const { isAdmin, portal } = useBranch();
  const reports = useAllReports();
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");
  const [all, setAll] = useState(false);
  const counts = useMemo(
    () => ({ all: reports.data.length, draft: reports.data.filter((r) => r.status !== "shared").length, shared: reports.data.filter((r) => r.status === "shared").length }),
    [reports.data],
  );
  const words = fold(q).split(/\s+/).filter(Boolean);
  const list = reports.data.filter((r) => (tab === "all" || (tab === "shared" ? r.status === "shared" : r.status !== "shared")) && words.every((w) => fold(`${r.studentName} ${r.student?.name ?? ""}`).includes(w)));
  const shown = all ? list : list.slice(0, SHOWN);

  let body;
  if (reports.loading) body = <SkeletonCards count={4} height={92} />;
  else if (reports.error) {
    body = (
      <Card>
        <T variant="label">Couldn’t load the reports</T>
        <T variant="small" tone="muted">
          Check your connection, then pull down to try again.
        </T>
      </Card>
    );
  } else if (!reports.data.length) {
    body = (
      <EmptyState
        testID="reports-empty"
        icon={<ChartLine size={26} color={colors.mutedForeground} />}
        title="No progress reports yet"
        text={isAdmin ? "A report is prepared on the website from a student’s scores over a period. You review it there, then share it from here or there." : "Reports appear here once an admin prepares them on the website."}
        action={
          isAdmin ? (
            <Button variant="outline" onPress={() => void openWebsite(`/${portal}/reports`)} testID="reports-website">
              Open Reports on the website
            </Button>
          ) : undefined
        }
      />
    );
  } else if (!list.length) {
    body = (
      <EmptyState
        testID="reports-none"
        icon={<SearchX size={26} color={colors.mutedForeground} />}
        title="No reports match"
        text={words.length ? "Check the student’s name, or look in All." : tab === "draft" ? "Every report has been shared." : "No report has been shared yet."}
      />
    );
  } else {
    body = (
      <ListSection title={tab === "draft" ? "Drafts" : tab === "shared" ? "Shared" : "Reports"} detail={String(list.length)} testID="reports-list">
        {shown.map((r) => (
          <StaffReportRow key={r.id} report={r} onPress={() => router.push({ pathname: "/report/[id]", params: { id: r.id } })} testID={`report-row-${r.id}`} />
        ))}
        {shown.length < list.length ? (
          <ListRow icon={<ChevronDown size={18} color={colors.mutedForeground} />} title={`Show all ${list.length}`} chevron={false} onPress={() => setAll(true)} testID="reports-all" />
        ) : null}
      </ListSection>
    );
  }

  return (
    <Screen testID="reports-screen" onRefresh={() => new Promise((r) => setTimeout(r, 600))}>
      <T tone="muted" style={styles.intro}>
        {isAdmin ? "Every student’s progress reports. Share a draft with the family once it’s ready; changes are made on the website." : "Every student’s progress reports. Share a draft with the family once it’s ready."}
      </T>
      <View style={styles.controls}>
        <SearchField value={q} onChangeText={setQ} placeholder="Search by student" testID="reports-search" />
        <FilterChips
          value={tab}
          onChange={setTab}
          options={[
            { value: "all", label: "All", count: counts.all, testID: "reports-filter-all" },
            { value: "draft", label: "Drafts", count: counts.draft, testID: "reports-filter-draft" },
            { value: "shared", label: "Shared", count: counts.shared, testID: "reports-filter-shared" },
          ]}
          testID="reports-filter"
        />
      </View>
      {body}
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { paddingHorizontal: space.xs },
  controls: { gap: space.md },
});
