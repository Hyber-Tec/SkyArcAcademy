import { Canvas } from "@shopify/react-native-skia";
import { dateText } from "@shared/i18n";
import type { EvaluationPoint, PositionFacts } from "@shared/reports/types";
import { POSITION_COLORS, pointOf } from "@shared/shooting/evaluation";
import { type ShotPoint, meanPoint, targetViewMm } from "@shared/shooting/target";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react-native";
import type { ComponentType, ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Card } from "@/components/Card";
import { ListRow, ListSection } from "@/components/List";
import { T } from "@/components/Text";
import { MpiMark, ShotDot, TargetFace } from "@/features/scores/Target";
import { positionLabel, sourceLabel } from "@/features/scores/words";
import { useLang, useT } from "@/lib/lang";
import { radius, space, useColors } from "@/theme";
import { INK } from "./charts";
import { one, signed } from "./format";

/** Pieces of a report's screen (ReportBody.tsx, the family's and the staff's), as the website's report has them. */

export interface Tile {
  label: string;
  value: string;
  spark?: ReactNode;
  sub: { text: string; tone: "up" | "down" | "flat" } | null;
  testID?: string;
}

/** A figure of the period: what it is, the number, a small trend line where it has one, and a line under it. */
export function StatTile({ tile: t }: { tile: Tile }) {
  const colors = useColors();
  const Arrow = t.sub?.tone === "up" ? ArrowUpRight : t.sub?.tone === "down" ? ArrowDownRight : null;
  const tone = t.sub?.tone === "up" ? colors.success : t.sub?.tone === "down" ? colors.destructive : colors.mutedForeground;
  return (
    <Card style={styles.tile} testID={t.testID}>
      <T variant="small" tone="muted" numberOfLines={2} style={styles.tileLabel}>
        {t.label}
      </T>
      <T variant="stat" numberOfLines={1} adjustsFontSizeToFit>
        {t.value}
      </T>
      {t.spark ?? <View style={styles.sparkSpace} />}
      {t.sub ? (
        <View style={styles.tileSub}>
          {Arrow ? <Arrow size={13} color={tone} /> : null}
          <T variant="tiny" style={[styles.shrink, { color: tone }]} numberOfLines={2}>
            {t.sub.text}
          </T>
        </View>
      ) : null}
    </Card>
  );
}

/** The tiles two by two, as wide as the screen allows. */
export function TileGrid({ tiles }: { tiles: Tile[] }) {
  const rows: Tile[][] = [];
  for (let i = 0; i < tiles.length; i += 2) rows.push(tiles.slice(i, i + 2));
  return (
    <View style={styles.grid} testID="report-tiles">
      {rows.map((row) => (
        <View key={row.map((t) => t.label).join()} style={styles.gridRow}>
          {row.map((t) => (
            <View key={t.label} style={styles.gridCell}>
              <StatTile tile={t} />
            </View>
          ))}
          {row.length === 1 ? <View style={styles.gridCell} /> : null}
        </View>
      ))}
    </View>
  );
}

/** A section's heading with its icon in the brand's tint, as the website's report headings. */
export function Heading({ icon: Icon, children, testID }: { icon: ComponentType<{ size?: number; color?: string }>; children: string; testID?: string }) {
  const colors = useColors();
  return (
    <View style={styles.heading} testID={testID}>
      <View style={[styles.headingIcon, { backgroundColor: colors.brandTint }]}>
        <Icon size={16} color={colors.brandText} />
      </View>
      <T variant="heading" accessibilityRole="header" style={styles.shrink}>
        {children}
      </T>
    </View>
  );
}

/**
 * A result's shots on a still target (the comparison's), on the target's light paper with the average point; a typed
 * paper card says its shots' places weren't recorded.
 */
export function StillTarget({ point, size, color }: { point: EvaluationPoint; size: number; color: string }) {
  const t = useT();
  const placed = point.marks.map(pointOf).filter((p): p is ShotPoint => p !== null);
  if (!placed.length) {
    return (
      <View style={[styles.noPlace, { width: size, height: size, borderRadius: size / 2, borderColor: INK.hairline }]}>
        <T variant="tiny" style={[styles.center, { color: INK.muted }]}>
          {t("Paper card: where the shots landed isn’t recorded", "종이 표적지라 탄착 위치가 없어요")}
        </T>
      </View>
    );
  }
  const view = targetViewMm(placed, size);
  const mpi = placed.length >= 2 ? meanPoint(placed) : null;
  return (
    <Canvas style={{ width: size, height: size }} accessibilityLabel={t(`${placed.length} shots on the target`, `표적 위 ${placed.length}발`)} accessible>
      <TargetFace view={view} size={size}>
        {placed.map((p, i) => (
          <ShotDot key={i} point={p} color={color} view={view} size={size} />
        ))}
        {mpi ? <MpiMark point={mpi} view={view} /> : null}
      </TargetFace>
    </Canvas>
  );
}

