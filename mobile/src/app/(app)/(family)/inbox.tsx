import { InboxScreen } from "@/features/notifications/InboxScreen";
import { familyTarget, openFamilyItem } from "@/features/notifications/inbox";
import { useBranch } from "@/state/BranchProvider";

/** A family's notifications (Home's bell): a class, an answer to a request, a score, a report or a post opens from its notice. */
export default function FamilyInboxScreen() {
  const { branchId } = useBranch();
  return (
    <InboxScreen
      leads={(n) => familyTarget(n) !== null}
      onOpen={(n) => openFamilyItem(branchId, n)}
      empty="Changes to your classes, answers to your requests, new scores and reports, and the academy’s news show here as they come."
    />
  );
}
