import { effectiveLockDays } from "@shared/availability";
import type { BranchSettings } from "@shared/settings/defaults";
import { cancelRuleWords } from "@/features/family/words";
import type { TourKind } from "./state";

/** A tab, and where it opens. */
export interface TourTab {
  label: string;
  href: string;
}

/**
 * One step: the place it lights up and what it says there. The app behind it is the real one: each step opens its
 * tab, and the steps of a `page` open that page from the tab first, as the person would.
 */
export interface TourStep {
  /** The tab it's on (its index in `tabs`). */
  tab: number;
  /**
   * What it points at: a part's test ID ("family-ask"), a list's first part by its ID's start ("family-next-*"), "tab"
   * for the tab's own button in the tab bar, or nothing for a card alone.
   */
  at?: string;
  /** On the page that tapping this part of the tab opens (a class, a result). */
  page?: string;
  /** Tapping the lit part does what it does in the app (opens it, or the tab) and goes on. Only parts that open something. */
  tap?: boolean;
  /** Left out when its part isn't on the screen: no classes yet, one child, nothing to answer. */
  optional?: boolean;
  title: string;
  /** A sentence or two. */
  text: string[];
}

export interface Tour {
  tabs: TourTab[];
  steps: TourStep[];
}

/** The last step everywhere: where the tour is again. */
const again = (tab: number, at: string): TourStep => ({ tab, at, title: "See this again", text: ["Take this tour again here, any time."] });

/**
 * Each kind of person's tour (the fourth meeting's B1, "show and tell them most of the stuff we have"): for each tab, its
 * button in the tab bar, then the parts of the screen that matter, each lit in turn, and a result's page. Pages that
 * open as sheets (a class) are told from the card that opens them: iOS shows no sheet over the tour. The academy's
 * rules come from its settings (the cancellation cutoff, the availability lock), never written in.
 */
export function tourFor(kind: TourKind, settings: BranchSettings, children = 1): Tour {
  if (kind === "parent" || kind === "student") return familyTour(kind === "parent", settings, children);
  return kind === "coach" ? coachTour(settings) : officeTour();
}

function familyTour(parent: boolean, settings: BranchSettings, children: number): Tour {
  const family = "/(app)/(family)/(tabs)";
  const tabs: TourTab[] = [
    { label: "Home", href: family },
    { label: "Classes", href: `${family}/classes` },
    { label: "Scores", href: `${family}/scores` },
    { label: "Reports", href: `${family}/reports` },
    { label: "More", href: `${family}/more` },
  ];
  const your = parent ? "your child’s" : "your";
  const steps: TourStep[] = [
    {
      tab: 0,
      at: "tab",
      title: "Home",
      text: [`Where the app opens: ${your} next class, news from the academy and the latest scores.`],
    },
    ...(parent && children > 1
      ? [{ tab: 0, at: "family-child-filter", optional: true, title: "Choose a child", text: ["Choose whose classes and scores you see. All shows everyone."] }]
      : []),
    {
      tab: 0,
      at: "family-next-*",
      optional: true,
      title: "Your next class",
      text: ["Tap a class to see it in full. There you can cancel it, or ask to move it to another class.", cancelRuleWords(settings)],
    },
    {
      tab: 0,
      at: "family-home-notifications",
      title: "Notifications",
      text: ["What the academy tells you collects here: class changes, answers to your requests, new scores and reports. A dot means something new."],
    },
    { tab: 0, at: "family-home-news", optional: true, title: "From the academy", text: ["The academy’s news and notices. Tap one to read it."] },
    { tab: 1, at: "tab", tap: true, title: "Classes", text: [`Every one of ${parent ? "your child’s" : "your"} classes, coming up and past.`] },
    { tab: 1, at: "family-classes-view", optional: true, title: "List or month", text: ["See them as a list, or on a calendar, month by month."] },
    {
      tab: 1,
      at: "family-ask",
      optional: true,
      title: "Ask for a class",
      text: ["For a makeup, an extra class or another time, tap Ask and choose a class with a free seat. The academy confirms it."],
    },
    { tab: 2, at: "tab", tap: true, title: "Scores", text: ["Every result: practice targets, SIUS and competitions."] },
    { tab: 2, at: "family-scores-tiles*", optional: true, title: "At a glance", text: ["Each position’s average and best. Tap one to open its best result."] },
    { tab: 2, at: "family-score-row-*", tap: true, optional: true, title: "Open a result", text: ["Tap a result to see every shot on the target."] },
    {
      tab: 2,
      page: "family-score-row-*",
      at: "family-score-replay",
      optional: true,
      title: "Shot by shot",
      text: ["Play the shots back one by one, in the order they were fired. Tap a shot to see where it went."],
    },
    {
      tab: 2,
      page: "family-score-row-*",
      at: "family-score-compare",
      optional: true,
      title: "Compare",
      text: ["Put it beside an earlier result in the same position, to see what changed."],
    },
    {
      tab: 3,
      at: "tab",
      tap: true,
      title: "Reports",
      text: ["Progress reports from the coaches, once the academy shares them: how the scores moved, where the shots went, and what comes next."],
    },
    { tab: 3, at: "family-report-*", optional: true, title: "A report", text: ["Tap one to read it. You’re told when a new one arrives."] },
    { tab: 4, at: "tab", tap: true, title: "More", text: [parent ? "Your account, notifications, contracts and help." : "Your account, notifications and help."] },
    { tab: 4, at: "family-more-notifications", optional: true, title: "Your notifications", text: ["Choose what you’re told about, and turn them on for this phone."] },
    ...(parent ? [{ tab: 4, at: "family-more-contracts", optional: true, title: "Enrollment contracts", text: ["Your signed contracts, to read or keep."] }] : []),
    again(4, "family-more-tour"),
  ];
  return { tabs, steps };
}

