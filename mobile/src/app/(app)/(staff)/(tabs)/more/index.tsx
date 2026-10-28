import { notificationsSummary } from "@shared/profile";
import { ROLE_LABELS } from "@shared/roles";
import * as Application from "expo-application";
import { router } from "expo-router";
import { Bell, ChartLine, Globe, HardDrive, KeyRound, LifeBuoy, LogOut, Megaphone, ShieldCheck, Users, UsersRound, Wallet } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import { ListRow, ListSection, RowIcon } from "@/components/List";
import { Screen } from "@/components/Screen";
import { SegmentedControl } from "@/components/SegmentedControl";
import { T } from "@/components/Text";
import { DeleteAccountLink } from "@/features/account/DeleteAccount";
import { useUnreadNewsCount } from "@/features/announcements/staffNews";
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

/** A list row's icon: the lucide picture in the row's rounded square. */
function Icon({ as: Picture }: { as: typeof Globe }) {
  const colors = useColors();
  return (
    <RowIcon>
      <Picture size={17} color={colors.foreground} />
    </RowIcon>
  );
}

/**
 * Everything beyond the tabs, kept short. Coaches (2026-10-18: "every ability … as a coach on the website … on the
 * phone too"): Students, News, the Drive, Reports and their Payroll; the office: the coaches with their contacts, News,
 * the Drive and Reports. Then the account (the details, notifications and sign-in), the appearance, the website, help,
 * the privacy policy, which version this is, and signing out.
 */
export default function MoreScreen() {
  const { actor, member, name, isCoach, portal, staff } = useBranch();
  const { email, signOut } = useAuth();
  const { pref, setPref } = useAppearance();
  const colors = useColors();
  const unreadNews = useUnreadNewsCount();
  const version = `${Application.nativeApplicationVersion ?? "1.0.0"} (${Application.nativeBuildVersion ?? "1"})`;
  const built = [env.buildCommit, env.builtAt ? builtWhen(env.builtAt) : ""].filter(Boolean).join(", ");

  return (
    <Screen title="More" testID="more-screen">
      <ListSection title="Signed in">
        <ListRow
          icon={<Avatar name={actor.name} url={member.photoURL} size={40} />}
          title={actor.name}
          subtitle={`${email} · ${ROLE_LABELS[actor.role]}`}
          onPress={() => router.push("/more/account")}
          testID="more-account"
        />
      </ListSection>

      {/* "/reports" is also the families' Reports tab: from inside a tab the router would pick theirs, so the staff's
          screens are named with their group where an address is shared. */}
      <ListSection title={isCoach ? "Your work" : "The academy"}>
        {/* Coaches' tabs hold Availability where the office's hold Students, so their Students is here, first. */}
        {isCoach ? <ListRow icon={<Icon as={UsersRound} />} title="Students" subtitle="Every student, their classes and scores" onPress={() => router.push("/more/students")} testID="more-students" /> : null}
        {isCoach ? null : <ListRow icon={<Icon as={Users} />} title="Coaches" subtitle="Who teaches, with their phone and email" onPress={() => router.push("/more/coaches")} testID="more-coaches" />}
        <ListRow
          icon={<Icon as={Megaphone} />}
          title="News"
          subtitle="The academy’s announcements"
          right={unreadNews ? <Badge tone="destructive">{unreadNews}</Badge> : undefined}
          onPress={() => router.push("/news")}
          testID="more-news"
        />
        <ListRow icon={<Icon as={HardDrive} />} title="Drive" subtitle="Every student’s folder: results, cards and files" onPress={() => router.push("/drive")} testID="more-drive" />
        <ListRow icon={<Icon as={ChartLine} />} title="Reports" subtitle="Progress reports, and sharing them with families" onPress={() => router.push("/(app)/(staff)/reports")} testID="more-reports" />
        {isCoach ? <ListRow icon={<Icon as={Wallet} />} title="Payroll" subtitle="Your pay, by pay period" onPress={() => router.push("/more/payroll")} testID="more-payroll" /> : null}
        <ListRow
          icon={<Icon as={Globe} />}
          title="Open the website"
          subtitle={isCoach ? "The same, on a bigger screen" : "Everything else: the schedule’s changes, people, payroll, settings"}
          onPress={() => void openWebsite(`/${portal}`)}
          testID="more-website"
        />
      </ListSection>

      <ListSection title="Settings">
        <ListRow
          icon={<Icon as={Bell} />}
          title="Notifications"
          subtitle="On this phone, and what you’re told about"
          right={isCoach ? notificationsSummary(staff?.notificationPrefs) : undefined}
          onPress={() => router.push("/more/notifications")}
          testID="more-notifications"
        />
        <ListRow icon={<Icon as={KeyRound} />} title="Sign-in & security" subtitle="How you sign in, and your password" onPress={() => router.push("/more/security")} testID="more-security" />
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
              <LifeBuoy size={17} color={colors.foreground} />
            </RowIcon>
          }
          title="Help"
          subtitle="Whom to ask, signing in, and reporting a problem with the app"
          onPress={() => void openWebsite("/help")}
          testID="more-help"
        />
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
