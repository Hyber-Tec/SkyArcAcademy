import { Mail, UserRound } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { SkyArcLogo } from "@/components/brand/SkyArc";
import { Button } from "@/components/Button";
import { CenteredCard } from "@/components/CenteredCard";
import { ListRow, ListSection } from "@/components/List";
import { T } from "@/components/Text";
import { DeleteAccountLink } from "@/features/account/DeleteAccount";
import { useAuth } from "@/state/AuthProvider";
import { space, useColors } from "@/theme";

/**
 * Signed in, but the academy hasn't given this email access (the website's "No access yet"). The member doc is
 * watched, so the app opens by itself once an admin adds the address.
 */
export default function NoAccessScreen() {
  const { email, signOut } = useAuth();
  const colors = useColors();
  return (
    <CenteredCard testID="no-access">
      <View style={styles.head}>
        <SkyArcLogo height={64} />
        <T variant="title" style={styles.center}>
          No access yet
        </T>
        <T tone="muted" style={styles.center}>
          You&apos;re signed in as {email}, and the academy hasn&apos;t added this address. This screen opens the app by itself once it does.
        </T>
      </View>
      <ListSection>
        <ListRow icon={<Mail size={18} color={colors.mutedForeground} />} title="Got an invitation email?" subtitle="Sign in with the address it was sent to." />
        <ListRow icon={<UserRound size={18} color={colors.mutedForeground} />} title="No invitation?" subtitle={`Ask an admin of the academy to add ${email}.`} />
      </ListSection>
      <View style={styles.buttons}>
        <Button size="lg" variant="outline" onPress={() => void signOut()} testID="use-another-account">
          Use another account
        </Button>
      </View>
      <DeleteAccountLink />
    </CenteredCard>
  );
}

const styles = StyleSheet.create({
  head: { alignItems: "center", gap: space.sm },
  center: { textAlign: "center" },
  buttons: { gap: space.sm },
});
