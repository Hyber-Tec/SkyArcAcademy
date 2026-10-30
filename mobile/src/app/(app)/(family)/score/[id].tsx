import { POSITION_COLORS, POSITION_LABELS, inOrder, wholePer10 } from "@shared/shooting/evaluation";
import { personalBestIds, positionProgress } from "@shared/shooting/progress";
import { canReplay } from "@shared/shooting/replay";
import { FLAT_SIZE, editModeOf, savedReview } from "@shared/targets/flat";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { ArrowDownRight, ArrowRight, ArrowUpRight, FileImage, FileText, MessageSquareQuote, SearchX, Trophy } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { ListRow, ListSection, RowIcon } from "@/components/List";
import { Screen } from "@/components/Screen";
import { Skeleton } from "@/components/Skeleton";
import { T } from "@/components/Text";
import { type EvaluationDoc, useEvaluation } from "@/features/data/hooks";
import { useFamilyEvaluations } from "@/features/family/data";
import { useFamily } from "@/features/family/FamilyProvider";
import { one } from "@/features/reports/format";
import { BullTiles } from "@/features/scan/BullTiles";
import { CardView } from "@/features/scan/CardView";
import { monthDay } from "@/features/schedule/format";
import { CompareCard } from "@/features/scores/CompareCard";
import { scoreTitle } from "@/features/scores/format";
import { BestBadge, ScoreHead, scoreFacts, useCardPicture } from "@/features/scores/ScoreParts";
import { ShotDarts, ShotSheet } from "@/features/scores/ShotDarts";
import { MatchCard, matchResults } from "@/features/scores/MatchCard";
import { ShotReplay } from "@/features/scores/ShotReplay";
import { useBranch } from "@/state/BranchProvider";
import { radius, space, useColors } from "@/theme";

/**
 * One score, as the family sees it (loaded by ID, so a link opens it too): the same score the staff see, to look at
 * only. Its total and how the group sits; its shots played back one by one on the target as it opens; how it compares
 * with the student's other results in that position, and side by side with one of them (the first, the one before it,
 * the lowest, or any two chosen), as the website's Compare; a SIUS result's shots series by series, or a scanned card
 * on its picture with each bull's score (pinch to zoom), or a typed card's scores; the coach's note; and the original,
 * the SIUS result's PDF or the card's photo, full screen.
 */
export default function FamilyScoreScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { name } = useBranch();
  const colors = useColors();
  const family = useFamily();
  const score = useEvaluation(id ?? null);
  // Only the family's own students' (the rules say so; the phone's copy of what another account saw on it doesn't).
  const e = score.data && family.ids.includes(score.data.studentId) ? score.data : null;

  if (score.loading) {
    return (
      <Screen typing={false} testID="family-score-screen">
        <Stack.Screen options={{ title: "" }} />
        <Skeleton height={150} rounded={radius.lg} />
        <Skeleton height={400} rounded={radius.lg} />
      </Screen>
    );
  }
  if (!e) {
    return (
      <Screen typing={false} testID="family-score-screen">
        <Stack.Screen options={{ title: "" }} />
        <EmptyState
          testID="family-score-missing"
          icon={<SearchX size={26} color={colors.mutedForeground} />}
          title="This score isn’t available"
          text={`It may have been removed. Ask ${name} if you were expecting it.`}
          action={
            <Button variant="outline" onPress={() => (router.canGoBack() ? router.back() : router.replace("/scores"))} testID="family-score-back">
              Back to scores
            </Button>
          }
        />
      </Screen>
    );
  }
  return <ScoreBody e={e} />;
}

