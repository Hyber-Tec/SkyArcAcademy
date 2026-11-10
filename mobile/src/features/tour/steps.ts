import { effectiveLockDays } from "@shared/availability";
import type { Lang } from "@shared/i18n";
import type { BranchSettings } from "@shared/settings/defaults";
import { Calendar, CalendarDays, Camera, ChartLine, Clock, Ellipsis, House, type LucideIcon, Target, Users } from "lucide-react-native";
import { cancelRuleWords } from "@/features/family/words";
import type { TourKind } from "./state";

/** A tab as the tour draws it in its small tab bar, and where it opens behind the card. */
export interface TourTab {
  name: string;
  label: string;
  icon: LucideIcon;
  href: string;
}

export interface TourStep {
  /** The tab this step opens behind the card (its index in `tabs`). */
  tab: number;
  title: string;
  /** Short paragraphs. */
  text: string[];
}

export interface Tour {
  tabs: TourTab[];
  steps: TourStep[];
}

type Say = (en: string, ko: string) => string;

/**
 * Each kind of person's tour: one step per tab, in the tab bar's order, saying what it's for and the one thing to do
 * there. The academy's rules come from its settings (the cancellation cutoff, the availability lock), never written in.
 * Parents read it in their language; coaches, the office and students in English, as their screens.
 */
export function tourFor(kind: TourKind, settings: BranchSettings, lang: Lang, t: Say, children = 1): Tour {
  if (kind === "parent" || kind === "student") {
    const family = `/(app)/(family)/(tabs)`;
    const tabs: TourTab[] = [
      { name: "index", label: t("Home", "홈"), icon: House, href: family },
      { name: "classes", label: t("Classes", "수업"), icon: CalendarDays, href: `${family}/classes` },
      { name: "scores", label: t("Scores", "점수"), icon: Target, href: `${family}/scores` },
      { name: "reports", label: t("Reports", "리포트"), icon: ChartLine, href: `${family}/reports` },
      { name: "more", label: t("More", "더보기"), icon: Ellipsis, href: `${family}/more` },
    ];
    const parent = kind === "parent";
    const cancelRule = cancelRuleWords(settings, lang);
    return {
      tabs,
      steps: [
        {
          tab: 0,
          title: t("Home", "홈"),
          text: [
            parent
              ? t("Your child’s next classes, news from the academy, and anything that needs your answer, at a glance.", "자녀의 다음 수업과 아카데미 소식, 답이 필요한 일을 한눈에 볼 수 있어요.")
              : "Your next classes, news from the academy, and anything that needs an answer, at a glance.",
            ...(parent && children > 1 ? [t("With more than one child, choose whose at the top of each tab.", "자녀가 여러 명이면 탭마다 맨 위에서 자녀를 고를 수 있어요.")] : []),
          ],
        },
        {
          tab: 1,
          title: t("Classes", "수업"),
          text: [
            t("Every class, as a list or a month. Tap a class to cancel it or move it to another time.", "수업을 목록이나 달력으로 볼 수 있어요. 수업을 누르면 취소하거나 다른 시간으로 옮길 수 있어요."),
            cancelRule,
            t("Need a makeup or an extra class? Tap Ask, and the academy confirms it.", "보강이나 추가 수업이 필요하면 ‘신청’을 누르세요. 아카데미에서 확정해요."),
          ],
        },
        {
          tab: 2,
          title: t("Scores", "점수"),
          text: [
            t(
              "Every result: SIUS, paper targets and competitions. Open one to see each shot, play the shots back, and compare it with an earlier result.",
              "SIUS 기록, 종이 표적, 대회 기록을 모두 볼 수 있어요. 기록을 열면 한 발씩 다시 보고, 이전 기록과 비교할 수 있어요.",
            ),
          ],
        },
        {
          tab: 3,
          title: t("Reports", "리포트"),
          text: [parent ? t("Progress reports from the coaches, once the academy shares them with you.", "아카데미에서 공유한 성장 리포트를 볼 수 있어요.") : "Progress reports from your coaches, once the academy shares them."],
        },
        {
          tab: 4,
          title: t("More", "더보기"),
          text: [
            parent
              ? t("Notifications, the language, your signed contracts and help.", "알림, 언어, 서명한 계약서와 도움말이 있어요.")
              : "Notifications, your details and help.",
            t("You can take this tour again here, any time.", "이 안내는 여기서 언제든 다시 볼 수 있어요."),
          ],
        },
      ],
    };
  }

  const staff = `/(app)/(staff)/(tabs)`;
  const home: TourTab = { name: "index", label: "Home", icon: House, href: staff };
  const schedule: TourTab = { name: "schedule", label: "Schedule", icon: Calendar, href: `${staff}/schedule` };
  const scan: TourTab = { name: "scan", label: "Scan", icon: Camera, href: `${staff}/scan` };
  const more: TourTab = { name: "more", label: "More", icon: Ellipsis, href: `${staff}/more` };
  const scanStep = (tab: number): TourStep => ({
    tab,
    title: "Scan",
    text: ["Photograph a paper target to score it shot by shot, or a competition’s results sheet to save every series. You check it before it’s saved."],
  });
  if (kind === "coach") {
    const lock = effectiveLockDays(settings);
    return {
      tabs: [home, schedule, { name: "availability", label: "Availability", icon: Clock, href: `${staff}/availability` }, scan, more],
      steps: [
        { tab: 0, title: "Home", text: ["Your day at a glance: today’s classes and who’s in with you, and what’s still to do, such as days of availability to set."] },
        { tab: 1, title: "Schedule", text: ["Every class, by day or by week, with its students and the coaches in. Tap a class to see who’s coming."] },
        {
          tab: 2,
          title: "Availability",
          text: [
            "Mark the days and times you can coach, so the office can put you on the schedule. Tap a day to set it, or copy last week.",
            ...(lock > 0 ? [`Within the next ${lock === 1 ? "day" : `${lock} days`} you can only add time; ask the office to take some away.`] : []),
          ],
        },
        scanStep(3),
        { tab: 4, title: "More", text: ["Students, news, the Drive, reports, your payroll and your kiosk PIN.", "You can take this tour again here, any time."] },
      ],
    };
  }
  return {
    tabs: [home, schedule, scan, { name: "students", label: "Students", icon: Users, href: `${staff}/students` }, more],
    steps: [
      { tab: 0, title: "Home", text: ["The day at a glance: today’s classes, who’s clocked in, and what needs you."] },
      {
        tab: 1,
        title: "Schedule",
        text: ["Every class, by day or by week. Mark who came, put a student in an open seat or move them, and answer families’ requests: the badge counts the ones waiting."],
      },
      scanStep(2),
      { tab: 3, title: "Students", text: ["Every student: their classes, scores, Drive folder and enrollment contract."] },
      {
        tab: 4,
        title: "More",
        text: ["Coaches, news, the Drive, reports and the enrollment contract. Settings, payroll and the rest are on the website.", "You can take this tour again here, any time."],
      },
    ],
  };
}
