import { router } from "expo-router";
import { Bell } from "lucide-react-native";
import { IconButton } from "@/components/IconButton";
import { useBranch } from "@/state/BranchProvider";
import { useColors } from "@/theme";
import { useInbox } from "./inbox";

/**
 * The bell at the top of Home: the person's notifications (the inbox, `/inbox`, the staff's or the family's), with how
 * many are unread. Coaches and families always have it, as on the website; owners and admins once something has come
 * for them (families' requests and cancellations, the website's messages).
 */
export function InboxBell({ testID = "today-notifications" }: { testID?: string }) {
  const colors = useColors();
  const { isCoach, role } = useBranch();
  const inbox = useInbox();
  if (!isCoach && role !== "parent" && role !== "student" && !inbox.data.length) return null;
  const unread = inbox.data.filter((n) => !n.readAt).length;
  return (
    <IconButton
      icon={<Bell size={20} color={colors.foreground} />}
      badge={unread}
      accessibilityLabel="Notifications"
      onPress={() => router.push("/inbox")}
      size={36}
      filled
      testID={testID}
    />
  );
}
