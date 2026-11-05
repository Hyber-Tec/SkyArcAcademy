import { dateText } from "@shared/i18n";
import { type MatchResult, isWholeResult, matchTotal, seriesInnerTens, seriesLabel, seriesTotalText, shotLabel } from "@shared/scores/match";
import { POSITION_COLORS, evaluationPoints } from "@shared/shooting/evaluation";
import { isInnerTen } from "@shared/shooting/target";
import { ChevronDown, ChevronRight, Trophy } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { Card } from "@/components/Card";
import { T } from "@/components/Text";
import { useLang, useT } from "@/lib/lang";
import { radius, space, useAccents, useColors } from "@/theme";
import { MiniTarget } from "./MiniTarget";
import { ShotReplay } from "./ShotReplay";
import { positionLabel } from "./words";

export { matchResults } from "@shared/scores/match";

/**
 * A competition from its results sheet, as the match was (the owner, 2026-10-29: "in one competition we have six
 * sections: tap one and see all its shots and the animation"): the match's total and inner tens, then each series
 * of ten as the sheet prints it ("K1–K10 · 71 - 1"), with its shots on a small target when the sheet's pictures gave
 * their places. Tapping a series shows its shots and plays them on the target, one by one.
 */
export function MatchCard({ evaluation, results, testID }: { evaluation: MatchResult; results: MatchResult[]; testID?: string }) {
  const colors = useColors();
  const amber = useAccents().amber;
  const t = useT();
  const lang = useLang();
  const { width } = useWindowDimensions();
  const [open, setOpen] = useState<string | null>(null);
  const { total, innerTens: inner, whole } = matchTotal(results);
  const rows = useMemo(
    () => results.flatMap((r) => r.series.map((s) => ({ key: `${r.id}-${s.n}`, r, s, label: seriesLabel(r.position, s), placed: evaluationPoints({ series: [s] }).length > 0 }))),
    [results],
  );
  const size = Math.min(width - space.lg * 4, 340);
  const name = evaluation.match?.name?.trim() || t("Competition", "대회");

  return (
    <Card style={styles.card} testID={testID}>
      <View style={styles.head}>
        <View style={[styles.icon, { backgroundColor: amber.bg }]}>
          <Trophy size={18} color={amber.fg} />
        </View>
        <View style={styles.grow}>
          <T variant="label" numberOfLines={2}>
            {name}
          </T>
          <T variant="small" tone="muted">
            {[dateText(evaluation.dateKey, "medium", lang), evaluation.match?.course?.trim()].filter(Boolean).join(" · ")}
          </T>
        </View>
        <View style={styles.right}>
          <T variant="heading" style={styles.number} testID="match-total">
            {whole ? String(total) : total.toFixed(1)}
            {inner !== null ? <T variant="label" tone="muted">{` - ${inner}`}</T> : null}
          </T>
          <T variant="tiny" tone="muted">
            {results.length > 1 ? t("the match", "경기 전체") : positionLabel(evaluation.position, lang)}
          </T>
        </View>
      </View>

      {results.length > 1 ? (
        <View style={styles.positions}>
          {results.map((r) => (
            <View key={r.id} style={[styles.position, { borderColor: colors.border }]}>
              <View style={[styles.dot, { backgroundColor: POSITION_COLORS[r.position] }]} />
              <T variant="small">{positionLabel(r.position, lang)}</T>
              <T variant="small" style={styles.number}>
                {isWholeResult(r) ? String(r.total) : r.total.toFixed(1)}
                {r.innerTens !== null ? ` - ${r.innerTens}` : ""}
              </T>
            </View>
          ))}
        </View>
      ) : null}

      {rows.length ? (
        <View style={[styles.list, { borderColor: colors.border }]}>
          {rows.map(({ key, r, s, label, placed }, i) => {
            const shown = open === key;
            return (
              <View key={key} style={i ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border } : null}>
                <Pressable
                  onPress={() => setOpen(shown ? null : key)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: shown }}
                  accessibilityLabel={t(
                    `${positionLabel(r.position, "en")}, shots ${label}: ${seriesTotalText(s, whole)}, ${seriesInnerTens(s)} inner tens. ${shown ? "Hide" : "Show"} the shots.`,
                    `${positionLabel(r.position, "ko")}, ${label}: ${seriesTotalText(s, whole)}, 이너 텐 ${seriesInnerTens(s)}개. ${shown ? "발별 점수 접기" : "발별 점수 보기"}`,
                  )}
                  style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.accent }]}
                  testID={`match-series-${key}`}
                >
                  <MiniTarget evaluation={{ series: [s] }} color={POSITION_COLORS[r.position]} size={40} />
                  <View style={styles.grow}>
                    <T variant="label">{`${positionLabel(r.position, lang)} · ${label}`}</T>
                    <T variant="small" tone="muted">
                      {placed ? t("Tap to see the shots and play them", "누르면 발별 점수와 재생을 볼 수 있어요") : t("Tap to see the shots", "누르면 발별 점수를 볼 수 있어요")}
                    </T>
                  </View>
                  <T variant="subheading" style={styles.number}>
                    {seriesTotalText(s, whole)}
                    <T variant="small" tone="muted">{` - ${seriesInnerTens(s)}`}</T>
                  </T>
                  {shown ? <ChevronDown size={16} color={colors.mutedForeground} /> : <ChevronRight size={16} color={colors.mutedForeground} />}
                </Pressable>
                {shown ? (
                  <View style={styles.open} testID={`match-series-open-${key}`}>
                    {placed ? <ShotReplay evaluation={{ source: r.source, series: [s] }} color={POSITION_COLORS[r.position]} size={size} autoPlay /> : null}
                    <View style={styles.shots}>
                      {s.shots.map((shot, k) => {
                        const x = isInnerTen(shot.v);
                        return (
                          <View key={k} style={[styles.shot, { backgroundColor: x ? amber.bg : colors.secondary }]}>
                            <T variant="tiny" tone="muted">{shotLabel(r.position, s.n, k)}</T>
                            <T variant="label" style={[styles.number, x && { color: amber.fg }]}>
                              {whole && Number.isInteger(shot.v) ? String(shot.v) : shot.v.toFixed(1)}
                              {x ? "*" : ""}
                            </T>
                          </View>
                        );
                      })}
                    </View>
                    {!placed ? (
                      <T variant="small" tone="muted" style={styles.note}>
                        {t(
                          "The sheet’s picture of this series couldn’t be read, so its shots have no places on the target.",
                          "결과지에서 이 시리즈의 그림을 읽지 못해서 표적에 탄착 위치를 표시할 수 없어요.",
                        )}
                      </T>
                    ) : null}
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : (
        <T variant="small" tone="muted">
          {t(
            "Only the totals were saved for this match: its shots weren’t on the sheet, or were typed as totals.",
            "이 경기는 합계만 저장됐어요. 결과지에 발별 점수가 없었거나 합계로만 입력했어요.",
          )}
        </T>
      )}
      <T variant="tiny" tone="muted">
        {t("* an inner ten. A series’ score is its total, then its inner tens.", "* 이너 텐. 시리즈 점수는 합계 - 이너 텐 개수로 적어요.")}
      </T>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.md },
  head: { flexDirection: "row", alignItems: "center", gap: space.md },
  icon: { width: 36, height: 36, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  grow: { flex: 1, gap: 2 },
  right: { alignItems: "flex-end" },
  number: { fontVariant: ["tabular-nums"] },
  positions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  position: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.full, paddingHorizontal: space.md, paddingVertical: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  list: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.md, paddingVertical: space.sm, minHeight: 56 },
  open: { paddingHorizontal: space.md, paddingBottom: space.md, gap: space.md, alignItems: "center" },
  shots: { flexDirection: "row", flexWrap: "wrap", gap: 6, justifyContent: "center" },
  shot: { minWidth: 54, alignItems: "center", borderRadius: radius.md, paddingVertical: 4, paddingHorizontal: 6 },
  note: { textAlign: "center" },
});
