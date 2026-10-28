import { router } from "expo-router";
import { Inbox } from "lucide-react-native";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { ListSection } from "@/components/List";
import { Screen } from "@/components/Screen";
import { SkeletonCards } from "@/components/Skeleton";
import { T } from "@/components/Text";
import { usePendingRequests } from "@/features/requests/data";
import { RequestRow } from "@/features/requests/RequestRow";
import { plural } from "@/features/schedule/format";
import { useBranch } from "@/state/BranchProvider";
import { useColors } from "@/theme";

/**
 * The office's requests from families still waiting for an answer (Home's card and the schedule's Requests open it), the
 * soonest class first, as the website's sheet: makeups, moved classes and extra classes. Each opens to approve or
 * decline. Live: one answered on the website, or withdrawn, leaves the list.
 */
export default function RequestsScreen() {
  const { timezone, settings, isAdmin } = useBranch();
  const colors = useColors();
  const hour12 = settings.general.timeFormat !== "24h";
  const pending = usePendingRequests(isAdmin);

  return (
    <Screen typing={false} onRefresh={() => new Promise((r) => setTimeout(r, 600))} testID="requests-screen">
      <T tone="muted">Makeups, moved classes and extra classes waiting for an answer. The family is told either way.</T>
      {pending.loading ? (
        <SkeletonCards count={3} height={72} />
      ) : pending.error && !pending.data.length ? (
        <Card testID="requests-error">
          <T variant="label">Couldn’t load the requests</T>
          <T variant="small" tone="muted">
            Check your connection, then pull down to try again.
          </T>
        </Card>
      ) : pending.data.length ? (
        <ListSection title="Waiting" detail={plural(pending.data.length, "request")} testID="requests-list">
          {pending.data.map((r) => (
            <RequestRow key={r.id} r={r} timezone={timezone} hour12={hour12} onPress={() => router.push({ pathname: "/request/[id]", params: { id: r.id } })} />
          ))}
        </ListSection>
      ) : (
        <EmptyState testID="requests-empty" icon={<Inbox size={26} color={colors.mutedForeground} />} title="Nothing waiting" text="Requests from families show here as they come." />
      )}
    </Screen>
  );
}
