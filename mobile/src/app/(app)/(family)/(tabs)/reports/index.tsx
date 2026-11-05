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
import { useT } from "@/lib/lang";
import { useBranch } from "@/state/BranchProvider";
import { space, useColors } from "@/theme";

/**
 * The progress reports the academy shared with the family, newest first, "New" until someone in the family opens one; a
 * parent with several children picks All or one child. A report opens on its own screen.
 */
export default function FamilyReportsScreen() {
  const family = useFamily();
  const colors = useColors();
  const t = useT();
  const { name } = useBranch();
  const reports = useFamilyReports(family.ids);
  const isNew = useIsNew();
  const shown = new Set(family.shown);
  const list = reports.data.filter((r) => shown.has(r.studentId));
  const fresh = list.filter(isNew).length;
  const showNames = family.several && family.child === "all";
  const whose = family.who === "student" ? "you’re" : family.shown.length === 1 ? `${family.firstName(family.shown[0])} is` : "your children are";
  const whoseKo = family.shown.length === 1 ? `${family.firstName(family.shown[0])}의` : "자녀의";

  return (
    <Screen title={t("Reports", "리포트")} typing={false} onRefresh={() => new Promise((r) => setTimeout(r, 600))} testID="family-reports">
      {!family.ids.length ? (
        <NotLinked />
      ) : (
        <>
          <View style={styles.controls}>
            <ChildSwitcher />
            <T tone="muted" style={styles.intro}>
              {t(`How ${whose} doing, from the coaches at ${name}.`, `${whoseKo} 성장 과정을 코치진이 정리해 보내 드려요.`)}
            </T>
          </View>
          {reports.loading ? (
            <SkeletonCards count={2} height={88} />
          ) : reports.error ? (
            <Card>
              <T variant="label">{t("Couldn’t load the reports", "리포트를 불러오지 못했어요")}</T>
              <T variant="small" tone="muted">
                {t("Check your connection, then pull down to try again.", "인터넷 연결을 확인한 뒤 화면을 아래로 당겨 다시 시도해 주세요.")}
              </T>
            </Card>
          ) : list.length ? (
            <ListSection
              title={t("Progress reports", "성장 리포트")}
              detail={fresh ? t(`${fresh} new`, `새 리포트 ${fresh}개`) : t(plural(list.length, "report"), `${list.length}개`)}
              testID="family-reports-list"
            >
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
              title={t("No reports yet", "아직 받은 리포트가 없어요")}
              text={t(
                `${name} shares a progress report here when it’s ready: the scores over the period, where the shots went, and the coach’s words.`,
                "성장 리포트가 준비되면 아카데미가 여기로 보내 드려요. 기간 동안의 점수, 탄착 위치, 코치 한마디를 담아요.",
              )}
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
