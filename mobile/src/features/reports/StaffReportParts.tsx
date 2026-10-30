import { trendLabel } from "@shared/reports/types";
import { POSITION_COLORS, POSITION_LABELS } from "@shared/shooting/evaluation";
import { formatDateKey, formatInstant } from "@shared/time";
import { router } from "expo-router";
import { CircleAlert, ExternalLink, Send, Undo2 } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ListRow, ListSection } from "@/components/List";
import { T } from "@/components/Text";
import { openWebsite } from "@/lib/links";
import { useBranch } from "@/state/BranchProvider";
import { radius, space, useColors } from "@/theme";
import { one, signed, stateLabel } from "./format";
import type { StaffReport } from "./staff";
import { TrendChip } from "./TrendChip";

/**
 * What the staff see around a report (the website's rail, web/src/features/reports/ReportRail.tsx): its state and who
 * prepared it, sharing it with the family (or, for an admin, stopping that), what to check before it's shared, how the
 * trend was worked out, and what it's built from. Changing a report stays on the website.
 */

const millis = (t: unknown) => (t as { toMillis?: () => number } | null)?.toMillis?.() ?? null;

/** At the top: the state, Share with the family (a draft) or Stop sharing (an admin, a shared one), and the website. */
export function ReportStatus({
  report: r,
  stale,
  problems,
  onShare,
  onUnshare,
}: {
  report: StaffReport;
  /** The student's evaluations in the period changed after the report was made. */
  stale: boolean;
  /** Evaluations in the period with something to check from when they were read. */
  problems: number;
  onShare: () => void;
  onUnshare: () => void;
}) {
  const colors = useColors();
  const { timezone, isAdmin, portal } = useBranch();
  const draft = r.status !== "shared";
  const made = millis(r.generatedAt);
  const prepared = made !== null ? formatInstant(made, timezone, { month: "short", day: "numeric", year: "numeric" }) : null;
  const unmarked = r.facts?.attendance?.unmarked ?? 0;
  const checks = draft
    ? [
        stale ? `Some evaluations changed after this report was made. ${isAdmin ? "Update its figures on the website." : "An admin can update its figures on the website."}` : null,
        unmarked ? `${unmarked} past ${unmarked === 1 ? "class has" : "classes have"} no attendance taken, so attendance may read low.` : null,
        problems ? `${problems} ${problems === 1 ? "evaluation had" : "evaluations had"} something to check when ${problems === 1 ? "it was" : "they were"} read. See the student’s scores.` : null,
      ].filter((x): x is string => !!x)
    : [];
  return (
    <Card style={styles.status} testID="report-staff">
      <View style={styles.line}>
        <Badge tone={draft ? "secondary" : "success"}>{stateLabel(r, timezone)}</Badge>
        {prepared ? (
          <T variant="small" tone="muted" style={styles.shrink}>
            Prepared {prepared}
            {r.generatedBy?.name ? ` by ${r.generatedBy.name}` : ""}
          </T>
        ) : null}
      </View>
      {draft ? (
        <T variant="small" tone="muted">
          The family doesn’t see a draft. Share it with them once it’s ready.
        </T>
      ) : (
        <T variant="small" tone="muted">
          The family sees it in the app and on the website. Shared reports are locked: {isAdmin ? "stop sharing it to change it." : "an admin can stop sharing it to make changes."}
        </T>
      )}
      {checks.length ? (
        <View style={[styles.checks, { backgroundColor: colors.warningTint }]} testID="report-checks">
          <View style={styles.line}>
            <CircleAlert size={16} color={colors.warning} />
            <T variant="label" style={{ color: colors.warning }}>
              Check before sharing
            </T>
          </View>
          {checks.map((c) => (
            <T key={c} variant="small">
              {c}
            </T>
          ))}
        </View>
      ) : null}
      {draft ? (
        <Button icon={<Send size={18} color={colors.primaryForeground} />} onPress={onShare} testID="report-share">
          Share with the family
        </Button>
      ) : isAdmin ? (
        <Button variant="outline" icon={<Undo2 size={18} color={colors.foreground} />} onPress={onUnshare} testID="report-unshare">
          Stop sharing
        </Button>
      ) : null}
      <Button variant="ghost" size="sm" icon={<ExternalLink size={16} color={colors.foreground} />} onPress={() => void openWebsite(`/${portal}/reports/${r.id}`)} testID="report-open-website">
        {isAdmin && draft ? "Change it on the website" : "Open it on the website"}
      </Button>
    </Card>
  );
}

