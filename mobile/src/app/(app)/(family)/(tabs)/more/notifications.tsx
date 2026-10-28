import { Screen } from "@/components/Screen";
import { NoticeSwitches } from "@/features/notifications/NoticeSwitches";
import { PhoneNotifications } from "@/features/notifications/PhoneNotifications";

/**
 * More → Notifications for families: whether the academy's notices reach this phone (and turning them on), then which
 * kinds they're told about (class changes, answers to requests, scores, reports, news), as on the website.
 */
export default function FamilyNotificationsScreen() {
  return (
    <Screen testID="family-notifications-screen" typing={false}>
      <PhoneNotifications />
      <NoticeSwitches />
    </Screen>
  );
}