function ScoreBody({ e }: { e: EvaluationDoc }) {
  const { settings } = useBranch();
  const family = useFamily();
  const colors = useColors();
  const reduced = useReducedMotion();
  const { width } = useWindowDimensions();
  // The student's other results, for how this one compares (the same listener as the Scores tab's for one student).
  const own = useFamilyEvaluations([e.studentId]);
  const picture = useCardPicture(e);
  const { flat, file } = picture;
  const f = file.data;
  // The shot the replay is showing (the darts follow it), and the one opened large.
  const [current, setCurrent] = useState<number | null>(null);
  const [openShot, setOpenShot] = useState<number | null>(null);

  const mode = editModeOf(e);
  const sius = e.source === "sius";
  const review = useMemo(() => savedReview(e), [e]);
  const color = POSITION_COLORS[e.position];
  const best = useMemo(() => personalBestIds(own.data).has(e.id), [own.data, e.id]);
  const inner = width - space.lg * 2 - space.sm * 2;
  const target = Math.min(width - space.lg * 4, 380);
  const fileReady = !!f && f.status === "ready" && !f.trashed;
  const fileLine = file.loading ? "Loading…" : fileReady ? f.name : "Not available: it may have been removed";
  const cardNote = picture.scanned && !flat ? (picture.failed ? "The card’s picture couldn’t be opened. Check your connection, then try again." : !file.loading && !fileReady ? "The card’s picture isn’t available. Its scores are below." : null) : null;

  return (
    <>
      <Stack.Screen options={{ title: scoreTitle(e) }} />
      <Screen typing={false} zoomable={picture.scanned} testID="family-score-screen">
        <ScoreHead evaluation={e} name={e.studentName} dateKey={e.dateKey} hour12={settings.general.timeFormat !== "24h"} facts={scoreFacts(e)} figure="whole">
          <View style={styles.chips}>
            <View style={[styles.chip, { backgroundColor: colors.secondary }]}>
              <View style={[styles.dot, { backgroundColor: color }]} />
              <T variant="tiny" style={styles.chipText}>
                {POSITION_LABELS[e.position]}
              </T>
            </View>
            {best ? <BestBadge position={e.position} testID="family-score-best" /> : null}
          </View>
        </ScoreHead>

        {/* A competition from its sheet: the whole match, series by series, each played on its own. */}
        {e.source === "sheet" ? <MatchCard evaluation={e} results={matchResults(e, own.data)} testID="family-score-match" /> : null}

        {canReplay(e) && e.source !== "sheet" ? (
          <Card style={styles.center} testID="family-score-replay">
            <ShotReplay evaluation={e} color={color} size={target} autoPlay={!reduced} onStep={sius ? setCurrent : undefined} />
          </Card>
        ) : null}

        {e.note?.trim() ? (
          <View style={[styles.quote, { backgroundColor: colors.card, borderColor: colors.border, borderLeftColor: colors.brand }]} testID="family-score-note">
            <View style={styles.quoteHead}>
              <MessageSquareQuote size={16} color={colors.brandText} />
              <T variant="label">Coach’s note</T>
            </View>
            <T style={styles.prose}>{e.note.trim()}</T>
          </View>
        ) : null}

        <Compare e={e} own={own.data} loading={own.loading} first={family.firstName(e.studentId, e.studentName)} you={family.who === "student"} />

        <CompareCard anchor={e} evaluations={own.data} loading={own.loading} onOpen={(id) => router.push({ pathname: "/score/[id]", params: { id } })} testID="family-compare" />

        {sius ? (
          <ListSection title="Shots" footer={`Tap a shot to see it larger.${e.sighters ? ` Before them, ${e.sighters} sighters (never counted).` : ""}`} testID="family-score-shots">
            <View style={styles.inset}>
              <ShotDarts evaluation={e} color={color} width={inner} current={current} onOpen={setOpenShot} />
            </View>
          </ListSection>
        ) : mode === "card" && review ? (
          picture.scanned ? (
            <ListSection title="The card" footer={flat ? "Each bull’s score is beside it. Pinch the card with two fingers to zoom in, or double-tap it." : undefined} testID="family-score-card">
              <View style={styles.inset}>
                {flat ? (
                  <CardView image={flat} width={flat.width()} height={flat.height()} review={review} viewWidth={inner} plain testID="score-card" />
                ) : cardNote ? (
                  <>
                    <T variant="small" tone="muted" style={styles.note}>
                      {cardNote}
                    </T>
                    <BullTiles review={review} plain />
                  </>
                ) : (
                  <Skeleton height={(inner * FLAT_SIZE.height) / FLAT_SIZE.width} rounded={radius.md} />
                )}
              </View>
            </ListSection>
          ) : (
            <ListSection title="Scores" footer="Typed from the card bull by bull, without where the shots landed." testID="family-score-bulls">
              <View style={styles.inset}>
                <BullTiles review={review} plain />
              </View>
            </ListSection>
          )
        ) : mode === "total" ? (
          <ListSection title="Score" testID="family-score-total-only">
            <ListRow title={`${e.total} out of ${e.shots * 10}`} subtitle="Only the card’s total was kept, without its bulls." />
          </ListSection>
        ) : (
          <ListSection title="Shots" testID="family-score-values">
            <ListRow title={e.series.flatMap((s) => s.shots.map((t) => t.v)).join("  ")} />
          </ListSection>
        )}

        {e.fileId ? (
          <ListSection title="The original" testID="family-score-original">
            <ListRow
              icon={<RowIcon>{sius ? <FileText size={17} color={colors.foreground} /> : <FileImage size={17} color={colors.foreground} />}</RowIcon>}
              title={sius ? "The SIUS result (PDF)" : "The card’s photo"}
              subtitle={fileLine}
              onPress={fileReady ? () => router.push({ pathname: "/file/[id]", params: { id: e.fileId! } }) : undefined}
              testID="family-score-file"
            />
          </ListSection>
        ) : null}
      </Screen>

      {sius ? <ShotSheet evaluation={e} color={color} n={openShot} onChange={setOpenShot} onClose={() => setOpenShot(null)} /> : null}
    </>
  );
}

