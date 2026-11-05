import { type DateKey, addDays } from "@shared/time";
import { router, useFocusEffect, useIsFocused } from "expo-router";
import { CalendarDays, CalendarX2, ChevronRight, History, MessageCircleQuestionMark } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { ListSection } from "@/components/List";
import { Screen } from "@/components/Screen";
import { SectionHeading } from "@/components/SectionHeading";
import { SegmentedControl } from "@/components/SegmentedControl";
import { SkeletonCards } from "@/components/Skeleton";
import { T } from "@/components/Text";
import { useAcademyNow } from "@/features/data/hooks";
import { FamilyClassRow } from "@/features/family/ClassCards";
import { ClassesHeader, type ClassesMode } from "@/features/family/ClassesHeader";
import { FamilyClassMonth } from "@/features/family/ClassMonth";
import { useFamilySessions } from "@/features/family/data";
import { ChildSwitcher, NotLinked } from "@/features/family/FamilyParts";
import { type FamilyState, useFamily } from "@/features/family/FamilyProvider";
import { RequestsPanel, useClassesToDo } from "@/features/family/RequestsPanel";
import { type FamilyClass, familyClasses } from "@/features/family/classes";
import { dayHeading, hasEnded } from "@/features/family/format";
import { plural } from "@/features/schedule/format";
import { useLang, useT } from "@/lib/lang";
import { useBranch } from "@/state/BranchProvider";
import { radius, space, useColors } from "@/theme";

type Show = "upcoming" | "past";

/** Weeks shown at first, and added by "Show more". */
const STEP_WEEKS = 8;
/** How far the list reaches at the most: half a year ahead, a year back. */
const MAX_AHEAD_WEEKS = 26;
const MAX_BACK_WEEKS = 52;

/** "Your classes", "Jiwoo’s classes", "Your children’s classes" (Jiwoo의 수업, 자녀 수업). */
function whoseClasses(family: FamilyState, lang: "en" | "ko"): string {
  if (family.who === "student") return "Your classes";
  if (lang === "ko") return family.shown.length === 1 ? `${family.firstName(family.shown[0])}의 수업` : "자녀 수업";
  return family.shown.length === 1 ? `${family.firstName(family.shown[0])}’s classes` : "Your children’s classes";
}

/**
 * The family's classes, remade to be clear at a glance (the owner, 2026-10-29), as a list or on the months (List /
 * Month and Ask by the title, the same in both; a parent with several children picks All or one child under it).
 *
 * The list: first, only when there's something, what asks for the family's answer or tells them where their requests
 * stand, each part in its own colour (RequestsPanel: Needs your answer, Waiting for the academy, Makeups to book, then
 * the recent requests folded); then the classes day by day, what's coming (earliest first) or what's past (latest
 * first), each with its status in plain words and the class's note, a few weeks at a time. A class opens its sheet
 * (where it's canceled or moved).
 *
 * The months: the whole page, scrolling vertically; a tap on a day opens its sheet (`/day`: its classes, or none, and
 * asking for a class on it). A time the academy suggests says so above them, a tap away from the list.
 */
