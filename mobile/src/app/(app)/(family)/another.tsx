import { offerText, requestLine } from "@shared/schedule/requests";
import type { ClassRequest } from "@shared/schedule/requests";
import { router, useLocalSearchParams } from "expo-router";
import { CalendarSearch, Send } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet } from "react-native";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { Field } from "@/components/Field";
import { FooterBar } from "@/components/FooterBar";
import { Screen } from "@/components/Screen";
import { SkeletonCards } from "@/components/Skeleton";
import { T } from "@/components/Text";
import { useFamily } from "@/features/family/FamilyProvider";
import { answerOffer, requestError } from "@/features/requests/api";
import { ClassChoices } from "@/features/requests/ClassChoices";
import { useClassChoices, useClassRequest } from "@/features/requests/data";
import { whatFor } from "@/features/requests/RequestRow";
import { shortDay, timeRange } from "@/features/schedule/format";
import { useLang, useT } from "@/lib/lang";
import { toast } from "@/lib/toast";
import { useBranch } from "@/state/BranchProvider";
import { space, useColors } from "@/theme";

/**
 * Asking for another time instead of the one the academy suggested (a request's "Ask for another", in Classes): a class
 * with a seat open in the next days, as when asking, with a message. The server checks it again (`answerClassOffer`);
 * the request then waits on the academy, which approves it, declines it or suggests another time again.
 */
export default function AskAnotherScreen() {
  const { requestId } = useLocalSearchParams<{ requestId?: string }>();
  const family = useFamily();
  const { branchId, settings } = useBranch();
  const colors = useColors();
  const t = useT();
  const lang = useLang();
  const hour12 = settings.general.timeFormat !== "24h";
  const request = useClassRequest(requestId ?? null);
  /** A class's day and time in Korean: "11월 5일 (목) 오후 5:00~6:00". */
  const whenKo = (c: Pick<ClassRequest, "dateKey" | "startMin" | "endMin">) => `${shortDay(c.dateKey, "ko")} ${timeRange(c.startMin, c.endMin, hour12, "ko")}`;
  const r = request.data && family.ids.includes(request.data.studentId) ? request.data : null;
  const o = r?.status === "offered" ? (r.offer ?? null) : null;
  const choices = useClassChoices({ studentId: o ? (r?.studentId ?? null) : null, forSessionId: r?.forSessionId ?? null, requestId: r?.id ?? null, exclude: [o?.classId] });
  const [classId, setClassId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const picked = choices.choices.find((c) => c.id === classId) ?? null;

  const send = async () => {
    if (!r || !picked || sending) return;
    setSending(true);
    try {
      await answerOffer(branchId, r.id, "another", picked.id, message.trim());
      toast.success(t("Asked for another time", "다른 시간을 요청했어요"), {
        description: t(`${shortDay(picked.dateKey)}, ${timeRange(picked.startMin, picked.endMin, hour12)}. The academy answers again.`, `${whenKo(picked)} · 아카데미에서 다시 답해 줄 거예요.`),
      });
      router.back();
    } catch (e) {
      toast.error(t("Not sent", "보내지 못했어요"), { description: requestError(e, t("Please try again.", "다시 시도해 주세요."), lang) });
      setSending(false);
    }
  };

  if (request.loading) {
    return (
      <Screen testID="another-screen">
        <SkeletonCards count={3} height={52} />
      </Screen>
    );
  }
  if (!r || !o) {
    return (
      <Screen testID="another-screen">
        <EmptyState
          testID="another-gone"
          icon={<CalendarSearch size={26} color={colors.mutedForeground} />}
          title={t("Nothing to answer here", "답할 신청이 없어요")}
          text={t("The academy may have answered it since, or it was withdrawn. Your requests are in Classes.", "그사이 아카데미에서 답했거나 신청이 취소됐을 수 있어요. 신청 내역은 수업 탭에 있어요.")}
          action={
            <Button variant="outline" onPress={() => router.back()} testID="another-back">
              {t("Back", "뒤로")}
            </Button>
          }
        />
      </Screen>
    );
  }

  return (
    <Screen
      testID="another-screen"
      footer={
        <FooterBar>
          <Button size="lg" style={styles.grow} icon={<Send size={18} color={colors.primaryForeground} />} disabled={!picked} busy={sending} onPress={() => void send()} testID="another-send">
            {t("Send", "보내기")}
          </Button>
        </FooterBar>
      }
    >
      <T variant="label" style={styles.intro}>
        {family.who === "parent" ? `${family.firstName(r.studentId)}: ` : ""}
        {lang === "ko" ? `${whatFor(r, "ko")} · ${whenKo(r)}` : requestLine(r)}
      </T>
      <T tone="muted" style={styles.intro}>
        {lang === "ko"
          ? `아카데미 제안: ${whenKo(o)}. 빈자리가 있는 다른 시간을 고르면 아카데미에서 다시 답해 줄 거예요.`
          : `${offerText(o, "family")} Choose another time with a seat open; the academy answers again.`}
      </T>
      <ClassChoices choices={choices.choices} selected={classId} onSelect={setClassId} hour12={hour12} loading={choices.loading} horizon={choices.horizon} testID="another-class" />
      <Field
        label={t("Message (optional)", "메시지 (선택)")}
        value={message}
        onChangeText={setMessage}
        maxLength={500}
        multiline
        placeholder={t("Thursdays don’t work for us this month.", "이번 달은 목요일이 어려워요.")}
        testID="another-message"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { paddingHorizontal: space.xs },
  grow: { flex: 1 },
});
