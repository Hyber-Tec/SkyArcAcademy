import { router } from "expo-router";
import { ChartLine } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { ListSection } from "@/components/List";
import { Screen } from "@/components/Screen";
import { SkeletonCards } from "@/components/Skeleton";
import { T } from "@/components/Text";
import { useFamilyReports, useIsNew } from "@/features/family/data";
import { ChildSwitcher, NotLinked } from "@/features/family/FamilyParts";
import { useFamily } from "@/features/family/FamilyProvider";
import { ReportRow } from "@/features/family/ReportRow";
import { plural } from "@/features/schedule/format";
import { useBranch } from "@/state/BranchProvider";
import { space, useColors } from "@/theme";

/**
 * The progress reports the academy shared with the family, newest first, "New" until someone in the family opens one; a
 * parent with several children picks All or one child. A report opens on its own screen.
 */
export default function FamilyReportsScreen() {
  const family = useFamily();
  const colors = useColors();
  const { name } = useBranch();
  const reports = useFamilyReports(family.ids);
  const isNew = useIsNew();
  const shown = new Set(family.shown);
  const list = reports.data.filter((r) => shown.has(r.studentId));
  const fresh = list.filter(isNew).length;
  const showNames = family.several && family.child === "all";
  const whose = family.who === "student" ? "you’re" : family.shown.length === 1 ? `${family.firstName(family.shown[0])} is` : "your children are";

  return (
    <Screen title="Reports" typing={false} onRefresh={() => new Promise((r) => setTimeout(r, 600))} testID="family-reports">
      {!family.ids.length ? (
        <NotLinked />
      ) : (
        <>
          <View style={styles.controls}>
            <ChildSwitcher />
            <T tone="muted" style={styles.intro}>
              How {whose} doing, from the coaches at {name}.
            </T>
          </View>
          {reports.loading ? (
            <SkeletonCards count={2} height={88} />
          ) : reports.error ? (
            <Card>
              <T variant="label">Couldn’t load the reports</T>
              <T variant="small" tone="muted">
                Check your connection, then pull down to try again.
              </T>
            </Card>
          ) : list.length ? (
            <ListSection title="Progress reports" detail={fresh ? `${fresh} new` : plural(list.length, "report")} testID="family-reports-list">
              {list.map((r) => (
                <ReportRow
                  key={r.id}
                  report={r}
                  name={showNames ? family.firstName(r.studentId, r.student?.firstName) : null}
                  isNew={isNew(r)}
                  onPress={() => router.push({ pathname: "/report/[id]", params: { id: r.id } })}
                  testID={`family-report-${r.id}`}
                />
              ))}
            </ListSection>
          ) : (
            <EmptyState
              testID="family-reports-empty"
              icon={<ChartLine size={26} color={colors.mutedForeground} />}
              title="No reports yet"
              text={`${name} shares a progress report here when it’s ready: the scores over the period, where the shots went, and the coach’s words.`}
            />
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  controls: { gap: space.md },
  intro: { paddingHorizontal: space.xs },
});
