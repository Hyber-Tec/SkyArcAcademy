import type { EvaluationPoint } from "@shared/reports/types";
import { POSITIONS, POSITION_COLORS, POSITION_LABELS } from "@shared/shooting/evaluation";
import { type DateKey, diffDays } from "@shared/time";
import { useState } from "react";
import { type LayoutChangeEvent, Pressable, StyleSheet, View } from "react-native";
import Svg, { Circle, Line, Path, Polyline, Text as SvgText } from "react-native-svg";
import { T } from "@/components/Text";
import { monthDay, shortDay } from "@/features/schedule/format";
import { radius, space } from "@/theme";
import { one } from "./format";

/**
 * The report's charts, drawn by hand in SVG as the website's are (web/src/features/reports/charts.tsx). The scores
 * over time and the shot counts sit on light paper in both appearances, as the printed report and the target do, so
 * the positions' colours always clear contrast (shared/src/shooting/evaluation.ts). Thin marks, solid hairline grids,
 * a legend for more than one line, labels only where they help; every value is also in the report's words and table.
 */

/** The report paper's ink (web/src/features/reports/paper.ts). */
export const INK = { primary: "#0b0b0b", secondary: "#52514e", muted: "#7d7a72", hairline: "#e3e1da", paper: "#ffffff" };
/** Shots by whole score, light to dark (one hue, an ordered ramp), as on the website. */
export const RING_COLORS = { lower: "#93b4e6", eights: "#5f91dc", nines: "#2f68c4", tens: "#163f8a" };

const useWidth = () => {
  const [width, setWidth] = useState(0);
  return [width, (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width))] as const;
};

/** A tiny trend line for a stat tile, as wide as the tile. */
export function Sparkline({ values, color, height = 18 }: { values: (number | null)[]; color: string; height?: number }) {
  const [width, onLayout] = useWidth();
  const v = values.filter((x): x is number => x !== null);
  if (v.length < 2) return <View style={{ height }} />;
  const min = Math.min(...v);
  const max = Math.max(...v);
  const span = max - min || 1;
  const points = v.map((x, i) => `${((i / (v.length - 1)) * (width - 4) + 2).toFixed(1)},${(height - 2 - ((x - min) / span) * (height - 4)).toFixed(1)}`).join(" ");
  return (
    <View style={{ height }} onLayout={onLayout} accessible={false}>
      {width ? (
        <Svg width={width} height={height}>
          <Polyline points={points} fill="none" stroke={color} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
        </Svg>
      ) : null}
    </View>
  );
}

export interface TrendSeries {
  key: string;
  label: string;
  color: string;
  points: { dateKey: DateKey; value: number; detail?: string }[];
}

/**
 * The scores-over-time lines: one per position, whole scores per 10 shots (the reports' scale, where SIUS results and
 * paper cards compare), a SIUS result's decimal in its readout.
 */
export function trendSeries(points: readonly Pick<EvaluationPoint, "position" | "dateKey" | "wholePer10" | "per10" | "source">[]): TrendSeries[] {
  return POSITIONS.map((pos) => ({
    key: pos,
    label: POSITION_LABELS[pos],
    color: POSITION_COLORS[pos],
    points: points.filter((p) => p.position === pos).map((p) => ({ dateKey: p.dateKey, value: p.wholePer10, detail: p.source === "sius" ? `${one(p.per10)} decimal` : "paper card" })),
  })).filter((s) => s.points.length);
}

/** Clean bounds around the values (scores per 10 shots, at most 100 when whole), at least 10 apart. */
function yBounds(values: number[], cap: number) {
  if (!values.length) return { lo: 0, hi: cap };
  let lo = Math.max(0, Math.floor((Math.min(...values) - 3) / 5) * 5);
  let hi = Math.min(cap, Math.ceil((Math.max(...values) + 2) / 5) * 5);
  if (hi - lo < 10) {
    lo = Math.max(0, hi - 10);
    if (hi - lo < 10) hi = lo + 10;
  }
  return { lo, hi };
}

/**
 * Scores over the period, one line per position on one axis, with the latest value of each line at its end. Tapping
 * the chart reads out every position's score on the nearest date (tap the readout, or the same date, to clear it).
 */
