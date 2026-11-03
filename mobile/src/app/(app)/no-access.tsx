import { ACADEMY_ID } from "@shared/academy";
import { type LinkResult, isHiddenEmail } from "@shared/access/onFile";
import { COL, ROOT } from "@shared/paths";
import type { SignupRequest } from "@shared/types";
import { router } from "expo-router";
import { Clock, Mail, UserRound } from "lucide-react-native";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { HelpLinks } from "@/components/AuthParts";
import { SkyArcLogo } from "@/components/brand/SkyArc";
import { Button } from "@/components/Button";
import { CenteredCard } from "@/components/CenteredCard";
import { ListRow, ListSection } from "@/components/List";
import { Loading } from "@/components/Loading";
import { T } from "@/components/Text";
import { DeleteAccountLink } from "@/features/account/DeleteAccount";
import { callable } from "@/lib/api";
import { useDoc } from "@/lib/firestore";
import { useAuth } from "@/state/AuthProvider";
import { space, useColors } from "@/theme";

const linkMyAccount = callable<Record<string, never>, LinkResult>("linkMyAccount");

/**
 * Signed in, but not a member of the academy yet (the website's NoBranchAccess). First the server looks for the email
 * on the students' records (docs/DECISIONS.md §31): a parent's or a student's own links them, and the app opens by itself
 * (the member doc is watched). Otherwise: waiting for the academy (a request sent), or "Ask the academy" and another
 * email.
 */
export default function NoAccessScreen() {
  const { email, signOut } = useAuth();
  const colors = useColors();
  const request = useDoc<SignupRequest>(email ? `${ROOT.branches}/${ACADEMY_ID}/${COL.signupRequests}/${email}` : null);
  const [result, setResult] = useState<{ email: string | null; state: "checking" | "linked" | "not_found" | "error" }>({ email, state: "checking" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!email) return;
    let alive = true;
    linkMyAccount({})
      .then((r) => alive && setResult({ email, state: r.state === "not_found" ? "not_found" : "linked" }))
      .catch(() => alive && setResult({ email, state: "error" }));
    return () => {
      alive = false;
    };
  }, [email, attempt]);
  const state = result.email === email ? result.state : "checking";

  if (state === "checking" || request.loading) return <Loading label="Looking for you on the academy’s records" />;
  if (state === "linked") return <Loading label="Opening Sky Arc" />;

  const waiting = request.data?.status === "pending";
  const declined = request.data?.status === "rejected";
  return (
    <CenteredCard testID="no-access">
      <View style={styles.head}>
        <SkyArcLogo height={64} />
        <T variant="title" style={styles.center}>
          {waiting ? "Waiting for the academy" : state === "error" ? "We couldn’t check just now" : "This email isn’t on the academy’s records"}
        </T>
        <T tone="muted" style={styles.center}>
          {waiting
            ? `You’re signed in as ${email}, and you asked the academy to let you in. This screen opens the app by itself once they approve it.`
            : state === "error"
              ? `You’re signed in as ${email}. Check your connection, then try again.`
              : `You’re signed in as ${email}. Families are found by the email they gave the academy, and no student’s record has this one.`}
        </T>
      </View>
      {!waiting && state === "not_found" ? (
        <ListSection>
          {isHiddenEmail(email) ? (
            <ListRow icon={<Mail size={18} color={colors.mutedForeground} />} title="Hidden with Apple" subtitle="The academy can’t match an email Apple hides. Ask the academy, or use the email you gave them." />
          ) : (
            <ListRow icon={<Mail size={18} color={colors.mutedForeground} />} title="Gave the academy another email?" subtitle="Sign in with that one: the app finds your child by it." />
          )}
          <ListRow
            icon={<UserRound size={18} color={colors.mutedForeground} />}
            title={declined ? "The academy declined a request from this email" : "New to the academy, or a coach?"}
            subtitle={declined ? (request.data?.decisionNote ? `Their note: ${request.data.decisionNote}` : "Contact the academy if that’s a mistake.") : "Ask the academy to let you in."}
          />
        </ListSection>
      ) : waiting ? (
        <ListSection>
          <ListRow icon={<Clock size={18} color={colors.mutedForeground} />} title="Your request" subtitle={`As a ${request.data?.requestedRole ?? "member"}${request.data?.studentNames ? `, for ${request.data.studentNames}` : ""}`} />
        </ListSection>
      ) : null}
      <View style={styles.buttons}>
        {state === "error" ? (
          <Button size="lg" onPress={() => setAttempt((n) => n + 1)} testID="link-again">
            Try again
          </Button>
        ) : !waiting && !declined ? (
          <Button size="lg" onPress={() => router.push("/ask-access")} testID="ask-academy">
            Ask the academy
          </Button>
        ) : null}
        <Button size="lg" variant="outline" onPress={() => void signOut()} testID="use-another-account">
          Use another email
        </Button>
      </View>
      <DeleteAccountLink />
      <HelpLinks />
    </CenteredCard>
  );
}

const styles = StyleSheet.create({
  head: { alignItems: "center", gap: space.sm },
  center: { textAlign: "center" },
  buttons: { gap: space.sm },
});
