import { josa } from "@shared/i18n";
import { DEFAULT_REPORT_OPTIONS, NARRATIVE_LABELS_KO, type ProgressReportDoc } from "@shared/reports/types";
import { POSITIONS, POSITION_COLORS, type Position, pointOf } from "@shared/shooting/evaluation";
import { ArrowRight, Check, Crosshair, Flag, MessageSquareQuote, Target } from "lucide-react-native";
import { type ReactNode, useMemo, useState } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { SkyArcLogo } from "@/components/brand/SkyArc";
import { Card } from "@/components/Card";
import { Screen } from "@/components/Screen";
import { SegmentedControl } from "@/components/SegmentedControl";
import { T } from "@/components/Text";
import { hasPlacedShots, playPoints } from "@/features/scores/playback";
import { ShotReplay } from "@/features/scores/ShotReplay";
import { positionLabel } from "@/features/scores/words";
import { useLang, useT } from "@/lib/lang";
import { useBranch } from "@/state/BranchProvider";
import { radius, space, useColors, useIsDark } from "@/theme";
import { DistributionBar, INK, Sparkline, TrendChart, trendSeries } from "./charts";
import { evaluationsText, one, periodText, preparedOn, signed } from "./format";
import { Comparison, Heading, PositionRows, type Tile, TileGrid } from "./ReportParts";
import { TrendChip } from "./TrendChip";

/** A progress report as stored, with its ID. */
type Report = ProgressReportDoc & { id: string };

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** The previous report's period, short, in Korean: "9월" for a whole month ("September 2026"), else "지난 리포트". */
function previousKo(label: string): string {
  const m = /^([A-Z][a-z]+) \d{4}$/.exec(label);
  const i = m ? MONTHS.indexOf(m[1]) : -1;
  return i >= 0 ? `${i + 1}월` : "지난 리포트";
}

/** The position with the most results (ties: the better average). */
function mainPosition(r: Report): Position | null {
  return [...r.facts.positions].sort((a, b) => b.evaluations - a.evaluations || (b.average ?? 0) - (a.average ?? 0))[0]?.position ?? null;
}

/**
 * A progress report as the family sees it, the same for the staff (the website's report shows the staff what the family
 * sees): whose it is and the period, how the scores went (when the report shows it), the period's figures, the coach's
 * words, the scores over time, the period's shots played back on the target, each position's figures, the first and
 * latest results side by side, and the goals. The report's options decide what shows, as on the website
 * (web/src/features/reports/ReportDocument.tsx). `top` and `bottom` go above and below it on the same page (the staff's
 * state of the report, sharing it, what it's built from).
 */