/**
 * How a result compares with the student's others in its position (whole scores per 10 shots, as the charts count
 * them): the position's average, the result before it, and the best so far (a tap opens it).
 */
function Compare({ e, own, loading, first, you }: { e: EvaluationDoc; own: EvaluationDoc[]; loading: boolean; first: string; you: boolean }) {
  const colors = useColors();
  const label = POSITION_LABELS[e.position].toLowerCase();
  const value = wholePer10(e);
  const facts = useMemo(() => {
    const list = inOrder(own.filter((x) => x.position === e.position && x.shots > 0));
    const at = list.findIndex((x) => x.id === e.id);
    const progress = positionProgress(own).find((p) => p.position === e.position) ?? null;
    return { count: list.length, previous: at > 0 ? list[at - 1] : null, progress };
  }, [own, e.id, e.position]);
  if (loading || value === null || !facts.progress) return null;
  const { count, previous, progress } = facts;
  const whose = you ? "your" : `${first}’s`;
  const round = (n: number) => Math.round(n * 10) / 10;
  const prevValue = previous ? wholePer10(previous) : null;
  const bestMark = progress.best;
  const isBest = bestMark?.id === e.id;
  // The result before it may be the best so far too: one line says both.
  const prevIsBest = !!previous && bestMark?.id === previous.id;
  if (count < 2) {
    return (
      <Card style={styles.compare} testID="family-score-compare">
        <T variant="label">How it compares</T>
        <T variant="small" tone="muted">
          {`The first ${label} result: the ones after it compare with it here.`}
        </T>
      </Card>
    );
  }
  const open = (id: string) => router.push({ pathname: "/score/[id]", params: { id } });
  return (
    <Card style={styles.compare} testID="family-score-compare">
      <View style={styles.compareHead}>
        <T variant="label" style={styles.grow}>
          How it compares
        </T>
        <T variant="small" tone="muted">
          per 10 shots
        </T>
      </View>
      {progress.average !== null ? (
        <View style={[styles.fact, { backgroundColor: colors.secondary }]} testID="family-score-vs-average">
          <View style={styles.grow}>
            <T variant="small" tone="muted">{`${whose[0].toUpperCase()}${whose.slice(1)} ${label} average`}</T>
            <T variant="small" style={styles.number}>{`${one(progress.average)} over ${count} results`}</T>
          </View>
          <Versus diff={round(value - progress.average)} words={["above", "below"]} />
        </View>
      ) : null}
      {previous && prevValue !== null ? (
        <Pressable
          onPress={() => open(previous.id)}
          accessibilityRole="button"
          accessibilityLabel={`The ${label} result before it, ${monthDay(previous.dateKey)}: ${one(prevValue)}${prevIsBest ? ", the best so far" : ""}. Opens it.`}
          style={({ pressed }) => [styles.fact, { backgroundColor: pressed ? colors.accent : colors.secondary }]}
          testID="family-score-vs-previous"
        >
          <View style={styles.grow}>
            <T variant="small" tone="muted">{`The ${label} result before it`}</T>
            <View style={styles.value}>
              <T variant="small" style={styles.number}>{`${one(prevValue)} on ${monthDay(previous.dateKey)}`}</T>
              {prevIsBest ? (
                <>
                  <Trophy size={12} color={colors.warning} />
                  <T variant="small" tone="muted">
                    the best so far
                  </T>
                </>
              ) : null}
            </View>
          </View>
          <Versus diff={round(value - prevValue)} words={["higher", "lower"]} />
        </Pressable>
      ) : null}
      {bestMark && !prevIsBest ? (
        isBest ? (
          <View style={[styles.fact, { backgroundColor: colors.warningTint }]} testID="family-score-is-best">
            <T variant="small" style={[styles.grow, { color: colors.warning, fontWeight: "600" }]}>
              {`${whose[0].toUpperCase()}${whose.slice(1)} best ${label} result so far`}
            </T>
          </View>
        ) : (
          <Pressable
            onPress={() => open(bestMark.id)}
            accessibilityRole="button"
            accessibilityLabel={`The best ${label} result so far, ${monthDay(bestMark.dateKey)}: ${one(bestMark.per10)}. Opens it.`}
            style={({ pressed }) => [styles.fact, { backgroundColor: pressed ? colors.accent : colors.secondary }]}
            testID="family-score-to-best"
          >
            <View style={styles.grow}>
              <T variant="small" tone="muted">{`The best ${label} result so far`}</T>
              <T variant="small" style={styles.number}>{`${one(bestMark.per10)} on ${monthDay(bestMark.dateKey)}`}</T>
            </View>
            <T variant="small" tone="muted">
              Open
            </T>
          </Pressable>
        )
      ) : null}
    </Card>
  );
}

