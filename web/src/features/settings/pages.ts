import { type Find, searchWords } from '@shared/settings/search'
import { OTHER_FINDS, SETTINGS_SECTIONS, type FieldDef } from './schema'

/**
 * The Settings home's pages (Goo's pick of 2026-10-28, docs/DECISIONS.md §23: "Settings home"): each tile opens a short
 * page at its own address (/admin/settings/<key>) with its settings in plain groups, the fine-tuning under "More
 * options", and the parts that aren't settings fields (the dated hours, the seats, the profile, the website…) as blocks.
 */

/** The parts of a page that aren't fields of the schema. */
export type BlockKey = 'dateHours' | 'seats' | 'payRule' | 'profile' | 'signupShare' | 'website' | 'contract' | 'activity' | 'ai'

export type PageItem = { field: string } | { block: BlockKey }

export interface PageGroup {
  title?: string
  items: PageItem[]
}

export type HomeGroup = 'day' | 'people' | 'academy' | 'platform'

export interface SettingsPageDef {
  key: string
  title: string
  description: string
  home: HomeGroup
  groups: PageGroup[]
  /** Fine-tuning almost nobody changes: under "More options". */
  more: string[]
  /** Wide pages (the website, the activity log) take the page's width. */
  wide?: boolean
  /** One block with its own title and description (the website, the contract, the activity log): the page adds none. */
  selfTitled?: boolean
  /** Words it's also found by. */
  keywords?: string
  /** Only super admins see it (the AI page): its tile, its search results and its address. */
  superAdminOnly?: boolean
}

const f = (path: string): PageItem => ({ field: path })
const b = (block: BlockKey): PageItem => ({ block })

export const PAGES: SettingsPageDef[] = [
  {
    key: 'hours',
    title: 'Opening hours & closed days',
    description: 'When the academy is open each week, and the days it closes or keeps other hours.',
    home: 'day',
    groups: [{ items: [f('schedule.defaultWeek')] }, { items: [b('dateHours')] }],
    more: [],
    keywords: 'holiday closed day special hours open close',
  },
  {
    key: 'classes',
    title: 'Classes & families',
    description: 'What families can do in the app, and how a new class starts out.',
    home: 'day',
    groups: [
      { title: 'Families', items: [f('schedule.autoConfirm.hoursBefore'), f('schedule.autoConfirm.enabled'), f('schedule.requests.daysAhead')] },
      { title: 'A new class', items: [b('seats'), f('schedule.defaultSessionMinutes')] },
      { title: 'The schedule', items: [f('general.weekStartsOn'), f('schedule.defaultView')] },
    ],
    more: ['schedule.snapMinutes', 'schedule.pasteStatus', 'trash.retentionDays'],
    keywords: 'cancel makeup request seats capacity class',
  },
  {
    key: 'availability',
    title: 'Coaches’ availability',
    description: 'When coaches’ days lock, and how far ahead they set them.',
    home: 'day',
    groups: [{ items: [f('availability.lockWindowDays'), f('availability.leadTimeDays'), f('availability.leadTimeEnforcement')] }],
    more: ['availability.maxRangesPerDay', 'availability.stepMinutes', 'availability.minBlockMinutes'],
  },
  {
    key: 'pay',
    title: 'Pay & time clock',
    description: 'When a coach’s paid time starts and ends, the pay periods, and the kiosk. Each person’s rate is on their page in Employees → Directory.',
    home: 'day',
    groups: [
      { title: 'Paid time', items: [b('payRule'), f('timeClock.arrivalMinutes'), f('timeClock.payEndsAtLastClass'), f('timeClock.autoClockOut.enabled'), f('timeClock.autoClockOut.localTime')] },
      { title: 'Pay periods', items: [f('payroll.payPeriod.type'), f('payroll.payPeriod.anchorDate')] },
      { title: 'Kiosk', items: [f('timeClock.kiosk.pinLength')] },
    ],
    more: ['timeClock.autoClockOut.atLastClass', 'timeEntries.stepMinutes', 'home.clockLookbackDays'],
    keywords: 'payroll wage rate hourly money clock',
  },
  {
    key: 'students',
    title: 'Students & levels',
    description: 'Levels, programs and grades, and the statuses that change on their own.',
    home: 'people',
    groups: [
      { title: 'Levels and programs', items: [f('students.levels'), f('students.programs'), f('students.gradeOptions')] },
      { title: 'Automatic statuses', items: [f('students.autoStatus.enabled'), f('students.autoStatus.inactivityPauseDays'), f('students.autoStatus.respectManual')] },
    ],
    more: [],
  },
  {
    key: 'signup',
    title: 'Sign-up page',
    description: 'Who can ask for access, the welcome they see, and the link and QR code to share.',
    home: 'people',
    groups: [{ items: [f('signup.enabled'), f('signup.roles'), f('signup.welcomeMessage')] }, { title: 'Share it', items: [b('signupShare')] }],
    more: [],
  },
  {
    key: 'notices',
    title: 'Notices & posts',
    description: 'What the academy’s notices cover, and the categories for posts. Each person turns kinds of notices on or off on their own page.',
    home: 'people',
    groups: [
      { title: 'Notices', items: [f('schedule.alerts.firstSession'), f('notifications.sessionChangeWindowHours')] },
      { title: 'Posts', items: [f('announcements.defaultCategories')] },
    ],
    more: ['notifications.retentionDays'],
    keywords: 'notifications announcements',
  },
  {
    key: 'academy',
    title: 'Academy profile',
    description: 'The academy’s name, time zone and contact details, as people see them in the app and on the privacy policy.',
    home: 'academy',
    groups: [{ items: [b('profile')] }],
    more: [],
  },
  { key: 'website', title: 'Website', description: 'The public website: its pages, photos, coaches and reviews, and the trial requests and questions it sends.', home: 'academy', groups: [{ items: [b('website')] }], more: [], wide: true, selfTitled: true },
  { key: 'contract', title: 'Enrollment contract', description: 'The blank contract families sign from a link the office sends.', home: 'academy', groups: [{ items: [b('contract')] }], more: [], selfTitled: true },
  { key: 'activity', title: 'Activity log', description: 'Every change to the settings, the schedule, people and pay: who made it and when.', home: 'academy', groups: [{ items: [b('activity')] }], more: [], wide: true, selfTitled: true, keywords: 'audit history' },
  {
    key: 'ai',
    title: 'AI',
    description: 'The models the AI features use, the providers’ keys, the spend and every request. For super admins.',
    home: 'platform',
    groups: [{ items: [b('ai')] }],
    more: [],
    wide: true,
    selfTitled: true,
    superAdminOnly: true,
    keywords: 'artificial intelligence model api key spend cost tokens usage super admin',
  },
]

