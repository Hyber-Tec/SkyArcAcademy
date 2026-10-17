import { POSITIONS, POSITION_LABELS, type Position } from "@shared/shooting/evaluation";
import { type CardReview, changeShotsPerBull, reviewTotals, startReview, typedReview } from "@shared/targets/review";
import { type DateKey, formatDateKey } from "@shared/time";
import { Image } from "expo-image";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { Calendar, Camera, ImageIcon, UserRound, X } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
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
import { useAcademyNow } from "@/features/data/hooks";
import { BullEditor } from "@/features/scan/BullEditor";
import { BullTiles } from "@/features/scan/BullTiles";
import { CardView } from "@/features/scan/CardView";
import { lastChoices } from "@/features/scan/choices";
import { type CardFile, type FlatCard, type ReadPhoto, cardFile, flattenCard, readPhoto } from "@/features/scan/photo";
import { knowFolder, saveCard } from "@/features/scan/save";
import { type PickedStudent, StudentPicker } from "@/features/scan/StudentPicker";
import { toast } from "@/lib/toast";
import { useBranch } from "@/state/BranchProvider";
import { space, useColors } from "@/theme";

type Phase = { kind: "reading" } | { kind: "failed"; reason: string } | { kind: "review" } | { kind: "saving" };

/**
 * A scanned card, checked and saved: the photos come from the camera or the library (`photos`, one or several, read
 * one after the other). Each is read (photo.ts), shown flattened with every bull's score, and saved once a person has
 * chosen who shot it, the position and the date: the card's copy goes to the student's Drive folder and its scores
 * become an evaluation, which the progress reports use.
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
  const { branchId, actor, settings } = useBranch();
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

  const close = () => (router.canGoBack() ? router.back() : router.replace("/scan"));
  const next = () => (index + 1 < photos.length ? setIndex(index + 1) : close());
  const typeInstead = () => {
    setReview(typedReview(lastChoices.shotsPerBull ?? 1));
    setPhase({ kind: "review" });
  };

  const totals = review ? reviewTotals(review) : null;
  const ready = !!review && !!student && !!position && phase.kind === "review";

  const save = async () => {
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
      await saveCard({ branchId, actor, student, position, dateKey, note, review, total: null, file });
      lastChoices.student = student;
      lastChoices.position = position;
      lastChoices.dateKey = dateKey;
      lastChoices.shotsPerBull = review.shotsPerBull;
      toast.success(`Saved for ${student.name}`, { description: `${totals.total} out of ${totals.shots * 10}, ${POSITION_LABELS[position].toLowerCase()}. The card’s photo goes to their Drive in the background.` });
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
  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.grouped }]} edges={["bottom"]} testID="scan-review">
      <Stack.Screen
        options={{
          title,
          headerLeft: () => (
            <IconButton icon={<X size={22} color={colors.foreground} />} accessibilityLabel="Close" onPress={close} testID="scan-review-close" />
          ),
        }}
      />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
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
              {photos.length > 1 ? (
                <Button variant="ghost" onPress={next}>
                  Skip this photo
                </Button>
              ) : null}
            </View>
          </Card>
        ) : review && read ? (
          <>
            {flat ? (
              <CardView image={flat.image} width={flat.width} height={flat.height} review={review} viewWidth={viewWidth} onBull={setEditing} />
            ) : (
              <Image
                source={{ uri: read.uri }}
                style={{ width: viewWidth, height: (viewWidth * read.height) / read.width, borderRadius: 12 }}
                contentFit="contain"
              />
            )}
            <View style={styles.totalRow}>
              <T variant="title" testID="scan-total">
                {totals?.total ?? 0}
                <T variant="heading" tone="muted">
                  {" "}
                  / {(totals?.shots ?? 10) * 10}
                </T>
              </T>
              <T variant="small" tone={totals && (totals.toCheck || totals.missing) ? "warning" : "muted"} style={styles.totalNote}>
                {totals && totals.toCheck ? `${totals.toCheck} ${totals.toCheck === 1 ? "bull" : "bulls"} to check: tap to look` : "Every bull looks right"}
              </T>
            </View>
            <BullTiles review={review} onBull={setEditing} />
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
            <ListSection title="The card">
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
        ) : null}
      </ScrollView>
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
        weekStartsOn={settings.general.weekStartsOn}
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
  totalRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space.md },
  totalNote: { flexShrink: 1, textAlign: "right" },
  inset: { padding: space.sm },
  footer: { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm, gap: space.sm, borderTopWidth: StyleSheet.hairlineWidth },
  hint: { textAlign: "center" },
});
