import { MAKEUP_LOOKBACK_DAYS, makeupsLost, makeupsOwed } from "@shared/schedule/classes";
import { type Lang, josa, pick } from "@shared/i18n";
import { type ClassRequestStatus, REQUEST_STATUS_LABELS, REQUEST_STATUS_LABELS_KO, isOpenRequest, requestHistory, requestHorizon, requestWaitsOn } from "@shared/schedule/requests";
import { addDays, formatMinutesShort } from "@shared/time";
import { router } from "expo-router";
import { CalendarPlus, Check, ChevronDown, ChevronUp, Hourglass, MessageCircleQuestionMark, RotateCcw } from "lucide-react-native";
import { type ReactNode, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Button } from "@/components/Button";
import { confirmAsync } from "@/components/Confirm";
import { SectionHeading } from "@/components/SectionHeading";
import { T } from "@/components/Text";
import { useAcademyNow } from "@/features/data/hooks";
import { answerOffer, requestError, withdrawRequest } from "@/features/requests/api";
import { RECENT_REQUESTS_MS, type RequestDoc, millis, useClassSeat } from "@/features/requests/data";
import { RequestHistory } from "@/features/requests/History";
import { whatFor } from "@/features/requests/RequestRow";
import { clock, monthDay, plural, shortDay, shortRange, timeRange } from "@/features/schedule/format";
import { useLang, useT } from "@/lib/lang";
import { toast } from "@/lib/toast";
import { useBranch } from "@/state/BranchProvider";
import { type Colors, radius, space, useColors } from "@/theme";
import { type SessionDoc, useFamilyRequests, useFamilySessions } from "./data";
import { type FamilyState, useFamily } from "./FamilyProvider";

/**
 * What Classes asks of the family, or tells them about their requests, above their classes (the owner, 2026-10-29:
 * each part told apart at a glance, nothing when it's empty), as the website's panel holds it
 * (web/src/features/requests/FamilyRequestsPanel.tsx): the times the academy suggests, waiting on the family's answer;
 * the requests waiting for the academy; the makeups still to book; and the requests answered or withdrawn lately.
 */
export interface ClassesToDo {
  /** Times the academy suggests instead of the one asked for, waiting on the family (the soonest first). */
  offers: RequestDoc[];
  /** Requests waiting for the academy (the soonest class first). */
  waiting: RequestDoc[];
  /** Missed classes still to make up (the oldest first). */
  owed: SessionDoc[];
  /** The open request each missed class already has, by its seat. */
  askedFor: Map<string, RequestDoc>;
  /** Makeups missed: their credit is used. */
  lost: SessionDoc[];
  /** Requests answered or withdrawn in the last two weeks (the latest first). */
  answered: RequestDoc[];
  /** Something to show. */
  any: boolean;
}

/** The family's requests and makeups for the children shown (a parent's choice of child), live. */
export function useClassesToDo(): ClassesToDo {
  const family = useFamily();
  const { settings } = useBranch();
  const { today, now } = useAcademyNow();
  const since = addDays(today, -MAKEUP_LOOKBACK_DAYS);
  // Classes canceled ahead count too (a makeup is owed as soon as a class is canceled).
  const seats = useFamilySessions(family.shown, since, requestHorizon(today, settings));
  const requests = useFamilyRequests(family.shown);
  return useMemo(() => {
    const open = requests.data.filter(isOpenRequest);
    const soonest = (a: RequestDoc, b: RequestDoc) => millis(requestWaitsOn(a).startAt) - millis(requestWaitsOn(b).startAt);
    const offers = open.filter((r) => r.status === "offered" && r.offer).sort(soonest);
    const waiting = open.filter((r) => r.status === "pending").sort(soonest);
    const askedFor = new Map(open.filter((r) => r.forSessionId).map((r) => [r.forSessionId as string, r]));
    const owed = makeupsOwed(seats.data, since);
    const lost = makeupsLost(seats.data, since);
    const decided = (r: RequestDoc) => millis(r.decidedAt ?? r.updatedAt);
    const answered = requests.data.filter((r) => !isOpenRequest(r) && now - decided(r) < RECENT_REQUESTS_MS).sort((a, b) => decided(b) - decided(a));
    return { offers, waiting, owed, askedFor, lost, answered, any: offers.length + waiting.length + owed.length + lost.length + answered.length > 0 };
  }, [requests.data, seats.data, since, now]);
}

