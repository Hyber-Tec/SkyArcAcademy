import { POSITIONS, POSITION_COLORS, POSITION_LABELS, type Position } from "@shared/shooting/evaluation";
import { canReplay } from "@shared/shooting/replay";
import { type EditMode, FLAT_SIZE, cardEvaluation, editModeOf, savedReview } from "@shared/targets/flat";
import { type CardReview, reviewTotals } from "@shared/targets/review";
import { type DateKey, formatDateKey } from "@shared/time";
import { Stack, router, useLocalSearchParams, useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { Calendar, FileImage, FileText, SearchX, Trash2 } from "lucide-react-native";
import { useMemo, useRef, useState } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { Button } from "@/components/Button";
import { FooterBar } from "@/components/FooterBar";
import { Card } from "@/components/Card";
import { confirmAsync } from "@/components/Confirm";
import { DatePickerDialog } from "@/components/DatePickerDialog";
import { EmptyState } from "@/components/EmptyState";
import { Field } from "@/components/Field";
import { ListRow, ListSection, RowIcon } from "@/components/List";
import { Screen } from "@/components/Screen";
import { SegmentedControl } from "@/components/SegmentedControl";
import { Skeleton } from "@/components/Skeleton";
import { T } from "@/components/Text";
import { type DriveFileDoc, type EvaluationDoc, useAcademyNow, useEvaluation, useStudentEvaluations } from "@/features/data/hooks";
import { BullEditor } from "@/features/scan/BullEditor";
import { BullTiles } from "@/features/scan/BullTiles";
import { CardView } from "@/features/scan/CardView";
import { type NewEvaluation, deleteEvaluation, updateEvaluation } from "@/features/scores/api";
import { CompareCard } from "@/features/scores/CompareCard";
import { deleteScoreMessage, scoreTitle } from "@/features/scores/format";
import { ScoreHead, scoreFacts, useCardPicture } from "@/features/scores/ScoreParts";
import { ShotDarts, ShotSheet } from "@/features/scores/ShotDarts";
import { MatchCard, matchResults } from "@/features/scores/MatchCard";
import { ShotReplay } from "@/features/scores/ShotReplay";
import { toast } from "@/lib/toast";
import { useBranch } from "@/state/BranchProvider";
import { radius, space, useColors } from "@/theme";

interface Draft {
  position: Position;
  dateKey: DateKey;
  note: string;
  review: CardReview | null;
  total: number;
}

const shotsOf = (e: EvaluationDoc) => e.series.flatMap((s) => s.shots);

/** A scanned card's shots go back on its bulls where the Drive's flattened copy has them (shared/src/targets/flat.ts). */
function draftOf(e: EvaluationDoc): Draft {
  return { position: e.position, dateKey: e.dateKey, note: e.note ?? "", review: savedReview(e), total: e.total };
}

const STAMPS = new Set(["id", "createdAt", "createdBy", "updatedAt", "updatedBy"]);

/** The score as it will be saved: its scores rebuilt from the draft, or kept as they are where they can't change. */
function changed(e: EvaluationDoc, d: Draft): NewEvaluation {
  const mode = editModeOf(e);
  const kept = Object.fromEntries(Object.entries(e).filter(([k]) => !STAMPS.has(k))) as NewEvaluation;
  if (mode === "fixed") return { ...kept, position: d.position, dateKey: e.source === "paper" ? d.dateKey : e.dateKey, note: d.note.trim() };
  const rebuilt = cardEvaluation(
    { student: { id: e.studentId, name: e.studentName }, position: d.position, dateKey: d.dateKey, note: d.note, review: mode === "card" ? d.review : null, total: mode === "total" ? d.total : null },
    e.fileId,
  );
  // What the rebuild doesn't know stays as it was: what the result was (a competition or an evaluation stays one), a
  // typed total's number of shots, and the score the coach wrote on the card, still the official one, with the new
  // reading as its reference (as the scan saves it).
  const next: NewEvaluation = { ...kept, ...rebuilt };
  if (mode === "total") next.shots = e.shots;
  if (mode === "card" && e.official) {
    next.total = e.total;
    next.wholeTotal = e.wholeTotal;
    next.official = rebuilt.total === e.total ? null : { ...e.official, appTotal: rebuilt.total };
  }
  return next;
}

const CHANGEABLE = "Its scores can still be changed bull by bull.";

/** Why a scanned card's picture doesn't show (`failed`: it couldn't be read, or isn't the flattened card); null while it loads. */
function pictureNote(o: { failed: boolean; waiting: boolean; file: DriveFileDoc | null; loading: boolean }): string | null {
  if (o.failed) return `The card’s picture couldn’t be opened. ${CHANGEABLE}`;
  if (o.waiting || o.loading) return null;
  if (!o.file) return `The card’s picture isn’t in the Drive. ${CHANGEABLE}`;
  if (o.file.trashed) return `The card’s picture is in the Drive’s Trash. ${CHANGEABLE}`;
  if (o.file.status === "error") return `The card’s picture didn’t reach the Drive. ${CHANGEABLE}`;
  if (o.file.status === "uploading") return "The card’s picture is on its way to the Drive; it shows here once it’s there.";
  return null;
}

/**
 * One score (loaded by ID, so it opens from anywhere): its total and how the group sits, its shots played back one by
 * one on the target, side by side with another of the student's results in its position (the first, the one before it,
 * the lowest, or any two chosen; the saved scores), as the website's Compare, and what can be changed. A paper card
 * scanned with the app comes back as it was checked, its shots on the card's picture, to move, add or remove bull by
 * bull; a typed card's bulls take new scores. The position, the date and the coach's note change too, and the score can
 * be deleted. Changes are kept with Save; leaving with changes not saved asks first.
 */
export default function ScoreScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const colors = useColors();
  const { width } = useWindowDimensions();
  const { branchId, actor, settings } = useBranch();
  const { today } = useAcademyNow();
  const score = useEvaluation(id ?? null);
  const e = score.data;
  const mode: EditMode = e ? editModeOf(e) : "fixed";
  // A scanned card's picture (its copy on this phone moments after it was saved, otherwise the Drive's), and the file.
  const picture = useCardPicture(e ?? null);
  const { scanned, flat, file } = picture;
  const f = file.data;
  // The student's other results, to compare with (the same listener as their page's).
  const others = useStudentEvaluations(e?.studentId ?? null);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [choosingDate, setChoosingDate] = useState(false);
  // The shot the replay is showing (the darts follow it), and the one opened large.
  const [current, setCurrent] = useState<number | null>(null);
  const [openShot, setOpenShot] = useState<number | null>(null);
  const leaving = useRef(false);

  // The draft follows the saved score (a change made on the website shows here) until the person changes something.
  const version = e ? JSON.stringify([e.position, e.dateKey, e.note, e.total, e.series]) : null;
  const [seen, setSeen] = useState<string | null>(null);
  if (e && !dirty && version !== seen) {
    setSeen(version);
    setDraft(draftOf(e));
  }
  const change = (patch: Partial<Draft>) => {
    setDraft((d) => (d ? { ...d, ...patch } : d));
    setDirty(true);
  };
  const preview = useMemo(() => (e && draft ? (editModeOf(e) === "fixed" ? e : changed(e, draft)) : null), [e, draft]);

  usePreventRemove(dirty, ({ data }) => {
    if (leaving.current) return navigation.dispatch(data.action);
    void confirmAsync({ title: "Discard your changes?", message: "The score stays as it was saved.", confirmLabel: "Discard", destructive: true }).then((ok) => {
      if (!ok) return;
      leaving.current = true;
      navigation.dispatch(data.action);
    });
  });

  if (score.loading) {
    return (
      <Screen testID="score-screen">
        <Skeleton height={120} rounded={radius.lg} />
        <Skeleton height={360} rounded={radius.lg} />
      </Screen>
    );
  }
  if (!e || !draft || !preview) {
    return (
      <Screen testID="score-screen">
        <EmptyState icon={<SearchX size={26} color={colors.mutedForeground} />} title="This score isn’t there any more" text="It may have been deleted on the website." />
      </Screen>
    );
  }

  // Saving keeps the change on the phone at once (this screen and the student's page show it) while the server
  // confirms it; a refusal puts the score back as it was and says so.
  const save = () => {
    void updateEvaluation(branchId, actor, e.id, e, changed(e, draft)).catch((err: unknown) =>
      toast.error("Couldn’t save the changes", { description: err instanceof Error ? err.message : String(err) }),
    );
    setDirty(false);
    toast.success("Changes saved");
  };
  const discard = () => {
    setDraft(draftOf(e));
    setDirty(false);
  };
  const remove = async () => {
    if (!(await confirmAsync({ title: "Delete this score?", message: deleteScoreMessage(e), confirmLabel: "Delete", destructive: true }))) return;
    void deleteEvaluation(branchId, actor, e.id, e).catch((err: unknown) =>
      toast.error("Couldn’t delete the score", { description: err instanceof Error ? err.message : String(err) }),
    );
    toast.success("Score deleted");
    leaving.current = true;
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };

  const sius = e.source === "sius";
  const totals = mode === "card" && draft.review ? reviewTotals(draft.review) : null;
  const inner = width - space.lg * 2 - space.sm * 2;
  const note = scanned && !flat ? pictureNote({ failed: picture.failed, waiting: picture.waiting, file: f, loading: file.loading }) : null;
  const target = Math.min(width - space.lg * 4, 380);

  return (
    <>
      <Stack.Screen options={{ title: scoreTitle({ position: draft.position, source: e.source }) }} />
      <Screen
        testID="score-screen"
        zoomable
        footer={
          dirty ? (
            <FooterBar>
              <Button variant="outline" onPress={discard} style={styles.grow} testID="score-discard">
                Discard
              </Button>
              <Button onPress={save} style={styles.grow} testID="score-save">
                Save changes
              </Button>
            </FooterBar>
          ) : null
        }
      >
        <ScoreHead
          evaluation={preview}
          name={e.studentName}
          dateKey={draft.dateKey}
          hour12={settings.general.timeFormat !== "24h"}
          facts={scoreFacts(preview, totals?.missing ?? 0)}
        />

        {/* A competition from its sheet: the whole match, series by series, each played on its own. */}
        {e.source === "sheet" ? <MatchCard evaluation={{ ...preview, id: e.id }} results={matchResults({ ...preview, id: e.id }, others.data)} testID="score-match" /> : null}

        {canReplay(preview) && e.source !== "sheet" ? (
          <Card style={styles.center}>
            <ShotReplay evaluation={preview} color={POSITION_COLORS[draft.position]} size={target} onStep={sius ? setCurrent : undefined} />
          </Card>
        ) : null}

        {mode === "card" && draft.review ? (
          <ListSection
            title={scanned ? "The card" : "Scores"}
            footer={scanned ? "Tap a bull to check it and move its shots. Pinch the card with two fingers to zoom in." : "Typed scores, without places on the target. Tap a bull to change its score."}
          >
            <View style={styles.inset}>
              {scanned ? (
                flat ? (
                  <CardView image={flat} width={flat.width()} height={flat.height()} review={draft.review} viewWidth={inner} onBull={setEditing} testID="score-card" />
                ) : note ? (
                  <T variant="small" tone="muted" style={styles.note}>
                    {note}
                  </T>
                ) : (
                  <Skeleton height={(inner * FLAT_SIZE.height) / FLAT_SIZE.width} rounded={radius.md} />
                )
              ) : null}
              <BullTiles review={draft.review} onBull={setEditing} />
            </View>
          </ListSection>
        ) : mode === "total" ? (
          <Field
            label={`Total, out of ${e.shots * 10}`}
            value={String(draft.total)}
            onChangeText={(t) => change({ total: Math.min(e.shots * 10, Number(t.replace(/\D/g, "")) || 0) })}
            keyboardType="number-pad"
            maxLength={String(e.shots * 10).length}
            hint="Only the card’s total was kept, without its bulls."
            testID="score-total-field"
          />
        ) : sius ? (
          <ListSection title="Shots" footer={`Tap a shot to see it larger.${e.sighters ? ` Before them, ${e.sighters} sighters (never counted).` : ""}`}>
            <View style={styles.inset}>
              <ShotDarts evaluation={e} color={POSITION_COLORS[draft.position]} width={inner} current={current} onOpen={setOpenShot} />
            </View>
          </ListSection>
        ) : shotsOf(e).length ? (
          <ListSection title="Shots" footer="These scores change on the website.">
            <ListRow title={shotsOf(e).map((t) => t.v).join("  ")} />
          </ListSection>
        ) : e.match?.name ? (
          // A competition from its results sheet has no shots: its match instead.
          <ListSection title="The match" footer="These scores change on the website.">
            <ListRow title={e.match.name} subtitle={e.match.course || undefined} testID="score-match" />
          </ListSection>
        ) : null}

        {e.problems.length ? (
          <Card style={styles.problems}>
            <T variant="label" tone="warning">
              When the result was read
            </T>
            {e.problems.map((p) => (
              <T key={p} variant="small" tone="muted">
                {p}
              </T>
            ))}
          </Card>
        ) : null}

        <CompareCard anchor={e} evaluations={others.data} loading={others.loading} onOpen={(id) => router.push({ pathname: "/score/[id]", params: { id } })} alone testID="score-compare" />

        <ListSection title="Position">
          <View style={styles.inset}>
            <SegmentedControl testID="score-position" value={draft.position} options={POSITIONS.map((p) => ({ value: p, label: POSITION_LABELS[p] }))} onChange={(position) => change({ position })} />
          </View>
        </ListSection>

        <ListSection title="Details">
          <ListRow
            icon={<Calendar size={20} color={colors.mutedForeground} />}
            title={formatDateKey(draft.dateKey, "medium")}
            subtitle={sius ? "From the SIUS result" : "The day it was shot"}
            onPress={sius ? undefined : () => setChoosingDate(true)}
            testID="score-date"
          />
          {e.fileId ? (
            <ListRow
              icon={<RowIcon>{sius ? <FileText size={17} color={colors.foreground} /> : <FileImage size={17} color={colors.foreground} />}</RowIcon>}
              title={sius ? "The SIUS result" : "The card’s photo"}
              subtitle={f ? f.name : "In the student’s Drive"}
              onPress={() => router.push({ pathname: "/file/[id]", params: { id: e.fileId! } })}
              testID="score-file"
            />
          ) : null}
        </ListSection>

        <Field
          label="Coach’s note"
          value={draft.note}
          onChangeText={(note) => change({ note })}
          multiline
          maxLength={2000}
          placeholder="Anything worth remembering about this result."
          hint="The student and their parents see this note with the score."
          testID="score-note"
        />

        <Button variant="destructive" icon={<Trash2 size={18} color={colors.destructive} />} onPress={() => void remove()} testID="score-delete">
          Delete this score
        </Button>
      </Screen>

      {sius ? <ShotSheet evaluation={e} color={POSITION_COLORS[draft.position]} n={openShot} onChange={setOpenShot} onClose={() => setOpenShot(null)} /> : null}
      {draft.review ? <BullEditor image={flat} review={draft.review} n={editing} onChange={(review) => change({ review })} onClose={() => setEditing(null)} /> : null}
      <DatePickerDialog
        open={choosingDate}
        title="The day it was shot"
        value={draft.dateKey}
        today={today}
        max={today}
        onPick={(d) => {
          change({ dateKey: d });
          setChoosingDate(false);
        }}
        onClose={() => setChoosingDate(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1, gap: 2 },
  center: { alignItems: "center" },
  inset: { padding: space.sm, gap: space.md },
  note: { padding: space.sm },
  number: { fontVariant: ["tabular-nums"] },
  problems: { gap: space.xs },
});
