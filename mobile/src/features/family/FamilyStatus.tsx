import { familyStatusLabel } from "@shared/schedule/family";
import type { SessionStatus } from "@shared/settings/defaults";
import { StyleSheet } from "react-native";
import { Badge } from "@/components/Badge";
import { useColors, useStatusColors } from "@/theme";

/**
 * A class's status as families read it (shared/src/schedule/family.ts): Scheduled, Confirmed, Attended, Missed,
 * Canceled, or "Not marked yet" for a class that has ended without a mark. Scheduled and not marked stay quiet; the
 * others take the schedule's status colours.
 */
export function FamilyStatus({ status, ended }: { status: SessionStatus; ended: boolean }) {
  const colors = useColors();
  const tone = useStatusColors();
  const quiet = status === "pending" || (ended && status === "confirmed");
  return (
    <Badge bg={quiet ? colors.secondary : tone[status].bg} fg={quiet ? colors.mutedForeground : tone[status].text} style={styles.badge}>
      {familyStatusLabel(status, ended)}
    </Badge>
  );
}

const styles = StyleSheet.create({ badge: { flexShrink: 0, alignSelf: "center" } });
