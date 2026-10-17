import { ROLE_LABELS } from "@shared/roles";
import * as Application from "expo-application";
import { Globe, LifeBuoy, LogOut, ShieldCheck } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { Avatar } from "@/components/Avatar";
import { ListRow, ListSection, RowIcon } from "@/components/List";
import { Screen } from "@/components/Screen";
import { SegmentedControl } from "@/components/SegmentedControl";
import { T } from "@/components/Text";
import { DeleteAccountLink } from "@/features/account/DeleteAccount";
import { useFamily } from "@/features/family/FamilyProvider";
import { studentLine } from "@/features/students/format";
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
 * Everything else, kept short: the account signed in, the children (or the student's own record) as the academy has
 * them, the appearance, help, the privacy policy, the website, which version this is, signing out, and deleting the
 * account.
 */
export default function FamilyMoreScreen() {
  const { actor, member, name, portal } = useBranch();
  const { email, signOut } = useAuth();
  const { pref, setPref } = useAppearance();
  const family = useFamily();
  const colors = useColors();
  const version = `${Application.nativeApplicationVersion ?? "1.0.0"} (${Application.nativeBuildVersion ?? "1"})`;
  const built = [env.buildCommit, env.builtAt ? builtWhen(env.builtAt) : ""].filter(Boolean).join(", ");
  const parent = family.who === "parent";

  return (
    <Screen title="More" typing={false} testID="family-more">
      <ListSection title="Signed in">
        <ListRow
          icon={<Avatar name={actor.name} url={member.photoURL} size={40} />}
          title={<T variant="label">{actor.name}</T>}
          subtitle={`${email} · ${ROLE_LABELS[actor.role]}`}
          testID="family-more-account"
        />
      </ListSection>

      <ListSection
        title={parent ? (family.ids.length === 1 ? "Your child" : "Your children") : "Your record"}
        footer={family.ids.length ? `Something out of date? Ask ${name} to change it.` : undefined}
        testID="family-more-students"
      >
        {family.ids.length ? (
          family.ids.map((id) => {
            const s = family.students.get(id);
            const line = s ? studentLine(s) : "";
            return (
              <ListRow
                key={id}
                icon={<Avatar name={s?.name ?? family.firstName(id)} size={40} />}
                title={<T variant="label">{s?.name ?? (family.loading ? "Loading…" : family.firstName(id))}</T>}
                subtitle={line || (s ? "No grade or level yet" : undefined)}
                testID={`family-more-student-${id}`}
              />
            );
          })
        ) : (
          <ListRow title={parent ? "No children linked yet" : "Not linked yet"} subtitle={`Ask ${name} to link ${parent ? "your child to your account" : "your account to your student record"}.`} />
        )}
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
            testID="family-more-appearance"
          />
        </View>
      </ListSection>

      <ListSection title="About">
        <ListRow
          icon={
            <RowIcon>
              <Globe size={17} color={colors.foreground} />
            </RowIcon>
          }
          title="Open the website"
          subtitle="The month calendar, and reports to download as PDFs"
          onPress={() => void openWebsite(`/${portal}`)}
          testID="family-more-website"
        />
        <ListRow
          icon={
            <RowIcon>
              <LifeBuoy size={17} color={colors.foreground} />
            </RowIcon>
          }
          title="Help"
          subtitle="Whom to ask, signing in, and reporting a problem with the app"
          onPress={() => void openWebsite("/help")}
          testID="family-more-help"
        />
        <ListRow
          icon={
            <RowIcon>
              <ShieldCheck size={17} color={colors.foreground} />
            </RowIcon>
          }
          title="Privacy policy"
          onPress={() => void openWebsite("/privacy")}
          testID="family-more-privacy"
        />
        <ListRow title="Version" right={version} subtitle={built || undefined} testID="family-more-version" />
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
          testID="family-more-sign-out"
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
