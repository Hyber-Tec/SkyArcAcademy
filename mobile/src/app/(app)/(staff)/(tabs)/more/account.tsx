import { hourlyRate } from "@shared/pay/rates";
import { formatMoney } from "@shared/pay/segment";
import { COL, DOC, ROOT } from "@shared/paths";
import { STAFF_STATUS_LABELS, formatPhone } from "@shared/people";
import { type MyDetails, cleanDetails, detailsDiffer, detailsOf } from "@shared/profile";
import { ROLE_LABELS } from "@shared/roles";
import { formatDateKey } from "@shared/time";
import type { Compensation } from "@shared/types";
import { useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { ExternalLink, Link2Off } from "lucide-react-native";
import { useRef, useState } from "react";
import { Keyboard, StyleSheet, View } from "react-native";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { FooterBar } from "@/components/FooterBar";
import { Card } from "@/components/Card";
import { confirmAsync } from "@/components/Confirm";
import { DateField } from "@/components/DateField";
import { EmptyState } from "@/components/EmptyState";
import { FactRow } from "@/components/FactRow";
import { Field } from "@/components/Field";
import { ListSection } from "@/components/List";
import { Screen } from "@/components/Screen";
import { T } from "@/components/Text";
import { saveMyDetails } from "@/features/account/profile";
import { useAcademyNow } from "@/features/data/hooks";
import { errorMessage } from "@/lib/api";
import { useDoc } from "@/lib/firestore";
import { openWebsite } from "@/lib/links";
import { toast } from "@/lib/toast";
import { useAuth } from "@/state/AuthProvider";
import { useBranch } from "@/state/BranchProvider";
import { space, useColors } from "@/theme";

/**
 * More → Account. A coach's is the website's Profile → Account details (web/src/features/coach/profile/AccountSection.tsx):
 * their phone, birth date and address, which only admins see and which they keep up to date themselves (the rules let a
 * coach change only these on their own record), and what the academy has on file for them (start date, hourly rate),
 * read-only. Owners and admins have no such page on the website (they change employee records under Employees), so
 * theirs is read-only here, with the way to the website.
 */
export default function AccountScreen() {
  const { isCoach } = useBranch();
  return isCoach ? <CoachAccount /> : <OfficeAccount />;
}

/** "Coach at Sky Arc Sports Academy since March 2025". */
function roleLine(role: string, academy: string, startDate: string | null | undefined): string {
  return `${role} at ${academy}${startDate ? ` since ${formatDateKey(startDate, "monthYear")}` : ""}`;
}

function CoachAccount() {
  const navigation = useNavigation();
  const colors = useColors();
  const { branchId, actor, staff, staffId, member, name: academy } = useBranch();
  const { email } = useAuth();
  const { today } = useAcademyNow();
  const comp = useDoc<Compensation>(staffId ? `${ROOT.branches}/${branchId}/${COL.staff}/${staffId}/private/${DOC.compensation}` : null);

  // Changes live in a draft until saved, so a change made elsewhere (the website) never wipes them. What was just saved
  // shows until the phone's copy of the record has it (a moment), so nothing flickers back.
  const saved = detailsOf(staff);
  const [draft, setDraft] = useState<MyDetails | null>(null);
  const [sent, setSent] = useState<MyDetails | null>(null);
  if (sent && !detailsDiffer(saved, sent)) setSent(null);
  const base = sent ?? saved;
  const values = draft ?? base;
  const dirty = !!draft && detailsDiffer(base, draft);
  const edit = (patch: Partial<MyDetails>) => setDraft((d) => ({ ...(d ?? base), ...patch }));
  // A typed number reads as (555) 010-1234 once the field is left, as on the website (only while it's being changed:
  // leaving it because Save was tapped finds no draft any more).
  const formatTypedPhone = () =>
    setDraft((d) => {
      if (!d?.phone) return d;
      const phone = formatPhone(d.phone);
      return phone === d.phone ? d : { ...d, phone };
    });

  const leaving = useRef(false);
  usePreventRemove(dirty, ({ data }) => {
    if (leaving.current) return navigation.dispatch(data.action);
    void confirmAsync({ title: "Discard your changes?", message: "Your details stay as they were saved.", confirmLabel: "Discard", destructive: true }).then((ok) => {
      if (!ok) return;
      leaving.current = true;
      navigation.dispatch(data.action);
    });
  });

  if (!staff) {
    return (
      <Screen testID="account-screen" typing={false}>
        <EmptyState
          icon={<Link2Off size={26} color={colors.mutedForeground} />}
          title="Your employee record isn’t linked yet"
          text={`Ask an admin at ${academy} to link it to your account. Your contact details and pay show here once it is.`}
          testID="account-not-linked"
        />
        <AccountFacts />
      </Screen>
    );
  }

  // Saving doesn't wait for the server: the phone has the change at once (and sends it when it's back online); a refusal
  // puts the draft back and says so.
  const save = () => {
    if (!draft) return;
    const patch = cleanDetails({ ...draft, phone: formatPhone(draft.phone.trim()) });
    Keyboard.dismiss();
    setSent(patch);
    setDraft(null);
    void saveMyDetails(branchId, actor, staff, patch).then(
      () => setSent((x) => (x === patch ? null : x)),
      (e: unknown) => {
        setSent(null);
        setDraft((d) => d ?? patch);
        toast.error("Couldn’t save your details", { description: errorMessage(e, "Try again in a moment.") });
      },
    );
    toast.success("Your details are saved");
  };

  const rate = comp.loading ? "…" : comp.data && hourlyRate(comp.data.rates) > 0 ? `${formatMoney(hourlyRate(comp.data.rates))}/hr` : "—";

  return (
    <Screen
      testID="account-screen"
      footer={
        dirty ? (
          <FooterBar>
            <Button variant="outline" onPress={() => setDraft(null)} style={styles.grow} testID="account-discard">
              Discard
            </Button>
            <Button onPress={save} style={styles.grow} testID="account-save">
              Save changes
            </Button>
          </FooterBar>
        ) : null
      }
    >
      <Card style={styles.head}>
        <Avatar name={staff.name} url={member.photoURL} size={56} color={staff.color} />
        <View style={styles.grow}>
          <T variant="heading" numberOfLines={2}>
            {staff.name}
          </T>
          <T variant="small" tone="muted">
            {roleLine("Coach", academy, staff.startDate)}
          </T>
          <T variant="small" tone="muted" numberOfLines={1}>
            {email ?? staff.email}
          </T>
        </View>
        {staff.status !== "active" ? (
          <Badge tone="warning" style={styles.center}>
            {STAFF_STATUS_LABELS[staff.status]}
          </Badge>
        ) : null}
      </Card>

      <ListSection title="Contact details" footer={`Only admins at ${academy} see these.`} testID="account-contact">
        <View style={styles.form}>
          <Field
            label="Phone"
            value={values.phone}
            onChangeText={(phone) => edit({ phone })}
            onBlur={formatTypedPhone}
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            autoComplete="tel"
            placeholder="(555) 010-1234"
            maxLength={40}
            testID="account-phone"
          />
          <DateField
            label="Date of birth"
            value={values.dob}
            onChange={(dob) => edit({ dob })}
            onClear={() => edit({ dob: null })}
            today={today}
            max={today}
            yearJump
            pickerTitle="Your date of birth"
            testID="account-dob"
          />
          <Field
            label="Home address"
            value={values.address}
            onChangeText={(address) => edit({ address })}
            textContentType="fullStreetAddress"
            autoComplete="street-address"
            placeholder="Street, city, ZIP"
            returnKeyType="done"
            maxLength={300}
            testID="account-address"
          />
        </View>
      </ListSection>

      <ListSection title={`At ${academy}`} footer="Kept by the academy. Ask an admin to change any of these." testID="account-on-file">
        <FactRow label="Name" value={staff.name} />
        <FactRow label="Email" value={staff.email || "—"} />
        <FactRow label="Started" value={staff.startDate ? formatDateKey(staff.startDate, "long") : "—"} />
        {staff.endDate ? <FactRow label="Ends" value={formatDateKey(staff.endDate, "long")} /> : null}
        <FactRow label="Hourly rate" value={rate} testID="account-rate" />
      </ListSection>
    </Screen>
  );
}

/** Owners and admins: their account and employee record as the academy has them, read-only. */
function OfficeAccount() {
  const colors = useColors();
  const { actor, member, staff, name: academy, portal } = useBranch();
  return (
    <Screen testID="account-screen" typing={false}>
      <Card style={styles.head}>
        <Avatar name={actor.name} url={member.photoURL} size={56} color={staff?.color} />
        <View style={styles.grow}>
          <T variant="heading" numberOfLines={2}>
            {actor.name}
          </T>
          <T variant="small" tone="muted">
            {roleLine(ROLE_LABELS[actor.role], academy, staff?.startDate)}
          </T>
        </View>
      </Card>

      <AccountFacts />

      {staff ? (
        <>
          <ListSection title="Your employee record" footer="Change it on the website, under Employees." testID="account-record">
            <FactRow label="Phone" value={staff.phone ? formatPhone(staff.phone) : "—"} />
            <FactRow label="Date of birth" value={staff.dob ? formatDateKey(staff.dob, "long") : "—"} />
            <FactRow label="Home address" value={staff.address || "—"} />
            <FactRow label="Started" value={staff.startDate ? formatDateKey(staff.startDate, "long") : "—"} />
            {staff.endDate ? <FactRow label="Ends" value={formatDateKey(staff.endDate, "long")} /> : null}
          </ListSection>
          <Button
            variant="outline"
            icon={<ExternalLink size={18} color={colors.foreground} />}
            onPress={() => void openWebsite(`/${portal}/employees/directory/${staff.id}`)}
            testID="account-open-website"
          >
            Change it on the website
          </Button>
        </>
      ) : null}
    </Screen>
  );
}

/** Who is signed in: name, email and role. */
function AccountFacts() {
  const { actor } = useBranch();
  const { email } = useAuth();
  return (
    <ListSection title="Your account" footer="Your access follows this email, whichever way you sign in." testID="account-facts">
      <FactRow label="Name" value={actor.name} />
      <FactRow label="Email" value={email ?? actor.email} />
      <FactRow label="Role" value={ROLE_LABELS[actor.role]} />
    </ListSection>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: space.md },
  grow: { flex: 1, gap: 2 },
  center: { alignSelf: "center" },
  form: { padding: space.lg, gap: space.lg },
});
