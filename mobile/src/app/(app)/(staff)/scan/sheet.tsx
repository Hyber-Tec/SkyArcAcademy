import { POSITIONS, POSITION_LABELS, type Position, RESULT_KINDS, RESULT_KIND_LABELS, type ResultKind } from "@shared/shooting/evaluation";
import { type DateKey } from "@shared/time";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { Camera, Images, Plus, Trash2, UserRound } from "lucide-react-native";
import { useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { DateField } from "@/components/DateField";
import { Field } from "@/components/Field";
import { IconButton } from "@/components/IconButton";
import { ListRow, ListSection } from "@/components/List";
import { Screen } from "@/components/Screen";
import { SegmentedControl } from "@/components/SegmentedControl";
import { SwitchRow } from "@/components/SwitchRow";
import { T } from "@/components/Text";
import { useAcademyNow, useStudent } from "@/features/data/hooks";
import { type SheetPhoto, type SheetRow, readSheet, saveSheetResults, sheetPhoto } from "@/features/scan/sheet";
import { type PickedStudent, StudentPicker } from "@/features/scan/StudentPicker";
import { errorMessage } from "@/lib/api";
import { toast } from "@/lib/toast";
import { useBranch } from "@/state/BranchProvider";
import { radius, space, useColors } from "@/theme";

interface Row {
  key: number;
  position: Position | null;
  shots: string;
  total: string;
  innerTens: string;
  /** Each shot, when the sheet listed them and they add up. */
  values: number[] | null;
  /** What to check, when the sheet was only partly read ("1 shot not read: …"). */
  check?: string | null;
}

const emptyRow = (key: number, position: Position | null = null): Row => ({ key, position, shots: "", total: "", innerTens: "", values: null });

/**
 * Why the sheet wasn't read, in the reader's own words when it says ("Reading sheets isn't switched on yet. Type the
 * numbers instead."): the app's usual wording would call that a lost connection. Anything else gets the usual line.
 */
function readError(e: unknown): string {
  const message = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message ?? "").replace(/^\[[^\]]+\]\s*/, "") : "";
  return /\s.*\.$/.test(message) && !/INTERNAL/.test(message) ? message : errorMessage(e, "The sheet couldn’t be read. Type the numbers below.");
}

const digits = (t: string, max: number) => t.replace(/[^0-9]/g, "").slice(0, max);
const decimals = (t: string) => t.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1").slice(0, 6);

/**
 * Add a competition: a match's results from a photo of its results sheet (the manager's second meeting, P7), as the
 * website's "Add a competition result" (web/src/features/scores/CompetitionDialog.tsx). The photo (the camera, or
 * Photos) is read on the server to fill the form: the match, the date, the course of fire, each position's total and
 * inner tens; the staff check every number and save. Each position becomes a result labelled Competition (or what they
 * choose), with the photo filed in the student's Drive folder. Opened from a student's page (`studentId`) or the Scan tab
 * (the student is chosen here).
 */