export const HOME_GROUPS: { key: HomeGroup; title: string }[] = [
  { key: 'day', title: 'Day to day' },
  { key: 'people', title: 'People' },
  { key: 'academy', title: 'The academy' },
  { key: 'platform', title: 'Super admins' },
]

/** Every field of the schema, by its path. */
export const FIELDS: Record<string, FieldDef> = Object.fromEntries(SETTINGS_SECTIONS.flatMap((s) => s.fields).map((x) => [x.path, x]))

export const pageFields = (p: SettingsPageDef): string[] => [...p.groups.flatMap((g) => g.items.flatMap((i) => ('field' in i ? [i.field] : []))), ...p.more]
export const pageBlocks = (p: SettingsPageDef): BlockKey[] => p.groups.flatMap((g) => g.items.flatMap((i) => ('block' in i ? [i.block] : [])))
export const pageByKey = (key: string): SettingsPageDef | null => PAGES.find((p) => p.key === key) ?? null

// Every setting has its page: a field left out of the pages would be lost from Settings.
if (import.meta.env.DEV) {
  const placed = new Set(PAGES.flatMap(pageFields))
  const lost = Object.keys(FIELDS).filter((p) => !placed.has(p))
  if (lost.length) throw new Error(`Settings fields on no page: ${lost.join(', ')}`)
}

/** Where a block can be found by the search (`?find=`): its anchor on the page. */
const BLOCK_PAGES: Record<string, string> = { 'date-hours': 'hours', seats: 'classes', 'pay-rule': 'pay', profile: 'academy', 'signup-share': 'signup' }

/**
 * The page an address asks for: a page's own key, or one of the old section addresses (links into Settings from before
 * the home, kept working), sent where its setting now is.
 */
export function pageFor(asked: string, find: string | null): string | null {
  if (pageByKey(asked)) return asked
  const own = find ? (PAGES.find((p) => pageFields(p).includes(find))?.key ?? BLOCK_PAGES[find] ?? null) : null
  switch (asked) {
    case 'schedule':
      return own ?? 'hours'
    case 'payroll':
      return 'pay'
    case 'notifications':
    case 'announcements':
    case 'home':
      return 'notices'
    case 'audit-log':
      return 'activity'
    default:
      return own
  }
}

/** Old section addresses the search's other finds used. */
const OTHER_PAGE: Record<string, string> = { academy: 'academy', schedule: 'hours', website: 'website', signup: 'signup', contract: 'contract', 'audit-log': 'activity' }

/** What the home's search finds: every page, every setting, and the other things on the pages. */
export const SETTINGS_FINDS: Find[] = [
  ...PAGES.map((p) => ({ key: `page:${p.key}`, label: p.title, text: searchWords(`${p.title} ${p.description} ${p.keywords ?? ''}`), page: p.key, find: null })),
  ...PAGES.flatMap((p) =>
    pageFields(p).map((path) => {
      const x = FIELDS[path]
      const group = p.groups.find((g) => g.items.some((i) => 'field' in i && i.field === path))?.title ?? (p.more.includes(path) ? 'More options' : '')
      return { key: `field:${path}`, label: x.label, text: searchWords(`${x.label} ${x.help ?? ''} ${x.keywords ?? ''} ${group} ${p.title}`), page: p.key, find: path }
    }),
  ),
  ...OTHER_FINDS.map((o) => {
    const page = o.anchor ? (BLOCK_PAGES[o.anchor] ?? OTHER_PAGE[o.section]) : (OTHER_PAGE[o.section] ?? o.section)
    return { key: `other:${o.label}`, label: o.label, text: searchWords(`${o.label} ${o.keywords}`), page, find: o.anchor ?? null }
  }),
]

/** The title of the page a find opens. */
export const pageTitle = (key: string): string => pageByKey(key)?.title ?? ''
