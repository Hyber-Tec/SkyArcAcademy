import { Screen } from "@/components/Screen";
import { PhoneNotifications } from "@/features/notifications/PhoneNotifications";

/** More → Notifications for families: whether the academy's notices reach this phone, and turning them on. */
export default function FamilyNotificationsScreen() {
  return (
    <Screen testID="family-notifications-screen" typing={false}>
      <PhoneNotifications />
    </Screen>
  );
}