export default function CompetitionSheetScreen() {
  const params = useLocalSearchParams<{ studentId?: string }>();
  const { branchId, actor } = useBranch();
  const colors = useColors();
  const { today } = useAcademyNow();
  const preset = useStudent(params.studentId ?? null);
  const [picked, setPicked] = useState<PickedStudent | null>(null);
  const student: PickedStudent | null = picked ?? (preset.data ? { id: preset.data.id, name: preset.data.name } : null);
  const [picking, setPicking] = useState(false);
  const [photo, setPhoto] = useState<SheetPhoto | null>(null);
  const [reading, setReading] = useState(false);
  const [readNote, setReadNote] = useState<string | null>(null);
  const [match, setMatch] = useState("");
  const [course, setCourse] = useState("");
  const [dateKey, setDateKey] = useState<DateKey>(today);
  const [decimal, setDecimal] = useState(false);
  const [kind, setKind] = useState<ResultKind>("competition");
  const [note, setNote] = useState("");
  const [rows, setRows] = useState<Row[]>([emptyRow(1, "standing")]);
  const [busy, setBusy] = useState(false);
  const nextKey = useRef(2);

  const setRow = (key: number, patch: Partial<Row>) => setRows((all) => all.map((r) => (r.key === key ? { ...r, ...patch, values: "values" in patch ? (patch.values ?? null) : null } : r)));

  /** A photo of the sheet: read on the server, and what it found put in the form. */
  const choose = async (from: "camera" | "library") => {
    let picked: ImagePicker.ImagePickerResult;
    try {
      if (from === "camera") {
        const allowed = await ImagePicker.requestCameraPermissionsAsync();
        if (!allowed.granted) return toast.error("The camera isn’t allowed", { description: "Allow Sky Arc to use the camera in the phone’s Settings, or choose a photo." });
        picked = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 1, exif: false });
      } else {
        picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1, exif: false });
      }
    } catch (e) {
      return toast.error(from === "camera" ? "Couldn’t open the camera" : "Couldn’t open Photos", { description: e instanceof Error ? e.message : String(e) });
    }
    if (picked.canceled || !picked.assets[0]) return;
    setReading(true);
    setReadNote(null);
    try {
      const p = await sheetPhoto(picked.assets[0].uri);
      setPhoto(p);
      const { reading: r, found } = await readSheet(branchId, p);
      if (!found) return setReadNote("No text found on it. Type the numbers below.");
      if (r.match) setMatch(r.match);
      if (r.course) setCourse(r.course);
      if (r.dateKey && r.dateKey <= today) setDateKey(r.dateKey);
      setDecimal(r.decimal);
      if (r.positions.length) {
        setRows(
          r.positions.map((pos) => {
            // Shots the reader missed: the course says how many there are; the total then needs the sheet's own.
            const missed = r.perPosition !== null && pos.shots.length < r.perPosition ? r.perPosition - pos.shots.length : 0;
            return {
              key: nextKey.current++,
              position: pos.position,
              shots: String(pos.shots.length + missed),
              total: r.decimal ? pos.decimalTotal.toFixed(1) : String(pos.wholeTotal),
              innerTens: r.decimal ? "" : String(pos.innerTens),
              values: r.consistent ? pos.shots : null,
              check: missed ? `${missed} ${missed === 1 ? "shot" : "shots"} not read: type this position’s total from the sheet.` : null,
            };
          }),
        );
      } else if (r.total !== null) {
        setRows([{ ...emptyRow(nextKey.current++, rows[0]?.position ?? "standing"), total: String(r.total), innerTens: r.innerTens === null ? "" : String(r.innerTens) }]);
      }
      const first = student?.name.split(" ")[0]?.toLowerCase();
      const who = r.name && first && !r.name.toLowerCase().includes(first) ? ` The sheet names ${r.name}: check it’s ${student?.name}’s.` : r.name && !student ? ` The sheet names ${r.name}.` : "";
      setReadNote(
        r.consistent
          ? `Read from the sheet: ${r.positions.length} ${r.positions.length === 1 ? "position" : "positions"}, adding up to the printed ${r.total}${r.innerTens !== null ? `-${r.innerTens}` : ""}.${who}`
          : `Partly read: check every number against the sheet.${who}`,
      );
    } catch (e) {
      setReadNote(readError(e));
    } finally {
      setReading(false);
    }
  };

  const parsed = rows.map((r) => {
    const shots = Number(r.shots);
    const total = Number(r.total);
    const tens = r.innerTens.trim() === "" ? null : Number(r.innerTens);
    const max = shots * (decimal ? 10.9 : 10);
    const ok =
      !!r.position &&
      Number.isInteger(shots) &&
      shots >= 1 &&
      shots <= 200 &&
      r.total.trim() !== "" &&
      Number.isFinite(total) &&
      total >= 0 &&
      total <= max + 1e-9 &&
      (decimal || Number.isInteger(total)) &&
      (tens === null || (Number.isInteger(tens) && tens >= 0 && tens <= shots));
    return { r, shots, total, tens, ok };
  });
  const positionsDistinct = new Set(rows.map((r) => r.position)).size === rows.length;
  const ready = !!student && parsed.length > 0 && parsed.every((p) => p.ok) && positionsDistinct && !reading;

  const save = async () => {
    if (!ready || !student || busy) return;
    setBusy(true);
    try {
      const results: SheetRow[] = parsed.map(({ r, shots, total, tens }) => ({ position: r.position as Position, shots, total, innerTens: tens, values: r.values }));
      await saveSheetResults({ branchId, actor, student, dateKey, kind, match, course, note, rows: results, photo });
      toast.success(results.length === 1 ? "Competition result added" : `${results.length} competition results added`, {
        description: photo ? `For ${student.name}. The sheet goes to their Drive folder in the background.` : `For ${student.name}.`,
      });
      router.back();
    } catch (e) {
      toast.error("Not saved", { description: errorMessage(e, e instanceof Error ? e.message : "Please try again.") });
      setBusy(false);
    }
  };

  const free = POSITIONS.filter((p) => !rows.some((r) => r.position === p));
  return (
    <Screen
      testID="sheet-screen"
      footer={
        <Button size="lg" disabled={!ready} busy={busy} onPress={() => void save()} testID="sheet-save">
          {rows.length > 1 ? `Save ${rows.length} results` : "Save the result"}
        </Button>
      }
    >
      <T tone="muted">A photo of the results sheet fills the form; check every number before saving.</T>

      <ListSection title="Who">
        <ListRow
          icon={<UserRound size={20} color={colors.mutedForeground} />}
          title={student ? student.name : preset.loading ? "…" : "Who shot it?"}
          subtitle={student ? "Tap to change" : "Choose the student"}
          onPress={() => setPicking(true)}
          testID="sheet-student"
        />
      </ListSection>

      <ListSection title="The results sheet">
        <View style={styles.inset}>
          {photo ? <Image source={{ uri: photo.uri }} style={styles.photo} contentFit="contain" accessibilityLabel="The results sheet’s photo" /> : null}
          {reading ? (
            <View style={styles.reading} testID="sheet-reading">
              <ActivityIndicator />
              <T variant="label">Reading the sheet…</T>
            </View>
          ) : null}
          {readNote ? (
            <T variant="small" tone="muted" testID="sheet-read-note">
              {readNote}
            </T>
          ) : null}
          <View style={styles.buttons}>
            <Button style={styles.grow} icon={<Camera size={18} color={colors.primaryForeground} />} disabled={reading} onPress={() => void choose("camera")} testID="sheet-take-photo">
              {photo ? "Take another" : "Take a photo"}
            </Button>
            <Button style={styles.grow} variant="outline" icon={<Images size={18} color={colors.foreground} />} disabled={reading} onPress={() => void choose("library")} testID="sheet-choose-photo">
              Choose a photo
            </Button>
          </View>
        </View>
      </ListSection>

      <ListSection title="The match">
        <View style={styles.insetGap}>
          <Field label="Match" value={match} onChangeText={setMatch} maxLength={120} placeholder="Walton August 3P" testID="sheet-match" />
          <Field label="Course of fire" value={course} onChangeText={setCourse} maxLength={80} placeholder="3x20 Air Rifle" testID="sheet-course" />
          <DateField label="Date" value={dateKey} onChange={setDateKey} today={today} max={today} pickerTitle="The day of the match" testID="sheet-date" />
        </View>
      </ListSection>

      <ListSection title="What it was">
        <View style={styles.inset}>
          <SegmentedControl testID="sheet-kind" value={kind} options={RESULT_KINDS.map((k) => ({ value: k, label: RESULT_KIND_LABELS[k] }))} onChange={setKind} />
        </View>
        <SwitchRow title="Decimal scoring" subtitle="Totals with tenths (587.4) rather than whole numbers (478)" value={decimal} onValueChange={setDecimal} testID="sheet-decimal" />
      </ListSection>

      {rows.map((r, i) => {
        const p = parsed[i];
        const taken = rows.some((o) => o.key !== r.key && o.position === r.position);
        return (
          <Card key={r.key} style={styles.row} testID={`sheet-row-${i}`}>
            <View style={styles.rowHead}>
              <T variant="label" style={styles.grow}>
                {r.position ? POSITION_LABELS[r.position] : "A position"}
              </T>
              {rows.length > 1 ? (
                <IconButton
                  icon={<Trash2 size={17} color={colors.mutedForeground} />}
                  size={34}
                  accessibilityLabel={`Remove ${r.position ? POSITION_LABELS[r.position].toLowerCase() : "this position"}`}
                  onPress={() => setRows((all) => all.filter((o) => o.key !== r.key))}
                  testID={`sheet-row-${i}-remove`}
                />
              ) : null}
            </View>
            <SegmentedControl
              testID={`sheet-row-${i}-position`}
              value={r.position ?? ("" as Position)}
              options={POSITIONS.map((x) => ({ value: x, label: POSITION_LABELS[x] }))}
              onChange={(x) => setRow(r.key, { position: x, values: r.values })}
            />
            <View style={styles.numbers}>
              <View style={styles.number}>
                <Field label="Shots" value={r.shots} onChangeText={(t) => setRow(r.key, { shots: digits(t, 3) })} keyboardType="number-pad" testID={`sheet-row-${i}-shots`} />
              </View>
              <View style={styles.number}>
                <Field
                  label="Total"
                  value={r.total}
                  onChangeText={(t) => setRow(r.key, { total: decimal ? decimals(t) : digits(t, 4) })}
                  keyboardType={decimal ? "decimal-pad" : "number-pad"}
                  testID={`sheet-row-${i}-total`}
                />
              </View>
              <View style={styles.number}>
                <Field label="Inner tens" value={r.innerTens} onChangeText={(t) => setRow(r.key, { innerTens: digits(t, 3) })} keyboardType="number-pad" testID={`sheet-row-${i}-tens`} />
              </View>
            </View>
            {taken ? (
              <T variant="small" tone="destructive">
                This position is already above.
              </T>
            ) : r.check ? (
              <T variant="small" tone="warning">
                {r.check}
              </T>
            ) : !p.ok && (r.total.trim() !== "" || r.shots.trim() !== "") ? (
              <T variant="small" tone="muted">
                {`Shots from 1 to 200; the total at most ${Number.isFinite(p.shots) ? (p.shots * (decimal ? 10.9 : 10)).toFixed(decimal ? 1 : 0) : "10 a shot"}${decimal ? "" : ", a whole number"}.`}
              </T>
            ) : null}
          </Card>
        );
      })}
      {free.length && rows.length < POSITIONS.length ? (
        <Button variant="outline" icon={<Plus size={18} color={colors.foreground} />} onPress={() => setRows((all) => [...all, emptyRow(nextKey.current++, free[0])])} testID="sheet-add-position">
          Add a position
        </Button>
      ) : null}

      <Field label="Note (optional)" value={note} onChangeText={setNote} multiline maxLength={2000} placeholder="Anything worth remembering about this match." testID="sheet-note" />

      <StudentPicker
        open={picking}
        title="Whose results?"
        onClose={() => setPicking(false)}
        onPick={(s) => {
          setPicked(s);
          setPicking(false);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  inset: { padding: space.md, gap: space.md },
  insetGap: { padding: space.md, gap: space.md },
  photo: { width: "100%", height: 220, borderRadius: radius.md },
  reading: { flexDirection: "row", alignItems: "center", gap: space.sm },
  buttons: { flexDirection: "row", gap: space.sm },
  grow: { flex: 1 },
  row: { gap: space.md },
  rowHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  numbers: { flexDirection: "row", gap: space.sm },
  number: { flex: 1 },
});
