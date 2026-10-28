import { InboxScreen } from "@/features/notifications/InboxScreen";
import { inboxTarget, openInboxItem } from "@/features/notifications/inbox";
import { useBranch } from "@/state/BranchProvider";

/** The staff's notifications (Home's bell): a class, a post or a family's request opens from its notice. */
export default function StaffInboxScreen() {
  const { branchId, isCoach } = useBranch();
  return (
    <InboxScreen
      leads={(n) => inboxTarget(n) !== null}
      onOpen={(n) => void openInboxItem(branchId, n)}
      empty={
        isCoach
          ? "Changes to your classes and new announcements show here as they come."
          : "Requests and cancellations from families, and messages from the website, show here as they come."
      }
    />
  );
}