export function TrendChart({ series, from, to, cap = 100, height = 190, testID }: { series: TrendSeries[]; from: DateKey; to: DateKey; cap?: number; height?: number; testID?: string }) {
  const [width, onLayout] = useWidth();
  const [active, setActive] = useState<DateKey | null>(null);
  const L = 30;
  const R = Math.max(L + 40, width - 30);
  const T_ = 12;
  const B = height - 24;
  const span = Math.max(1, diffDays(from, to));
  const x = (d: DateKey) => L + (Math.min(span, Math.max(0, diffDays(from, d))) / span) * (R - L);
  const { lo, hi } = yBounds(
    series.flatMap((s) => s.points.map((p) => p.value)),
    cap,
  );
  const y = (v: number) => B - ((v - lo) / (hi - lo || 1)) * (B - T_);
  const step = hi - lo <= 20 ? 5 : 10;
  const ticks: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) ticks.push(t);
  const dates = [...new Set(series.flatMap((s) => s.points.map((p) => p.dateKey)))].sort();

  // Date labels: the first and last day, and the scores' dates in between where they have room.
  const labels: DateKey[] = [];
  for (const d of [from, ...dates, to]) {
    if (labels.includes(d)) continue;
    if (labels.some((l) => Math.abs(x(l) - x(d)) < 52)) {
      if (d === to) {
        labels.pop();
        labels.push(d);
      }
      continue;
    }
    labels.push(d);
  }
  // The latest value of each line at its end, where they don't collide.
  const ends = series
    .filter((s) => s.points.length)
    .map((s) => ({ s, last: s.points[s.points.length - 1] }))
    .sort((a, b) => y(a.last.value) - y(b.last.value));
  const endLabels = ends.filter((e, i) => i === 0 || Math.abs(y(e.last.value) - y(ends[i - 1].last.value)) >= 13);

  const pick = (px: number) => {
    let best: DateKey | null = null;
    let dist = Infinity;
    for (const d of dates) {
      const dx = Math.abs(x(d) - px);
      if (dx < dist) {
        dist = dx;
        best = d;
      }
    }
    setActive((a) => (a === best ? null : best));
  };
  const here = active ? series.flatMap((s) => s.points.filter((p) => p.dateKey === active).map((p) => ({ s, p }))) : [];

  return (
    <View style={styles.chart} testID={testID}>
      <Pressable
        onLayout={onLayout}
        onPress={(e) => pick(e.nativeEvent.locationX)}
        accessibilityRole="image"
        accessibilityLabel={`Scores per 10 shots from ${monthDay(from)} to ${monthDay(to)}: ${series.map((s) => `${s.label} ${s.points.map((p) => one(p.value)).join(", ")}`).join("; ")}`}
        accessibilityHint="Tap a date to read its scores"
      >
        {width ? (
          <Svg width={width} height={height}>
            {ticks.map((t) => (
              <Line key={`g${t}`} x1={L} x2={R} y1={y(t)} y2={y(t)} stroke={INK.hairline} strokeWidth={1} />
            ))}
            {ticks.map((t) => (
              <SvgText key={`t${t}`} x={L - 7} y={y(t) + 3.5} textAnchor="end" fontSize={10} fill={INK.muted}>
                {t}
              </SvgText>
            ))}
            {labels.map((d) => (
              <SvgText key={`d${d}`} x={x(d)} y={height - 6} textAnchor={d === from ? "start" : d === to ? "end" : "middle"} fontSize={10} fill={INK.muted}>
                {monthDay(d)}
              </SvgText>
            ))}
            {active ? <Line x1={x(active)} x2={x(active)} y1={T_ - 4} y2={B} stroke={INK.secondary} strokeWidth={1} opacity={0.5} /> : null}
            {series.map((s) =>
              s.points.length > 1 ? (
                <Path
                  key={`l${s.key}`}
                  d={s.points.map((p, i) => `${i ? "L" : "M"}${x(p.dateKey).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ")}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ) : null,
            )}
            {series.flatMap((s) =>
              s.points.map((p, i) => <Circle key={`p${s.key}${i}`} cx={x(p.dateKey)} cy={y(p.value)} r={active === p.dateKey ? 5.5 : 4} fill={s.color} stroke={INK.paper} strokeWidth={2} />),
            )}
            {endLabels.map(({ s, last }) => (
              <SvgText key={`e${s.key}`} x={Math.min(R + 5, x(last.dateKey) + 8)} y={y(last.value) + 3.5} fontSize={11} fontWeight="600" fill={INK.secondary}>
                {one(last.value)}
              </SvgText>
            ))}
          </Svg>
        ) : (
          <View style={{ height }} />
        )}
      </Pressable>
      {active ? (
        <Pressable onPress={() => setActive(null)} style={styles.readout} accessibilityRole="button" accessibilityLabel="Clear the chosen date" testID="report-chart-readout">
          <T variant="tiny" style={{ color: INK.muted }}>
            {shortDay(active)}
          </T>
          {here.map(({ s, p }, i) => (
            <View key={`${s.key}${i}`} style={styles.readoutRow}>
              <View style={[styles.key, { backgroundColor: s.color }]} />
              <T variant="small" style={[styles.strong, { color: INK.primary }]}>
                {one(p.value)}
              </T>
              <T variant="small" style={{ color: INK.secondary }}>
                {s.label}
              </T>
              {p.detail ? (
                <T variant="small" style={{ color: INK.muted }}>
                  {p.detail}
                </T>
              ) : null}
            </View>
          ))}
        </Pressable>
      ) : null}
      {series.length > 1 ? <Legend items={series.map((s) => ({ key: s.key, label: s.label, color: s.color }))} /> : null}
    </View>
  );
}

/** A legend whose keys mirror the marks (short lines for lines, squares for bars); its words stay in ink. */
export function Legend({ items, shape = "line" }: { items: { key: string; label: string; color: string; value?: string }[]; shape?: "line" | "square" }) {
  return (
    <View style={styles.legend}>
      {items.map((i) => (
        <View key={i.key} style={styles.legendItem}>
          <View style={[shape === "line" ? styles.key : styles.square, { backgroundColor: i.color }]} />
          <T variant="small" style={{ color: INK.secondary }}>
            {i.label}
          </T>
          {i.value ? (
            <T variant="small" style={[styles.strong, { color: INK.primary }]}>
              {i.value}
            </T>
          ) : null}
        </View>
      ))}
    </View>
  );
}

/** Every counted shot by whole score, as one bar (2 points between its parts) with a legend of the counts. */
export function DistributionBar({ tens, nines, eights, lower }: { tens: number; nines: number; eights: number; lower: number }) {
  const total = tens + nines + eights + lower;
  if (!total) return null;
  const parts = [
    { key: "tens", label: "10", n: tens, color: RING_COLORS.tens },
    { key: "nines", label: "9", n: nines, color: RING_COLORS.nines },
    { key: "eights", label: "8", n: eights, color: RING_COLORS.eights },
    { key: "lower", label: "7 or less", n: lower, color: RING_COLORS.lower },
  ];
  const pct = (n: number) => `${Math.round((n / total) * 1000) / 10}%`;
  const shown = parts.filter((p) => p.n > 0);
  return (
    <View testID="report-distribution">
      <View style={styles.bar} accessible accessibilityRole="image" accessibilityLabel={parts.map((p) => `${p.label}: ${p.n} shots`).join(", ")}>
        {shown.map((p, i) => (
          <View
            key={p.key}
            style={[
              { flex: p.n, backgroundColor: p.color },
              i === 0 && styles.barStart,
              i === shown.length - 1 && styles.barEnd,
              i > 0 && { marginLeft: 2 },
            ]}
          />
        ))}
      </View>
      <Legend shape="square" items={parts.map((p) => ({ key: p.key, label: p.label, color: p.color, value: `${p.n} · ${pct(p.n)}` }))} />
    </View>
  );
}

const styles = StyleSheet.create({
  chart: { gap: space.sm },
  readout: { borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: INK.hairline, backgroundColor: INK.paper, paddingHorizontal: space.md, paddingVertical: space.sm, gap: 2 },
  readoutRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  strong: { fontWeight: "600", fontVariant: ["tabular-nums"] },
  legend: { flexDirection: "row", flexWrap: "wrap", columnGap: space.lg, rowGap: 4, marginTop: space.sm },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  key: { width: 14, height: 2, borderRadius: 1 },
  square: { width: 10, height: 10, borderRadius: 3 },
  bar: { flexDirection: "row", height: 12, borderRadius: radius.full, overflow: "hidden" },
  barStart: { borderTopLeftRadius: radius.full, borderBottomLeftRadius: radius.full },
  barEnd: { borderTopRightRadius: radius.full, borderBottomRightRadius: radius.full },
});