const staff = "/(app)/(staff)/(tabs)";

function coachTour(settings: BranchSettings): Tour {
  const lock = effectiveLockDays(settings);
  return {
    tabs: [
      { label: "Home", href: staff },
      { label: "Schedule", href: `${staff}/schedule` },
      { label: "Availability", href: `${staff}/availability` },
      { label: "Scan", href: `${staff}/scan` },
      { label: "More", href: `${staff}/more` },
    ],
    steps: [
      { tab: 0, at: "tab", title: "Home", text: ["Your day: today’s classes, who’s coaching with you, and your hours."] },
      {
        tab: 0,
        at: "today-class-*",
        optional: true,
        title: "Today’s classes",
        text: ["Tap a class to see who’s booked, with their level and rifle, and who’s coaching it: everyone in at its time."],
      },
      { tab: 1, at: "tab", tap: true, title: "Schedule", text: ["Every class, with its students and the coaches in."] },
      { tab: 1, at: "schedule-view", optional: true, title: "Day or week", text: ["Switch between one day and the whole week."] },
      { tab: 1, at: "schedule-whos-in", optional: true, title: "Who’s in", text: ["The coaches in that day, and who has clocked in at the front desk."] },
      { tab: 2, at: "tab", tap: true, title: "Availability", text: ["When you can coach, so the office can put you on the schedule."] },
      {
        tab: 2,
        at: "availability-calendar",
        title: "Tap a day",
        text: [
          "Tap a day to set the times you can coach, or mark it not available.",
          ...(lock > 0 ? [`Within the next ${lock === 1 ? "day" : `${lock} days`} you can only add time; ask the office to take some away.`] : []),
        ],
      },
      { tab: 2, at: "availability-gaps", optional: true, title: "Days to set", text: ["The days you haven’t answered yet. Setting them helps the office plan the week."] },
      { tab: 3, at: "tab", tap: true, title: "Scan", text: ["Score a paper target with the camera, shot by shot."] },
      { tab: 3, at: "scan-take-photo", optional: true, title: "Take a photo", text: ["Photograph the card: the app finds each hole and its score, and you check it before it’s saved."] },
      { tab: 3, at: "scan-competition", optional: true, title: "Competitions", text: ["Add a competition from a photo of its results sheet, series by series."] },
      { tab: 4, at: "tab", tap: true, title: "More", text: ["Students, news, the Drive, reports, your payroll and your kiosk PIN."] },
      { tab: 4, at: "more-kiosk-pin", optional: true, title: "Your kiosk PIN", text: ["Set or change the PIN you clock in and out with at the front desk."] },
      again(4, "more-tour"),
    ],
  };
}

function officeTour(): Tour {
  return {
    tabs: [
      { label: "Home", href: staff },
      { label: "Schedule", href: `${staff}/schedule` },
      { label: "Scan", href: `${staff}/scan` },
      { label: "Students", href: `${staff}/students` },
      { label: "More", href: `${staff}/more` },
    ],
    steps: [
      { tab: 0, at: "tab", title: "Home", text: ["The day at a glance: today’s classes, who’s in, and what needs you."] },
      {
        tab: 0,
        at: "today-class-*",
        optional: true,
        title: "Today’s classes",
        text: ["Tap a class to see its students and coaches. There you mark who came, and a student’s ⋯ moves them or takes them out."],
      },
      { tab: 1, at: "tab", tap: true, title: "Schedule", text: ["Every class, with its students, open seats and the coaches in."] },
      { tab: 1, at: "schedule-view", optional: true, title: "Day or week", text: ["Switch between one day and the whole week."] },
      {
        tab: 1,
        at: "schedule-requests",
        optional: true,
        title: "Families’ requests",
        text: ["Makeups, moves and extra classes families ask for. The badge counts the ones waiting for your answer."],
      },
      { tab: 2, at: "tab", tap: true, title: "Scan", text: ["Score a paper target with the camera, or add a competition from its results sheet."] },
      { tab: 2, at: "scan-take-photo", optional: true, title: "Take a photo", text: ["The app finds each hole and its score, and you check it before it’s saved."] },
      { tab: 3, at: "tab", tap: true, title: "Students", text: ["Every student, with their classes, scores, Drive folder and enrollment contract."] },
      { tab: 3, at: "student-search-tab", optional: true, title: "Find a student", text: ["Search by name, then tap a student to open them."] },
      {
        tab: 4,
        at: "tab",
        tap: true,
        title: "More",
        text: ["Coaches, news, the Drive, reports and the enrollment contract. Settings, payroll and the rest are on the website."],
      },
      again(4, "more-tour"),
    ],
  };
}
