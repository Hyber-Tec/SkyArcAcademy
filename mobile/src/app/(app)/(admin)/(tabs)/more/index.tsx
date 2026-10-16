import { ROLE_LABELS } from "@shared/roles";
import * as Application from "expo-application";
import { router } from "expo-router";
import { Globe, LogOut, ShieldCheck, Users } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { Avatar } from "@/components/Avatar";
import { ListRow, ListSection, RowIcon } from "@/components/List";
import { Screen } from "@/components/Screen";
import { SegmentedControl } from "@/components/SegmentedControl";
import { T } from "@/components/Text";
import { DeleteAccountLink } from "@/features/account/DeleteAccount";
import { env } from "@/lib/env";
import { openWebsite } from "@/lib/links";
import { type AppearancePref, useAppearance } from "@/state/AppearanceProvider";
import { useAuth } from "@/state/AuthProvider";
import { useBranch } from "@/state/BranchProvider";
import { space, useColors } from "@/theme";

/** "Oct 16, 2026, 5:41 PM" for when this copy was built. */
function builtWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

/**
 * Everything else, kept short: the account signed in, the coaches with their contacts, the appearance, the website
 * (where the rest of the office's work is), the privacy policy, which version this is, and signing out.
 */
export default function MoreScreen() {
  const { actor, member, name } = useBranch();
  const { email, signOut } = useAuth();
  const { pref, setPref } = useAppearance();
  const colors = useColors();
  const version = `${Application.nativeApplicationVersion ?? "1.0.0"} (${Application.nativeBuildVersion ?? "1"})`;
  const built = [env.buildCommit, env.builtAt ? builtWhen(env.builtAt) : ""].filter(Boolean).join(", ");

  return (
    <Screen testID="more-screen">
      <ListSection title="Signed in">
        <ListRow
          icon={<Avatar name={actor.name} url={member.photoURL} size={40} />}
          title={actor.name}
          subtitle={`${email} · ${ROLE_LABELS[actor.role]}`}
          testID="more-account"
        />
      </ListSection>

      <ListSection title="The academy">
        <ListRow
          icon={
            <RowIcon>
              <Users size={17} color={colors.foreground} />
            </RowIcon>
          }
          title="Coaches"
          subtitle="Who teaches, with their phone and email"
          onPress={() => router.push("/more/coaches")}
          testID="more-coaches"
        />
        <ListRow
          icon={
            <RowIcon>
              <Globe size={17} color={colors.foreground} />
            </RowIcon>
          }
          title="Open the website"
          subtitle="Everything else: changes to the schedule, people, the Drive, reports"
          onPress={() => void openWebsite("/admin/home")}
          testID="more-website"
        />
      </ListSection>

      <ListSection title="Appearance">
        <View style={[styles.segment, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SegmentedControl<AppearancePref>
            value={pref}
            onChange={setPref}
            options={[
              { value: "system", label: "System" },
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
            testID="more-appearance"
          />
        </View>
      </ListSection>

      <ListSection title="About">
        <ListRow
          icon={
            <RowIcon>
              <ShieldCheck size={17} color={colors.foreground} />
            </RowIcon>
          }
          title="Privacy policy"
          onPress={() => void openWebsite("/privacy")}
          testID="more-privacy"
        />
        <ListRow title="Version" right={version} subtitle={built || undefined} testID="more-version" />
      </ListSection>

      <ListSection>
        <ListRow
          icon={
            <RowIcon color={colors.destructiveTint}>
              <LogOut size={17} color={colors.destructive} />
            </RowIcon>
          }
          title="Sign out"
          destructive
          chevron={false}
          onPress={() => void signOut()}
          testID="more-sign-out"
        />
      </ListSection>
      <View style={styles.delete}>
        <DeleteAccountLink academyName={name} />
        {env.useEmulators ? (
          <T variant="small" tone="muted" style={styles.center}>
            Practice copy: the local emulators on this Mac.
          </T>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  segment: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: space.sm },
  delete: { alignItems: "center", gap: space.sm },
  center: { textAlign: "center" },
});
