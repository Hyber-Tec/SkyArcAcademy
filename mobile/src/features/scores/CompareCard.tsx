import { type CompareMode, type ComparePair, compareFacts, compareModes, comparePair, positionPoints } from "@shared/reports/compare";
import type { EvaluationPoint } from "@shared/reports/types";
import { POSITION_COLORS, POSITION_LABELS, SOURCE_LABELS, pointOf } from "@shared/shooting/evaluation";
import { formatDateKey } from "@shared/time";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Check, ChevronRight, ChevronsUpDown, GitCompareArrows, PencilLine } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Dialog } from "@/components/Dialog";
import { SegmentedControl } from "@/components/SegmentedControl";
import { T } from "@/components/Text";
import type { EvaluationDoc } from "@/features/data/hooks";
import { one, signed } from "@/features/reports/format";
import { StillTarget } from "@/features/reports/ReportParts";
import { radius, space, useColors } from "@/theme";

const MODE_LABELS: Record<CompareMode, string> = { lowest: "Lowest", previous: "Previous", first: "First", choose: "Choose two" };

/** "Sep 3, 2026 · 85", with a SIUS result's decimal after it ("· 85 (90.2)"), as the website's choices read. */
const pointLine = (p: EvaluationPoint) => `${formatDateKey(p.dateKey, "medium")} · ${one(p.wholePer10)}${p.source === "sius" ? ` (${one(p.per10)})` : ""}`;

/**
 * Two results of one position side by side, on a score's own screen (the family's and the staff's), as the website's
 * Compare card offers them (web/src/features/students/scores/CompareCard.tsx), from this result: against the lowest one
 * before it, the one just before it or the position's first, or any two of the position's results chosen. Each side's
 * day and score per 10 shots (whole numbers, as the charts count them, with a SIUS result's decimal), the change between
 * them, both targets (a typed card's shots have no places), and how the inner tens and the group size changed. The other
 * result opens with a tap. The pairs are shared/src/reports/compare.ts's, the website's own.
 */
export function CompareCard({
  anchor,
  evaluations,
  loading = false,
  onOpen,
  alone = false,
  testID,
}: {
  /** The result the screen is about. */
  anchor: EvaluationDoc;
  /** The student's results, in any order: those in the anchor's position compare. */
  evaluations: readonly EvaluationDoc[];
  loading?: boolean;
  /** Opens another result's screen. */
  onOpen?: (id: string) => void;
  /** The only result in its position so far: say so (otherwise nothing shows). */
  alone?: boolean;
  testID?: string;
}) {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const list = useMemo(() => positionPoints(evaluations, anchor.position), [evaluations, anchor.position]);
  const modes = useMemo(() => compareModes(list, anchor.id), [list, anchor.id]);
  const [chosen, setChosen] = useState<CompareMode>("first");
  const [picks, setPicks] = useState<[string | null, string | null]>([null, null]);
  // The side being chosen (kept while the list closes).
  const [picking, setPicking] = useState<{ side: 0 | 1; open: boolean }>({ side: 0, open: false });
  // A position's first result can only be compared with a later one, chosen (the latest at first).
  const mode = modes.includes(chosen) ? chosen : (modes[0] ?? "choose");
  const named = { anchorId: anchor.id, anchorLabel: "This result" };
  // Picks that no longer make a pair (one deleted since) give way to the first ones.
  const pair = comparePair(list, mode, { ...named, picks }) ?? comparePair(list, mode, named);
  const position = POSITION_LABELS[anchor.position].toLowerCase();
  // Two targets side by side in the card (the page's and the card's padding on each side).
  const size = Math.min(150, Math.floor((width - space.lg * 5) / 2));

  if (loading || anchor.shots <= 0) return null;
  const head = (
    <View style={styles.head}>
      <GitCompareArrows size={16} color={colors.mutedForeground} />
      <T variant="label" style={styles.grow} accessibilityRole="header">
        Compare
      </T>
    </View>
  );
  if (!pair) {
    return alone ? (
      <Card style={styles.card} testID={testID}>
        {head}
        <T variant="small" tone="muted">{`The only ${position} result so far: the next one compares with it here.`}</T>
      </Card>
    ) : null;
  }

  const sides: [EvaluationPoint, EvaluationPoint] = [pair.a, pair.b];
  return (
    <Card style={styles.card} testID={testID}>
      {head}
      {modes.length > 1 ? (
        <SegmentedControl<CompareMode> value={mode} onChange={setChosen} options={modes.map((m) => ({ value: m, label: MODE_LABELS[m] }))} testID={testID ? `${testID}-mode` : undefined} />
      ) : null}
      {mode === "choose" ? (
        <View style={styles.picks}>
          {sides.map((p, i) => (
            <Pressable
              key={i}
              onPress={() => setPicking({ side: i === 0 ? 0 : 1, open: true })}
              accessibilityRole="button"
              accessibilityLabel={`${pair.labels[i]}: ${formatDateKey(p.dateKey, "medium")}, ${one(p.wholePer10)} per 10 shots. Choose another ${position} result.`}
              style={({ pressed }) => [styles.pick, { borderColor: colors.input, backgroundColor: pressed ? colors.accent : colors.card }]}
              testID={testID ? `${testID}-pick-${i}` : undefined}
            >
              <View style={styles.grow}>
                <T variant="tiny" tone="muted" style={styles.caps}>
                  {pair.labels[i].toUpperCase()}
                </T>
                <T variant="small" style={styles.number} numberOfLines={1}>
                  {pointLine(p)}
                </T>
              </View>
              <ChevronsUpDown size={16} color={colors.mutedForeground} />
            </Pressable>
          ))}
        </View>
      ) : null}
      <Pair pair={pair} size={size} anchorId={anchor.id} onOpen={onOpen} testID={testID} />
      <ChooseDialog
        open={picking.open && mode === "choose"}
        position={position}
        list={list}
        anchorId={anchor.id}
        current={sides[picking.side].id}
        other={sides[picking.side === 0 ? 1 : 0].id}
        onPick={(id) => {
          setPicks(picking.side === 0 ? [id, pair.b.id] : [pair.a.id, id]);
          setPicking((p) => ({ ...p, open: false }));
        }}
        onClose={() => setPicking((p) => ({ ...p, open: false }))}
        testID={testID ? `${testID}-choose` : undefined}
      />
    </Card>
  );
}

