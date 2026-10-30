import { type MatchResult, isWholeResult, matchTotal, seriesInnerTens, seriesLabel, seriesTotalText, shotLabel } from "@shared/scores/match";
import { POSITION_COLORS, POSITION_LABELS, evaluationPoints } from "@shared/shooting/evaluation";
import { isInnerTen } from "@shared/shooting/target";
import { formatDateKey } from "@shared/time";
import { ChevronDown, ChevronRight, Trophy } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { Card } from "@/components/Card";
import { T } from "@/components/Text";
import { radius, space, useAccents, useColors } from "@/theme";
import { MiniTarget } from "./MiniTarget";
import { ShotReplay } from "./ShotReplay";

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
  const { width } = useWindowDimensions();
  const [open, setOpen] = useState<string | null>(null);
  const { total, innerTens: inner, whole } = matchTotal(results);
  const rows = useMemo(
    () => results.flatMap((r) => r.series.map((s) => ({ key: `${r.id}-${s.n}`, r, s, label: seriesLabel(r.position, s), placed: evaluationPoints({ series: [s] }).length > 0 }))),
    [results],
  );
  const size = Math.min(width - space.lg * 4, 340);
  const name = evaluation.match?.name?.trim() || "Competition";

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
            {[formatDateKey(evaluation.dateKey, "medium"), evaluation.match?.course?.trim()].filter(Boolean).join(" · ")}
          </T>
        </View>
        <View style={styles.right}>
          <T variant="heading" style={styles.number} testID="match-total">
            {whole ? String(total) : total.toFixed(1)}
            {inner !== null ? <T variant="label" tone="muted">{` - ${inner}`}</T> : null}
          </T>
          <T variant="tiny" tone="muted">
            {results.length > 1 ? "the match" : POSITION_LABELS[evaluation.position]}
          </T>
        </View>
      </View>

      {results.length > 1 ? (
        <View style={styles.positions}>
          {results.map((r) => (
            <View key={r.id} style={[styles.position, { borderColor: colors.border }]}>
              <View style={[styles.dot, { backgroundColor: POSITION_COLORS[r.position] }]} />
              <T variant="small">{POSITION_LABELS[r.position]}</T>
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
                  accessibilityLabel={`${POSITION_LABELS[r.position]}, shots ${label}: ${seriesTotalText(s, whole)}, ${seriesInnerTens(s)} inner tens. ${shown ? "Hide" : "Show"} the shots.`}
                  style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.accent }]}
                  testID={`match-series-${key}`}
                >
                  <MiniTarget evaluation={{ series: [s] }} color={POSITION_COLORS[r.position]} size={40} />
                  <View style={styles.grow}>
                    <T variant="label">{`${POSITION_LABELS[r.position]} · ${label}`}</T>
                    <T variant="small" tone="muted">
                      {placed ? "Tap to see the shots and play them" : "Tap to see the shots"}
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
                      {s.shots.map((t, k) => {
                        const x = isInnerTen(t.v);
                        return (
                          <View key={k} style={[styles.shot, { backgroundColor: x ? amber.bg : colors.secondary }]}>
                            <T variant="tiny" tone="muted">{shotLabel(r.position, s.n, k)}</T>
                            <T variant="label" style={[styles.number, x && { color: amber.fg }]}>
                              {whole && Number.isInteger(t.v) ? String(t.v) : t.v.toFixed(1)}
                              {x ? "*" : ""}
                            </T>
                          </View>
                        );
                      })}
                    </View>
                    {!placed ? (
                      <T variant="small" tone="muted" style={styles.note}>
                        The sheet’s picture of this series couldn’t be read, so its shots have no places on the target.
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
          Only the totals were saved for this match: its shots weren’t on the sheet, or were typed as totals.
        </T>
      )}
      <T variant="tiny" tone="muted">
        * an inner ten. A series’ score is its total, then its inner tens.
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