export default function FamilyClassesScreen() {
  const family = useFamily();
  const colors = useColors();
  const t = useT();
  const lang = useLang();
  const insets = useSafeAreaInsets();
  const { settings } = useBranch();
  const { today, nowMin } = useAcademyNow();
  const hour12 = settings.general.timeFormat !== "24h";
  const [mode, setMode] = useState<ClassesMode>("list");
  // The day whose sheet is open, filled on the months while it is (this page isn't in front then), and forgotten once
  // the page is in front again.
  const [tapped, setTapped] = useState<DateKey | null>(null);
  const focused = useIsFocused();
  useFocusEffect(useCallback(() => setTapped(null), []));
  const todo = useClassesToDo();
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
    const groups = familyClasses(list);
    // Coming: earliest first. Past: the latest first, day by day and within a day.
    const ordered = upcoming ? groups : groups.reverse();
    const byDay = new Map<DateKey, FamilyClass[]>();
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
  const spanKo = upcoming ? `앞으로 ${weeks}주 동안` : `지난 ${weeks}주 동안`;
  const linked = family.ids.length > 0;
  const header = <ClassesHeader mode={mode} onMode={setMode} linked={linked} />;

  const openDay = useCallback((d: DateKey) => {
    setTapped(d);
    router.push({ pathname: "/day", params: { date: d } });
  }, []);

  // The months scroll by themselves (a list in the page's scroll would fight them): a page of their own under the top.
  if (mode === "month" && linked) {
    return (
      <View style={[styles.page, { backgroundColor: colors.grouped }]} testID="family-classes">
        <View style={[styles.top, { paddingTop: insets.top + space.lg }]}>
          {header}
          <ChildSwitcher />
          {todo.offers.length ? (
            <Pressable
              onPress={() => setMode("list")}
              accessibilityRole="button"
              accessibilityHint={t("Shows it in the list, to answer it", "목록에서 보고 답할 수 있어요")}
              style={({ pressed }) => [styles.strip, { backgroundColor: colors.infoTint, borderColor: `${colors.info}55` }, pressed && styles.pressed]}
              testID="family-month-needs-answer"
            >
              <MessageCircleQuestionMark size={18} color={colors.info} />
              <T variant="label" style={[styles.grow, { color: colors.info }]}>
                {todo.offers.length === 1
                  ? t("The academy suggests another time", "아카데미에서 다른 시간을 제안했어요")
                  : t(`The academy suggests ${todo.offers.length} other times`, `아카데미에서 다른 시간 ${todo.offers.length}개를 제안했어요`)}
              </T>
              <T variant="small" style={[styles.answer, { color: colors.info }]}>
                {t("Answer", "답하기")}
              </T>
              <ChevronRight size={16} color={colors.info} />
            </Pressable>
          ) : null}
        </View>
        <FamilyClassMonth today={today} nowMin={nowMin} hour12={hour12} selected={focused ? null : tapped} onOpenDay={openDay} />
      </View>
    );
  }

  return (
    <Screen tab typing={false} onRefresh={() => new Promise((r) => setTimeout(r, 600))} testID="family-classes">
      {header}
      {!linked ? (
        <NotLinked />
      ) : (
        <>
          <ChildSwitcher />
          {todo.any ? <RequestsPanel todo={todo} /> : null}

          <View style={[styles.controls, todo.any && styles.after]}>
            {todo.any ? (
              <SectionHeading
                title={whoseClasses(family, lang)}
                icon={<CalendarDays size={16} color={colors.brand} />}
                color={colors.brandText}
                tint={colors.brandTint}
                testID="family-classes-heading"
              />
            ) : null}
            <SegmentedControl<Show>
              value={show}
              onChange={setShow}
              options={[
                { value: "upcoming", label: t("Upcoming", "예정") },
                { value: "past", label: t("Past", "지난 수업") },
              ]}
              testID="family-classes-show"
            />
            {!sessions.loading && count ? (
              <T variant="small" tone="muted" style={styles.summary} testID="family-classes-count">
                {t(`${plural(count, "class", "classes")} ${span}`, `${spanKo} 수업 ${count}개`)}
              </T>
            ) : null}
          </View>

          {sessions.loading && !extending ? (
            <SkeletonCards count={4} height={72} />
          ) : sessions.error ? (
            <Card>
              <T variant="label">{t("Couldn’t load the classes", "수업을 불러오지 못했어요")}</T>
              <T variant="small" tone="muted">
                {t("Check your connection, then pull down to try again.", "인터넷 연결을 확인한 뒤 화면을 아래로 당겨 다시 시도해 주세요.")}
              </T>
            </Card>
          ) : days.length ? (
            <View style={styles.days} testID="family-classes-list">
              {days.map(([day, list]) => (
                <ListSection key={day} title={dayHeading(day, today, lang)} testID={`family-classes-day-${day}`}>
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
              title={upcoming ? t("Nothing booked", "예정된 수업이 없어요") : t("No past classes", "지난 수업이 없어요")}
              text={
                upcoming
                  ? t(
                      `No classes ${span}. The academy books them, and they show here. To ask for one, tap Ask at the top.`,
                      `${spanKo} 잡힌 수업이 없어요. 아카데미에서 수업을 잡으면 여기에 보여요. 수업을 신청하려면 위의 신청을 눌러 주세요.`,
                    )
                  : t(`No classes ${span}.`, `${spanKo} 수업이 없어요.`)
              }
            />
          )}

          {canMore && (!sessions.loading || extending) ? (
            <Button variant="ghost" wrap onPress={more} busy={extending} testID="family-classes-more">
              {upcoming ? t(`Show ${STEP_WEEKS} more weeks`, `${STEP_WEEKS}주 더 보기`) : t("Show earlier classes", "이전 수업 더 보기")}
            </Button>
          ) : noMore && count ? (
            <T variant="small" tone="muted" style={styles.end} testID="family-classes-end">
              {upcoming ? t("Nothing else is booked yet.", "더 잡힌 수업이 없어요.") : t("No earlier classes.", "이전 수업이 없어요.")}
            </T>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  top: { paddingHorizontal: space.lg, paddingBottom: space.sm, gap: space.md },
  grow: { flex: 1 },
  pressed: { opacity: 0.6 },
  strip: { flexDirection: "row", alignItems: "center", gap: space.sm, borderRadius: radius.lg, borderWidth: 1, paddingHorizontal: space.md, paddingVertical: space.md },
  answer: { fontWeight: "700" },
  controls: { gap: space.md },
  // The classes stand apart from the parts above them.
  after: { marginTop: space.sm },
  summary: { paddingHorizontal: space.xs },
  days: { gap: space.lg },
  end: { textAlign: "center", paddingVertical: space.sm },
});