/** The pair: each side's day and score, the change between them, both targets, then the inner tens and the group size. */
function Pair({ pair, size, anchorId, onOpen, testID }: { pair: ComparePair<EvaluationPoint>; size: number; anchorId: string; onOpen?: (id: string) => void; testID?: string }) {
  const { a, b, labels } = pair;
  const facts = compareFacts(a, b);
  const color = POSITION_COLORS[b.position];
  const placed = [a, b].some((p) => p.marks.some((m) => pointOf(m) !== null));
  const open = (p: EvaluationPoint) => (onOpen && p.id !== anchorId ? () => onOpen(p.id) : undefined);
  return (
    <View style={styles.pair}>
      <View style={styles.sides}>
        <Side point={a} label={labels[0]} onOpen={open(a)} testID={testID ? `${testID}-a` : undefined} />
        <Side point={b} label={labels[1]} onOpen={open(b)} testID={testID ? `${testID}-b` : undefined} />
      </View>
      <View style={styles.center}>
        <Change
          value={facts.change}
          size="md"
          label={facts.change === 0 ? "No change per 10 shots" : `${one(Math.abs(facts.change))} ${facts.change > 0 ? "higher" : "lower"} per 10 shots`}
          testID={testID ? `${testID}-change` : undefined}
        />
      </View>
      {placed ? (
        <View style={styles.sides}>
          {[a, b].map((p) => (
            <View key={p.id} style={styles.side}>
              {p.marks.some((m) => pointOf(m) !== null) ? <StillTarget point={p} size={size} color={color} /> : <Typed size={size} />}
            </View>
          ))}
        </View>
      ) : null}
      {facts.innerTens ? (
        <Fact label="Inner tens" from={`${facts.innerTens.a}%`} to={`${facts.innerTens.b}%`} change={facts.innerTens.change} unit=" pts" words={["points more", "points fewer"]} />
      ) : null}
      {facts.group ? (
        <Fact label="Group size" from={one(facts.group.a)} to={`${one(facts.group.b)} mm`} change={facts.group.change} unit=" mm" goodWhenUp={false} words={["mm wider", "mm tighter"]} />
      ) : null}
    </View>
  );
}