/** "6 PM", "6:30 PM" or "18:00": a class's start, mid-sentence (오후 6:00). */
const startClock = (m: number, hour12: boolean, lang: Lang = "en") => (lang === "ko" ? clock(m, hour12, "ko") : hour12 ? formatMinutesShort(m) : clock(m, false));

/** "Tue, Nov 3 · 5–6 PM": the class a request is about (11월 3일 (화) · 오후 5:00~6:00). */
const classLine = (c: { dateKey: string; startMin: number; endMin: number }, hour12: boolean, lang: Lang = "en") => `${shortDay(c.dateKey, lang)} · ${shortRange(c.startMin, c.endMin, hour12, lang)}`;

/** Who asked last: "You" (null), the student by their first name, or the other parent's. */
function askedBy(r: RequestDoc, me: string, family: FamilyState): string | null {
  const asks = requestHistory(r).filter((s) => s.action === "asked" || s.action === "asked_again");
  const by = asks[asks.length - 1]?.by ?? r.requestedBy;
  if (!by || by.email === me) return null;
  if (by.role === "student") return family.firstName(r.studentId, r.studentName);
  return (by.name ?? "").trim().split(/\s+/)[0] || null;
}

/** "You asked for an extra class on Mon, Nov 2 at 6 PM.", "… a makeup for Oct 28 on …", "… to move the class on Oct 28 to …". */
function askedText(r: RequestDoc, who: string | null, hour12: boolean, lang: Lang): string {
  if (lang === "ko") {
    // The parent themself needs no subject; another of the family by name.
    const p = who ? `${josa(who, "이/가")} ` : "";
    const when = `${shortDay(r.dateKey, "ko")} ${startClock(r.startMin, hour12, "ko")}`;
    if (r.kind === "makeup") return `${p}${r.forDateKey ? `${monthDay(r.forDateKey, "ko")} 수업 보강을` : "보강을"} 신청했어요: ${when}`;
    if (r.kind === "reschedule") return `${p}${r.forDateKey ? `${monthDay(r.forDateKey, "ko")} 수업을` : "수업을"} 옮겨 달라고 신청했어요: ${when}`;
    return `${p}추가 수업을 신청했어요: ${when}`;
  }
  const by = who ?? "You";
  const when = `${shortDay(r.dateKey)} at ${startClock(r.startMin, hour12)}`;
  if (r.kind === "makeup") return `${by} asked for a makeup${r.forDateKey ? ` for ${monthDay(r.forDateKey)}` : ""} on ${when}.`;
  if (r.kind === "reschedule") return `${by} asked to move ${r.forDateKey ? `the class on ${monthDay(r.forDateKey)}` : "a class"} to ${when}.`;
  return `${by} asked for an extra class on ${when}.`;
}

/** A request's outcome in its colour: booked in green, the rest grey. */
function outcomeColors(status: ClassRequestStatus, colors: Colors): { color: string; tint: string } {
  return status === "approved" ? { color: colors.success, tint: colors.successTint } : { color: colors.mutedForeground, tint: colors.secondary };
}

/**
 * The parts above the family's classes, each only when it has something (nothing at all when none has): "Needs your
 * answer" (blue: a time the academy suggests, to accept, answer with another time, or withdraw), "Waiting for the
 * academy" (amber: the family's open requests, each with Withdraw), "Makeups to book" (violet: each missed class with
 * Book, or "Asked"), then the requests answered lately, folded. Each request's back and forth folds open under it.
 */
