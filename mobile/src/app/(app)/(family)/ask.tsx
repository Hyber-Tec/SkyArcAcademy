import { MAKEUP_LOOKBACK_DAYS, makeupsOwed, takesSeat } from "@shared/schedule/classes";
import { type ClassRequestKind, isOpenRequest, isRequestable, requestHorizon } from "@shared/schedule/requests";
import { type DateKey, addDays, isDateKey } from "@shared/time";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { CalendarPlus, CalendarSearch } from "lucide-react-native";
import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button } from "@/components/Button";
import { FooterBar } from "@/components/FooterBar";
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
import { useLang, useT } from "@/lib/lang";
import { toast } from "@/lib/toast";
import { useBranch } from "@/state/BranchProvider";
import { space, useColors } from "@/theme";

const KINDS: readonly ClassRequestKind[] = ["makeup", "reschedule", "extra"];

/**
 * Ask for a class (from Classes, or a class's sheet to move it): a makeup for a missed class, a class moved to another
 * time, or an extra class, in a class with seats open in the next days, as the website's dialog
 * (web/src/features/requests/AskForClassDialog.tsx; docs/DECISIONS.md §23). Families see how many seats are open, never
 * who's in a class. The server checks the request with the shared rules (`requestCheck`) and says why when it can't
 * be made; the academy approves, declines or suggests another time, and the family is told each time. Opened with `studentId`, `kind` and
 * `forSessionId` (the class to move, or the missed class to make up), and a class to move's day (`forDateKey`), so it's
 * found however far ahead it is (the choices stay within the request horizon). `date`: a day chosen on Classes' months
 * (its sheet's "Ask for a class on this day"): that day's open classes only, until "See other days".
 */
