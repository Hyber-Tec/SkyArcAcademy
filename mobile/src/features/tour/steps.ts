import { effectiveLockDays } from "@shared/availability";
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


/**
 * Each kind of person's tour: one step per tab, in the tab bar's order, saying what it's for and the one thing to do
 * there. The academy's rules come from its settings (the cancellation cutoff, the availability lock), never written in.
 * Parents read it in their language; coaches, the office and students in English, as their screens.
 */
export function tourFor(kind: TourKind, settings: BranchSettings, children = 1): Tour {
  if (kind === "parent" || kind === "student") {
    const family = `/(app)/(family)/(tabs)`;
    const tabs: TourTab[] = [
      { name: "index", label: "Home", icon: House, href: family },
      { name: "classes", label: "Classes", icon: CalendarDays, href: `${family}/classes` },
      { name: "scores", label: "Scores", icon: Target, href: `${family}/scores` },
      { name: "reports", label: "Reports", icon: ChartLine, href: `${family}/reports` },
      { name: "more", label: "More", icon: Ellipsis, href: `${family}/more` },
    ];
    const parent = kind === "parent";
    const cancelRule = cancelRuleWords(settings);
    return {
      tabs,
      steps: [
        {
          tab: 0,
          title: "Home",
          text: [
            parent
              ? "Your child’s next classes, news from the academy, and anything that needs your answer, at a glance."
              : "Your next classes, news from the academy, and anything that needs an answer, at a glance.",
            ...(parent && children > 1 ? ["With more than one child, choose whose at the top of each tab."] : []),
          ],
        },
        {
          tab: 1,
          title: "Classes",
          text: [
            "Every class, as a list or a month. Tap a class to cancel it or move it to another time.",
            cancelRule,
            "Need a makeup or an extra class? Tap Ask, and the academy confirms it.",
          ],
        },
        {
          tab: 2,
          title: "Scores",
          text: [
            "Every result: SIUS, paper targets and competitions. Open one to see each shot, play the shots back, and compare it with an earlier result.",
          ],
        },
        {
          tab: 3,
          title: "Reports",
          text: [parent ? "Progress reports from the coaches, once the academy shares them with you." : "Progress reports from your coaches, once the academy shares them."],
        },
        {
          tab: 4,
          title: "More",
          text: [
            parent
              ? "Notifications, the language, your signed contracts and help."
              : "Notifications, your details and help.",
            "You can take this tour again here, any time.",
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
