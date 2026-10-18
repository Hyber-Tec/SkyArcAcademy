import { type DateKey, addDays } from "@shared/time";
import { router } from "expo-router";
import { CalendarX2, History } from "lucide-react-native";
import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { ListSection } from "@/components/List";
import { Screen } from "@/components/Screen";
import { SegmentedControl } from "@/components/SegmentedControl";
import { SkeletonCards } from "@/components/Skeleton";
import { TabHeader } from "@/components/TabHeader";
import { T } from "@/components/Text";
import { useAcademyNow } from "@/features/data/hooks";
import { FamilyClassRow } from "@/features/family/ClassCards";
import { FamilyClassMonth } from "@/features/family/ClassMonth";
import { useFamilySessions } from "@/features/family/data";
import { ChildSwitcher, NotLinked } from "@/features/family/FamilyParts";
import { useFamily } from "@/features/family/FamilyProvider";
import { dayHeading, hasEnded } from "@/features/family/format";
import { type ClassGroup, groupClasses } from "@/features/schedule/classes";
import { plural } from "@/features/schedule/format";
import { useBranch } from "@/state/BranchProvider";
import { space, useColors } from "@/theme";

type Show = "upcoming" | "past";
type Mode = "list" | "month";

/** Weeks shown at first, and added by "Show more". */
const STEP_WEEKS = 8;
/** How far the list reaches at the most: half a year ahead, a year back. */
const MAX_AHEAD_WEEKS = 26;
const MAX_BACK_WEEKS = 52;

/**
 * The family's classes, as a list or on the months (List / Month, by the title, as on the website). The list goes day
 * by day: what's coming (earliest first) or what's past (latest first), each with the coach, its status in plain words
 * and the class's note. The months scroll vertically, each day marked with its classes (FamilyClassMonth), and the day
 * tapped shows its classes under them. A parent with several children picks All or one child. A class opens its sheet.
 * Read-only: the academy books and changes classes.
 */
export default function FamilyClassesScreen() {
  const family = useFamily();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { settings } = useBranch();
  const { today, nowMin } = useAcademyNow();
  const hour12 = settings.general.timeFormat !== "24h";
  const [mode, setMode] = useState<Mode>("list");
  // The day chosen on the months (null: today, whichever day that is), kept while the list shows.
  const [day, setDay] = useState<DateKey | null>(null);
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
  const switcher = family.ids.length ? (
    <View style={styles.mode}>
      <SegmentedControl<Mode>
        value={mode}
        onChange={setMode}
        options={[
          { value: "list", label: "List" },
          { value: "month", label: "Month" },
        ]}
        testID="family-classes-view"
      />
    </View>
  ) : undefined;

  // The months scroll by themselves (a list in the page's scroll would fight it): a page of their own, its top as the
  // list's.
  if (mode === "month" && family.ids.length) {
    return (
      <View style={[styles.page, { backgroundColor: colors.grouped }]} testID="family-classes">
        <View style={[styles.top, { paddingTop: insets.top + space.lg }]}>
          <TabHeader title="Classes" right={switcher} testID="family-classes-title" />
          <ChildSwitcher />
        </View>
        <FamilyClassMonth selected={day ?? today} onSelect={setDay} today={today} nowMin={nowMin} hour12={hour12} />
      </View>
    );
  }

  return (
    <Screen title="Classes" titleRight={switcher} typing={false} onRefresh={() => new Promise((r) => setTimeout(r, 600))} testID="family-classes">
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
  page: { flex: 1 },
  top: { paddingHorizontal: space.lg, paddingBottom: space.md, gap: space.md },
  mode: { width: 150 },
  controls: { gap: space.md },
  summary: { paddingHorizontal: space.xs },
  days: { gap: space.lg },
  end: { textAlign: "center", paddingVertical: space.sm },
});