/** A change between two results as a small pill: up is good (or smaller, for a group), with an arrow and words. */
function Delta({ value, unit = "", goodWhenUp = true }: { value: number; unit?: string; goodWhenUp?: boolean }) {
  const colors = useColors();
  const t = useT();
  const good = value === 0 ? null : value > 0 === goodWhenUp;
  const fg = good === null ? colors.mutedForeground : good ? colors.success : colors.destructive;
  const bg = good === null ? colors.secondary : good ? colors.successTint : colors.destructiveTint;
  const Arrow = value === 0 ? ArrowRight : value > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <View style={[styles.delta, { backgroundColor: bg }]}>
      <Arrow size={12} color={fg} />
      <T variant="tiny" style={{ color: fg, fontWeight: "700", fontVariant: ["tabular-nums"] }}>
        {value === 0 ? t("No change", "변화 없음") : `${signed(value)}${unit}`}
      </T>
    </View>
  );
}

const pct = (p: EvaluationPoint) => (p.innerTens !== null && p.shots ? Math.round((p.innerTens / p.shots) * 100) : null);

/** The first and the latest result of one position side by side: the scores, the change, and both targets. */
export function Comparison({ a, b, width }: { a: EvaluationPoint; b: EvaluationPoint; width: number }) {
  const colors = useColors();
  const t = useT();
  const lang = useLang();
  const color = POSITION_COLORS[b.position];
  const change = Math.round((b.wholePer10 - a.wholePer10) * 10) / 10;
  const tens = pct(a) !== null && pct(b) !== null ? (pct(b) as number) - (pct(a) as number) : null;
  const group = a.groupMm !== null && b.groupMm !== null ? Math.round((b.groupMm - a.groupMm) * 10) / 10 : null;
  const size = Math.min(150, Math.floor((width - space.lg) / 2));
  const side = (p: EvaluationPoint, label: string) => (
    <View style={styles.side}>
      <T variant="tiny" tone="muted" style={styles.caps}>
        {label.toUpperCase()}
      </T>
      <T variant="small" tone="muted">
        {dateText(p.dateKey, "medium", lang)} · {p.source === "sius" ? "SIUS" : sourceLabel("paper", lang)}
      </T>
      <T variant="display" style={styles.number}>
        {one(p.wholePer10)}
      </T>
      <T variant="small" tone="muted">
        {t(`per 10 shots${p.source === "sius" ? ` · ${one(p.per10)} decimal` : ""}`, `10발 평균${p.source === "sius" ? ` · 소수점 ${one(p.per10)}` : ""}`)}
      </T>
    </View>
  );
  const targets = [a, b].some((p) => p.marks.some((m) => pointOf(m) !== null));
  return (
    <Card style={styles.compare} testID="report-comparison">
      <View style={styles.sides}>
        {side(a, t("First", "첫 기록"))}
        {side(b, t("Latest", "최근 기록"))}
      </View>
      <View style={styles.deltaRow}>
        <Delta value={change} />
      </View>
      {targets ? (
        <View style={[styles.sides, styles.paper]}>
          <View style={styles.side}>
            <StillTarget point={a} size={size} color={color} />
          </View>
          <View style={styles.side}>
            <StillTarget point={b} size={size} color={color} />
          </View>
        </View>
      ) : null}
      {tens !== null ? (
        <View style={[styles.fact, { backgroundColor: colors.secondary }]}>
          <T variant="small" tone="muted" style={styles.shrink}>
            {t("Inner tens", "이너 텐")}
          </T>
          <T variant="small" style={styles.number}>
            {pct(a)}% → {pct(b)}%
          </T>
          <Delta value={tens} unit={t(" pts", "%p")} />
        </View>
      ) : null}
      {group !== null ? (
        <View style={[styles.fact, { backgroundColor: colors.secondary }]}>
          <T variant="small" tone="muted" style={styles.shrink}>
            {t("Group size", "탄착군 크기")}
          </T>
          <T variant="small" style={styles.number}>
            {one(a.groupMm as number)} → {one(b.groupMm as number)}
            {t(" mm", "mm")}
          </T>
          <Delta value={group} unit={t(" mm", "mm")} goodWhenUp={false} />
        </View>
      ) : null}
    </Card>
  );
}