/** At the bottom: the trend as the staff read it, and what the report is built from (each result opens its score). */
export function ReportStaffFacts({ report: r }: { report: StaffReport }) {
  const colors = useColors();
  const { timezone } = useBranch();
  const f = r.facts;
  const level = f?.trend?.level ?? null;
  const changes = (f?.positions ?? []).filter((p) => p.change !== null && p.first && p.latest);
  const made = millis(r.generatedAt);
  const sections = Object.values(r.narrativeMeta?.sections ?? {});
  const edited = sections.some((m) => m?.source === "staff");
  // Sections drafted with "Write with AI" on the website (docs/DECISIONS.md §26).
  const drafted = sections.some((m) => m?.source === "ai");
  const kinds = [f?.evaluations.sius ? `${f.evaluations.sius} SIUS` : "", f?.evaluations.paper ? `${f.evaluations.paper} paper` : ""].filter(Boolean).join(", ");
  const dot = (color: string) => <View style={[styles.dot, { backgroundColor: color, borderColor: colors.card }]} />;
  return (
    <View style={styles.facts} testID="report-staff-facts">
      <ListSection title="Trend" footer={`${level ? `Families see “${trendLabel(level, "family")}”. ` : ""}It’s worked out from the scores, never typed in.`} testID="report-staff-trend">
        <ListRow title={level ? <TrendChip level={level} audience="staff" /> : "Not enough evaluations for a trend"} />
        {changes.map((p) => (
          <ListRow
            key={p.position}
            icon={dot(POSITION_COLORS[p.position])}
            title={POSITION_LABELS[p.position]}
            subtitle={`${one(p.first!.wholePer10)} → ${one(p.latest!.wholePer10)} per 10 shots (${signed(p.change as number)} in the second half)`}
          />
        ))}
      </ListSection>

      <ListSection title="Built from" testID="report-staff-built">
        <ListRow title="Period" subtitle={r.period.label} />
        <ListRow title="Evaluations" subtitle={`${f?.evaluations.total ?? 0}${kinds ? ` (${kinds})` : ""}`} />
        <ListRow title="Prepared" subtitle={[made !== null ? formatInstant(made, timezone, { dateStyle: "medium", timeStyle: "short" }) : null, r.generatedBy?.name ? `by ${r.generatedBy.name}` : null].filter(Boolean).join(" ") || "—"} />
        <ListRow title="Written by" subtitle={drafted ? (edited ? "Drafted with AI, edited by staff" : "Drafted with AI") : edited ? "Standard text, edited by staff" : "Standard text"} />
      </ListSection>

      {r.series?.length ? (
        <ListSection title="Results in this report" detail={String(r.series.length)} footer="Each opens its score." testID="report-staff-results">
          {r.series.map((p) => (
            <ListRow
              key={p.id}
              icon={dot(POSITION_COLORS[p.position])}
              title={`${POSITION_LABELS[p.position]} · ${p.source === "sius" ? "SIUS" : "Paper"}`}
              subtitle={formatDateKey(p.dateKey, "medium")}
              right={
                <View style={styles.per10}>
                  <T variant="label" style={styles.number}>
                    {one(p.wholePer10)}
                  </T>
                  <T variant="tiny" tone="muted">
                    per 10
                  </T>
                </View>
              }
              onPress={() => router.push({ pathname: "/score/[id]", params: { id: p.id } })}
              testID={`report-result-${p.id}`}
            />
          ))}
        </ListSection>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  status: { gap: space.md },
  line: { flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" },
  shrink: { flexShrink: 1 },
  checks: { borderRadius: radius.md, padding: space.md, gap: space.sm },
  facts: { gap: space.lg, marginTop: space.sm },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2 },
  per10: { alignItems: "flex-end" },
  number: { fontVariant: ["tabular-nums"] },
});
