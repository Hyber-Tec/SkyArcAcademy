import { doc, serverTimestamp, setDoc } from "@react-native-firebase/firestore";
import { ACADEMY_ID } from "@shared/academy";
import { COL, DOC, ROOT } from "@shared/paths";
import type { Role } from "@shared/roles";
import type { BranchPublicProfile } from "@shared/types";
import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { ErrorBox } from "@/components/AuthParts";
import { Button } from "@/components/Button";
import { ChoiceRow } from "@/components/ChoiceRow";
import { Field } from "@/components/Field";
import { FooterBar } from "@/components/FooterBar";
import { ListSection } from "@/components/List";
import { Screen } from "@/components/Screen";
import { T } from "@/components/Text";
import { errorMessage } from "@/lib/api";
import { db } from "@/lib/firebase";
import { useDoc } from "@/lib/firestore";
import { toast } from "@/lib/toast";
import { useAuth } from "@/state/AuthProvider";
import { space } from "@/theme";

const CHOICES: { role: Role; title: string; subtitle: string; }[] = [
  { role: "parent", title: "Parent or guardian", subtitle: "My child takes classes at the academy." },
  { role: "student", title: "Student", subtitle: "I take classes at the academy." },
  { role: "coach", title: "Coach or employee", subtitle: "I work at the academy." },
];

/**
 * "Ask the academy" (docs/DECISIONS.md §31): someone the app couldn't find by their email asks to join, as the
 * website's /join does: who they are, the child or children they're signing up for, a phone and a message. The office
 * hears of it and approves it on the website; the app opens by itself then (the member doc is watched).
 */
export default function AskAccessScreen() {
  const { user, email } = useAuth();
  const profile = useDoc<BranchPublicProfile>(`${ROOT.branches}/${ACADEMY_ID}/${COL.public}/${DOC.publicProfile}`);
  const [first, ...rest] = (user?.displayName ?? "").split(" ");
  const [role, setRole] = useState<Role | null>(null);
  const [firstName, setFirstName] = useState(first ?? "");
  const [lastName, setLastName] = useState(rest.join(" "));
  const [phone, setPhone] = useState("");
  const [children, setChildren] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = profile.data?.status === "active" && profile.data.signupEnabled;
  const choices = CHOICES.filter((c) => profile.data?.signupRoles?.includes(c.role));

  async function send() {
    setError(null);
    if (!user || !email) return;
    if (!role) return setError("Choose who you are.");
    if (!firstName.trim() || !lastName.trim()) return setError("Enter your first and last name.");
    if (role === "parent" && !children.trim()) return setError("Enter your child’s name.");
    setBusy(true);
    try {
      await setDoc(doc(db, ROOT.branches, ACADEMY_ID, COL.signupRequests, email), {
        email,
        uid: user.uid,
        photoURL: user.photoURL ?? null,
        requestedRole: role,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
        message: message.trim(),
        studentNames: role === "parent" ? children.trim() : "",
        status: "pending",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toast.success("Request sent", {
        description: "The academy will look at it. The app opens by itself once they approve it.",
      });
      if (router.canGoBack()) router.back();
    } catch (e) {
      setError(errorMessage(e, "Couldn’t send the request. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      testID="ask-access"
      footer={
        <FooterBar>
          <Button size="lg" onPress={() => void send()} busy={busy} disabled={!open} testID="ask-send">
            Send the request
          </Button>
        </FooterBar>
      }
    >
      <T tone="muted" style={styles.intro}>
        {open
          ? `Signed in as ${email}. The academy looks at your request and lets you in; you’ll get an email.`
          : "The academy isn’t taking requests in the app right now. Please contact them."}
      </T>
      {open ? (
        <>
          <ListSection title="I am a">
            {choices.map((c) => (
              <ChoiceRow
                key={c.role}
                title={c.title}
                subtitle={c.subtitle}
                selected={role === c.role}
                onPress={() => setRole(c.role)}
                testID={`ask-role-${c.role}`}
              />
            ))}
          </ListSection>
          <View style={styles.form}>
            <Field label="First name" value={firstName} onChangeText={setFirstName} autoCapitalize="words" autoComplete="given-name" testID="ask-first" />
            <Field label="Last name" value={lastName} onChangeText={setLastName} autoCapitalize="words" autoComplete="family-name" testID="ask-last" />
            {role === "parent" ? (
              <Field
                label="Child’s name"
                hint="Several children at the academy? Name them all."
                value={children}
                onChangeText={setChildren}
                autoCapitalize="words"
                placeholder="e.g. Ava Monroe"
                testID="ask-children"
              />
            ) : null}
            <Field label="Phone (optional)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" testID="ask-phone" />
            <Field
              label="Message (optional)"
              hint="New to the academy? Say so here."
              value={message}
              onChangeText={setMessage}
              multiline
              testID="ask-message"
            />
            {error ? <ErrorBox>{error}</ErrorBox> : null}
          </View>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { paddingHorizontal: space.lg, paddingTop: space.md },
  form: { gap: space.md, paddingHorizontal: space.lg, paddingBottom: space.xl },
});