/** A difference in calm words, never red (as the website says it): "1.3 above", "2 lower", "the same". */
function Versus({ diff, words }: { diff: number; words: [up: string, down: string] }) {
  const colors = useColors();
  const Icon = diff > 0 ? ArrowUpRight : diff < 0 ? ArrowDownRight : ArrowRight;
  const tone = diff > 0 ? colors.success : colors.mutedForeground;
  return (
    <View style={styles.versus}>
      <Icon size={14} color={tone} />
      <T variant="small" style={[styles.versusText, { color: tone }]}>
        {diff === 0 ? "the same" : `${one(Math.abs(diff))} ${diff > 0 ? words[0] : words[1]}`}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  versus: { flexDirection: "row", alignItems: "center", gap: 2 },
  versusText: { fontWeight: "600", fontVariant: ["tabular-nums"] },
  grow: { flex: 1, gap: 2 },
  center: { alignItems: "center" },
  inset: { padding: space.sm, gap: space.md },
  note: { padding: space.sm },
  number: { fontVariant: ["tabular-nums"], fontWeight: "600" },
  chips: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.sm, marginTop: space.sm },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: radius.full, paddingHorizontal: 9, paddingVertical: 3 },
  chipText: { fontWeight: "600" },
  dot: { width: 8, height: 8, borderRadius: 4 },
  quote: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderLeftWidth: 3, padding: space.lg, gap: space.sm },
  quoteHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  prose: { lineHeight: 22 },
  compare: { gap: space.sm },
  compareHead: { flexDirection: "row", alignItems: "center", gap: space.sm, marginBottom: 2 },
  value: { flexDirection: "row", alignItems: "center", gap: 4, flexWrap: "wrap" },
  fact: { flexDirection: "row", alignItems: "center", gap: space.sm, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm, minHeight: 48 },
});
