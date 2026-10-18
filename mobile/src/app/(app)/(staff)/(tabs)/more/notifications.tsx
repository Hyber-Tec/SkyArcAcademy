import { NOTIFICATION_SWITCHES, prefOn } from "@shared/profile";
import type { NotificationPrefs } from "@shared/types";
import { BellOff, Link2Off } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet } from "react-native";
import { EmptyState } from "@/components/EmptyState";
import { ListSection } from "@/components/List";
import { Screen } from "@/components/Screen";
import { SwitchRow } from "@/components/SwitchRow";
import { T } from "@/components/Text";
import { setMyNotificationPref } from "@/features/account/profile";
import { errorMessage } from "@/lib/api";
import { toast } from "@/lib/toast";
import { useBranch } from "@/state/BranchProvider";
import { space, useColors } from "@/theme";

/**
 * More → Notifications: the four switches of the website's Profile → Notifications (`staff.notificationPrefs`), which
 * decide what the academy tells a coach about. Each saves as it's switched, with an audit entry; the switch shows its
 * new position at once. Notifications reach coaches only (functions/src/notify.ts), so owners and admins are told so.
 */
export default function NotificationsScreen() {
  const { branchId, actor, staff, isCoach, settings, name: academy } = useBranch();
  const colors = useColors();
  // Shown at once while the write is on its way (and kept if the phone is offline until it goes).
  const [pending, setPending] = useState<Partial<NotificationPrefs>>({});
  const hours = settings.notifications.sessionChangeWindowHours;

  if (!isCoach) {
    return (
      <Screen testID="notifications-screen" typing={false}>
        <EmptyState
          icon={<BellOff size={26} color={colors.mutedForeground} />}
          title="Notifications are for coaches"
          text={`${academy}’s coaches are told about their new classes, class changes and cancellations, and the academy’s announcements, and each chooses which. Nothing is sent to owners and admins.`}
          testID="notifications-office"
        />
      </Screen>
    );
  }
  if (!staff) {
    return (
      <Screen testID="notifications-screen" typing={false}>
        <EmptyState
          icon={<Link2Off size={26} color={colors.mutedForeground} />}
          title="Your employee record isn’t linked yet"
          text={`Ask an admin at ${academy} to link it to your account. Your notification switches show here once it is.`}
          testID="notifications-not-linked"
        />
      </Screen>
    );
  }

  const value = (key: keyof NotificationPrefs) => pending[key] ?? prefOn(staff.notificationPrefs, key);
  const change = (key: keyof NotificationPrefs, on: boolean) => {
    setPending((p) => ({ ...p, [key]: on }));
    void setMyNotificationPref(branchId, actor, staff, key, on)
      .catch((e: unknown) => toast.error("Couldn’t change the notification", { description: errorMessage(e, "Try again in a moment.") }))
      .finally(() =>
        setPending((p) => {
          const next = { ...p };
          delete next[key];
          return next;
        }),
      );
  };

  return (
    <Screen testID="notifications-screen" typing={false}>
      <T tone="muted" style={styles.intro}>
        Choose what you’re told about. Turning one off stops it everywhere you’re signed in.
      </T>
      <ListSection footer={`Class alerts are about classes that start within the next ${hours} hours. They arrive in the bell, here and on the website.`} testID="notifications-switches">
        {NOTIFICATION_SWITCHES.map((s) => (
          <SwitchRow key={s.key} title={s.label} subtitle={s.description} value={value(s.key)} onValueChange={(on) => change(s.key, on)} testID={`notifications-${s.key}`} />
        ))}
      </ListSection>
    </Screen>
  );
}

const styles = StyleSheet.create({ intro: { paddingHorizontal: space.xs } });
