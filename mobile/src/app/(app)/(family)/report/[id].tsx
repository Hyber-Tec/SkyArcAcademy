import { DEFAULT_REPORT_OPTIONS, type EvaluationPoint } from "@shared/reports/types";
import { POSITIONS, POSITION_COLORS, POSITION_LABELS, type Position, pointOf } from "@shared/shooting/evaluation";
import { router, useLocalSearchParams } from "expo-router";
import { ArrowRight, Check, Crosshair, FileX2, Flag, MessageSquareQuote, Target } from "lucide-react-native";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { SkyArcLogo } from "@/components/brand/SkyArc";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { Screen } from "@/components/Screen";
import { SegmentedControl } from "@/components/SegmentedControl";
import { Skeleton } from "@/components/Skeleton";
import { T } from "@/components/Text";
import { type ReportDoc, recordReportView, useReport } from "@/features/family/data";
import { DistributionBar, INK, Sparkline, TrendChart, type TrendSeries } from "@/features/reports/charts";
import { evaluationsText, one, preparedOn, signed } from "@/features/reports/format";
import { Comparison, Heading, PositionRows, type Tile, TileGrid } from "@/features/reports/ReportParts";
import { TrendChip } from "@/features/reports/TrendChip";
import { hasPlacedShots, playPoints } from "@/features/scores/playback";
import { ShotReplay } from "@/features/scores/ShotReplay";
import { useBranch } from "@/state/BranchProvider";
import { radius, space, useColors, useIsDark } from "@/theme";

/**
 * A progress report, on its own screen (loaded by ID, so a link opens it too): whose it is and the period, how the
 * scores went (when the report shows it), the period's figures, the coach's words, the scores over time, the period's
 * shots played back on the target, each position's figures, the first and latest results side by side, and the goals.
 * The report's options decide what shows, as on the website (web/src/features/reports/ReportDocument.tsx). A family's
 * opening is recorded once, so the academy sees "Viewed".
 */
export default function FamilyReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { branchId, actor, role, name } = useBranch();
  const colors = useColors();
  const report = useReport(id ?? null);
  const r = report.data;
  const visible = !!r && r.sharedWithParents === true;

  useEffect(() => {
    if (visible && r) void recordReportView(branchId, r.id, actor.email, role);
  }, [visible, r, branchId, actor.email, role]);

  if (report.loading) {
    return (
      <Screen typing={false} testID="report-screen">
        <Skeleton height={170} rounded={radius.lg} />
        <Skeleton height={220} rounded={radius.lg} />
        <Skeleton height={120} rounded={radius.lg} />
      </Screen>
    );
  }
  if (!r || !visible) {
    return (
      <Screen typing={false} testID="report-screen">
        <EmptyState
          icon={<FileX2 size={26} color={colors.mutedForeground} />}
          title="Report not available"
          text={`It may have been taken back to be changed. Ask ${name} if you were expecting it.`}
          action={
            <Button variant="outline" onPress={() => (router.canGoBack() ? router.back() : router.replace("/reports"))} testID="report-back">
              Back to reports
            </Button>
          }
        />
      </Screen>
    );
  }
  return <ReportBody r={r} />;
}

/** The position with the most results (ties: the better average). */
function mainPosition(r: ReportDoc): Position | null {
  return [...r.facts.positions].sort((a, b) => b.evaluations - a.evaluations || (b.average ?? 0) - (a.average ?? 0))[0]?.position ?? null;
}

/** The scores-over-time lines: one per position, whole scores per 10 shots. */
function trendSeries(points: readonly EvaluationPoint[]): TrendSeries[] {
  return POSITIONS.map((pos) => ({
    key: pos,
    label: POSITION_LABELS[pos],
    color: POSITION_COLORS[pos],
    points: points.filter((p) => p.position === pos).map((p) => ({ dateKey: p.dateKey, value: p.wholePer10, detail: p.source === "sius" ? `${one(p.per10)} decimal` : "paper card" })),
  })).filter((s) => s.points.length);
}

