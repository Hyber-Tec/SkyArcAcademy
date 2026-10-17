import { type DateKey, addDays } from "@shared/time";
import { router } from "expo-router";
import { CalendarX2, History } from "lucide-react-native";
import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { ListSection } from "@/components/List";
import { Screen } from "@/components/Screen";
import { SegmentedControl } from "@/components/SegmentedControl";
import { SkeletonCards } from "@/components/Skeleton";
import { T } from "@/components/Text";
import { useAcademyNow } from "@/features/data/hooks";
import { FamilyClassRow } from "@/features/family/ClassCards";
import { useFamilySessions } from "@/features/family/data";
import { ChildSwitcher, NotLinked } from "@/features/family/FamilyParts";
import { useFamily } from "@/features/family/FamilyProvider";
import { dayHeading, hasEnded } from "@/features/family/format";
import { type ClassGroup, groupClasses } from "@/features/schedule/classes";
import { plural } from "@/features/schedule/format";
import { useBranch } from "@/state/BranchProvider";
import { space, useColors } from "@/theme";

type Show = "upcoming" | "past";

/** Weeks shown at first, and added by "Show more". */
const STEP_WEEKS = 8;
/** How far the list reaches at the most: half a year ahead, a year back. */
const MAX_AHEAD_WEEKS = 26;
const MAX_BACK_WEEKS = 52;

/**
 * The family's classes, day by day: what's coming (earliest first) or what's past (latest first), each with the coach,
 * its status in plain words and the class's note; a parent with several children picks All or one child. A class
 * opens its sheet. Read-only: the academy books and changes classes.
 */
export default function FamilyClassesScreen() {
  const family = useFamily();
  const colors = useColors();
  const { settings } = useBranch();
  const { today, nowMin } = useAcademyNow();
  const hour12 = settings.general.timeFormat !== "24h";
  const [show, setShow] = useState<Show>("upcoming");
  const [ahead, setAhead] = useState(STEP_WEEKS);
  const [back, setBack] = useState(STEP_WEEKS);
  // How many classes showed when "Show more" was tapped: none more once loaded means there are no more.
  const [before, setBefore] = useState<Record<Show, number | null>>({ upcoming: null, past: null });
  const upcoming = show === "upcoming";
  const weeks = upcoming ? ahead : back;
  // Both lists stay loaded, so switching between them is instant; a longer stretch keeps the list in place while it loads.
  const coming = useFamilySessions(family.ids, today, addDays(today, ahead * 7), true);
  const past = useFamilySessions(family.ids, addDays(today, -back * 7), today, true);
  const sessions = upcoming ? coming : past;

  const days = useMemo(() => {
    const shown = new Set(family.shown);
    const list = sessions.data.filter((s) => shown.has(s.studentId) && hasEnded(s, today, nowMin) !== upcoming);
    const groups = groupClasses(list);
    // Coming: earliest first. Past: the latest first, day by day and within a day.
    const ordered = upcoming ? groups : groups.reverse();
    const byDay = new Map<DateKey, ClassGroup[]>();
    for (const g of ordered) byDay.set(g.dateKey, [...(byDay.get(g.dateKey) ?? []), g]);
    return [...byDay.entries()];
  }, [sessions.data, family.shown, today, nowMin, upcoming]);
  const count = days.reduce((n, [, list]) => n + list.length, 0);
  const extending = sessions.loading && sessions.data.length > 0;
  const noMore = !sessions.loading && before[show] !== null && before[show] === count;
  const canMore = (upcoming ? ahead < MAX_AHEAD_WEEKS : back < MAX_BACK_WEEKS) && !noMore;
  const more = () => {
    setBefore((b) => ({ ...b, [show]: count }));
    if (upcoming) setAhead((w) => Math.min(MAX_AHEAD_WEEKS, w + STEP_WEEKS));
    else setBack((w) => Math.min(MAX_BACK_WEEKS, w + STEP_WEEKS));
  };
  const span = upcoming ? `in the next ${weeks} weeks` : `in the last ${weeks} weeks`;

  return (
    <Screen title="Classes" typing={false} onRefresh={() => new Promise((r) => setTimeout(r, 600))} testID="family-classes">
      {!family.ids.length ? (
        <NotLinked />
      ) : (
        <>
          <View style={styles.controls}>
            <ChildSwitcher />
            <SegmentedControl<Show>
              value={show}
              onChange={setShow}
              options={[
                { value: "upcoming", label: "Upcoming" },
                { value: "past", label: "Past" },
              ]}
              testID="family-classes-show"
            />
            {!sessions.loading && count ? (
              <T variant="small" tone="muted" style={styles.summary} testID="family-classes-count">
                {plural(count, "class", "classes")} {span}
              </T>
            ) : null}
          </View>

          {sessions.loading && !extending ? (
            <SkeletonCards count={4} height={72} />
          ) : sessions.error ? (
            <Card>
              <T variant="label">Couldn’t load the classes</T>
              <T variant="small" tone="muted">
                Check your connection, then pull down to try again.
              </T>
            </Card>
          ) : days.length ? (
            <View style={styles.days} testID="family-classes-list">
              {days.map(([day, list]) => (
                <ListSection key={day} title={dayHeading(day, today)} testID={`family-day-${day}`}>
                  {list.map((g) => (
                    <FamilyClassRow
                      key={g.id}
                      group={g}
                      when={{ today, nowMin, hour12 }}
                      onPress={() => router.push({ pathname: "/session/[id]", params: { id: g.sessions[0].id } })}
                      testID={`family-class-${g.sessions[0].id}`}
                    />
                  ))}
                </ListSection>
              ))}
            </View>
          ) : (
            <EmptyState
              testID="family-classes-empty"
              icon={upcoming ? <CalendarX2 size={26} color={colors.mutedForeground} /> : <History size={26} color={colors.mutedForeground} />}
              title={upcoming ? "Nothing booked" : "No past classes"}
              text={upcoming ? `No classes ${span}. The academy books them, and they show here.` : `No classes ${span}.`}
            />
          )}

          {canMore && (!sessions.loading || extending) ? (
            <Button variant="ghost" onPress={more} busy={extending} testID="family-classes-more">
              {upcoming ? `Show ${STEP_WEEKS} more weeks` : "Show earlier classes"}
            </Button>
          ) : noMore && count ? (
            <T variant="small" tone="muted" style={styles.end} testID="family-classes-end">
              {upcoming ? "Nothing else is booked yet." : "No earlier classes."}
            </T>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  controls: { gap: space.md },
  summary: { paddingHorizontal: space.xs },
  days: { gap: space.lg },
  end: { textAlign: "center", paddingVertical: space.sm },
});