/** One side: what it is ("First", "This result"), its day and where it came from, and its score per 10 shots. */
function Side({ point: p, label, onOpen, testID }: { point: EvaluationPoint; label: string; onOpen?: () => void; testID?: string }) {
  const colors = useColors();
  const sius = p.source === "sius";
  const said = `${label}, ${formatDateKey(p.dateKey, "medium")}, ${SOURCE_LABELS[p.source]}: ${one(p.wholePer10)} per 10 shots${sius ? `, ${one(p.per10)} in decimals` : ""}`;
  const body = (
    <>
      <T variant="tiny" tone="muted" style={styles.caps}>
        {label.toUpperCase()}
      </T>
      <View style={styles.when}>
        <T variant="small" tone="muted" style={styles.centerText}>
          {`${formatDateKey(p.dateKey, "medium")} · ${SOURCE_LABELS[p.source]}`}
        </T>
        {onOpen ? <ChevronRight size={13} color={colors.mutedForeground} /> : null}
      </View>
      <T variant="display" style={styles.number}>
        {one(p.wholePer10)}
      </T>
      <T variant="small" tone="muted" style={styles.centerText}>
        {`per 10 shots${sius ? ` · ${one(p.per10)} decimal` : ""}`}
      </T>
    </>
  );
  if (!onOpen) {
    return (
      <View style={[styles.side, styles.sideBox]} accessible accessibilityLabel={said} testID={testID}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`${said}. Opens it.`}
      style={({ pressed }) => [styles.side, styles.sideBox, pressed && { backgroundColor: colors.accent }]}
      testID={testID}
    >
      {body}
    </Pressable>
  );
}

/** A typed paper card in place of a target: its shots' places weren't kept. */
function Typed({ size }: { size: number }) {
  const colors = useColors();
  return (
    <View style={[styles.typed, { width: size, height: size, borderRadius: size / 2, borderColor: colors.border }]}>
      <PencilLine size={18} color={colors.mutedForeground} />
      <T variant="tiny" tone="muted" style={styles.centerText}>
        Typed card: where the shots landed isn’t kept
      </T>
    </View>
  );
}

/** A change as a pill: up is good (or smaller, for a group), with an arrow and the number, as the website shows it. */
function Change({ value, unit = "", goodWhenUp = true, size = "sm", label, testID }: { value: number; unit?: string; goodWhenUp?: boolean; size?: "sm" | "md"; label?: string; testID?: string }) {
  const colors = useColors();
  const good = value === 0 ? null : value > 0 === goodWhenUp;
  const fg = good === null ? colors.mutedForeground : good ? colors.success : colors.destructive;
  const bg = good === null ? colors.secondary : good ? colors.successTint : colors.destructiveTint;
  const Arrow = value === 0 ? ArrowRight : value > 0 ? ArrowUpRight : ArrowDownRight;
  const md = size === "md";
  return (
    <View style={[styles.change, md && styles.changeMd, { backgroundColor: bg }]} accessible={!!label} accessibilityLabel={label} testID={testID}>
      <Arrow size={md ? 15 : 12} color={fg} />
      <T variant={md ? "small" : "tiny"} style={[styles.changeText, { color: fg }]}>
        {value === 0 ? "No change" : `${signed(value)}${unit}`}
      </T>
    </View>
  );
}

/** A figure on both sides, "40% → 55%", and its change (`words` say it aloud: "points more", "points fewer"). */
function Fact({ label, from, to, change, unit, goodWhenUp = true, words }: { label: string; from: string; to: string; change: number; unit: string; goodWhenUp?: boolean; words: [up: string, down: string] }) {
  const colors = useColors();
  const said = `${label}: ${from} then ${to}, ${change === 0 ? "no change" : `${one(Math.abs(change))} ${change > 0 ? words[0] : words[1]}`}`;
  return (
    <View style={[styles.fact, { backgroundColor: colors.secondary }]} accessible accessibilityLabel={said}>
      <T variant="small" tone="muted" style={styles.grow}>
        {label}
      </T>
      <T variant="small" style={styles.number}>
        {`${from} → ${to}`}
      </T>
      <Change value={change} unit={unit} goodWhenUp={goodWhenUp} />
    </View>
  );
}

