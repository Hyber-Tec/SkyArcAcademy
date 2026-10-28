import { MAKEUP_LOOKBACK_DAYS, makeupsOwed, takesSeat } from "@shared/schedule/classes";
import { type ClassRequestKind, isRequestable, requestHorizon } from "@shared/schedule/requests";
import { type DateKey, addDays } from "@shared/time";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { CalendarPlus, CalendarSearch } from "lucide-react-native";
import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button } from "@/components/Button";
import { ChoiceRow } from "@/components/ChoiceRow";
import { EmptyState } from "@/components/EmptyState";
import { Field } from "@/components/Field";
import { FilterChips } from "@/components/FilterChips";
import { ListRow, ListSection } from "@/components/List";
import { Screen } from "@/components/Screen";
import { SectionTitle } from "@/components/SectionTitle";
import { SkeletonCards } from "@/components/Skeleton";
import { T } from "@/components/Text";
import { useAcademyNow } from "@/features/data/hooks";
import { type SessionDoc, useFamilyRequests, useFamilySessions } from "@/features/family/data";
import { useFamily } from "@/features/family/FamilyProvider";
import { requestClass, requestError } from "@/features/requests/api";
import { type ClassSeatsDoc, millis, useClassSeats } from "@/features/requests/data";
import { clock, monthDay, plural, shortDay, timeRange } from "@/features/schedule/format";
import { toast } from "@/lib/toast";
import { useBranch } from "@/state/BranchProvider";
import { space, useColors } from "@/theme";

const KINDS: readonly ClassRequestKind[] = ["makeup", "reschedule", "extra"];

/**
 * Ask for a class (from Classes, or a class's sheet to move it): a makeup for a missed class, a class moved to another
 * time, or an extra class, in a class with seats open in the next days, as the website's dialog
 * (web/src/features/requests/AskForClassDialog.tsx; docs/DECISIONS.md §23). Families see how many seats are open, never
 * who's in a class. The server checks the request with the shared rules (`requestCheck`) and says why when it can't
 * be made; the academy approves or declines, and the family is told either way. Opened with `studentId`, `kind` and
 * `forSessionId` (the class to move, or the missed class to make up).
 */
