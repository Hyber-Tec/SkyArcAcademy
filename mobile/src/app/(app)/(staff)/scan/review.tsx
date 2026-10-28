import { POSITIONS, POSITION_COLORS, POSITION_LABELS, type Position, RESULT_KINDS, RESULT_KIND_LABELS, type ResultKind, paperEvaluation } from "@shared/shooting/evaluation";
import { canReplay } from "@shared/shooting/replay";
import { type CardReview, changeShotsPerBull, reviewShots, reviewTotals, startReview, typedReview } from "@shared/targets/review";
import { type DateKey, formatDateKey } from "@shared/time";
import { Image } from "expo-image";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { Calendar, Camera, Hash, ImageIcon, UserRound, X } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { confirmAsync } from "@/components/Confirm";
import { DatePickerDialog } from "@/components/DatePickerDialog";
import { Field } from "@/components/Field";
import { IconButton } from "@/components/IconButton";
import { ListRow, ListSection } from "@/components/List";
import { SegmentedControl } from "@/components/SegmentedControl";
import { T } from "@/components/Text";
import { ZoomScrollView } from "@/components/ZoomScrollView";
import { useAcademyNow } from "@/features/data/hooks";
import { BullEditor } from "@/features/scan/BullEditor";
import { BullTiles } from "@/features/scan/BullTiles";
import { CardView } from "@/features/scan/CardView";
import { lastChoices } from "@/features/scan/choices";
import { type CardFile, type FlatCard, type ReadPhoto, cardFile, flattenCard, readPhoto } from "@/features/scan/photo";
import { knowFolder, saveCard } from "@/features/scan/save";
import { type PickedStudent, StudentPicker } from "@/features/scan/StudentPicker";
import { ShotReplay } from "@/features/scores/ShotReplay";
import { toast } from "@/lib/toast";
import { useBranch } from "@/state/BranchProvider";
import { space, useColors } from "@/theme";

type Phase = { kind: "reading" } | { kind: "failed"; reason: string } | { kind: "review" } | { kind: "saving" };

/** The shots' colour on the replay until a position is chosen (then the position's). */
const UNSET_COLOR = "#6b7280";

/**
 * A scanned card, checked and saved: the photos come from the camera or the library (`photos`, one or several, read
 * one after the other). Each is read (photo.ts) and shown as a score's screen shows it: the total, the shots played
 * back one by one (at once), the card flattened with every bull's score to zoom into and correct bull by bull. It's
 * saved once a person has chosen who shot it, the position, the date and what it was (practice, a competition, an
 * evaluation): the card's copy goes to the student's Drive folder and its scores become an evaluation, which the
 * progress reports use. A card the coach already scored by hand takes the score written on it as the official one (the
 * app's reading is kept for reference); a card that can't be read can have its bulls typed, or only its total, over any
 * number of shots, as the website's paper dialog (web/src/features/scores/PaperScoreDialog.tsx).
 */
