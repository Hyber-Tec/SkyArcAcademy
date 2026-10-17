import { useImage } from "@shopify/react-native-skia";
import { POSITIONS, POSITION_COLORS, POSITION_LABELS, type Position } from "@shared/shooting/evaluation";
import { canReplay } from "@shared/shooting/replay";
import { offsetWords } from "@shared/shooting/target";
import { type EditMode, FLAT_SIZE, cardEvaluation, editModeOf, savedReview, wasScanned } from "@shared/targets/flat";
import { type CardReview, reviewTotals } from "@shared/targets/review";
import { type DateKey, formatDateKey } from "@shared/time";
import { Stack, router, useLocalSearchParams, useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { Calendar, FileImage, FileText, SearchX, Trash2 } from "lucide-react-native";
import { useMemo, useRef, useState } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
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
import { type DriveFileDoc, type EvaluationDoc, useAcademyNow, useDriveFile, useEvaluation } from "@/features/data/hooks";
import { useLocalCopy } from "@/features/drive/download";
import { BullEditor } from "@/features/scan/BullEditor";
import { BullTiles } from "@/features/scan/BullTiles";
import { CardView } from "@/features/scan/CardView";
import { waitingCopy } from "@/features/scan/uploads";
import { clock } from "@/features/schedule/format";
import { type NewEvaluation, deleteEvaluation, updateEvaluation } from "@/features/scores/api";
import { deleteScoreMessage, scorePer10, scoreTitle, scoreTotal } from "@/features/scores/format";
import { ShotDarts, ShotSheet } from "@/features/scores/ShotDarts";
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
  if (mode === "fixed") {
    const kept = Object.fromEntries(Object.entries(e).filter(([k]) => !STAMPS.has(k))) as NewEvaluation;
    return { ...kept, position: d.position, dateKey: e.source === "paper" ? d.dateKey : e.dateKey, note: d.note.trim() };
  }
  return cardEvaluation(
    { student: { id: e.studentId, name: e.studentName }, position: d.position, dateKey: d.dateKey, note: d.note, review: mode === "card" ? d.review : null, total: mode === "total" ? d.total : null },
    e.fileId,
  );
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
 * one on the target, and what can be changed. A paper card scanned with the app comes back as it was checked, its
 * shots on the card's picture, to move, add or remove bull by bull; a typed card's bulls take new scores. The position,
 * the date and the coach's note change too, and the score can be deleted. Changes are kept with Save; leaving with
 * changes not saved asks first.
 */
export default function ScoreScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { branchId, actor, settings } = useBranch();
  const { today } = useAcademyNow();
  const score = useEvaluation(id ?? null);
  const e = score.data;
  const mode: EditMode = e ? editModeOf(e) : "fixed";
  const scanned = !!e && wasScanned(e);
  const fileId = e?.fileId ?? null;
  const file = useDriveFile(fileId);
  const f = file.data;
  // A scanned card's picture: its copy still on this phone when it was saved moments ago (uploads.ts), otherwise the
  // Drive's flattened copy, read through the Storage rules.
  const waiting = useMemo(() => (scanned && fileId ? waitingCopy(fileId) : null), [scanned, fileId]);
  const copy = useLocalCopy(scanned && !waiting && f && f.status === "ready" && !f.trashed ? { id: f.id, kind: f.kind, size: f.size } : null);
  const image = useImage(waiting ?? copy.uri);
  const flat = image && image.width() === FLAT_SIZE.width && image.height() === FLAT_SIZE.height ? image : null;

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
  const per10 = scorePer10(preview);
  const where = offsetWords(preview.mpi);
  const facts = [
    `${preview.shots} shots`,
    sius && e.innerTens !== null ? `${e.innerTens} inner ${e.innerTens === 1 ? "ten" : "tens"}` : null,
    preview.groupMm !== null ? `group ${preview.groupMm}\u00a0mm` : null,
    preview.mpi ? (where ? `sits ${where}` : "centred") : null,
    totals && totals.missing ? `${totals.missing} missing (0)` : null,
  ].filter(Boolean);
  const inner = width - space.lg * 2 - space.sm * 2;
  const note = scanned && !flat ? pictureNote({ failed: !!copy.error || !!image, waiting: !!waiting, file: f, loading: file.loading }) : null;
  const target = Math.min(width - space.lg * 4, 380);

  return (
    <>
      <Stack.Screen options={{ title: scoreTitle({ position: draft.position, source: e.source }) }} />
      <Screen
        testID="score-screen"
        zoomable
        footer={
          dirty ? (
            <View style={[styles.footer, { borderTopColor: colors.border, backgroundColor: colors.grouped, paddingBottom: insets.bottom + space.sm }]}>
              <Button variant="outline" onPress={discard} style={styles.grow} testID="score-discard">
                Discard
              </Button>
              <Button onPress={save} style={styles.grow} testID="score-save">
                Save changes
              </Button>
            </View>
          ) : null
        }
      >
        <Card style={styles.head}>
          <View style={styles.headTop}>
            <View style={styles.grow}>
              <T variant="label" numberOfLines={2}>
                {e.studentName}
              </T>
              <T variant="small" tone="muted" testID="score-when">
                {formatDateKey(draft.dateKey, "medium")}
                {sius && e.timeMin !== null ? `, ${clock(e.timeMin, settings.general.timeFormat !== "24h")}` : ""}
              </T>
            </View>
            {/* Per 10 shots, for results of another length (a card of ten already reads out of 100). */}
            {preview.shots !== 10 ? (
              <View style={styles.per10}>
                <T variant="stat">{per10 ?? "–"}</T>
                <T variant="tiny" tone="muted">
                  per 10
                </T>
              </View>
            ) : null}
          </View>
          <T variant="display" testID="score-total">
            {scoreTotal(preview)}
            {sius ? null : (
              <T variant="heading" tone="muted">
                {" "}
                / {preview.shots * 10}
              </T>
            )}
          </T>
          <T tone="muted">{facts.join(" · ")}</T>
        </Card>

        {canReplay(preview) ? (
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
            label="Total, out of 100"
            value={String(draft.total)}
            onChangeText={(t) => change({ total: Math.min(100, Number(t.replace(/\D/g, "")) || 0) })}
            keyboardType="number-pad"
            maxLength={3}
            hint="Only the card’s total was kept, without its bulls."
            testID="score-total-field"
          />
        ) : sius ? (
          <ListSection title="Shots" footer={`Tap a shot to see it larger.${e.sighters ? ` Before them, ${e.sighters} sighters (never counted).` : ""}`}>
            <View style={styles.inset}>
              <ShotDarts evaluation={e} color={POSITION_COLORS[draft.position]} width={inner} current={current} onOpen={setOpenShot} />
            </View>
          </ListSection>
        ) : (
          <ListSection title="Shots" footer="These scores change on the website.">
            <ListRow title={shotsOf(e).map((t) => t.v).join("  ")} />
          </ListSection>
        )}

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
        weekStartsOn={settings.general.weekStartsOn}
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
  head: { gap: space.xs },
  headTop: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  grow: { flex: 1, gap: 2 },
  per10: { alignItems: "flex-end" },
  center: { alignItems: "center" },
  inset: { padding: space.sm, gap: space.md },
  note: { padding: space.sm },
  number: { fontVariant: ["tabular-nums"] },
  problems: { gap: space.xs },
  footer: { flexDirection: "row", gap: space.md, paddingHorizontal: space.lg, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth },
});
