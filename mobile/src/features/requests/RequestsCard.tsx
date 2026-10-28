import { router } from "expo-router";
import { Badge } from "@/components/Badge";
import { ListRow, ListSection } from "@/components/List";
import { useBranch } from "@/state/BranchProvider";
import { usePendingRequests } from "./data";
import { RequestRow } from "./RequestRow";

/** How many show on Home; the rest are a tap away. */
const SHOWN = 5;

/**
 * Home's "Requests from families" for owners and admins, as the website's Home card: the requests waiting for an answer,
 * the soonest class first, each opening to approve or decline, and all of them on their own page. Nothing while there
 * are none.
 */
export function RequestsCard() {
  const { timezone, settings, isAdmin } = useBranch();
  const hour12 = settings.general.timeFormat !== "24h";
  const pending = usePendingRequests(isAdmin);
  if (!isAdmin || pending.loading || !pending.data.length) return null;
  const more = pending.data.length - SHOWN;
  return (
    <ListSection title="Requests from families" detail={<Badge tone="destructive">{pending.data.length}</Badge>} testID="today-requests">
      {[
        ...pending.data.slice(0, SHOWN).map((r) => (
          <RequestRow key={r.id} r={r} timezone={timezone} hour12={hour12} onPress={() => router.push({ pathname: "/request/[id]", params: { id: r.id } })} />
        )),
        <ListRow key="all" title={more > 0 ? `All requests (${more} more)` : "All requests"} onPress={() => router.push("/requests")} testID="today-requests-all" />,
      ]}
    </ListSection>
  );
}
