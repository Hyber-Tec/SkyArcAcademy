import { ROLE_LABELS_PLURAL } from "@shared/roles";
import { Sparkles } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { Button } from "@/components/Button";
import { CenteredCard } from "@/components/CenteredCard";
import { T } from "@/components/Text";
import { DeleteAccountLink } from "@/features/account/DeleteAccount";
import { openWebsite } from "@/lib/links";
import { useAuth } from "@/state/AuthProvider";
import { useBranch } from "@/state/BranchProvider";
import { radius, space, useColors } from "@/theme";

/**
 * Coaches, parents and students: the app is the academy office's for now (owner, 2026-10-16: the admin part first,
 * then coaches, then families). Until their part comes, the website works on the phone too.
 */
export default function ComingSoonScreen() {
  const { signOut, email } = useAuth();
  const { role, name } = useBranch();
  const colors = useColors();
  return (
    <CenteredCard testID="coming-soon">
      <View style={styles.icon}>
        <View style={[styles.circle, { backgroundColor: colors.secondary }]}>
          <Sparkles size={28} color={colors.foreground} />
        </View>
      </View>
      <T variant="title" style={styles.center}>
        Coming to the app
      </T>
      <T tone="muted" style={styles.center}>
        The app is for the academy&apos;s office for now. The part for {ROLE_LABELS_PLURAL[role].toLowerCase()} comes later; until then, use {name} on this
        phone&apos;s browser and sign in there with {email}.
      </T>
      <View style={styles.buttons}>
        <Button size="lg" onPress={() => void openWebsite("/login")} testID="open-website">
          Open the website
        </Button>
        <Button variant="ghost" onPress={() => void signOut()} testID="sign-out">
          Sign out
        </Button>
      </View>
      <DeleteAccountLink academyName={name} />
    </CenteredCard>
  );
}

const styles = StyleSheet.create({
  icon: { alignItems: "center" },
  circle: { width: 64, height: 64, borderRadius: radius.full, alignItems: "center", justifyContent: "center" },
  center: { textAlign: "center" },
  buttons: { gap: space.sm },
});
