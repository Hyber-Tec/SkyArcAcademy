import * as Haptics from "expo-haptics";
import { Check, Dot, Eye, Send } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Switch, View } from "react-native";
import { Button } from "@/components/Button";
import { Dialog } from "@/components/Dialog";
import { T } from "@/components/Text";
import { toast } from "@/lib/toast";
import { useBranch } from "@/state/BranchProvider";
import { radius, space, useColors } from "@/theme";
import { type StaffReport, shareReport, useReportAudience } from "./staff";

/**
 * Share with the family, as the website's (web/src/features/reports/ReportDialogs.tsx): who will see it (an admin sees
 * the accounts; a coach is told whose), whether to email them a link (on by default), and a last check of what the
 * report holds. Sharing is kept on the phone at once and the report shows it straight away; the family hears from the
 * academy once the server has it.
 */
export function ShareDialog({ report: r, stale, onClose }: { report: StaffReport; stale: boolean; onClose: () => void }) {
  const colors = useColors();
  const { branchId, actor, isAdmin } = useBranch();
  const audience = useReportAudience(r.studentId, isAdmin);
  const [emailFamily, setEmailFamily] = useState(true);
  const name = r.student?.name || r.studentName;
  const first = r.student?.firstName || name;
  const checks = [
    { ok: !!r.narrative?.overview?.trim(), text: "The overview is written" },
    { ok: !stale, text: "The figures are up to date with the evaluations" },
    { ok: !!r.narrative?.coachNote?.trim(), text: "A note from the coach (optional)" },
  ];

  const share = () => {
    void shareReport(branchId, actor, r, emailFamily).catch((e: unknown) => toast.error("Couldn’t share the report", { description: e instanceof Error ? e.message : String(e) }));
    toast.success(emailFamily ? "Shared. The family will get an email with a link." : "Shared with the family");
    onClose();
  };
  const toggle = (on: boolean) => {
    void Haptics.selectionAsync().catch(() => undefined);
    setEmailFamily(on);
  };

  return (
    <Dialog
      open
      onRequestClose={onClose}
      testID="report-share-dialog"
      footer={
        <View style={styles.buttons}>
          <Button variant="outline" onPress={onClose} style={styles.grow} testID="report-share-cancel">
            Cancel
          </Button>
          <Button icon={<Send size={18} color={colors.primaryForeground} />} onPress={share} style={styles.grow} testID="report-share-confirm">
            Share
          </Button>
        </View>
      }
    >
      <T variant="heading">Share with the family</T>
      <T tone="muted">
        {name}’s {r.period.label} report will appear for the family in the app and on the website. Shared reports are locked until an admin stops sharing them.
      </T>

      <View style={styles.block}>
        <T variant="small" tone="muted" style={styles.caps}>
          WHO CAN SEE IT
        </T>
        {!isAdmin ? (
          <T variant="small">
            The parents linked to {first}, and {first} if they have an account.
          </T>
        ) : audience.loading ? (
          <ActivityIndicator color={colors.mutedForeground} style={styles.start} />
        ) : audience.data.length ? (
          audience.data.map((m) => (
            <View key={m.email} style={styles.person} testID="report-share-person">
              <Eye size={14} color={colors.mutedForeground} />
              <T variant="small" numberOfLines={1} style={styles.shrink}>
                {m.displayName || m.email}
              </T>
              {m.displayName ? (
                <T variant="small" tone="muted" numberOfLines={1} style={styles.shrink}>
                  {m.email}
                </T>
              ) : null}
            </View>
          ))
        ) : (
          <T variant="small" tone="muted">
            No parent or student account is linked to {name} yet. The report will appear for them once one is added.
          </T>
        )}
      </View>

      <Pressable
        accessibilityRole="switch"
        accessibilityLabel="Email them a link to the report"
        accessibilityState={{ checked: emailFamily }}
        onPress={() => toggle(!emailFamily)}
        style={({ pressed }) => [styles.switchRow, { borderColor: colors.border }, pressed && { backgroundColor: colors.accent }]}
        testID="report-share-email"
      >
        <T style={styles.grow}>Email them a link to the report</T>
        <Switch
          value={emailFamily}
          onValueChange={toggle}
          {...(Platform.OS === "android" ? { trackColor: { false: colors.input, true: colors.success }, thumbColor: "#ffffff" } : null)}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          testID="report-share-email-switch"
        />
      </Pressable>

      <View style={[styles.checks, { backgroundColor: colors.secondary }]} testID="report-share-checks">
        {checks.map((c) => (
          <View key={c.text} style={styles.check}>
            {c.ok ? <Check size={14} color={colors.success} /> : <Dot size={14} color={colors.warning} />}
            <T variant="small" style={[styles.shrink, { color: c.ok ? colors.foreground : colors.warning }]}>
              {c.text}
            </T>
          </View>
        ))}
      </View>
    </Dialog>
  );
}

const styles = StyleSheet.create({
  buttons: { flexDirection: "row", gap: space.md },
  grow: { flex: 1 },
  shrink: { flexShrink: 1 },
  block: { gap: space.sm },
  caps: { fontWeight: "600", letterSpacing: 0.5 },
  start: { alignSelf: "flex-start" },
  person: { flexDirection: "row", alignItems: "center", gap: space.sm },
  switchRow: { flexDirection: "row", alignItems: "center", gap: space.md, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm, minHeight: 48 },
  checks: { borderRadius: radius.md, padding: space.md, gap: space.sm },
  check: { flexDirection: "row", alignItems: "center", gap: space.sm },
});
