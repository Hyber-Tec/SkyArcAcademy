import { router } from "expo-router";
import { Inbox } from "lucide-react-native";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { ListSection } from "@/components/List";
import { Screen } from "@/components/Screen";
import { SkeletonCards } from "@/components/Skeleton";
import { T } from "@/components/Text";
import { type RequestDoc, useOpenRequests, useRecentRequests } from "@/features/requests/data";
import { RequestRow } from "@/features/requests/RequestRow";
import { plural } from "@/features/schedule/format";
import { useBranch } from "@/state/BranchProvider";
import { useColors } from "@/theme";

/**
 * Every request from families in one place (Home's card, the schedule's Requests and the office's notices lead here), as
 * the website's sheet: those waiting on the office, the soonest class first; those waiting on a family's answer to a
 * class the office suggested; and those decided or withdrawn in the last two weeks. Each opens to answer it, or to see
 * its back and forth. Live: one answered on the website, or by the family, moves at once.
 */
export default function RequestsScreen() {
  const { timezone, settings, isAdmin } = useBranch();
  const colors = useColors();
  const hour12 = settings.general.timeFormat !== "24h";
  const open = useOpenRequests(isAdmin);
  const decided = useRecentRequests(isAdmin);
  const openRequest = (r: RequestDoc) => router.push({ pathname: "/request/[id]", params: { id: r.id } });
  const rows = (list: RequestDoc[]) => list.map((r) => <RequestRow key={r.id} r={r} timezone={timezone} hour12={hour12} onPress={() => openRequest(r)} />);
  const nothing = !open.pending.length && !open.offered.length && !decided.data.length;

  return (
    <Screen typing={false} onRefresh={() => new Promise((r) => setTimeout(r, 600))} testID="requests-screen">
      <T tone="muted">Makeups, moved classes and extra classes. Approve one, decline it, or suggest another time; the family is told each time.</T>
      {open.loading ? (
        <SkeletonCards count={3} height={72} />
      ) : open.error && !open.data.length ? (
        <Card testID="requests-error">
          <T variant="label">Couldn’t load the requests</T>
          <T variant="small" tone="muted">
            Check your connection, then pull down to try again.
          </T>
        </Card>
      ) : nothing ? (
        <EmptyState testID="requests-empty" icon={<Inbox size={26} color={colors.mutedForeground} />} title="Nothing waiting" text="Requests from families show here as they come." />
      ) : (
        <>
          {open.pending.length ? (
            <ListSection title="Waiting on us" detail={plural(open.pending.length, "request")} testID="requests-list">
              {rows(open.pending)}
            </ListSection>
          ) : (
            <T variant="small" tone="muted" testID="requests-none-waiting">
              Nothing is waiting on you.
            </T>
          )}
          {open.offered.length ? (
            <ListSection title="Waiting on the family" detail={plural(open.offered.length, "request")} testID="requests-offered">
              {rows(open.offered)}
            </ListSection>
          ) : null}
          {decided.data.length ? (
            <ListSection title="Decided" detail="Last two weeks" testID="requests-decided">
              {rows(decided.data)}
            </ListSection>
          ) : null}
        </>
      )}
    </Screen>
  );
}