export function ReportBody({ r, top, bottom }: { r: Report; top?: ReactNode; bottom?: ReactNode }) {
  const { timezone } = useBranch();
  const colors = useColors();
  const dark = useIsDark();
  const t = useT();
  const lang = useLang();
  const ko = lang === "ko";
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
  const shots = useMemo(() => (target ? playPoints(target.points, lang) : []), [target, lang]);
  const counted = f.distribution.tens + f.distribution.nines + f.distribution.eights + f.distribution.lower;
  const showTargets = o.showTargets && (!!target || counted > 0);
  const main = mainPosition(r);
  const compare = main ? series.filter((p) => p.position === main) : [];

  const prevShort = f.previous ? (ko ? previousKo(f.previous.periodLabel) : /^[A-Z][a-z]+ \d{4}$/.test(f.previous.periodLabel) ? f.previous.periodLabel.slice(0, 3) : "the last report") : null;
  const spark = (values: (number | null)[]) => <Sparkline values={values} color={colors.brandText} />;
  const classes = f.attendance.attended + f.attendance.missed;
  const tiles: Tile[] = [
    {
      label: t("Evaluations", "기록 수"),
      value: String(f.evaluations.total),
      sub: { text: t(`${f.evaluations.shots} scored shots`, `총 ${f.evaluations.shots}발`), tone: "flat" },
      testID: "report-tile-evaluations",
    },
    ...(f.average !== null
      ? [
          {
            label: t("Average per 10 shots", "10발 평균"),
            value: one(f.average),
            spark: spark(series.map((p) => p.wholePer10)),
            sub:
              f.deltaAverage !== null && prevShort
                ? {
                    text:
                      f.deltaAverage === 0
                        ? t(`same as ${prevShort}`, `${josa(prevShort, "과/와")} 같음`)
                        : t(`${signed(f.deltaAverage)} vs. ${prevShort}`, `${prevShort} 대비 ${signed(f.deltaAverage)}`),
                    tone: f.deltaAverage > 0 ? ("up" as const) : f.deltaAverage < 0 ? ("down" as const) : ("flat" as const),
                  }
                : { text: t("out of 100", "100점 만점"), tone: "flat" as const },
            testID: "report-tile-average",
          },
        ]
      : []),
    ...(f.decimal !== null
      ? [{ label: t("Decimal average", "소수점 평균"), value: one(f.decimal), spark: spark(sius.map((p) => p.per10)), sub: { text: t("SIUS results, out of 109", "SIUS 기록, 109점 만점"), tone: "flat" as const } }]
      : []),
    ...(f.innerTensPct !== null
      ? [
          {
            label: t("Inner tens", "이너 텐"),
            value: `${f.innerTensPct}%`,
            spark: spark(sius.map((p) => (p.innerTens !== null && p.shots ? (p.innerTens / p.shots) * 100 : null))),
            sub: { text: t("shots of 10.2 or better", "10.2점 이상인 발"), tone: "flat" as const },
          },
        ]
      : []),
    ...(f.groupMm !== null
      ? [
          {
            label: t("Group size", "탄착군 크기"),
            value: t(`${one(f.groupMm)} mm`, `${one(f.groupMm)}mm`),
            spark: spark(sius.map((p) => p.groupMm)),
            sub: { text: t("average; smaller is tighter", "평균, 작을수록 잘 모여요"), tone: "flat" as const },
          },
        ]
      : []),
    ...(o.showAttendance && f.attendance.percent !== null
      ? [
          {
            label: t("Attendance", "출석률"),
            value: `${f.attendance.percent}%`,
            sub: { text: t(`${f.attendance.attended} of ${classes} classes`, `수업 ${classes}번 중 ${f.attendance.attended}번`), tone: "flat" as const },
            testID: "report-tile-attendance",
          },
        ]
      : []),
  ];

  const contact = [r.snapshot?.academyName, r.snapshot?.contact?.phone, r.snapshot?.contact?.email, r.snapshot?.contact?.website].filter(Boolean).join(" · ");
  const prepared = preparedOn(r, timezone, lang);
  const strengths = (n.strengths ?? []).filter((s) => s.trim());
  const focus = (n.focusAreas ?? []).filter((s) => s.trim());
  const goals = (n.goals ?? []).filter((g) => g.goal.trim() || g.measure.trim());
  // Charts sit on the report's light paper in both appearances (their colours are checked against it).
  const paper = { backgroundColor: INK.paper, borderColor: dark ? "transparent" : colors.border };

  return (
    <Screen typing={false} testID="report-screen">
      {top}
      <Card style={styles.hero} testID="report-hero">
        <SkyArcLogo height={40} />
        <T variant="tiny" tone="muted" style={styles.kicker} numberOfLines={2}>
          {(r.customName || t("Progress report", "성장 리포트")).toUpperCase()} · {periodText(r.period, lang).toUpperCase()}
        </T>
        <T variant="title" testID="report-student">
          {r.student?.name || r.studentName}
        </T>
        <T variant="small" tone="muted">
          {[
            r.student?.level ? t(`Level: ${r.student.level}`, `레벨: ${r.student.level}`) : "",
            r.student?.program ? t(`Program: ${r.student.program}`, `프로그램: ${r.student.program}`) : "",
            t(evaluationsText(f.evaluations.total), `기록 ${f.evaluations.total}개`),
          ]
            .filter(Boolean)
            .join(" · ")}
        </T>
        {level ? (
          <View style={styles.trend}>
            <TrendChip level={level} testID="report-trend" />
            <T variant="tiny" tone="muted">
              {t("From the scores across the period", "이 기간의 점수로 계산했어요")}
            </T>
          </View>
        ) : null}
      </Card>

      <TileGrid tiles={tiles} />

      {n.overview?.trim() ? (
        <Section>
          <Heading icon={Crosshair}>{t("This period at a glance", "이번 기간 요약")}</Heading>
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
            {t("Strengths", NARRATIVE_LABELS_KO.strengths)}
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
            {t("Focus areas", NARRATIVE_LABELS_KO.focusAreas)}
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
              {t("Scores over time", "점수 변화")}
            </T>
            <T variant="small" tone="muted">
              {t("per 10 shots", "10발 평균")}
            </T>
          </View>
          <View style={[styles.paper, paper]}>
            <TrendChart series={trendSeries(series, lang)} from={r.period.from} to={r.period.to} />
          </View>
          <T variant="tiny" tone="muted">
            {t("Tap the chart to read a date’s scores.", "차트를 누르면 그날 점수를 볼 수 있어요.")}
          </T>
        </Card>
      ) : null}

      {showTargets ? (
        <Card style={styles.gap} testID="report-targets">
          <T variant="label">{t("Where the shots went", "탄착 위치")}</T>
          {targets.length > 1 ? (
            <SegmentedControl<Position>
              value={target?.pos ?? targets[0].pos}
              onChange={setChosen}
              options={targets.map((x) => ({ value: x.pos, label: positionLabel(x.pos, lang) }))}
              testID="report-position"
            />
          ) : null}
          {target ? (
            <View style={styles.replay}>
              <ShotReplay
                key={target.pos}
                shots={shots}
                color={POSITION_COLORS[target.pos]}
                size={Math.min(inner, 340)}
                caption={t(
                  `${positionLabel(target.pos, "en")} · ${target.shots} shots in ${target.points.length} ${target.points.length === 1 ? "result" : "results"} · the cross marks the average`,
                  `${positionLabel(target.pos, "ko")} · 기록 ${target.points.length}개 · ${target.shots}발 · 십자는 평균 탄착점이에요`,
                )}
              />
            </View>
          ) : null}
          {counted ? (
            <View style={[styles.paper, paper]}>
              <T variant="small" style={[styles.paperTitle, { color: INK.secondary }]}>
                {t("Every counted shot by score", "점수별 발 수")}
              </T>
              <DistributionBar {...f.distribution} />
            </View>
          ) : null}
        </Card>
      ) : null}

      {f.positions.length ? <PositionRows positions={f.positions} /> : null}

      {o.showComparison && compare.length >= 2 && main ? (
        <Section>
          <Heading icon={Target}>{t(`First vs latest · ${positionLabel(main, "en")}`, `처음과 최근 비교 · ${positionLabel(main, "ko")}`)}</Heading>
          <Comparison a={compare[0]} b={compare[compare.length - 1]} width={inner} />
        </Section>
      ) : null}

      {goals.length ? (
        <Section testID="report-goals">
          <Heading icon={Flag}>{t("Goals for next period", "다음 기간 목표")}</Heading>
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
              {t("A note from the coach", NARRATIVE_LABELS_KO.coachNote)}
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
          {t(
            `Questions about this report? We’re happy to talk.${prepared ? ` Prepared ${prepared}.` : ""}`,
            `궁금한 점이 있으면 언제든 편하게 물어보세요.${prepared ? ` ${prepared}에 작성했어요.` : ""}`,
          )}
        </T>
      </View>
      {bottom}
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
