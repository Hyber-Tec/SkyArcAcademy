import { type Lang, josa } from "@shared/i18n";
import { type ClassRequest, type ClassRequestAction, type ClassRequestStep, requestHistory, requestStepText } from "@shared/schedule/requests";
import { StyleSheet, View } from "react-native";
import { ListSection } from "@/components/List";
import { T } from "@/components/Text";
import { shortDay, timeRange } from "@/features/schedule/format";
import { useLang, useT } from "@/lib/lang";
import { space, useColors } from "@/theme";
import { askedWhen } from "./RequestRow";

/** A step with no one behind it (the server's), in Korean. */
const ACTION_KO: Record<ClassRequestAction, string> = {
  asked: "신청",
  asked_again: "다시 신청",
  offered: "다른 시간 제안",
  accepted: "제안 수락",
  approved: "승인",
  rejected: "거절",
  withdrawn: "신청 취소",
};

/**
 * A step as a parent reading Korean sees it (shared/src/schedule/requests.ts says it in English): the parent
 * themself without a subject, the academy's people as "아카데미에서", anyone else of the family by name.
 */
function stepTextKo(step: ClassRequestStep, me: string, hour12: boolean): string {
  if (step.by.role === "system") return step.action === "rejected" ? "답이 없는 채로 수업 날짜가 지나 닫혔어요." : `${ACTION_KO[step.action]}.`;
  const office = step.by.role === "owner" || step.by.role === "admin";
  const p = me && step.by.email === me ? "" : office ? "아카데미에서 " : `${josa(step.by.name || step.by.email || "가족", "이/가")} `;
  const when = step.dateKey && step.startMin !== undefined && step.endMin !== undefined ? `${shortDay(step.dateKey, "ko")} ${timeRange(step.startMin, step.endMin, hour12, "ko")}` : null;
  switch (step.action) {
    case "asked":
      return when ? `${p}${when} 수업을 신청했어요.` : `${p}신청했어요.`;
    case "offered":
      return when ? `${p}다른 시간을 제안했어요: ${when}` : `${p}다른 시간을 제안했어요.`;
    case "accepted":
      return when ? `${p}제안을 수락했어요: ${when}` : `${p}제안을 수락했어요.`;
    case "asked_again":
      return when ? `${p}다른 시간으로 다시 신청했어요: ${when}` : `${p}다른 시간을 요청했어요.`;
    case "approved":
      return when ? `${p}승인했어요: ${when}` : `${p}승인했어요.`;
    case "rejected":
      return `${p}거절했어요.`;
    case "withdrawn":
      return `${p}신청을 취소했어요.`;
  }
}

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
  const t = useT();
  if (!steps.length) return null;
  return (
    <ListSection title={t("History", "진행 내역")} testID={testID}>
      {steps.map((s, i) => (
        <Step key={`${i}-${s.action}`} step={s} {...reader} testID={testID ? `${testID}-${i}` : undefined} />
      ))}
    </ListSection>
  );
}

function Step({ step, viewer, me, timezone, hour12, divider = false, testID }: Reader & { step: ClassRequestStep; divider?: boolean; testID?: string }) {
  const colors = useColors();
  const lang: Lang = useLang();
  return (
    <View style={[styles.step, divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]} testID={testID}>
      <View style={[styles.dot, { backgroundColor: DOT[step.action] }]} />
      <View style={styles.grow}>
        <T variant="small">{lang === "ko" && viewer === "family" ? stepTextKo(step, me, hour12) : requestStepText(step, viewer, me)}</T>
        {step.note ? (
          <T variant="small" tone="muted">
            “{step.note}”
          </T>
        ) : null}
        <T variant="tiny" tone="muted">
          {askedWhen(step.at, timezone, hour12, lang)}
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
