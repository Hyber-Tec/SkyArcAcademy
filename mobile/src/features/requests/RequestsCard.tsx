import { router } from "expo-router";
import { Badge } from "@/components/Badge";
import { ListRow, ListSection } from "@/components/List";
import { plural } from "@/features/schedule/format";
import { useBranch } from "@/state/BranchProvider";
import { useOpenRequests } from "./data";
import { RequestRow } from "./RequestRow";

/** How many show on Home; the rest are a tap away. */
const SHOWN = 5;

/**
 * Home's "Requests from families" for owners and admins, as the website's Home card: the requests waiting for an answer,
 * the soonest class first, each opening to answer it, and every request on its own page (with how many wait on a
 * family's answer to a time suggested). Nothing while none is open.
 */
export function RequestsCard() {
  const { timezone, settings, isAdmin } = useBranch();
  const hour12 = settings.general.timeFormat !== "24h";
  const open = useOpenRequests(isAdmin);
  if (!isAdmin || open.loading || !open.data.length) return null;
  const waiting = open.pending;
  const more = waiting.length - SHOWN;
  const awaited = open.offered.length ? `${plural(open.offered.length, "answer")} awaited from families` : null;
  return (
    <ListSection title="Requests from families" detail={waiting.length ? <Badge tone="destructive">{waiting.length}</Badge> : undefined} testID="today-requests">
      {[
        ...waiting.slice(0, SHOWN).map((r) => (
          <RequestRow key={r.id} r={r} timezone={timezone} hour12={hour12} onPress={() => router.push({ pathname: "/request/[id]", params: { id: r.id } })} />
        )),
        <ListRow
          key="all"
          title={more > 0 ? `All requests (${more} more)` : "All requests"}
          subtitle={waiting.length ? (awaited ?? undefined) : ["Nothing waiting on you", awaited].filter(Boolean).join(" · ")}
          onPress={() => router.push("/requests")}
          testID="today-requests-all"
        />,
      ]}
    </ListSection>
  );
}
