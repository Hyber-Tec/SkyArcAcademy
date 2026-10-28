import { POSITION_COLORS, POSITION_LABELS, SOURCE_LABELS, per10, wholePer10 } from "@shared/shooting/evaluation";
import { ChevronRight, MessageSquareQuote } from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";
import { T } from "@/components/Text";
import type { EvaluationDoc } from "@/features/data/hooks";
import { one } from "@/features/reports/format";
import { shortDay } from "@/features/schedule/format";
import { scoreTotal } from "@/features/scores/format";
import { MiniTarget } from "@/features/scores/MiniTarget";
import { ResultKindChip } from "@/features/scores/kinds";
import { BestBadge } from "@/features/scores/ScoreParts";
import { space, useColors } from "@/theme";

/**
 * One score in a family's list, as the website lists it: its shots on a small target in the position's colour (a typed
 * card's pencil), the position, "New best" when it beat every earlier result in its position, a mark when the coach
 * left a note; under them whose it is (a parent's list of several children), where it came from (SIUS or a paper
 * card), the day and the shots; and the score per 10 shots: in whole numbers, as the charts and the personal bests
 * count it, with a SIUS result's decimal beside it (its decimal total in the line under). Tapping it opens the score.
 */
export function ScoreRow({
  evaluation: e,
  name,
  who,
  best,
  divider = false,
  onPress,
  testID,
}: {
  evaluation: EvaluationDoc;
  /** The student's first name, when the list mixes children. */
  name?: string | null;
  /** Whose it is, first (staff's lists of everyone's scores): the name leads, the position follows it. */
  who?: string | null;
  best: boolean;
  divider?: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const colors = useColors();
  const whole = wholePer10(e);
  const decimal = e.source === "sius" ? per10(e.total, e.shots) : null;
  const color = POSITION_COLORS[e.position];
  const note = !!e.note?.trim();
  const total = e.source === "sius" || e.shots !== 10 ? `total ${scoreTotal(e)}` : null;
  // Each part kept whole on its line: a long one moves down rather than breaking ("total / 195.5").
  const line = [who ? POSITION_LABELS[e.position] : name, SOURCE_LABELS[e.source], shortDay(e.dateKey), `${e.shots} shots`, total]
    .filter((x): x is string => !!x)
    .map((x) => x.replace(/ /g, " "))
    .join(" · ");
  const label = [
    who ? `${who}, ${POSITION_LABELS[e.position]}, ${SOURCE_LABELS[e.source]}` : `${POSITION_LABELS[e.position]}, ${SOURCE_LABELS[e.source]}`,
    line,
    whole !== null ? `${one(whole)} per 10 shots${decimal !== null ? `, ${one(decimal)} in decimals` : ""}` : null,
    best ? "a new personal best" : null,
    note ? "with a coach’s note" : null,
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.row, divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, pressed && { backgroundColor: colors.accent }]}
    >
      <MiniTarget evaluation={e} color={color} />
      <View style={styles.grow}>
        <View style={styles.title}>
          <View style={[styles.dot, { backgroundColor: color }]} />
          <T variant="label" numberOfLines={1} style={styles.shrink}>
            {who ?? POSITION_LABELS[e.position]}
          </T>
          {best ? <BestBadge position={e.position} /> : null}
          <ResultKindChip e={e} />
          {note ? <MessageSquareQuote size={14} color={colors.mutedForeground} /> : null}
        </View>
        <T variant="small" tone="muted" numberOfLines={2}>
          {line}
        </T>
      </View>
      <View style={styles.score}>
        <T variant="subheading" style={styles.number}>
          {whole !== null ? one(whole) : "–"}
          {decimal !== null ? (
            <T variant="tiny" tone="muted">
              {` ${one(decimal)}`}
            </T>
          ) : null}
        </T>
        <T variant="tiny" tone="muted">
          per 10
        </T>
      </View>
      <ChevronRight size={16} color={colors.mutedForeground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 64 },
  grow: { flex: 1, gap: 2 },
  // The badges ("New best", a competition's or an evaluation's chip) wrap rather than cut the name short.
  title: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 6, rowGap: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  shrink: { flexShrink: 1 },
  score: { alignItems: "flex-end" },
  number: { fontVariant: ["tabular-nums"] },
});
