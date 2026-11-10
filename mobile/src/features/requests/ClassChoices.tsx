import type { DateKey } from "@shared/time";
import { CalendarSearch } from "lucide-react-native";
import { useMemo } from "react";
import { ChoiceRow } from "@/components/ChoiceRow";
import { EmptyState } from "@/components/EmptyState";
import { ListSection } from "@/components/List";
import { SkeletonCards } from "@/components/Skeleton";
import { monthDay, plural, shortDay, timeRange } from "@/features/schedule/format";
import { useColors } from "@/theme";
import type { ClassSeatsDoc } from "./data";

/**
 * Classes with seats open, a day at a time (each day's title says when), to choose one: what the office suggests
 * instead of the class asked for, or what a family asks for instead of the one suggested (`useClassChoices` lists
 * them). Each shows how many seats are open, never who's in it.
 */
export function ClassChoices({
  choices,
  selected,
  onSelect,
  hour12,
  loading,
  horizon,
  testID,
}: {
  choices: readonly ClassSeatsDoc[];
  selected: string | null;
  onSelect: (classId: string) => void;
  hour12: boolean;
  loading: boolean;
  horizon: DateKey;
  testID: string;
}) {
  const colors = useColors();
  const byDay = useMemo(() => {
    const m = new Map<DateKey, ClassSeatsDoc[]>();
    for (const c of choices) m.set(c.dateKey, [...(m.get(c.dateKey) ?? []), c]);
    return [...m.entries()];
  }, [choices]);
  if (loading) return <SkeletonCards count={3} height={52} />;
  if (!byDay.length) {
    return (
      <EmptyState
        testID={`${testID}-none`}
        icon={<CalendarSearch size={26} color={colors.mutedForeground} />}
        title="No open seats"
        text={`No other class has a seat open until ${monthDay(horizon)}.`}
      />
    );
  }
  return (
    <>
      {byDay.map(([day, list]) => (
        <ListSection key={day} title={shortDay(day)} testID={`${testID}-day-${day}`}>
          {list.map((c) => (
            <ChoiceRow
              key={c.id}
              selected={c.id === selected}
              title={timeRange(c.startMin, c.endMin, hour12)}
              right={`${plural(c.seats - c.taken, "seat")} open`}
              onPress={() => onSelect(c.id)}
              testID={`${testID}-${c.id}`}
            />
          ))}
        </ListSection>
      ))}
    </>
  );
}