function ReportBody({ r }: { r: ReportDoc }) {
  const { timezone } = useBranch();
  const colors = useColors();
  const dark = useIsDark();
  const { width } = useWindowDimensions();
  const f = r.facts;
  const o = { ...DEFAULT_REPORT_OPTIONS, ...r.options };
  const n = r.narrative;
  const series = useMemo(() => r.series ?? [], [r.series]);
  const sius = series.filter((p) => p.source === "sius");
  const level = o.showStatus ? (f.trend?.level ?? null) : null;
  const inner = width - space.lg * 4;

  // The positions whose shots have places on the target (SIUS, and cards scanned with the app), the most shots first.
  const targets = useMemo(
    () =>
      POSITIONS.map((pos) => {
        const points = series.filter((p) => p.position === pos && hasPlacedShots(p));
        return { pos, points, shots: points.reduce((k, p) => k + p.marks.filter((m) => pointOf(m) !== null).length, 0) };
      })
        .filter((t) => t.shots > 0)
        .sort((a, b) => b.shots - a.shots),
    [series],
  );
  const [chosen, setChosen] = useState<Position | null>(null);
  const target = targets.find((t) => t.pos === chosen) ?? targets[0] ?? null;
  const shots = useMemo(() => (target ? playPoints(target.points) : []), [target]);
  const counted = f.distribution.tens + f.distribution.nines + f.distribution.eights + f.distribution.lower;
  const showTargets = o.showTargets && (!!target || counted > 0);
  const main = mainPosition(r);
  const compare = main ? series.filter((p) => p.position === main) : [];

  const prevShort = f.previous ? (/^[A-Z][a-z]+ \d{4}$/.test(f.previous.periodLabel) ? f.previous.periodLabel.slice(0, 3) : "the last report") : null;
  const spark = (values: (number | null)[]) => <Sparkline values={values} color={colors.brandText} />;
  const tiles: Tile[] = [
    { label: "Evaluations", value: String(f.evaluations.total), sub: { text: `${f.evaluations.shots} scored shots`, tone: "flat" }, testID: "report-tile-evaluations" },
    ...(f.average !== null
      ? [
          {
            label: "Average per 10 shots",
            value: one(f.average),
            spark: spark(series.map((p) => p.wholePer10)),
            sub:
              f.deltaAverage !== null && prevShort
                ? { text: f.deltaAverage === 0 ? `same as ${prevShort}` : `${signed(f.deltaAverage)} vs. ${prevShort}`, tone: f.deltaAverage > 0 ? ("up" as const) : f.deltaAverage < 0 ? ("down" as const) : ("flat" as const) }
                : { text: "out of 100", tone: "flat" as const },
            testID: "report-tile-average",
          },
        ]
      : []),
    ...(f.decimal !== null ? [{ label: "Decimal average", value: one(f.decimal), spark: spark(sius.map((p) => p.per10)), sub: { text: "SIUS results, out of 109", tone: "flat" as const } }] : []),
    ...(f.innerTensPct !== null
      ? [{ label: "Inner tens", value: `${f.innerTensPct}%`, spark: spark(sius.map((p) => (p.innerTens !== null && p.shots ? (p.innerTens / p.shots) * 100 : null))), sub: { text: "shots of 10.2 or better", tone: "flat" as const } }]
      : []),
    ...(f.groupMm !== null ? [{ label: "Group size", value: `${one(f.groupMm)} mm`, spark: spark(sius.map((p) => p.groupMm)), sub: { text: "average; smaller is tighter", tone: "flat" as const } }] : []),
    ...(o.showAttendance && f.attendance.percent !== null
      ? [{ label: "Attendance", value: `${f.attendance.percent}%`, sub: { text: `${f.attendance.attended} of ${f.attendance.attended + f.attendance.missed} classes`, tone: "flat" as const }, testID: "report-tile-attendance" }]
      : []),
  ];

  const contact = [r.snapshot?.academyName, r.snapshot?.contact?.phone, r.snapshot?.contact?.email, r.snapshot?.contact?.website].filter(Boolean).join(" · ");
  const prepared = preparedOn(r, timezone);
  const strengths = (n.strengths ?? []).filter((s) => s.trim());
  const focus = (n.focusAreas ?? []).filter((s) => s.trim());
  const goals = (n.goals ?? []).filter((g) => g.goal.trim() || g.measure.trim());
  // Charts sit on the report's light paper in both appearances (their colours are checked against it).
  const paper = { backgroundColor: INK.paper, borderColor: dark ? "transparent" : colors.border };

  return (
    <Screen typing={false} testID="report-screen">
      <Card style={styles.hero} testID="report-hero">
        <SkyArcLogo height={40} />
        <T variant="tiny" tone="muted" style={styles.kicker} numberOfLines={2}>
          {(r.customName || "Progress report").toUpperCase()} · {r.period.label.toUpperCase()}
        </T>
        <T variant="title" testID="report-student">
          {r.student?.name || r.studentName}
        </T>
        <T variant="small" tone="muted">
          {[r.student?.level ? `Level: ${r.student.level}` : "", r.student?.program ? `Program: ${r.student.program}` : "", evaluationsText(f.evaluations.total)].filter(Boolean).join(" · ")}
        </T>
        {level ? (
          <View style={styles.trend}>
            <TrendChip level={level} testID="report-trend" />
            <T variant="tiny" tone="muted">
              From the scores across the period
            </T>
          </View>
        ) : null}
      </Card>

      <TileGrid tiles={tiles} />

      {n.overview?.trim() ? (
        <Section>
          <Heading icon={Crosshair}>This period at a glance</Heading>
          <Card>
            <T style={styles.prose} testID="report-overview">
              {n.overview.trim()}
            </T>
          </Card>
        </Section>
      ) : null}

      {strengths.length ? (
        <View style={[styles.box, { backgroundColor: colors.successTint }]} testID="report-strengths">
          <T variant="label" style={{ color: colors.success }}>
            Strengths
          </T>
          {strengths.map((s, i) => (
            <View key={i} style={styles.point}>
              <Check size={16} color={colors.success} style={styles.pointIcon} />
              <T style={[styles.prose, styles.shrink]}>{s}</T>
            </View>
          ))}
        </View>
      ) : null}
      {focus.length ? (
        <View style={[styles.box, { backgroundColor: colors.warningTint }]} testID="report-focus">
          <T variant="label" style={{ color: colors.warning }}>
            Focus areas
          </T>
          {focus.map((s, i) => (
            <View key={i} style={styles.point}>
              <ArrowRight size={16} color={colors.warning} style={styles.pointIcon} />
              <T style={[styles.prose, styles.shrink]}>{s}</T>
            </View>
          ))}
        </View>
      ) : null}

      {series.length >= 2 ? (
        <Card style={styles.gap} testID="report-chart">
          <View style={styles.cardHead}>
            <T variant="label" style={styles.grow}>
              Scores over time
            </T>
            <T variant="small" tone="muted">
              per 10 shots
            </T>
          </View>
          <View style={[styles.paper, paper]}>
            <TrendChart series={trendSeries(series)} from={r.period.from} to={r.period.to} />
          </View>
          <T variant="tiny" tone="muted">
            Tap the chart to read a date’s scores.
          </T>
        </Card>
      ) : null}

      {showTargets ? (
        <Card style={styles.gap} testID="report-targets">
          <T variant="label">Where the shots went</T>
          {targets.length > 1 ? (
            <SegmentedControl<Position> value={target?.pos ?? targets[0].pos} onChange={setChosen} options={targets.map((t) => ({ value: t.pos, label: POSITION_LABELS[t.pos] }))} testID="report-position" />
          ) : null}
          {target ? (
            <View style={styles.replay}>
              <ShotReplay
                key={target.pos}
                shots={shots}
                color={POSITION_COLORS[target.pos]}
                size={Math.min(inner, 340)}
                caption={`${POSITION_LABELS[target.pos]} · ${target.shots} shots in ${target.points.length} ${target.points.length === 1 ? "result" : "results"} · the cross marks the average`}
              />
            </View>
          ) : null}
          {counted ? (
            <View style={[styles.paper, paper]}>
              <T variant="small" style={[styles.paperTitle, { color: INK.secondary }]}>
                Every counted shot by score
              </T>
              <DistributionBar {...f.distribution} />
            </View>
          ) : null}
        </Card>
      ) : null}

      {f.positions.length ? <PositionRows positions={f.positions} /> : null}

      {o.showComparison && compare.length >= 2 && main ? (
        <Section>
          <Heading icon={Target}>{`First vs latest · ${POSITION_LABELS[main]}`}</Heading>
          <Comparison a={compare[0]} b={compare[compare.length - 1]} width={inner} />
        </Section>
      ) : null}

      {goals.length ? (
        <Section testID="report-goals">
          <Heading icon={Flag}>Goals for next period</Heading>
          <Card style={styles.goals}>
            {goals.map((g, i) => (
              <View key={i} style={[styles.goal, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: space.md }]}>
                <View style={[styles.goalN, { backgroundColor: colors.brandTint }]}>
                  <T variant="small" style={{ color: colors.brandText, fontWeight: "700" }}>
                    {i + 1}
                  </T>
                </View>
                <View style={styles.grow}>
                  {g.goal.trim() ? <T variant="label">{g.goal.trim()}</T> : null}
                  {g.measure.trim() ? (
                    <T variant="small" tone="muted">
                      {g.measure.trim()}
                    </T>
                  ) : null}
                </View>
              </View>
            ))}
          </Card>
        </Section>
      ) : null}

      {n.coachNote?.trim() ? (
        <View style={[styles.quote, { backgroundColor: colors.card, borderColor: colors.border, borderLeftColor: colors.brand }]} testID="report-note">
          <View style={styles.cardHead}>
            <MessageSquareQuote size={16} color={colors.brandText} />
            <T variant="label" style={styles.shrink}>
              A note from the coach
            </T>
          </View>
          <T style={styles.prose}>“{n.coachNote.trim()}”</T>
        </View>
      ) : null}

      <View style={styles.footer} testID="report-footer">
        {contact ? (
          <T variant="small" tone="muted" style={styles.center}>
            {contact}
          </T>
        ) : null}
        <T variant="small" tone="muted" style={styles.center}>
          Questions about this report? We’re happy to talk.{prepared ? ` Prepared ${prepared}.` : ""}
        </T>
      </View>
    </Screen>
  );
}

function Section({ children, testID }: { children: ReactNode; testID?: string }) {
  return (
    <View style={styles.section} testID={testID}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1, gap: 2 },
  shrink: { flexShrink: 1 },
  center: { textAlign: "center" },
  hero: { gap: space.xs },
  kicker: { marginTop: space.md, fontWeight: "700", letterSpacing: 0.6 },
  trend: { marginTop: space.sm, gap: 4 },
  section: { gap: space.sm },
  prose: { lineHeight: 22 },
  box: { borderRadius: radius.lg, padding: space.lg, gap: space.sm },
  point: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
  pointIcon: { marginTop: 3 },
  gap: { gap: space.md },
  cardHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  paper: { borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, padding: space.md },
  paperTitle: { fontWeight: "600", marginBottom: space.sm },
  replay: { alignItems: "center" },
  goals: { gap: space.md },
  goal: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  goalN: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  quote: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderLeftWidth: 3, padding: space.lg, gap: space.sm },
  footer: { gap: space.xs, paddingHorizontal: space.md, marginTop: space.sm },
});
