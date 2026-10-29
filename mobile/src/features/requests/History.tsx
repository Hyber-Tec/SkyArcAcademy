import { type ClassRequest, type ClassRequestAction, type ClassRequestStep, requestHistory, requestStepText } from "@shared/schedule/requests";
import { StyleSheet, View } from "react-native";
import { ListSection } from "@/components/List";
import { T } from "@/components/Text";
import { space, useColors } from "@/theme";
import { askedWhen } from "./RequestRow";

/** Each step's dot: the family's asks in amber, the academy's suggestions in blue, a booking in green. */
const DOT: Record<ClassRequestAction, string> = {
  asked: "#D97706",
  asked_again: "#D97706",
  offered: "#2563EB",
  accepted: "#16A34A",
  approved: "#16A34A",
  rejected: "#71717A",
  withdrawn: "#71717A",
};

type Reader = { viewer: "family" | "office"; me: string; timezone: string; hour12: boolean };

/**
 * A request's back and forth, oldest first, as the website shows it: who asked for which class, what the academy
 * suggested, accepted or asked for again, and how it ended, each with its note in quotes and when. For a family the
 * academy's people are "The academy" (`viewer`), and `me` (the reader's email) is "You". Nothing for a request from
 * before the steps were kept.
 */
export function RequestHistory({ r, testID, ...reader }: Reader & { r: Pick<ClassRequest, "history">; testID?: string }) {
  const steps = requestHistory(r);
  if (!steps.length) return null;
  return (
    <ListSection title="History" testID={testID}>
      {steps.map((s, i) => (
        <Step key={`${i}-${s.action}`} step={s} {...reader} testID={testID ? `${testID}-${i}` : undefined} />
      ))}
    </ListSection>
  );
}

function Step({ step, viewer, me, timezone, hour12, divider = false, testID }: Reader & { step: ClassRequestStep; divider?: boolean; testID?: string }) {
  const colors = useColors();
  return (
    <View style={[styles.step, divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]} testID={testID}>
      <View style={[styles.dot, { backgroundColor: DOT[step.action] }]} />
      <View style={styles.grow}>
        <T variant="small">{requestStepText(step, viewer, me)}</T>
        {step.note ? (
          <T variant="small" tone="muted">
            “{step.note}”
          </T>
        ) : null}
        <T variant="tiny" tone="muted">
          {askedWhen(step.at, timezone, hour12)}
        </T>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  step: { flexDirection: "row", alignItems: "flex-start", gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  grow: { flex: 1, gap: 2 },
});
