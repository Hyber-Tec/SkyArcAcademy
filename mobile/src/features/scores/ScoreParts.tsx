import { useImage } from "@shopify/react-native-skia";
import { type Evaluation, POSITION_LABELS, type Position, wholePer10 } from "@shared/shooting/evaluation";
import { offsetWords } from "@shared/shooting/target";
import { FLAT_SIZE, wasScanned } from "@shared/targets/flat";
import { type DateKey, formatDateKey } from "@shared/time";
import { Trophy } from "lucide-react-native";
import { type ReactNode, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { Card } from "@/components/Card";
import { T } from "@/components/Text";
import { type EvaluationDoc, useDriveFile } from "@/features/data/hooks";
import { useLocalCopy } from "@/features/drive/download";
import { one } from "@/features/reports/format";
import { waitingCopy } from "@/features/scan/uploads";
import { clock } from "@/features/schedule/format";
import { radius, space, useColors } from "@/theme";
import { scorePer10, scoreTotal } from "./format";

/**
 * What a score's screen shows that doesn't change it, the same for the staff (src/app/(app)/(staff)/score/[id].tsx,
 * where it can be changed) and the family (src/app/(app)/(family)/score/[id].tsx, read-only): its head, its facts, and
 * a scanned card's picture.
 */

/** "20 shots · 3 inner tens · group 12.4 mm · sits right and low" (and, while a card is checked, its missing shots). */
export function scoreFacts(e: Pick<Evaluation, "source" | "shots" | "innerTens" | "groupMm" | "mpi">, missing = 0): string[] {
  const where = offsetWords(e.mpi);
  return [
    `${e.shots} shots`,
    // A SIUS result's, and a competition's when its sheet gave them (a paper card has none).
    e.innerTens !== null ? `${e.innerTens} inner ${e.innerTens === 1 ? "ten" : "tens"}` : null,
    e.groupMm !== null ? `group ${e.groupMm} mm` : null,
    e.mpi ? (where ? `sits ${where}` : "centred") : null,
    missing ? `${missing} missing (0)` : null,
  ].filter((x): x is string => !!x);
}

/**
 * A score's head: whose it is and when (a SIUS result's time too), the total as its source gives it (a paper card out of
 * its shots × 10), and its facts. The corner gives it per 10 shots so results of other lengths compare: as the staff
 * read it (`decimal`: a SIUS result's decimal, for results of another length than ten), or as the family's charts and
 * personal bests count it (`whole`: whole scores, with a SIUS result's decimal under them). `children` go at the
 * bottom (the family's badges).
 */
export function ScoreHead({
  evaluation: e,
  name,
  dateKey,
  hour12,
  facts,
  figure = "decimal",
  children,
}: {
  evaluation: Pick<Evaluation, "source" | "shots" | "total" | "wholeTotal" | "timeMin">;
  name: string;
  /** The date shown (the staff's draft may have changed it). */
  dateKey: DateKey;
  hour12: boolean;
  facts: string[];
  figure?: "decimal" | "whole";
  children?: ReactNode;
}) {
  const sius = e.source === "sius";
  const decimal = scorePer10(e);
  const whole = wholePer10(e);
  const corner =
    figure === "decimal"
      ? e.shots !== 10
        ? { value: decimal ?? "–", under: null }
        : null
      : e.shots !== 10 || sius
        ? { value: whole !== null ? one(whole) : "–", under: sius && decimal !== null ? `${one(decimal)} decimal` : null }
        : null;
  return (
    <Card style={styles.head}>
      <View style={styles.headTop}>
        <View style={styles.grow}>
          <T variant="label" numberOfLines={2}>
            {name}
          </T>
          <T variant="small" tone="muted" testID="score-when">
            {formatDateKey(dateKey, "medium")}
            {sius && e.timeMin !== null ? `, ${clock(e.timeMin, hour12)}` : ""}
          </T>
        </View>
        {/* Per 10 shots, for results of another length (a card of ten already reads out of 100). */}
        {corner ? (
          <View style={styles.per10} testID="score-per10">
            <T variant="stat">{corner.value}</T>
            <T variant="tiny" tone="muted">
              per 10
            </T>
            {corner.under ? (
              <T variant="tiny" tone="muted">
                {corner.under}
              </T>
            ) : null}
          </View>
        ) : null}
      </View>
      <T variant="display" testID="score-total">
        {scoreTotal(e)}
        {/* Out of shots × 10 for a paper card only: a SIUS result or a competition sheet can count decimals (10.9 a shot). */}
        {e.source !== "paper" ? null : (
          <T variant="heading" tone="muted">
            {" "}
            / {e.shots * 10}
          </T>
        )}
      </T>
      <T tone="muted">{facts.join(" · ")}</T>
      {children}
    </Card>
  );
}

/**
 * A scanned card's picture: its copy still on this phone when it was saved moments ago (src/features/scan/uploads.ts),
 * otherwise the Drive's flattened copy, read through the Storage rules. `flat` is the picture once it's in and is the
 * flattened card; `failed`, that it couldn't be read or isn't the flattened card. `file` is the score's Drive record
 * (any score's: its name, or that it can't be read).
 */
export function useCardPicture(e: EvaluationDoc | null) {
  const scanned = !!e && wasScanned(e);
  const fileId = e?.fileId ?? null;
  const file = useDriveFile(fileId);
  const f = file.data;
  const waiting = useMemo(() => (scanned && fileId ? waitingCopy(fileId) : null), [scanned, fileId]);
  const copy = useLocalCopy(scanned && !waiting && f && f.status === "ready" && !f.trashed ? { id: f.id, kind: f.kind, size: f.size } : null);
  const image = useImage(waiting ?? copy.uri);
  const flat = image && image.width() === FLAT_SIZE.width && image.height() === FLAT_SIZE.height ? image : null;
  return { scanned, file, flat, failed: !!copy.error || (!!image && !flat), waiting: !!waiting };
}

/**
 * "New best" on a result that beat every earlier one in its position when it was shot (shared/src/shooting/progress.ts),
 * as the website marks it: several results of a position can carry it.
 */
export function BestBadge({ position, testID }: { position?: Position; testID?: string }) {
  const colors = useColors();
  return (
    <View
      style={[styles.best, { backgroundColor: colors.warningTint }]}
      accessible
      accessibilityLabel={`A new personal best${position ? `: higher than every earlier ${POSITION_LABELS[position].toLowerCase()} result` : ""}`}
      testID={testID}
    >
      <Trophy size={11} color={colors.warning} />
      <T variant="tiny" style={[styles.bestText, { color: colors.warning }]} numberOfLines={1}>
        New best
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { gap: space.xs },
  headTop: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  grow: { flex: 1, gap: 2 },
  per10: { alignItems: "flex-end" },
  best: { flexDirection: "row", alignItems: "center", gap: 3, borderRadius: radius.full, paddingHorizontal: 7, paddingVertical: 2, alignSelf: "center" },
  bestText: { fontWeight: "700" },
});