/** The position's results, newest first, to choose one side from (the other side's can't be chosen twice). */
function ChooseDialog({
  open,
  position,
  list,
  anchorId,
  current,
  other,
  onPick,
  onClose,
  testID,
}: {
  open: boolean;
  position: string;
  list: readonly EvaluationPoint[];
  anchorId: string;
  current: string;
  other: string;
  onPick: (id: string) => void;
  onClose: () => void;
  testID?: string;
}) {
  const colors = useColors();
  return (
    <Dialog
      open={open}
      onRequestClose={onClose}
      testID={testID}
      footer={
        <Button variant="ghost" onPress={onClose} testID={testID ? `${testID}-cancel` : undefined}>
          Cancel
        </Button>
      }
    >
      <View style={styles.dialogHead}>
        <T variant="heading">Choose a result</T>
        <T variant="small" tone="muted">{`Every ${position} result, newest first, with its score per 10 shots.`}</T>
      </View>
      <View style={[styles.options, { borderColor: colors.border }]}>
        {[...list].reverse().map((p, i) => {
          const on = p.id === current;
          const taken = p.id === other;
          const sius = p.source === "sius";
          const date = formatDateKey(p.dateKey, "medium");
          return (
            <Pressable
              key={p.id}
              disabled={taken}
              onPress={() => (on ? onClose() : onPick(p.id))}
              accessibilityRole="button"
              accessibilityState={{ selected: on, disabled: taken }}
              accessibilityLabel={`${date}${p.id === anchorId ? ", this result" : ""}, ${SOURCE_LABELS[p.source]}: ${one(p.wholePer10)} per 10 shots${taken ? ", already on the other side" : ""}`}
              style={({ pressed }) => [
                styles.option,
                i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
                pressed && { backgroundColor: colors.accent },
                taken && styles.taken,
              ]}
              testID={testID ? `${testID}-${p.id}` : undefined}
            >
              <View style={styles.grow}>
                <T variant="label" numberOfLines={1}>
                  {date}
                </T>
                <T variant="small" tone="muted" numberOfLines={1}>
                  {[p.id === anchorId ? "This result" : null, taken ? "On the other side" : null, SOURCE_LABELS[p.source], sius ? `${one(p.per10)} decimal` : `${p.shots} shots`].filter(Boolean).join(" · ")}
                </T>
              </View>
              <T variant="subheading" style={styles.number}>
                {one(p.wholePer10)}
              </T>
              <View style={styles.checkRoom}>{on ? <Check size={18} color={colors.foreground} /> : null}</View>
            </Pressable>
          );
        })}
      </View>
    </Dialog>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.md },
  head: { flexDirection: "row", alignItems: "center", gap: space.sm },
  grow: { flex: 1, gap: 2 },
  caps: { fontWeight: "700", letterSpacing: 0.6 },
  number: { fontVariant: ["tabular-nums"] },
  centerText: { textAlign: "center" },
  picks: { gap: space.sm },
  pick: { flexDirection: "row", alignItems: "center", gap: space.sm, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm },
  pair: { gap: space.md },
  sides: { flexDirection: "row", gap: space.lg },
  side: { flex: 1, alignItems: "center", gap: 2 },
  sideBox: { borderRadius: radius.md, paddingVertical: space.xs },
  when: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 2 },
  center: { alignItems: "center" },
  typed: { borderWidth: 1, borderStyle: "dashed", alignItems: "center", justifyContent: "center", gap: space.xs, padding: space.lg },
  change: { flexDirection: "row", alignItems: "center", gap: 2, borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 3 },
  changeMd: { gap: 4, paddingHorizontal: 12, paddingVertical: 5 },
  changeText: { fontWeight: "700", fontVariant: ["tabular-nums"] },
  fact: { flexDirection: "row", alignItems: "center", gap: space.sm, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm },
  dialogHead: { gap: 2 },
  options: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, overflow: "hidden" },
  option: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.md, paddingVertical: space.sm, minHeight: 56 },
  taken: { opacity: 0.45 },
  checkRoom: { width: 18, alignItems: "center" },
});