export default function AskForClassScreen() {
  const params = useLocalSearchParams<{ studentId?: string; kind?: string; forSessionId?: string }>();
  const family = useFamily();
  const { branchId, settings } = useBranch();
  const colors = useColors();
  const { today, now } = useAcademyNow();
  const hour12 = settings.general.timeFormat !== "24h";
  const horizon = requestHorizon(today, settings);
  const since = addDays(today, -MAKEUP_LOOKBACK_DAYS);
  const preset = KINDS.includes(params.kind as ClassRequestKind) ? (params.kind as ClassRequestKind) : null;

  // The child it's for: the one it was opened for, else the one chosen on the tabs, else the first.
  const [chosen, setChosen] = useState<string | null>(null);
  const opened = params.studentId && family.ids.includes(params.studentId) ? params.studentId : null;
  const studentId = chosen ?? opened ?? (family.child !== "all" ? family.child : (family.ids[0] ?? ""));
  const ids = useMemo(() => (studentId ? [studentId] : []), [studentId]);
  const seats = useFamilySessions(ids, since, horizon);
  const requests = useFamilyRequests(ids);
  const classes = useClassSeats(today, horizon);

  const owed = useMemo(() => makeupsOwed(seats.data, since), [seats.data, since]);
  const moving = preset === "reschedule" ? (seats.data.find((s) => s.id === params.forSessionId) ?? null) : null;
  const [kind, setKind] = useState<ClassRequestKind>(preset ?? "makeup");
  const [forId, setForId] = useState<string | null>(preset === "makeup" ? (params.forSessionId ?? null) : null);
  const [classId, setClassId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  // A makeup needs one owed; with none, an extra class is what's left (a move comes only from a class's sheet).
  const kindNow: ClassRequestKind = kind === "makeup" && !owed.length && !seats.loading ? "extra" : kind;
  const makeupFor = kindNow === "makeup" ? (owed.find((s) => s.id === forId) ?? owed[0] ?? null) : null;
  const pending = useMemo(() => requests.data.filter((r) => r.status === "pending"), [requests.data]);
  const live = useMemo(() => seats.data.filter(takesSeat), [seats.data]);

  // Open classes the child can take: not one they're in or at the same time, nor one already asked for.
  const choices = useMemo(
    () =>
      classes.data.filter(
        (c) =>
          isRequestable({ ...c, startMs: millis(c.startAt) }, now, horizon) &&
          !live.some((s) => s.id !== moving?.id && s.dateKey === c.dateKey && s.startMin < c.endMin && s.endMin > c.startMin) &&
          !pending.some((r) => r.classId === c.id),
      ),
    [classes.data, live, pending, horizon, moving?.id, now],
  );
  const byDay = useMemo(() => {
    const m = new Map<DateKey, ClassSeatsDoc[]>();
    for (const c of choices) m.set(c.dateKey, [...(m.get(c.dateKey) ?? []), c]);
    return [...m.entries()];
  }, [choices]);
  const picked = choices.find((c) => c.id === classId) ?? null;
  const loading = seats.loading || classes.loading || requests.loading;
  const ready = !!picked && !!studentId && (kindNow === "extra" || (kindNow === "makeup" ? !!makeupFor : !!moving));
  const parent = family.who === "parent";
  const name = family.firstName(studentId);
  const missed = (s: SessionDoc) => `${shortDay(s.dateKey)}, ${clock(s.startMin, hour12)} (${s.status === "no_show" ? "missed" : "canceled"})`;

  const send = async () => {
    if (!picked || !ready || sending) return;
    setSending(true);
    try {
      await requestClass({
        branchId,
        studentId,
        kind: kindNow,
        classId: picked.id,
        forSessionId: kindNow === "extra" ? null : kindNow === "makeup" ? (makeupFor?.id ?? null) : (moving?.id ?? null),
        message: message.trim(),
      });
      toast.success("Request sent", { description: "The academy approves or declines it, and you’ll be told either way." });
      router.back();
    } catch (e) {
      toast.error("The request wasn’t sent", { description: requestError(e) });
      setSending(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: preset === "reschedule" ? "Move a class" : "Ask for a class" }} />
      <Screen
        testID="ask-screen"
        footer={
          <Button icon={<CalendarPlus size={18} color={colors.primaryForeground} />} disabled={!ready} busy={sending} onPress={() => void send()} testID="ask-send">
            Send request
          </Button>
        }
      >
        <T tone="muted" style={styles.intro} testID="ask-intro">
          {preset === "reschedule"
            ? moving
              ? `Choose another time for ${parent ? `${name}’s` : "your"} class on ${shortDay(moving.dateKey)}. It stays booked until the academy approves the move.`
              : "Choose another time for the class. It stays booked until the academy approves the move."
            : "Choose a time with a seat open. The academy approves or declines each request."}
        </T>

        {parent && family.ids.length > 1 && preset !== "reschedule" ? (
          <View style={styles.block}>
            <SectionTitle title="For" />
            <FilterChips
              value={studentId}
              onChange={(id) => {
                setChosen(id);
                setClassId(null);
                setForId(null);
              }}
              options={family.ids.map((id) => ({ value: id, label: family.firstName(id), testID: `ask-for-${id}` }))}
              testID="ask-for"
            />
          </View>
        ) : null}

        {preset === "reschedule" ? (
          moving ? (
            <ListSection title="Moving" testID="ask-moving">
              <ListRow title={`${shortDay(moving.dateKey)}, ${timeRange(moving.startMin, moving.endMin, hour12)}`} subtitle="Stays booked until the academy approves the move" />
            </ListSection>
          ) : null
        ) : (
          <ListSection title="What for" testID="ask-kind">
            <ChoiceRow
              selected={kindNow === "makeup"}
              disabled={!owed.length}
              title="A makeup"
              subtitle={seats.loading ? "Looking for missed classes…" : owed.length ? `For a class ${parent ? name : "you"} missed.` : "No missed classes to make up."}
              onPress={() => setKind("makeup")}
              testID="ask-kind-makeup"
            />
            {kindNow === "makeup" && owed.length > 1
              ? owed.map((s) => <ChoiceRow key={s.id} selected={makeupFor?.id === s.id} title={missed(s)} onPress={() => setForId(s.id)} testID={`ask-makeup-${s.id}`} />)
              : null}
            {kindNow === "makeup" && owed.length === 1 && makeupFor ? <ListRow title={missed(makeupFor)} subtitle="The class it makes up" /> : null}
            <ChoiceRow selected={kindNow === "extra"} title="An extra class" subtitle="Extra practice in an open seat." onPress={() => setKind("extra")} testID="ask-kind-extra" />
          </ListSection>
        )}

        {/* The open classes, a day at a time (each day's title says when). */}
        {loading ? (
          <SkeletonCards count={3} height={52} />
        ) : byDay.length ? (
          byDay.map(([day, list]) => (
            <ListSection key={day} title={shortDay(day)} testID={`ask-day-${day}`}>
              {list.map((c) => {
                const open = c.seats - c.taken;
                return (
                  <ChoiceRow
                    key={c.id}
                    selected={c.id === classId}
                    title={timeRange(c.startMin, c.endMin, hour12)}
                    right={`${plural(open, "seat")} open`}
                    onPress={() => setClassId(c.id)}
                    testID={`ask-class-${c.id}`}
                  />
                );
              })}
            </ListSection>
          ))
        ) : (
          <EmptyState
            testID="ask-none"
            icon={<CalendarSearch size={26} color={colors.mutedForeground} />}
            title="No open seats"
            text={`No open seats until ${monthDay(horizon)}. Seats open up when students cancel, so check again soon.`}
          />
        )}

        <Field
          label="Message (optional)"
          value={message}
          onChangeText={setMessage}
          maxLength={500}
          multiline
          placeholder="Anything the academy should know"
          testID="ask-message"
        />
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  intro: { paddingHorizontal: space.xs },
  block: { gap: space.sm },
});