export default function AskForClassScreen() {
  const params = useLocalSearchParams<{ studentId?: string; kind?: string; forSessionId?: string; forDateKey?: string; date?: string }>();
  const family = useFamily();
  const { branchId, settings } = useBranch();
  const colors = useColors();
  const t = useT();
  const lang = useLang();
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
  // The child's classes from six weeks back to the horizon, or to the class being moved when it's further ahead.
  const until = preset === "reschedule" && params.forDateKey && params.forDateKey > horizon ? params.forDateKey : horizon;
  const seats = useFamilySessions(ids, since, until);
  const requests = useFamilyRequests(ids);
  const classes = useClassSeats(today, horizon);
  // Open requests: waiting for the academy, or for the family's answer to a time suggested.
  const pending = useMemo(() => requests.data.filter(isOpenRequest), [requests.data]);

  // Missed classes still to make up, less those a request is waiting for (the server would refuse a second one).
  const missed = useMemo(() => makeupsOwed(seats.data, since), [seats.data, since]);
  const owed = useMemo(() => missed.filter((s) => !pending.some((r) => r.forSessionId === s.id)), [missed, pending]);
  const moving = preset === "reschedule" ? (seats.data.find((s) => s.id === params.forSessionId) ?? null) : null;
  const [kind, setKind] = useState<ClassRequestKind>(preset ?? "makeup");
  const [forId, setForId] = useState<string | null>(preset === "makeup" ? (params.forSessionId ?? null) : null);
  const [classId, setClassId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  // The day chosen on the months, until the family asks to see the others.
  const [onDay, setOnDay] = useState<DateKey | null>(() => (preset !== "reschedule" && isDateKey(params.date) ? params.date : null));

  // A makeup needs one owed; with none, an extra class is what's left (a move comes only from a class's sheet).
  const kindNow: ClassRequestKind = kind === "makeup" && !owed.length && !seats.loading ? "extra" : kind;
  const makeupFor = kindNow === "makeup" ? (owed.find((s) => s.id === forId) ?? owed[0] ?? null) : null;
  const live = useMemo(() => seats.data.filter(takesSeat), [seats.data]);

  // Open classes the child can take: not one they're in or at the same time (the class being moved included), nor one
  // already asked for.
  const choices = useMemo(
    () =>
      classes.data.filter(
        (c) =>
          isRequestable({ ...c, startMs: millis(c.startAt) }, now, horizon) &&
          c.id !== moving?.classId &&
          !live.some((s) => s.id !== moving?.id && s.dateKey === c.dateKey && s.startMin < c.endMin && s.endMin > c.startMin) &&
          !pending.some((r) => r.classId === c.id),
      ),
    [classes.data, live, pending, horizon, moving?.id, moving?.classId, now],
  );
  const byDay = useMemo(() => {
    const m = new Map<DateKey, ClassSeatsDoc[]>();
    for (const c of choices) m.set(c.dateKey, [...(m.get(c.dateKey) ?? []), c]);
    return [...m.entries()];
  }, [choices]);
  const daysShown = onDay ? byDay.filter(([d]) => d === onDay) : byDay;
  const picked = choices.find((c) => c.id === classId) ?? null;
  const loading = seats.loading || classes.loading || requests.loading;
  const ready = !!picked && !!studentId && (kindNow === "extra" || (kindNow === "makeup" ? !!makeupFor : !!moving));
  const parent = family.who === "parent";
  const name = family.firstName(studentId);
  const missedText = (s: SessionDoc) =>
    lang === "ko"
      ? `${shortDay(s.dateKey, "ko")} ${clock(s.startMin, hour12, "ko")} (${s.status === "no_show" ? "결석" : "취소"})`
      : `${shortDay(s.dateKey)}, ${clock(s.startMin, hour12)} (${s.status === "no_show" ? "missed" : "canceled"})`;

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
      toast.success(t("Request sent", "신청했어요"), { description: t("The academy approves it or suggests another time, and you’ll be told.", "아카데미에서 승인하거나 다른 시간을 제안하면 알려 드려요.") });
      router.back();
    } catch (e) {
      toast.error(t("The request wasn’t sent", "신청하지 못했어요"), { description: requestError(e, t("Please try again.", "다시 시도해 주세요."), lang) });
      setSending(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: preset === "reschedule" ? t("Move a class", "수업 옮기기") : t("Ask for a class", "수업 신청") }} />
      <Screen
        testID="ask-screen"
        footer={
          <FooterBar>
            <Button
              size="lg"
              icon={<CalendarPlus size={18} color={colors.primaryForeground} />}
              disabled={!ready}
              busy={sending}
              onPress={() => void send()}
              style={styles.grow}
              testID="ask-send"
            >
              {t("Send request", "신청하기")}
            </Button>
          </FooterBar>
        }
      >
        <T tone="muted" style={styles.intro} testID="ask-intro">
          {preset === "reschedule"
            ? moving
              ? t(
                  `Choose another time for ${parent ? `${name}’s` : "your"} class on ${shortDay(moving.dateKey)}. It stays booked until the academy approves the move.`,
                  `${shortDay(moving.dateKey, "ko")} ${parent ? `${name} 학생 ` : ""}수업을 옮길 시간을 골라 주세요. 아카데미에서 승인할 때까지 원래 수업은 그대로 예약돼 있어요.`,
                )
              : t("Choose another time for the class. It stays booked until the academy approves the move.", "수업을 옮길 시간을 골라 주세요. 아카데미에서 승인할 때까지 원래 수업은 그대로 예약돼 있어요.")
            : onDay
              ? t(
                  `Choose a time on ${shortDay(onDay)} with a seat open. The academy approves each request, or suggests another time.`,
                  `${shortDay(onDay, "ko")} 중 빈자리가 있는 시간을 골라 주세요. 아카데미에서 승인하거나 다른 시간을 제안해요.`,
                )
              : t("Choose a time with a seat open. The academy approves each request, or suggests another time.", "빈자리가 있는 시간을 골라 주세요. 아카데미에서 승인하거나 다른 시간을 제안해요.")}
        </T>

        {parent && family.ids.length > 1 && preset !== "reschedule" ? (
          <View style={styles.block}>
            <SectionTitle title={t("For", "자녀")} />
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
            <ListSection title={t("Moving", "옮길 수업")} testID="ask-moving">
              <ListRow
                title={lang === "ko" ? `${shortDay(moving.dateKey, "ko")} ${timeRange(moving.startMin, moving.endMin, hour12, "ko")}` : `${shortDay(moving.dateKey)}, ${timeRange(moving.startMin, moving.endMin, hour12)}`}
                subtitle={t("Stays booked until the academy approves the move", "아카데미에서 승인할 때까지 그대로 예약돼 있어요")}
              />
            </ListSection>
          ) : null
        ) : (
          <ListSection title={t("What for", "신청 종류")} testID="ask-kind">
            <ChoiceRow
              selected={kindNow === "makeup"}
              disabled={!owed.length}
              title={t("A makeup", "보강")}
              subtitle={
                seats.loading
                  ? t("Looking for missed classes…", "빠진 수업을 찾고 있어요…")
                  : owed.length
                    ? t(`For a class ${parent ? name : "you"} missed.`, parent ? `${name} 학생이 빠진 수업의 보강이에요.` : "빠진 수업의 보강이에요.")
                    : missed.length
                      ? t("Each missed class has a request waiting.", "빠진 수업마다 이미 신청한 보강이 있어요.")
                      : t("No missed classes to make up.", "보강할 수업이 없어요.")
              }
              onPress={() => setKind("makeup")}
              testID="ask-kind-makeup"
            />
            {kindNow === "makeup" && owed.length > 1
              ? owed.map((s) => <ChoiceRow key={s.id} selected={makeupFor?.id === s.id} title={missedText(s)} onPress={() => setForId(s.id)} testID={`ask-makeup-${s.id}`} />)
              : null}
            {kindNow === "makeup" && owed.length === 1 && makeupFor ? <ListRow title={missedText(makeupFor)} subtitle={t("The class it makes up", "보강할 수업")} /> : null}
            <ChoiceRow
              selected={kindNow === "extra"}
              title={t("An extra class", "추가 수업")}
              subtitle={t("Extra practice in an open seat.", "빈자리에서 한 번 더 연습해요.")}
              onPress={() => setKind("extra")}
              testID="ask-kind-extra"
            />
          </ListSection>
        )}

        {/* The open classes, a day at a time (each day's title says when); the day chosen on the months alone, at first. */}
        {loading ? (
          <SkeletonCards count={3} height={52} />
        ) : daysShown.length ? (
          <>
            {daysShown.map(([day, list]) => (
              <ListSection key={day} title={shortDay(day, lang)} testID={`ask-day-${day}`}>
                {list.map((c) => {
                  const open = c.seats - c.taken;
                  return (
                    <ChoiceRow
                      key={c.id}
                      selected={c.id === classId}
                      title={timeRange(c.startMin, c.endMin, hour12, lang)}
                      right={t(`${plural(open, "seat")} open`, `${open}자리 남음`)}
                      onPress={() => setClassId(c.id)}
                      testID={`ask-class-${c.id}`}
                    />
                  );
                })}
              </ListSection>
            ))}
            {onDay && byDay.length > daysShown.length ? (
              <Button variant="ghost" wrap onPress={() => setOnDay(null)} testID="ask-other-days">
                {t("See other days", "다른 날짜 보기")}
              </Button>
            ) : null}
          </>
        ) : onDay ? (
          <EmptyState
            testID="ask-day-none"
            icon={<CalendarSearch size={26} color={colors.mutedForeground} />}
            title={t(`No open seats on ${shortDay(onDay)}`, `${shortDay(onDay, "ko")}에는 빈자리가 없어요`)}
            text={
              byDay.length
                ? t("Seats open up when students cancel. Other days have room now.", "다른 학생이 취소하면 자리가 생겨요. 지금은 다른 날짜에 빈자리가 있어요.")
                : t(`No open seats until ${monthDay(horizon)}. Seats open up when students cancel, so check again soon.`, `${monthDay(horizon, "ko")}까지 빈자리가 없어요. 다른 학생이 취소하면 자리가 생기니 다시 확인해 주세요.`)
            }
            action={
              byDay.length ? (
                <Button variant="outline" wrap onPress={() => setOnDay(null)} testID="ask-other-days">
                  {t("See other days", "다른 날짜 보기")}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <EmptyState
            testID="ask-none"
            icon={<CalendarSearch size={26} color={colors.mutedForeground} />}
            title={t("No open seats", "빈자리가 없어요")}
            text={t(`No open seats until ${monthDay(horizon)}. Seats open up when students cancel, so check again soon.`, `${monthDay(horizon, "ko")}까지 빈자리가 없어요. 다른 학생이 취소하면 자리가 생기니 다시 확인해 주세요.`)}
          />
        )}

        <Field
          label={t("Message (optional)", "메시지 (선택)")}
          value={message}
          onChangeText={setMessage}
          maxLength={500}
          multiline
          placeholder={t("Anything the academy should know", "아카데미에 전할 말이 있으면 적어 주세요")}
          testID="ask-message"
        />
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  intro: { paddingHorizontal: space.xs },
  block: { gap: space.sm },
});