export default function ScanReviewScreen() {
  const params = useLocalSearchParams<{ photos?: string; from?: string }>();
  const photos = useMemo<string[]>(() => {
    try {
      const list = JSON.parse(params.photos ?? "[]") as unknown;
      return Array.isArray(list) ? list.filter((u): u is string => typeof u === "string") : [];
    } catch {
      return [];
    }
  }, [params.photos]);
  const fromCamera = params.from === "camera";
  const colors = useColors();
  const { width } = useWindowDimensions();
  const { branchId, actor } = useBranch();
  const { today } = useAcademyNow();

  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>({ kind: "reading" });
  const [read, setRead] = useState<ReadPhoto | null>(null);
  const [flat, setFlat] = useState<FlatCard | null>(null);
  const [review, setReview] = useState<CardReview | null>(null);
  // Never filled in by itself: a batch of cards is usually several students (the picker offers the last one first).
  const [student, setStudent] = useState<PickedStudent | null>(null);
  const [position, setPosition] = useState<Position | null>(lastChoices.position);
  const [dateKey, setDateKey] = useState<DateKey>(lastChoices.dateKey ?? today);
  const [note, setNote] = useState("");
  const [kind, setKind] = useState<ResultKind>(lastChoices.kind ?? "practice");
  // The score written on a scanned card by the coach, when there is one (the official score).
  const [written, setWritten] = useState("");
  // Bulls typed rather than read (no written score to compare), or only the total typed, over its shots.
  const [typed, setTyped] = useState(false);
  const [mode, setMode] = useState<"bulls" | "total">("bulls");
  const [typedTotal, setTypedTotal] = useState("");
  const [shotCount, setShotCount] = useState("10");
  const [editing, setEditing] = useState<number | null>(null);
  const [picking, setPicking] = useState(false);
  const [choosingDate, setChoosingDate] = useState(false);
  const uri = photos[index] ?? null;
  /** The card's copy for the Drive, made while the person checks the card (so Save doesn't wait for it). */
  const fileRef = useRef<{ read: ReadPhoto; file: CardFile } | null>(null);

  // A new photo starts from nothing: its own reading, review and note.
  const [shown, setShown] = useState<string | null>(null);
  if (shown !== uri) {
    setShown(uri);
    setPhase({ kind: "reading" });
    setRead(null);
    setFlat(null);
    setReview(null);
    setNote("");
    setStudent(null);
    setWritten("");
    setTyped(false);
    setMode("bulls");
    setTypedTotal("");
    setShotCount("10");
  }
  useEffect(() => {
    if (!uri) return;
    let live = true;
    readPhoto(uri, "auto").then(
      (r) => {
        if (!live) return;
        setRead(r);
        if (!r.scan.ok) return setPhase({ kind: "failed", reason: r.scan.reason ?? "No target found." });
        setFlat(flattenCard(r));
        setReview(startReview(r.scan));
        setPhase({ kind: "review" });
      },
      (e: unknown) => live && setPhase({ kind: "failed", reason: e instanceof Error ? e.message : "The photo couldn’t be read." }),
    );
    return () => {
      live = false;
    };
  }, [uri]);
  useEffect(() => {
    if (!read || phase.kind !== "review" || fileRef.current?.read === read) return;
    const t = setTimeout(() => {
      try {
        fileRef.current = { read, file: cardFile(read, flat) };
      } catch {
        // Made again on Save, which then says what went wrong.
      }
    }, 600);
    return () => clearTimeout(t);
  }, [read, flat, phase.kind]);
  useEffect(() => {
    if (student) void knowFolder(branchId, student.id);
  }, [student, branchId]);

  const leave = () => (router.canGoBack() ? router.back() : router.replace("/scan"));
  const next = () => (index + 1 < photos.length ? setIndex(index + 1) : leave());
  // Closing loses a card read and not saved (and the photos after it): asked first.
  const close = async () => {
    const later = photos.length - index - 1;
    if (phase.kind === "review" || phase.kind === "failed") {
      const ok = await confirmAsync({
        title: "Close without saving?",
        message: `This card isn’t saved${later ? `, and the ${later === 1 ? "next photo isn’t" : `${later} photos after it aren’t`} read yet` : ""}.`,
        confirmLabel: "Close",
        destructive: true,
      });
      if (!ok) return;
    }
    leave();
  };
  const typeInstead = () => {
    setReview(typedReview(lastChoices.shotsPerBull ?? 1));
    setTyped(true);
    setPhase({ kind: "review" });
  };
  // Only the total written on the card (any number of shots: 20, 30, 60).
  const typeTotal = () => {
    setMode("total");
    setPhase({ kind: "review" });
  };

  const totals = review ? reviewTotals(review) : null;
  // The card's shots as a result, for the replay (it follows every change made below).
  const replay = useMemo(
    () => (review ? paperEvaluation({ studentId: "", studentName: "", position: "standing", dateKey: today, shots: reviewShots(review), total: null, fileId: null, note: "" }) : null),
    [review, today],
  );
  const slots = totals?.shots ?? 10;
  const writtenNumber = Number(written);
  const writtenOk = written.trim() === "" || (Number.isInteger(writtenNumber) && writtenNumber >= 0 && writtenNumber <= slots * 10);
  const shotsNumber = Number(shotCount);
  const totalNumber = Number(typedTotal);
  const shotsOk = Number.isInteger(shotsNumber) && shotsNumber >= 1 && shotsNumber <= 200;
  const totalOk = typedTotal.trim() !== "" && Number.isInteger(totalNumber) && totalNumber >= 0 && shotsOk && totalNumber <= shotsNumber * 10;
  const ready = !!student && !!position && phase.kind === "review" && (mode === "total" ? totalOk && !!read : !!review && writtenOk);

  const remember = (s: PickedStudent, p: Position) => {
    lastChoices.student = s;
    lastChoices.position = p;
    lastChoices.dateKey = dateKey;
    lastChoices.kind = kind;
  };

  /** Only the total typed: saved over the shots said. */
  const saveTotal = async () => {
    if (!student || !position || !read || !totalOk) return;
    setPhase({ kind: "saving" });
    try {
      const file = fileRef.current?.read === read ? fileRef.current.file : cardFile(read, flat);
      await saveCard({ branchId, actor, student, position, dateKey, note, review: null, total: totalNumber, shotCount: shotsNumber, kind, file });
      remember(student, position);
      toast.success(`Saved for ${student.name}`, { description: `${totalNumber} out of ${shotsNumber * 10}, ${POSITION_LABELS[position].toLowerCase()}. The card’s photo goes to their Drive in the background.` });
      next();
    } catch (e) {
      fileRef.current = null;
      setPhase({ kind: "review" });
      toast.error("Couldn’t save the card", { description: e instanceof Error ? e.message : String(e) });
    }
  };

  const save = async () => {
    if (mode === "total") return saveTotal();
    if (!review || !student || !position || !read || !totals) return;
    const short = review.bulls.filter((b) => b.shots.length < review.shotsPerBull).map((b) => b.n);
    if (short.length) {
      const ok = await confirmAsync({
        title: short.length === 1 ? `Bull ${short[0]} has no shot` : `${short.length} bulls are short of a shot`,
        message: `${short.length === 1 ? "It counts" : `Bulls ${short.join(", ")} count`} as a miss (0). Save anyway?`,
        confirmLabel: "Save",
      });
      if (!ok) return;
    }
    setPhase({ kind: "saving" });
    try {
      const file = fileRef.current?.read === read ? fileRef.current.file : cardFile(read, flat);
      const official = !typed && written.trim() !== "" ? writtenNumber : null;
      await saveCard({ branchId, actor, student, position, dateKey, note, review, total: null, kind, written: official, file });
      remember(student, position);
      lastChoices.shotsPerBull = review.shotsPerBull;
      const shown = official ?? totals.total;
      toast.success(`Saved for ${student.name}`, {
        description: `${shown} out of ${totals.shots * 10}${official !== null && official !== totals.total ? " (as written on the card)" : ""}, ${POSITION_LABELS[position].toLowerCase()}. The card’s photo goes to their Drive in the background.`,
      });
      next();
    } catch (e) {
      // The copy is made again on the next try.
      fileRef.current = null;
      setPhase({ kind: "review" });
      toast.error("Couldn’t save the card", { description: e instanceof Error ? e.message : String(e) });
    }
  };

  const viewWidth = width - space.lg * 2;
  const title = photos.length > 1 ? `Card ${index + 1} of ${photos.length}` : "Check the card";
  // Who shot it and when, the position, what it was and the note: the same for scanned, typed and total-only cards.
  const details = (
    <>
      <ListSection title="Who and when">
        <ListRow
          icon={<UserRound size={20} color={colors.mutedForeground} />}
          title={student ? student.name : "Who shot it?"}
          subtitle={student ? "Tap to change" : "Choose the student"}
          onPress={() => setPicking(true)}
          testID="scan-student"
        />
        <ListRow
          icon={<Calendar size={20} color={colors.mutedForeground} />}
          title={formatDateKey(dateKey, "medium")}
          subtitle={dateKey === today ? "Today: the day it was shot" : "The day it was shot"}
          onPress={() => setChoosingDate(true)}
          testID="scan-date"
        />
      </ListSection>
      <ListSection title="Position">
        <View style={styles.inset}>
          <SegmentedControl
            testID="scan-position"
            value={position ?? ("" as Position)}
            options={POSITIONS.map((p) => ({ value: p, label: POSITION_LABELS[p] }))}
            onChange={setPosition}
          />
        </View>
      </ListSection>
      <ListSection title="What it was" footer="Practice, a competition or an evaluation: scores, charts and reports can show one kind.">
        <View style={styles.inset}>
          <SegmentedControl testID="scan-kind" value={kind} options={RESULT_KINDS.map((k) => ({ value: k, label: RESULT_KIND_LABELS[k] }))} onChange={setKind} />
        </View>
      </ListSection>
      <Field
        label="Coach’s note (optional)"
        value={note}
        onChangeText={setNote}
        multiline
        maxLength={2000}
        placeholder="Anything worth remembering about this card."
        testID="scan-note"
      />
    </>
  );
  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.grouped }]} edges={["bottom"]} testID="scan-review">
      <Stack.Screen
        options={{
          title,
          headerLeft: () => (
            <IconButton icon={<X size={22} color={colors.foreground} />} accessibilityLabel="Close" onPress={() => void close()} testID="scan-review-close" />
          ),
        }}
      />
      <ZoomScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        // The note being typed stays above the keyboard; dragging the page down puts the keyboard away.
        automaticallyAdjustKeyboardInsets
        keyboardDismissMode="interactive"
      >
        {phase.kind === "reading" || !uri ? (
          <Reading uri={uri} width={viewWidth} />
        ) : phase.kind === "failed" ? (
          <Card style={styles.failed}>
            <T variant="subheading">The card couldn’t be read</T>
            <T tone="muted">{phase.reason}</T>
            {read ? (
              <Image
                source={{ uri: read.uri }}
                style={{ width: viewWidth - space.lg * 2, height: ((viewWidth - space.lg * 2) * read.height) / read.width, borderRadius: 10 }}
                contentFit="contain"
              />
            ) : null}
            <View style={styles.actions}>
              {fromCamera ? (
                <Button icon={<Camera size={18} color={colors.primaryForeground} />} onPress={() => router.replace("/scan/camera")} testID="scan-retake">
                  Take it again
                </Button>
              ) : null}
              <Button
                variant="outline"
                icon={<ImageIcon size={18} color={colors.foreground} />}
                onPress={typeInstead}
                disabled={!read}
                testID="scan-type-instead"
              >
                Type the scores instead
              </Button>
              <Button variant="outline" icon={<Hash size={18} color={colors.foreground} />} onPress={typeTotal} disabled={!read} testID="scan-type-total">
                Type only the total
              </Button>
              {photos.length > 1 ? (
                <Button variant="ghost" onPress={next}>
                  Skip this photo
                </Button>
              ) : null}
            </View>
          </Card>
        ) : mode === "total" && read ? (
          <>
            <ListSection title="The total written on the card" footer={shotsOk ? `Out of ${shotsNumber * 10}.` : "Shots: a whole number from 1 to 200."}>
              <View style={styles.insetGap}>
                <Field
                  label="Total"
                  value={typedTotal}
                  onChangeText={(t) => setTypedTotal(t.replace(/[^0-9]/g, "").slice(0, 4))}
                  keyboardType="number-pad"
                  error={typedTotal.trim() === "" || totalOk || !shotsOk ? null : `A whole number up to ${shotsNumber * 10}.`}
                  testID="scan-typed-total"
                />
                <Field
                  label="Shots"
                  hint="10 for most cards; 20, 30 or 60 for longer ones."
                  value={shotCount}
                  onChangeText={(t) => setShotCount(t.replace(/[^0-9]/g, "").slice(0, 3))}
                  keyboardType="number-pad"
                  testID="scan-shot-count"
                />
              </View>
            </ListSection>
            {details}
          </>
        ) : review && read ? (
          <>
            <Card style={styles.head}>
              <T variant="display" testID="scan-total">
                {totals?.total ?? 0}
                <T variant="heading" tone="muted">
                  {" "}
                  / {(totals?.shots ?? 10) * 10}
                </T>
              </T>
              <T variant="small" tone={totals && (totals.toCheck || totals.missing) ? "warning" : "muted"}>
                {totals && totals.toCheck ? `${totals.toCheck} ${totals.toCheck === 1 ? "bull is" : "bulls are"} worth a look: tap ${totals.toCheck === 1 ? "it" : "them"} below` : "Every bull looks right"}
              </T>
            </Card>
            {/* The shots played back as soon as the card is read; what's changed below shows here too. */}
            {replay && canReplay(replay) ? (
              <Card style={styles.center}>
                <ShotReplay key={uri} evaluation={replay} color={position ? POSITION_COLORS[position] : UNSET_COLOR} size={Math.min(viewWidth - space.lg * 2, 380)} autoPlay />
              </Card>
            ) : null}
            <ListSection title="The card" footer="Tap a bull to check it and move its shots. Pinch the card with two fingers to zoom in.">
              <View style={styles.insetGap}>
                {flat ? (
                  <CardView image={flat.image} width={flat.width} height={flat.height} review={review} viewWidth={viewWidth - space.sm * 2} onBull={setEditing} testID="scan-card" />
                ) : (
                  <Image
                    source={{ uri: read.uri }}
                    style={{ width: viewWidth - space.sm * 2, height: ((viewWidth - space.sm * 2) * read.height) / read.width, borderRadius: 10 }}
                    contentFit="contain"
                  />
                )}
                <BullTiles review={review} onBull={setEditing} />
              </View>
            </ListSection>
            <ListSection
              title="Shots per bull"
              footer="How many shots were fired at each bull. Most cards have one: 10 shots, out of 100. Some drills fire two at each bull: 20 shots, out of 200. The app counts them by itself; change it here if it got it wrong."
            >
              <View style={styles.inset}>
                <SegmentedControl
                  testID="scan-shots-per-bull"
                  value={String(review.shotsPerBull)}
                  options={[
                    { value: "1", label: "One" },
                    { value: "2", label: "Two" },
                  ]}
                  onChange={(v) => setReview(changeShotsPerBull(review, Number(v)))}
                />
              </View>
            </ListSection>
            {/* A card the coach already scored by hand: the written score is the official one. */}
            {typed ? null : (
              <ListSection
                title="Score written on the card (official)"
                footer="For a card the coach already scored: families, charts and reports show the written score; the app’s reading is kept for reference. Leave it empty otherwise."
              >
                <View style={styles.inset}>
                  <Field
                    value={written}
                    onChangeText={(t) => setWritten(t.replace(/[^0-9]/g, "").slice(0, 4))}
                    keyboardType="number-pad"
                    placeholder={`The app read ${totals?.total ?? 0}`}
                    error={writtenOk ? null : `A whole number up to ${slots * 10}.`}
                    accessibilityLabel="Score written on the card"
                    testID="scan-written"
                  />
                </View>
              </ListSection>
            )}
            {details}
          </>
        ) : null}
      </ZoomScrollView>
      {phase.kind === "review" || phase.kind === "saving" ? (
        <View style={[styles.footer, { borderTopColor: colors.border, backgroundColor: colors.grouped }]}>
          {!student || !position ? (
            <T variant="small" tone="muted" style={styles.hint}>
              {!student ? "Choose who shot the card" : "Choose the position"} to save it.
            </T>
          ) : null}
          <Button size="lg" onPress={() => void save()} disabled={!ready} busy={phase.kind === "saving"} testID="scan-save">
            {student ? `Save for ${student.name.split(" ")[0]}` : "Save"}
          </Button>
        </View>
      ) : null}
      <BullEditor image={read?.image ?? null} review={review ?? typedReview(1)} n={editing} onChange={setReview} onClose={() => setEditing(null)} />
      <StudentPicker
        open={picking}
        recent={lastChoices.student}
        onClose={() => setPicking(false)}
        onPick={(s) => {
          setStudent(s);
          setPicking(false);
        }}
      />
      <DatePickerDialog
        open={choosingDate}
        title="The day it was shot"
        value={dateKey}
        today={today}
        max={today}
        onPick={(d) => {
          setDateKey(d);
          setChoosingDate(false);
        }}
        onClose={() => setChoosingDate(false)}
      />
    </SafeAreaView>
  );
}

/** The photo while the scan reads it. */
function Reading({ uri, width }: { uri: string | null; width: number }) {
  const colors = useColors();
  return (
    <View style={[styles.reading, { width, height: width * 1.3, backgroundColor: colors.card, borderColor: colors.border }]}>
      {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="contain" /> : null}
      <View style={[styles.readingNote, { backgroundColor: colors.card }]}>
        <ActivityIndicator />
        <T variant="label">Reading the target…</T>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl * 5 },
  reading: { borderRadius: 12, overflow: "hidden", alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth },
  readingNote: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.md, borderRadius: 999 },
  failed: { gap: space.md },
  actions: { gap: space.sm },
  head: { gap: space.xs },
  center: { alignItems: "center" },
  inset: { padding: space.sm },
  insetGap: { padding: space.sm, gap: space.md },
  footer: { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm, gap: space.sm, borderTopWidth: StyleSheet.hairlineWidth },
  hint: { textAlign: "center" },
});