/** Every position's figures, a row each: the table twin of the charts. */
export function PositionRows({ positions }: { positions: PositionFacts[] }) {
  const colors = useColors();
  const t = useT();
  const lang = useLang();
  return (
    <ListSection
      title={t("By position", "자세별 기록")}
      footer={t(
        "Scores are per 10 shots: whole numbers out of 100 for every result, and decimals (out of 109) for SIUS results.",
        "점수는 10발 평균이에요. 모든 기록은 정수로 100점 만점이고, SIUS 기록은 소수점으로 109점 만점이에요.",
      )}
      testID="report-positions"
    >
      {positions.map((p) => {
        const facts = (
          lang === "ko"
            ? [
                `기록 ${p.evaluations}개`,
                p.best ? `최고 ${one(p.best.wholePer10)} (${dateText(p.best.dateKey, "monthDay", "ko")})` : null,
                p.latest ? `최근 ${one(p.latest.wholePer10)}` : null,
                p.decimal !== null ? `소수점 ${one(p.decimal)}` : null,
                p.innerTensPct !== null ? `이너 텐 ${p.innerTensPct}%` : null,
                p.groupMm !== null ? `탄착군 ${one(p.groupMm)}mm` : null,
              ]
            : [
                `${p.evaluations} ${p.evaluations === 1 ? "evaluation" : "evaluations"}`,
                p.best ? `best ${one(p.best.wholePer10)} on ${dateText(p.best.dateKey, "monthDay", "en")}` : null,
                p.latest ? `latest ${one(p.latest.wholePer10)}` : null,
                p.decimal !== null ? `decimal ${one(p.decimal)}` : null,
                p.innerTensPct !== null ? `inner tens ${p.innerTensPct}%` : null,
                p.groupMm !== null ? `group ${one(p.groupMm)} mm` : null,
              ]
        ).filter(Boolean);
        return (
          <ListRow
            key={p.position}
            icon={<View style={[styles.dot, { backgroundColor: POSITION_COLORS[p.position], borderColor: colors.card }]} />}
            title={positionLabel(p.position, lang)}
            subtitle={
              <T variant="small" tone="muted">
                {facts.map((x) => x!.replace(/ /g, "\u00a0")).join(" · ")}
              </T>
            }
            right={
              <View style={styles.average}>
                <T variant="subheading" style={styles.number}>
                  {p.average !== null ? one(p.average) : "–"}
                </T>
                <T variant="tiny" tone="muted">
                  {t("average", "평균")}
                </T>
              </View>
            }
            testID={`report-position-${p.position}`}
          />
        );
      })}
    </ListSection>
  );
}

const styles = StyleSheet.create({
  shrink: { flexShrink: 1 },
  center: { textAlign: "center" },
  number: { fontVariant: ["tabular-nums"] },
  caps: { fontWeight: "700", letterSpacing: 0.6 },
  grid: { gap: space.md },
  gridRow: { flexDirection: "row", gap: space.md },
  gridCell: { flex: 1 },
  tile: { flex: 1, gap: 4, padding: space.md },
  tileLabel: { minHeight: 34, fontWeight: "500" },
  tileSub: { flexDirection: "row", alignItems: "flex-start", gap: 3 },
  sparkSpace: { height: 18 },
  heading: { flexDirection: "row", alignItems: "center", gap: space.sm },
  headingIcon: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  noPlace: { borderWidth: 1, borderStyle: "dashed", alignItems: "center", justifyContent: "center", padding: space.lg },
  delta: { flexDirection: "row", alignItems: "center", gap: 2, borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 3, alignSelf: "center" },
  compare: { gap: space.md },
  sides: { flexDirection: "row", gap: space.lg },
  side: { flex: 1, alignItems: "center", gap: 2 },
  deltaRow: { alignItems: "center" },
  paper: { paddingVertical: space.xs },
  fact: { flexDirection: "row", alignItems: "center", gap: space.sm, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2 },
  average: { alignItems: "flex-end" },
});
