import { PauseCircle } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { Button } from "@/components/Button";
import { CenteredCard } from "@/components/CenteredCard";
import { T } from "@/components/Text";
import { DeleteAccountLink } from "@/features/account/DeleteAccount";
import { useAuth } from "@/state/AuthProvider";
import { radius, space, useColors } from "@/theme";

const WORDS = {
  paused: { title: "Your access is paused", text: (email: string) => `${email} is paused at Sky Arc. Ask an admin of the academy to restore your access. This screen opens the app by itself once they do.` },
  unavailable: { title: "The academy can’t be opened", text: () => "Sky Arc can’t be opened right now. Check your connection and try again later." },
} as const;

/** The person can't use the app now: an admin paused their access, or the academy can't be reached. */
export function PausedAccess({ why = "paused" }: { why?: keyof typeof WORDS }) {
  const { email, signOut } = useAuth();
  const colors = useColors();
  return (
    <CenteredCard testID="paused-access">
      <View style={styles.icon}>
        <View style={[styles.circle, { backgroundColor: colors.secondary }]}>
          <PauseCircle size={28} color={colors.foreground} />
        </View>
      </View>
      <T variant="title" style={styles.center}>
        {WORDS[why].title}
      </T>
      <T tone="muted" style={styles.center}>
        {WORDS[why].text(email ?? "")}
      </T>
      <View style={styles.buttons}>
        <Button size="lg" variant="outline" onPress={() => void signOut()}>
          Sign out
        </Button>
      </View>
      <DeleteAccountLink />
    </CenteredCard>
  );
}

const styles = StyleSheet.create({
  icon: { alignItems: "center" },
  circle: { width: 64, height: 64, borderRadius: radius.full, alignItems: "center", justifyContent: "center" },
  center: { textAlign: "center" },
  buttons: { gap: space.sm },
});
