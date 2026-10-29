import { offerText, requestLine } from "@shared/schedule/requests";
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
import { shortDay, timeRange } from "@/features/schedule/format";
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
  const hour12 = settings.general.timeFormat !== "24h";
  const request = useClassRequest(requestId ?? null);
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
      toast.success("Asked for another time", { description: `${shortDay(picked.dateKey)}, ${timeRange(picked.startMin, picked.endMin, hour12)}. The academy answers again.` });
      router.back();
    } catch (e) {
      toast.error("Not sent", { description: requestError(e) });
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
          title="Nothing to answer here"
          text="The academy may have answered it since, or it was withdrawn. Your requests are in Classes."
          action={
            <Button variant="outline" onPress={() => router.back()} testID="another-back">
              Back
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
            Send
          </Button>
        </FooterBar>
      }
    >
      <T variant="label" style={styles.intro}>
        {family.who === "parent" ? `${family.firstName(r.studentId)}: ` : ""}
        {requestLine(r)}
      </T>
      <T tone="muted" style={styles.intro}>
        {offerText(o, "family")} Choose another time with a seat open; the academy answers again.
      </T>
      <ClassChoices choices={choices.choices} selected={classId} onSelect={setClassId} hour12={hour12} loading={choices.loading} horizon={choices.horizon} testID="another-class" />
      <Field
        label="Message (optional)"
        value={message}
        onChangeText={setMessage}
        maxLength={500}
        multiline
        placeholder="Thursdays don’t work for us this month."
        testID="another-message"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { paddingHorizontal: space.xs },
  grow: { flex: 1 },
});
