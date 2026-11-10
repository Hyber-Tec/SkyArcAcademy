import { type SignInMethods, signInWays } from "@shared/auth";
import { ROLE_LABELS } from "@shared/roles";
import { formatDateKey, formatInstant } from "@shared/time";
import * as Application from "expo-application";
import { router } from "expo-router";
import type { ContractPdf } from "@shared/contracts/types";
import { Bell, Compass, Eye, FileSignature, Globe, KeyRound, LifeBuoy, LogOut, ShieldCheck } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Avatar } from "@/components/Avatar";
import { ListRow, ListSection, RowIcon, ToneIcon } from "@/components/List";
import { Screen } from "@/components/Screen";
import { SegmentedControl } from "@/components/SegmentedControl";
import { T } from "@/components/Text";
import { DeleteAccountLink } from "@/features/account/DeleteAccount";
import { PdfSheet, openPdf } from "@/features/contracts/PdfSheet";
import { useSignedContracts } from "@/features/family/data";
import { AcademyContact } from "@/features/family/FamilyParts";
import { useFamily } from "@/features/family/FamilyProvider";
import { studentLine } from "@/features/students/format";
import { tourSignals } from "@/features/tour/state";
import { callable, errorMessage } from "@/lib/api";
import { env } from "@/lib/env";
import { openWebsite } from "@/lib/links";
import { toast } from "@/lib/toast";
import { type AppearancePref, useAppearance } from "@/state/AppearanceProvider";
import { useAuth } from "@/state/AuthProvider";
import { useBranch } from "@/state/BranchProvider";
import { space, useColors } from "@/theme";

/** "Oct 16, 2026, 5:41 PM" for when this copy was built. */
function builtWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

/** "You sign in with Google", as the website's Account says how. */
function signInLine(methods: SignInMethods): string {
  return `You sign in with ${signInWays(methods).replace(/email and password$/i, "your email and password")}`;
}

const copyCall = callable<{ branchId: string; studentId: string }, ContractPdf>("getMySignedContract");

/**
 * Everything else, kept short: the account signed in and how it signs in (Sign-in & security), the children (or the
 * student's own record) as the academy has them, each one's enrollment contract (who signed it and when, to view or
 * save: docs/DECISIONS.md §34), the appearance, how to reach the academy, help, the privacy policy, the website, which
 * version this is, signing out, and deleting the account: the website's Profile, for families.
 */