export function RequestsPanel({ todo }: { todo: ClassesToDo }) {
  const family = useFamily();
  const { branchId, settings, timezone, actor } = useBranch();
  const { now } = useAcademyNow();
  const colors = useColors();
  const t = useT();
  const lang = useLang();
  const hour12 = settings.general.timeFormat !== "24h";
  const [busy, setBusy] = useState<string | null>(null);
  // Each line names its child when the parent sees more than one.
  const nameOf = (r: { studentId: string; studentName?: string }) => (family.shown.length > 1 ? family.firstName(r.studentId, r.studentName) : null);
  const reader = { me: actor.email, timezone, hour12 };

  const withdraw = async (r: RequestDoc) => {
    const ok = await confirmAsync({
      title: t("Withdraw this request?", "신청을 취소할까요?"),
      message: t("The academy won’t see it anymore. You can ask again any time.", "아카데미에서 더는 이 신청을 보지 않아요. 언제든 다시 신청할 수 있어요."),
      confirmLabel: t("Withdraw", "신청 취소"),
      cancelLabel: t("Cancel", "닫기"),
    });
    if (!ok) return;
    setBusy(r.id);
    try {
      await withdrawRequest(branchId, r.id);
      toast.success(t("Request withdrawn", "신청을 취소했어요"));
    } catch (e) {
      toast.error(t("Couldn’t withdraw it", "신청을 취소하지 못했어요"), { description: requestError(e, t("Please try again.", "다시 시도해 주세요."), lang) });
    } finally {
      setBusy(null);
    }
  };

  const accept = async (r: RequestDoc) => {
    const o = r.offer;
    if (!o) return;
    const when = lang === "ko" ? `${shortDay(o.dateKey, "ko")} ${timeRange(o.startMin, o.endMin, hour12, "ko")}` : `${shortDay(o.dateKey)}, ${timeRange(o.startMin, o.endMin, hour12)}`;
    const first = family.firstName(r.studentId, r.studentName);
    const moved = r.kind === "reschedule" && r.forDateKey ? t(` The class on ${shortDay(r.forDateKey)} is canceled.`, ` 원래 ${shortDay(r.forDateKey, "ko")} 수업은 취소돼요.`) : "";
    const ok = await confirmAsync({
      title: t(`Book ${when}?`, "이 시간으로 예약할까요?"),
      message:
        lang === "ko"
          ? `${when}\n${family.who === "parent" ? `${first} 학생이` : ""} 바로 이 수업에 예약돼요.${moved}`.replace("\n ", "\n")
          : `${family.who === "parent" ? `${first} is` : "You’re"} booked in that class at once.${moved}`,
      confirmLabel: t("Book it", "예약하기"),
      cancelLabel: t("Cancel", "닫기"),
    });
    if (!ok) return;
    setBusy(r.id);
    try {
      await answerOffer(branchId, r.id, "accept", o.classId);
      toast.success(t("Booked", "예약했어요"), { description: t(`${when}. The academy is told.`, `${when} · 아카데미에도 알렸어요.`) });
    } catch (e) {
      toast.error(t("Not booked", "예약하지 못했어요"), { description: requestError(e, t("Please try again.", "다시 시도해 주세요."), lang) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.panel} testID="family-requests-panel">
      {todo.offers.length ? (
        <View style={styles.section} testID="family-needs-answer">
          <SectionHeading
            title={t("Needs your answer", "답이 필요해요")}
            icon={<MessageCircleQuestionMark size={17} color={colors.info} />}
            color={colors.info}
            tint={colors.infoTint}
            count={todo.offers.length}
          />
          {todo.offers.map((r) => (
            <OfferCard
              key={r.id}
              r={r}
              name={nameOf(r)}
              asked={askedText(r, askedBy(r, actor.email, family), hour12, lang)}
              now={now}
              busy={busy === r.id}
              onAccept={() => void accept(r)}
              onAnother={() => router.push({ pathname: "/another", params: { requestId: r.id } })}
              onWithdraw={() => void withdraw(r)}
              reader={reader}
            />
          ))}
        </View>
      ) : null}

      {todo.waiting.length ? (
        <View style={styles.section} testID="family-waiting">
          <SectionHeading title={t("Waiting for the academy", "아카데미 확인 중")} icon={<Hourglass size={16} color={colors.warning} />} color={colors.warning} tint={colors.warningTint} count={todo.waiting.length} />
          <Group>
            {todo.waiting.map((r, i) => (
              <RequestItem key={r.id} r={r} name={nameOf(r)} divider={i > 0} reader={reader}>
                <Button size="sm" variant="ghost" wrap disabled={busy === r.id} busy={busy === r.id} onPress={() => void withdraw(r)} testID={`family-request-withdraw-${r.id}`}>
                  {t("Withdraw", "신청 취소")}
                </Button>
              </RequestItem>
            ))}
          </Group>
        </View>
      ) : null}

      {todo.owed.length ? (
        <View style={styles.section} testID="family-makeups">
          <SectionHeading title={t("Makeups to book", "잡아야 할 보강")} icon={<RotateCcw size={16} color={colors.makeup} />} color={colors.makeup} tint={colors.makeupTint} count={todo.owed.length} />
          <Group>
            {todo.owed.map((s, i) => (
              <MakeupRow key={s.id} s={s} name={nameOf(s)} asked={todo.askedFor.get(s.id)?.status ?? null} divider={i > 0} hour12={hour12} />
            ))}
          </Group>
          {todo.lost.length ? <LostMakeups lost={todo.lost} nameOf={nameOf} /> : null}
        </View>
      ) : todo.lost.length ? (
        <LostMakeups lost={todo.lost} nameOf={nameOf} />
      ) : null}

      {todo.answered.length ? <AnsweredFold list={todo.answered} nameOf={nameOf} reader={reader} /> : null}
    </View>
  );
}

type Reader = { me: string; timezone: string; hour12: boolean };

/** A card holding a section's rows, as a ListSection's group. */
function Group({ children }: { children: ReactNode }) {
  const colors = useColors();
  return <View style={[styles.group, { backgroundColor: colors.card, borderColor: colors.border }]}>{children}</View>;
}

/** A short coloured label (what a request is for, how it ended); it wraps rather than being cut. */
function Tag({ children, color, tint }: { children: string; color: string; tint: string }) {
  return (
    <View style={[styles.tag, { backgroundColor: tint }]}>
      <T variant="tiny" style={[styles.tagText, { color }]}>
        {children}
      </T>
    </View>
  );
}

/** "History", to fold a request's back and forth open or shut. */
function HistoryToggle({ open, onToggle, testID }: { open: boolean; onToggle: () => void; testID: string }) {
  const colors = useColors();
  const t = useT();
  const Chevron = open ? ChevronUp : ChevronDown;
  return (
    <Pressable onPress={onToggle} accessibilityRole="button" accessibilityState={{ expanded: open }} hitSlop={8} style={styles.historyToggle} testID={testID}>
      <T variant="small" tone="muted" style={styles.historyText}>
        {t("History", "진행 내역")}
      </T>
      <Chevron size={15} color={colors.mutedForeground} />
    </Pressable>
  );
}

/**
 * A time the academy suggests, on its blue card: whose request (a parent's child, when they see several), what was
 * asked for, the time suggested in large type with its seats left now and the academy's note, then Accept (booked at
 * once, after a confirmation, while a seat is open), Ask for another time and a quiet Withdraw, one under the other so
 * none is cut short, and the back and forth folded under them.
 */
function OfferCard({
  r,
  name,
  asked,
  now,
  busy,
  onAccept,
  onAnother,
  onWithdraw,
  reader,
}: {
  r: RequestDoc;
  name: string | null;
  asked: string;
  now: number;
  busy: boolean;
  onAccept: () => void;
  onAnother: () => void;
  onWithdraw: () => void;
  reader: Reader;
}) {
  const colors = useColors();
  const t = useT();
  const lang = useLang();
  const o = r.offer;
  const seat = useClassSeat(o?.classId ?? null);
  const [history, setHistory] = useState(false);
  if (!o) return null;
  const started = millis(o.startAt) <= now;
  const gone = !!seat.data?.isDeleted;
  const left = seat.data && !gone ? Math.max(0, seat.data.seats - seat.data.taken) : null;
  const full = left === 0;
  const blocked = started || gone || full;
  const seats = started
    ? t("That class has started: ask for another time.", "이미 시작한 수업이에요. 다른 시간을 요청해 주세요.")
    : gone
      ? t("That class is no longer on the schedule: ask for another time.", "더 이상 일정에 없는 수업이에요. 다른 시간을 요청해 주세요.")
      : full
        ? t("That class is full now: ask for another time.", "자리가 다 찼어요. 다른 시간을 요청해 주세요.")
        : left !== null
          ? t(`${plural(left, "seat")} left`, `${left}자리 남음`)
          : null;
  return (
    <View style={[styles.offer, { backgroundColor: colors.infoTint, borderColor: `${colors.info}55` }]} testID={`family-offer-${r.id}`}>
      {name ? (
        <T variant="label" style={{ color: colors.info }}>
          {name}
        </T>
      ) : null}
      <T tone="muted">{asked}</T>
      <View style={styles.suggestion}>
        <T variant="small" style={[styles.suggests, { color: colors.info }]}>
          {t("The academy suggests", "아카데미 제안")}
        </T>
        <T variant="heading" style={styles.big} testID={`family-offer-when-${r.id}`}>
          {classLine(o, reader.hour12, lang)}
        </T>
        {seats ? (
          <T variant="small" tone={blocked ? "destructive" : "muted"} testID={`family-offer-seats-${r.id}`}>
            {seats}
          </T>
        ) : null}
      </View>
      {o.note ? <T style={styles.note}>“{o.note}”</T> : null}
      <View style={styles.stack}>
        <Button
          size="lg"
          wrap
          icon={<Check size={18} color={colors.primaryForeground} />}
          disabled={busy || blocked}
          busy={busy}
          onPress={onAccept}
          testID={`family-offer-accept-${r.id}`}
        >
          {t("Accept", "수락하기")}
        </Button>
        <Button size="lg" variant="outline" wrap disabled={busy} onPress={onAnother} testID={`family-offer-another-${r.id}`}>
          {t("Ask for another time", "다른 시간 요청")}
        </Button>
        <Button variant="ghost" wrap disabled={busy} onPress={onWithdraw} testID={`family-request-withdraw-${r.id}`}>
          {t("Withdraw", "신청 취소")}
        </Button>
      </View>
      {requestHistory(r).length >= 2 ? <HistoryToggle open={history} onToggle={() => setHistory(!history)} testID={`family-request-history-${r.id}`} /> : null}
      {history ? <RequestHistory r={r} viewer="family" {...reader} /> : null}
    </View>
  );
}

/**
 * A request in a short row: the class it's about, what it's for in its section's colour (amber while it waits, its
 * outcome once answered) with whose it is, an action at the right (Withdraw while it waits), the office's note when it
 * said no, and its back and forth folded under it.
 */
function RequestItem({ r, name, divider, reader, tag, children }: { r: RequestDoc; name: string | null; divider: boolean; reader: Reader; tag?: ReactNode; children?: ReactNode }) {
  const colors = useColors();
  const lang = useLang();
  const [history, setHistory] = useState(false);
  return (
    <View style={[styles.item, divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]} testID={`family-request-${r.id}`}>
      <View style={styles.itemTop}>
        <View style={styles.grow}>
          <T variant="label">{classLine(r, reader.hour12, lang)}</T>
          <View style={styles.tagLine}>
            {tag ?? (
              <Tag color={colors.warning} tint={colors.warningTint}>
                {whatFor(r, lang)}
              </Tag>
            )}
            {name ? (
              <T variant="small" tone="muted">
                {name}
              </T>
            ) : null}
          </View>
        </View>
        {children}
      </View>
      {r.status === "rejected" && r.decisionNote ? (
        <T variant="small" tone="muted">
          “{r.decisionNote}”
        </T>
      ) : null}
      {requestHistory(r).length >= 2 ? <HistoryToggle open={history} onToggle={() => setHistory(!history)} testID={`family-request-history-${r.id}`} /> : null}
      {history ? <RequestHistory r={r} viewer="family" {...reader} /> : null}
    </View>
  );
}

/**
 * A missed class still to make up ("Jiwoo · missed Wed, Oct 28, 6 PM"), with Book (asking for a makeup); "Asked" once a
 * request for it waits on the academy, "Answer above" while a time the academy suggests for it waits on the family.
 */
function MakeupRow({ s, name, asked, divider, hour12 }: { s: SessionDoc; name: string | null; asked: ClassRequestStatus | null; divider: boolean; hour12: boolean }) {
  const colors = useColors();
  const t = useT();
  const lang = useLang();
  const what =
    lang === "ko"
      ? `${shortDay(s.dateKey, "ko")} ${startClock(s.startMin, hour12, "ko")} 수업 ${s.status === "no_show" ? "결석" : "취소"}`
      : `${s.status === "no_show" ? "missed" : "canceled"} ${shortDay(s.dateKey)}, ${startClock(s.startMin, hour12)}`;
  const text = name ? `${name} · ${what}` : `${what[0].toUpperCase()}${what.slice(1)}`;
  return (
    <View style={[styles.makeup, divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]} testID={`family-makeup-${s.id}`}>
      <T variant="label" style={styles.grow}>
        {text}
      </T>
      {asked ? (
        <T variant="small" tone="muted" style={styles.asked} testID={`family-makeup-asked-${s.id}`}>
          {asked === "offered" ? t("Answer above", "위에서 답해 주세요") : t("Asked", "신청함")}
        </T>
      ) : (
        <Button
          size="sm"
          variant="outline"
          wrap
          icon={<CalendarPlus size={16} color={colors.makeup} />}
          onPress={() => router.push({ pathname: "/ask", params: { studentId: s.studentId, kind: "makeup", forSessionId: s.id } })}
          accessibilityLabel={t(`Book a makeup for ${text}`, `보강 잡기: ${text}`)}
          testID={`family-makeup-ask-${s.id}`}
        >
          {t("Book", "보강 잡기")}
        </Button>
      )}
    </View>
  );
}

/** Makeups missed: their credit is used ("The makeup for 10/13 was missed on Oct 20, so it counts as used."). */
function LostMakeups({ lost, nameOf }: { lost: SessionDoc[]; nameOf: (s: SessionDoc) => string | null }) {
  const lang = useLang();
  return (
    <View style={styles.lost} testID="family-makeups-lost">
      {lost.map((s) => {
        const was = /(\d+)\/(\d+)/.exec(s.note ?? "");
        const forDay = was ? ` for ${was[1]}/${was[2]}` : "";
        const name = nameOf(s);
        return (
          <T key={s.id} variant="small" tone="muted">
            {lang === "ko"
              ? `${name ? `${name} · ` : ""}${monthDay(s.dateKey, "ko")} ${was ? `(${was[1]}/${was[2]} 수업) ` : ""}보강 수업에 빠져서, 이 보강은 쓴 것으로 처리됐어요.`
              : `${name ? `${name}: the` : "The"} makeup${forDay} was missed on ${monthDay(s.dateKey)}, so it counts as used.`}
          </T>
        );
      })}
    </View>
  );
}

/** The requests answered or withdrawn in the last two weeks, folded: each with how it ended. */
function AnsweredFold({ list, nameOf, reader }: { list: RequestDoc[]; nameOf: (r: RequestDoc) => string | null; reader: Reader }) {
  const colors = useColors();
  const t = useT();
  const lang = useLang();
  const [open, setOpen] = useState(false);
  const Chevron = open ? ChevronUp : ChevronDown;
  return (
    <View style={styles.section} testID="family-answered">
      <Pressable
        onPress={() => setOpen(!open)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={t(`Recent requests, ${list.length}`, `최근 신청 ${list.length}개`)}
        style={({ pressed }) => [styles.foldHead, pressed && styles.pressed]}
        testID="family-answered-toggle"
      >
        <T variant="label" tone="muted">
          {t("Recent requests", "최근 신청")}
        </T>
        <T variant="small" tone="muted" style={styles.count}>
          {list.length}
        </T>
        <Chevron size={16} color={colors.mutedForeground} />
      </Pressable>
      {open ? (
        <Group>
          {list.map((r, i) => {
            const c = outcomeColors(r.status, colors);
            return (
              <RequestItem
                key={r.id}
                r={r}
                name={[nameOf(r), whatFor(r, lang)].filter(Boolean).join(" · ")}
                divider={i > 0}
                reader={reader}
                tag={
                  <Tag color={c.color} tint={c.tint}>
                    {pick(lang, REQUEST_STATUS_LABELS[r.status], REQUEST_STATUS_LABELS_KO[r.status])}
                  </Tag>
                }
              />
            );
          })}
        </Group>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: space.xl },
  section: { gap: space.sm },
  grow: { flex: 1, gap: 4 },
  pressed: { opacity: 0.6 },
  group: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  offer: { borderRadius: radius.lg, borderWidth: 1, padding: space.lg, gap: space.sm },
  suggestion: { gap: 2, marginTop: space.xs },
  suggests: { fontWeight: "600" },
  big: { fontSize: 22, fontWeight: "700" },
  note: { fontStyle: "italic" },
  stack: { gap: space.sm, marginTop: space.sm },
  tag: { alignSelf: "flex-start", borderRadius: radius.sm, paddingHorizontal: 7, paddingVertical: 3 },
  tagText: { fontWeight: "700" },
  tagLine: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: space.sm, rowGap: 4 },
  historyToggle: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", minHeight: 28 },
  historyText: { fontWeight: "600" },
  item: { paddingHorizontal: space.lg, paddingVertical: space.md, gap: space.xs },
  itemTop: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
  makeup: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 56 },
  asked: { fontWeight: "600" },
  lost: { gap: space.xs, paddingHorizontal: space.xs },
  foldHead: { flexDirection: "row", alignItems: "center", gap: space.sm, alignSelf: "flex-start", minHeight: 36, paddingHorizontal: space.xs },
  count: { fontWeight: "700", fontVariant: ["tabular-nums"] },
});
