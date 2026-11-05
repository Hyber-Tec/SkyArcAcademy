import { InboxScreen } from "@/features/notifications/InboxScreen";
import { familyTarget, openFamilyItem } from "@/features/notifications/inbox";
import { useT } from "@/lib/lang";
import { useBranch } from "@/state/BranchProvider";

/** A family's notifications (Home's bell): a class, an answer to a request, a score, a report or a post opens from its notice. */
export default function FamilyInboxScreen() {
  const { branchId } = useBranch();
  const t = useT();
  return (
    <InboxScreen
      leads={(n) => familyTarget(n) !== null}
      onOpen={(n) => openFamilyItem(branchId, n)}
      empty={t(
        "Changes to your classes, answers to your requests, new scores and reports, and the academy’s news show here as they come.",
        "수업 변경, 신청 결과, 새 점수와 리포트, 아카데미 소식이 오면 여기에 보여요.",
      )}
    />
  );
}
