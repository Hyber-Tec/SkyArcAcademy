import { PauseCircle } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { Button } from "@/components/Button";
import { HelpLinks } from "@/components/AuthParts";
import { CenteredCard } from "@/components/CenteredCard";
import { T } from "@/components/Text";
import { DeleteAccountLink } from "@/features/account/DeleteAccount";
import { useLang, useT } from "@/lib/lang";
import { useAuth } from "@/state/AuthProvider";
import { radius, space, useColors } from "@/theme";

const WORDS = {
  paused: {
    title: "Your access is paused",
    text: (email: string) => `${email} is paused at Sky Arc. Ask an admin of the academy to restore your access. This screen opens the app by itself once they do.`,
    ko: {
      title: "이용이 일시 중지됐어요",
      text: (email: string) => `${email} 계정은 Sky Arc 이용이 일시 중지됐어요. 아카데미 관리자에게 다시 열어 달라고 요청해 주세요. 다시 열리면 앱이 바로 열려요.`,
    },
  },
  unavailable: {
    title: "The academy can’t be opened",
    text: () => "Sky Arc can’t be opened right now. Check your connection and try again later.",
    ko: { title: "아카데미를 열 수 없어요", text: () => "지금은 Sky Arc를 열 수 없어요. 인터넷 연결을 확인하고 나중에 다시 시도해 주세요." },
  },
} as const;

/** The person can't use the app now: an admin paused their access, or the academy can't be reached. */
export function PausedAccess({ why = "paused" }: { why?: keyof typeof WORDS }) {
  const { email, signOut } = useAuth();
  const colors = useColors();
  const t = useT();
  const words = useLang() === "ko" ? WORDS[why].ko : WORDS[why];
  return (
    <CenteredCard testID="paused-access">
      <View style={styles.icon}>
        <View style={[styles.circle, { backgroundColor: colors.secondary }]}>
          <PauseCircle size={28} color={colors.foreground} />
        </View>
      </View>
      <T variant="title" style={styles.center}>
        {words.title}
      </T>
      <T tone="muted" style={styles.center}>
        {words.text(email ?? "")}
      </T>
      <View style={styles.buttons}>
        <Button size="lg" variant="outline" onPress={() => void signOut()}>
          {t("Sign out", "로그아웃")}
        </Button>
      </View>
      <DeleteAccountLink />
      <HelpLinks />
    </CenteredCard>
  );
}

const styles = StyleSheet.create({
  icon: { alignItems: "center" },
  circle: { width: 64, height: 64, borderRadius: radius.full, alignItems: "center", justifyContent: "center" },
  center: { textAlign: "center" },
  buttons: { gap: space.sm },
});