export default function FamilyMoreScreen() {
  const { actor, member, name, portal, canViewAs, viewAs, timezone, branchId } = useBranch();
  const { email, methods, signOut } = useAuth();
  const { pref, setPref } = useAppearance();
  const family = useFamily();
  const signed = useSignedContracts(family.ids);
  const signedById = new Map(signed.data.map((d) => [d.id, d]));
  const colors = useColors();
  const version = `${Application.nativeApplicationVersion ?? "1.0.0"} (${Application.nativeBuildVersion ?? "1"})`;
  const built = [env.buildCommit, env.builtAt ? builtWhen(env.builtAt) : ""].filter(Boolean).join(", ");
  const parent = family.who === "parent";
  const [opening, setOpening] = useState<string | null>(null);
  const [pdf, setPdf] = useState<{ uri: string; name: string } | null>(null);
  async function openCopy(studentId: string) {
    setOpening(studentId);
    try {
      await openPdf(await copyCall({ branchId, studentId }), setPdf);
    } catch (e) {
      toast.error(errorMessage(e, "The signed copy couldn’t be opened just now."));
    } finally {
      setOpening(null);
    }
  }

  return (
    <Screen title="More" typing={false} testID="family-more">
      <PdfSheet pdf={pdf} onClose={() => setPdf(null)} />
      <ListSection title="Signed in">
        <ListRow
          icon={<Avatar name={actor.name} url={member.photoURL} size={40} />}
          title={<T variant="label">{actor.name}</T>}
          subtitle={`${email} · ${ROLE_LABELS[actor.role]}`}
          testID="family-more-account"
        />
        {canViewAs ? (
          <ListRow
            icon={<ToneIcon icon={Eye} tone="violet" />}
            title="View the app as…"
            subtitle={viewAs?.person ? `Now: ${viewAs.person.name}` : "An admin, a coach, a parent or a student"}
            onPress={() => router.push("/view-as")}
            testID="family-more-view-as"
          />
        ) : null}
        <ListRow
          icon={<ToneIcon icon={KeyRound} tone="grey" />}
          title="Sign-in & security"
          subtitle={signInLine(methods)}
          onPress={() => router.push("/more/security")}
          testID="family-more-security"
        />
        <ListRow
          icon={<ToneIcon icon={Bell} tone="red" />}
          title="Notifications"
          subtitle="On this phone, and what you’re told about"
          onPress={() => router.push("/more/notifications")}
          testID="family-more-notifications"
        />
      </ListSection>

      <ListSection
        title={parent ? family.ids.length === 1 ? "Your child" : "Your children" : "Your record"}
        footer={family.ids.length ? `Something out of date? Ask ${name} to change it.` : undefined}
        testID="family-more-students"
      >
        {family.ids.length ? (
          family.ids.map((id) => {
            const s = family.students.get(id);
            const line = s ? studentLine(s) : "";
            // The rest of what the website's Account shows: the school, and since when the classes go.
            const since = s?.firstSessionDate
              ? `Classes since ${formatDateKey(s.firstSessionDate, "monthYear")}`
              : null;
            const more = s ? [s.school?.trim(), since].filter(Boolean).join(" · ") : "";
            return (
              <ListRow
                key={id}
                icon={<Avatar name={s?.name ?? family.firstName(id)} size={40} />}
                title={<T variant="label">{s?.name ?? (family.loading ? "Loading…" : family.firstName(id))}</T>}
                subtitle={
                  s ? (
                    <View style={styles.lines}>
                      <T variant="small" tone="muted">
                        {line || "No grade or level yet"}
                      </T>
                      {more ? (
                        <T variant="small" tone="muted">
                          {more}
                        </T>
                      ) : null}
                    </View>
                  ) : undefined
                }
                testID={`family-more-student-${id}`}
              />
            );
          })
        ) : (
          <ListRow
            title={parent ? "No children linked yet" : "Not linked yet"}
            subtitle={
              parent
                ? `Ask ${name} to link your child to your account.`
                : `Ask ${name} to link your account to your student record.`
            }
          />
        )}
      </ListSection>

      {family.ids.length ? (
        <ListSection
          title={family.ids.length === 1 || !parent ? "Enrollment contract" : "Enrollment contracts"}
          footer={`${name} sends each contract when it’s time to sign.`}
          testID="family-more-contracts"
        >
          {family.ids.map((id) => {
            const s = family.students.get(id);
            const contract = signedById.get(id);
            const signedMs = contract?.signedAt?.toMillis ? contract.signedAt.toMillis() : null;
            const when = signedMs === null ? "" : formatInstant(signedMs, timezone, { month: "short", day: "numeric", year: "numeric" });
            const canOpen = !!contract?.fileId && !viewAs;
            return (
              <ListRow
                key={id}
                icon={<ToneIcon icon={FileSignature} tone="green" />}
                title={family.ids.length > 1 || parent ? (s?.name ?? family.firstName(id)) : "Your contract"}
                subtitle={
                  !contract
                    ? "None yet"
                    : contract.via === "paper"
                      ? `Signed on paper${when ? `, recorded ${when}` : ""}`
                      : `Signed by ${contract.signerName || "a parent"}${when ? ` on ${when}` : ""}${canOpen ? " · View or save" : ""}`
                }
                right={opening === id ? <ActivityIndicator /> : undefined}
                onPress={canOpen ? () => void openCopy(id) : undefined}
                testID={`family-more-contract-${id}`}
              />
            );
          })}
        </ListSection>
      ) : null}

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

      {/* The website's Contact & help: nothing when the academy hasn't given its details. */}
      <AcademyContact
        title={`Contact ${name}`}
        footer={`Classes, records and reports are kept by ${name}: ask it about any of them.`}
      />

      <ListSection title="About">
        <ListRow
          icon={<ToneIcon icon={Globe} tone="blue" />}
          title="Open the website"
          subtitle="The same, on a bigger screen, and reports to download as PDFs"
          onPress={() => void openWebsite(`/${portal}`)}
          testID="family-more-website"
        />
        <ListRow
          icon={<ToneIcon icon={Compass} tone="violet" />}
          title="Take the tour"
          subtitle="How the app works, tab by tab"
          onPress={() => tourSignals.replay()}
          testID="family-more-tour"
        />
        <ListRow
          icon={<ToneIcon icon={LifeBuoy} tone="blue" />}
          title="Help"
          subtitle="Whom to ask, signing in, and reporting a problem with the app"
          onPress={() => void openWebsite("/help")}
          testID="family-more-help"
        />
        <ListRow
          icon={<ToneIcon icon={ShieldCheck} tone="grey" />}
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
  lines: { gap: 1 },
  delete: { alignItems: "center", gap: space.sm },
  center: { textAlign: "center" },
});
