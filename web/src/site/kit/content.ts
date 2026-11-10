/**
 * The website's words, in English only (docs/DECISIONS.md §42), taken from the academy's earlier site and tidied.
 * Nothing here is invented as a fact: what the academy hasn't confirmed yet (the trials' price and length, tuition, the
 * youngest age) is left out until it does, and so is a spot without a photo (docs/DECISIONS.md §41). What the academy
 * changes itself comes from the CRM's Website page instead (photos, coaches, testimonials, hours, Instagram, news;
 * site/data.tsx), and its email and phone from Settings → Academy.
 */

/**
 * Keeps together what reads as one: a range ("Monday–Thursday", "250–275", "4:30–8 PM") and a hyphenated word
 * ("hands-on"), with a word joiner after the dash; a dash never starting a line ("sport—from"); and names that are one
 * name ("Sky Arc", "Marine Corps", "Junior Olympic"), with a no-break space.
 */
export const keepWhole = (s: string) =>
  s
    .replace(/([\p{L}\p{N}][–-])(?=[\p{L}\p{N}])/gu, '$1\u2060')
    .replace(/([\p{L}\p{N}.,])—/gu, '$1\u2060—')
    .replace(/\b(Sky Arc|Marine Corps|Junior Olympic|Level 1)\b/g, (m) => m.replace(' ', '\u00a0'))

export const ACADEMY = {
  name: 'Sky Arc Sports Academy',
  short: 'Sky Arc',
  location: 'Suwanee, Georgia',
  street: '730 Peachtree Industrial Blvd',
  city: 'Suwanee, GA 30024',
  /** The app's sign-in page (the parent portal). */
  loginUrl: '/login',
}

export const UI = {
  home: 'Home',
  programs: 'Programs',
  about: 'About',
  coaches: 'Coaches',
  gallery: 'Gallery',
  news: 'News',
  /** The phone app's page (`/get-app`), in the site's menu. */
  app: 'App',
  tuition: 'Tuition',
  contact: 'Contact',
  trial: 'Book a trial',
  trialShort: 'Book trial',
  login: 'Log in',
  openApp: 'Open the app',
  parentLogin: 'Parent login',
  portal: 'Parent portal',
  menu: 'Menu',
  close: 'Close',
  language: 'Language',
  skipIntro: 'Skip intro',
  readMore: 'Read more',
  viewAll: 'View all',
  allNews: 'All news',
  seeGallery: 'See the gallery',
  explorePrograms: 'Explore programs',
  learnMore: 'Learn more',
  meetCoaches: 'Meet the coaches',
  directions: 'Get directions',
  backHome: 'Back to home',
  back: 'Back',
  next: 'Next',
  previous: 'Previous',
  email: 'Email',
  phone: 'Phone',
  address: 'Address',
  hours: 'Hours',
  followUs: 'Follow us',
  minutes: 'min',
}

export const HOME = {
  hero: {
    eyebrow: 'Youth air rifle academy · Suwanee, Georgia',
    title: ['Focus', 'takes flight.'],
    lead: 'We develop calm, capable athletes through safe instruction, strong fundamentals, and a clear path from first shot to competition.',
  },
  /** Facts from their own site only. SIUS (the scoring system the academy uses) shows as its own logo. */
  facts: [
    { value: '10m', label: 'Olympic-style air rifle' },
    { value: '4', label: 'levels, from first shot to competition' },
    { value: '1:1', label: 'individual development focus' },
    { value: 'SIUS', label: 'live electronic scoring', logo: true },
  ] as { value: string; label: string; logo?: boolean }[],
  standard: {
    eyebrow: 'The Sky Arc standard',
    steps: ['Prepare', 'Execute', 'Call'],
    quote: 'Discipline creates confidence.',
  },
  method: {
    eyebrow: 'Our method',
    title: 'More than a score.',
    text: 'We coach the athlete behind the rifle. Technical skill matters—and so do patience, accountability, decision-making, and resilience.',
    items: [
      { title: 'Safe', text: 'Clear commands. Controlled movement. Respect for every rifle and every person on the range.' },
      { title: 'Steady', text: 'Strong fundamentals before speed. Athletes learn how to create a reliable shot process.' },
      { title: 'Self-aware', text: 'Call the shot, study the result, and make the next adjustment with purpose.' },
    ],
  },
  known: {
    eyebrow: 'Built for the long term',
    title: 'Every athlete. Known by name.',
    text: 'Sky Arc uses observation, coaching notes, and performance records to understand each athlete’s strengths and areas for growth. That insight shapes an individualized training plan built for lasting progress—not short-term scores.',
    points: [
      'Fundamentals-first coaching',
      'Individual progress tracking',
      'Positive, disciplined culture',
      'Competition-ready pathways',
    ],
  },
  safety: {
    eyebrow: 'Safety first',
    title: 'Safe before the first shot.',
    text: 'Air rifle is a precise, controlled sport, and it is taught that way. Safety habits come before anything else.',
    items: [
      {
        title: 'Safety before shooting',
        text: 'Every new athlete starts with Trial One: core safety rules, range commands and how a safe session flows. No one shoots in Trial One.',
      },
      {
        title: 'Clear commands',
        text: 'Clear commands and controlled movement on the range. Every command, movement and equipment habit begins with respect for the people around you.',
      },
      {
        title: 'Ready before anyone shoots',
        text: 'Coaches review the safety rules and confirm that every athlete is ready before anyone shoots.',
      },
      {
        title: 'A team that knows the range',
        text: 'Our coaches include NRA Level 1 Certified Instructors and an Elite Military Rifle Marksman, who oversee safety protocols and equipment readiness.',
      },
    ],
  },
  path: {
    eyebrow: 'The path',
    title: 'Grow with every shot.',
    text: 'Placement is led by demonstrated skill, safety, and readiness—not school grade. Age helps coaches choose positions an athlete can handle safely, but it does not create a rigid program boundary.',
    evaluations: 'Formal evaluations each quarter. Coaches may recommend an earlier evaluation when skill, safety, and physical readiness support the next position.',
    advance: 'Advance when ready',
    illustration: 'Illustration: a shot group tightening from level to level.',
  },
  launchpad: {
    eyebrow: 'Supported Launchpad',
    title: 'More options. More engagement.',
    text: 'New athletes—and especially younger athletes who are not yet physically ready for unsupported positions—benefit from bench support, shorter feedback loops, and flexible scheduling.',
    items: [
      {
        tag: 'Flexible attendance',
        title: 'Fit training into family life',
        text: 'Multiple Launchpad opportunities give families more ways to maintain consistent training without forcing one rigid weekly time.',
      },
      {
        tag: 'Supported fundamentals',
        title: 'Build the shot process',
        text: 'Engaging work on safety, sight picture, breathing, trigger feel, follow-through, and calling the shot before positional demands increase.',
      },
      {
        tag: 'Quarterly or sooner',
        title: 'Advance when ready',
        text: 'Formal evaluations occur each quarter. Coaches may recommend an earlier evaluation when skill, safety, and physical readiness support the next position.',
      },
    ],
  },
  report: {
    eyebrow: 'For parents',
    title: 'See every step of their progress.',
    text: 'Families sign in to the Sky Arc portal to see class schedules, scores and progress reports: how the scores moved, where the shots went, what is going well and what comes next, with a note from the coach.',
    features: [
      { title: 'Scores over time', text: 'Every evaluation, charted across the period.' },
      { title: 'Shot by shot', text: 'Replay where each shot landed on the target.' },
      { title: 'Coach notes and goals', text: 'Strengths, focus areas and goals for the next period.' },
      { title: 'Schedules and news', text: 'Classes, changes and academy news in one place.' },
    ],
    sampleNote: 'Sample report: a made-up athlete and made-up scores.',
  },
  coaches: {
    eyebrow: 'Meet the team',
    title: 'Experience that shapes every athlete.',
    text: 'Sky Arc brings together competition experience, certified instruction, elite military rifle marksmanship, athlete development, and disciplined facility operations.',
  },
  trial: {
    eyebrow: 'Your first visit',
    title: 'Start with the basics.',
    text: 'Every athlete begins with Trial One—safety, range procedures and the rifle itself—before the longer, hands-on Trial Two.',
    steps: [
      { title: 'Request Trial One online', text: 'Tell us the days that suit your family; we’ll confirm a time.' },
      { title: 'Trial One', text: 'Safety, commands and rifle orientation. No shooting yet.' },
      { title: 'Trial Two', text: 'A longer session: setup, then your first coached shots.' },
      { title: 'Join a program', text: 'Placement by coach evaluation, not school grade.' },
    ],
    bringTitle: 'Before you come',
    bring: [
      'Arrive ten minutes early.',
      'Wear comfortable clothing and closed-toe shoes.',
      'Equipment guidance is provided.',
    ],
  },
  news: {
    eyebrow: 'Stay current',
    title: 'The latest at Sky Arc.',
    text: 'Tournament results, competition updates and announcements from the academy.',
  },
  gallery: {
    eyebrow: 'Inside the academy',
    title: 'Training in focus.',
    text: 'Practice, competition and the community behind every shot.',
  },
  testimonials: {
    eyebrow: 'Families',
    title: 'What families say.',
    text: 'Real words from Sky Arc families, shared with their permission.',
  },
  faq: {
    eyebrow: 'Questions',
    title: 'Good to know.',
  },
  hours: {
    eyebrow: 'Academy hours',
    title: 'Plan your training.',
    text: 'Regular weekday training hours, with flexible weekend access by arrangement.',
  },
}

export interface Rank {
  name: string
  range: string
  track?: string
}

export interface Level {
  id: 'launchpad' | 'foundations' | 'development' | 'performance'
  name: string
  stage: string
  headline: string
  text: string
  description: string
  focus: string[]
  experience: string[]
  includes: string[]
  ranks: Rank[]
}

export const LEVELS: Level[] = [
  {
    id: 'launchpad',
    name: 'Launchpad',
    stage: 'Supported start',
    headline: 'Learn the shot from the bench.',
    text: 'New athletes build safety habits and an engaging bench-supported shot process before moving into more demanding positions.',
    description: 'A welcoming first step where new athletes learn to enjoy the sport while building safe, responsible habits and a repeatable shot process.',
    focus: [
      'Range safety, handling, and responsibility',
      'Position, sight alignment, breathing, and trigger basics',
      'Confidence through early, earned progress',
    ],
    experience: [
      'Structured group coaching Monday–Thursday',
      'Consistent coaches and weekly skill-building',
      'Individual practice and private coaching available Friday–Sunday',
    ],
    includes: [
      'Safety and equipment orientation',
      'Bench-supported first shots',
      'Flexible attendance options',
      'Readiness-based evaluations',
    ],
    ranks: [{ name: 'Scout', range: 'Entry & foundation' }],
  },
  {
    id: 'foundations',
    name: 'Foundations',
    stage: 'Beginner',
    headline: 'Safety becomes instinct.',
    text: 'Athletes develop range awareness, equipment care, body control, and a reliable foundation for confident first shots.',
    description: 'Athletes strengthen their fundamentals, learn to evaluate their own technique, and turn a good shot into a repeatable process.',
    focus: [
      'Stable position and natural point of aim',
      'Sight alignment, breath control, and trigger control',
      'The Commit · Execute · Accept mental process',
    ],
    experience: [
      'Weekly group coaching with progressive skill goals',
      'Electronic scoring and performance-history review',
      'Coaching targeted to each athlete’s strengths and needs',
    ],
    includes: [
      'Reliable bench shot process',
      'Sight and trigger fundamentals',
      'Coach-guided position introduction',
      'Individual progress check-ins',
    ],
    ranks: [
      { name: 'Hunter Jr.', range: '150–175' },
      { name: 'Hunter', range: '175–200' },
    ],
  },
  {
    id: 'development',
    name: 'Development',
    stage: 'Intermediate',
    headline: 'Build a repeatable process.',
    text: 'Athletes sharpen position, natural point of aim, sight alignment, breathing, trigger control, and follow-through.',
    description: 'A development stage for more independent athletes refining precision, shot control, and competition-ready routines.',
    focus: [
      'Precision, consistency, and purposeful adjustment',
      'Performance journaling and goal setting',
      'Preparation for postal, CMP, and school competition',
    ],
    experience: [
      'Individualized training informed by SIUS target data',
      'Regular progress reviews and readiness markers',
      'Opportunities to develop under match conditions',
    ],
    includes: [
      'Independent shot process',
      'Multi-position development',
      'Structured skill drills',
      'Individual performance notes',
    ],
    ranks: [
      { name: 'Marksman Jr.', range: '200–225' },
      { name: 'Marksman', range: '225–250' },
    ],
  },
  {
    id: 'performance',
    name: 'Performance',
    stage: 'Advanced',
    headline: 'Train to compete.',
    text: 'Goal-based practice, match preparation, performance tracking, mental routines, and leadership for serious competitors.',
    description: 'Advanced athletes build performance under pressure, deepen competition experience, and follow the equipment pathway that fits their goals.',
    focus: [
      'Competition readiness and advanced performance',
      'Mental preparation, leadership, and mentorship',
      'National-stage and collegiate pathway development',
    ],
    experience: [
      'Sporter pathway: Sharpshooter and Expert',
      'Precision pathway: NCAA Precision',
      'Coach evaluation includes consistency and attitude',
    ],
    includes: [
      'Competition-focused coaching',
      'Mental performance routines',
      'Match planning and analysis',
      'Individual development plan',
    ],
    ranks: [
      { name: 'Sharpshooter', range: '250–275', track: 'Sporter' },
      { name: 'Expert', range: '275+', track: 'Sporter' },
      { name: 'NCAA Precision', range: 'Separate discipline', track: 'Precision' },
    ],
  },
]

export const PROGRAMS = {
  eyebrow: 'The Sky Arc growth path',
  title: 'Train with purpose.',
  text: 'Four program levels guide athletes from their first safe shot to advanced Sporter or NCAA Precision competition.',
  overview: {
    title: 'One path. Personal progress.',
    text: 'Every athlete is treated as an individual—not a number. Coaches use live electronic scoring, performance history, and direct observation to focus training where it matters most.',
    note: 'Rank scores reflect the academy’s 3×10 in-facility format. At advanced levels, score is only part of the picture: consistency, attitude, and coach evaluation matter too.',
  },
  labels: {
    focus: 'Training focus',
    experience: 'Program experience',
    ranks: 'Ranks',
    includes: 'Included',
    level: 'Level',
    score: 'Score (3×10)',
  },
  placement: {
    eyebrow: 'How placement works',
    title: 'Progress is more than a score.',
    steps: [
      {
        title: 'Train',
        text: 'Build safe, repeatable fundamentals in the athlete’s current program.',
        /** The step's parts, in a word each (from its sentence). */
        marks: ['Safety', 'Fundamentals', 'Repetition'],
      },
      {
        title: 'Demonstrate',
        text: 'Show technical consistency, responsible conduct, effort, and coachability.',
        marks: ['Consistency', 'Conduct', 'Effort', 'Coachability'],
      },
      {
        title: 'Advance',
        text: 'Move forward when score, readiness, and coach evaluation align.',
        marks: ['Score', 'Readiness', 'Coach evaluation'],
      },
    ],
  },
  pathways: {
    eyebrow: 'Advanced pathways',
    title: 'Choose the right competitive track.',
    text: 'Both pathways demand discipline and strong fundamentals. Their equipment, uniform standards, and long-term competition goals are different.',
    items: [
      { tag: 'Sporter', title: 'Sharpshooter & Expert', text: 'Continue developing advanced match performance within the regulated Sporter equipment class.' },
      { tag: 'Precision', title: 'NCAA Precision', text: 'Explore the specialized equipment and technical pathway used in collegiate and international-style competition.' },
    ],
    /** Where the Precision pathway leads (from its sentence). */
    leadsTo: ['Collegiate competition', 'International-style competition'],
  },
  rankMap: {
    eyebrow: 'Rank & program map',
    title: 'See where every rank belongs.',
    text: 'The program level is the training foundation. The rank shows an athlete’s progress within that foundation.',
  },
  tuition: {
    eyebrow: 'Tuition',
    title: 'Training & tuition.',
    text: 'Programs are organized by demonstrated skill and readiness rather than school grade. Placement begins with a trial session and coach evaluation.',
    rate: 'Current rates available by inquiry',
    cta: 'Request the tuition guide',
    note: 'We’re more than happy to discuss tuition. Send us an inquiry, and we’ll get back to you as soon as possible.',
    age: {
      title: 'Age informs placement. Skill drives progress.',
      text: 'Age does not automatically determine an athlete’s level, but it can affect physical readiness. Coaches consider safety habits, maturity, size, strength, coordination, and whether the athlete can comfortably support the rifle in each position.',
    },
  },
}

export const ABOUT = {
  eyebrow: 'Who we are',
  title: 'Built with purpose.',
  text: 'Sky Arc is a youth development academy where technical excellence, personal growth, and a genuine sense of belonging share the same target.',
  mission: {
    eyebrow: 'Our mission',
    title: 'Develop the athlete. Respect the process.',
    paragraphs: [
      'We believe young athletes do their best work when they feel safe, understood, appropriately challenged, and proud of the process behind their progress.',
      'Sky Arc creates a structured environment where athletes learn to focus under pressure, take ownership of their decisions, and improve with intention. Our coaches begin with fundamentals, observe the individual, and shape training around what that athlete needs next.',
      'Scores help measure progress, but they never tell the whole story. Confidence, discipline, resilience, judgment, and character are the qualities that make growth last—on the range and beyond it.',
    ],
  },
  quote: 'We coach the athlete behind the rifle—not only the score on the target.',
  promiseLine: {
    title: 'Teach the process. Build the person.',
    text: 'Sky Arc develops disciplined, confident athletes through safe instruction, purposeful practice, and individual accountability. We teach young people to remain composed, make thoughtful decisions, respect those around them, and carry those habits far beyond the range.',
  },
  valuesTitle: 'What guides every session.',
  valuesText: 'Our values are visible in how we teach, how athletes train, and how families experience the academy.',
  values: [
    { title: 'Safety', text: 'Every command, movement, and equipment habit begins with respect for the range and the people on it.' },
    { title: 'Discipline', text: 'Athletes learn that dependable results come from a calm, repeatable process—not rushed outcomes.' },
    { title: 'Growth', text: 'Coaching meets each athlete where they are and builds the next skill with purpose and patience.' },
    { title: 'Community', text: 'Coaches, athletes, and families work together to create a positive place to train and belong.' },
  ],
  principles: [
    { title: 'Safety first', text: 'Respect every command, person, and piece of equipment.' },
    { title: 'Process over pressure', text: 'Build calm, repeatable habits before chasing outcomes.' },
    { title: 'Ownership always', text: 'Understand each result and choose the next adjustment.' },
    { title: 'Character beyond sport', text: 'Carry discipline, resilience, and confidence into daily life.' },
  ],
  approach: {
    eyebrow: 'How we coach',
    title: 'Individual by design.',
    text: 'Athletes may share a range, but they do not all learn the same way or advance on the same timeline. Our coaching keeps the standards consistent while making the path personal.',
    items: [
      { title: 'See the athlete', text: 'We observe readiness, confidence, physical development, and learning style before deciding what comes next.' },
      { title: 'Build the process', text: 'Safety, position, breathing, sight alignment, trigger control, follow-through, and shot calling become connected habits.' },
      { title: 'Create ownership', text: 'Athletes learn to understand results, make thoughtful adjustments, and take responsibility for their progress.' },
    ],
  },
  promise: {
    eyebrow: 'Our promise to families',
    title: 'A place to grow with confidence.',
    items: [
      { title: 'Clear pathways', text: 'Families understand what athletes are learning, what progress looks like, and how readiness shapes the next step.' },
      { title: 'Thoughtful coaching', text: 'Feedback is specific, constructive, age-appropriate, and focused on what the athlete can act on.' },
      { title: 'Lasting development', text: 'We build habits and character that support competition goals without losing sight of the young person developing them.' },
    ],
  },
  team: {
    eyebrow: 'Meet the team',
    title: 'Experience that shapes every athlete.',
    text: 'Sky Arc brings together competition experience, certified instruction, military leadership, athlete development, and disciplined facility operations. Each team member contributes a distinct area of expertise to one shared standard.',
  },
}

export type GalleryCategory = 'training' | 'coaching' | 'competition' | 'community'

export const GALLERY = {
  eyebrow: 'The Sky Arc experience',
  title: 'In the moment.',
  text: 'A clear look at athlete growth, focused practice, competition, and the community behind every shot.',
  categories: [
    { id: 'all', label: 'All' },
    { id: 'training', label: 'Training' },
    { id: 'coaching', label: 'Coaching' },
    { id: 'competition', label: 'Competition' },
    { id: 'community', label: 'Community' },
  ] as { id: 'all' | GalleryCategory; label: string }[],
  empty: 'Photos are on their way.',
}

export type NewsCategory = 'results' | 'competitions' | 'announcements' | 'training'
export const NEWS = {
  eyebrow: 'News & updates',
  title: 'News from the range.',
  text: 'Tournament results, competition updates and announcements from Sky Arc.',
  categories: {
    results: 'Results',
    competitions: 'Competitions',
    announcements: 'Announcements',
    training: 'Training',
  } as Record<NewsCategory, string>,
  all: 'All',
  writtenNote: 'Posts appear in the language they were written in.',
  share: 'Share',
  copied: 'Link copied',
  more: 'More news',
  empty: 'News is on its way. Check back soon for results and updates from the range.',
  notFound: 'This post isn’t available.',
}

/** A question and its answer; `hours` answers with the hours the Website page sets. */
export interface FaqItem {
  q: string
  a: string
  hours?: boolean
}

export const FAQ: FaqItem[] = [
  {
    q: 'What age can my child start?',
    a: 'Placement is led by skill, safety and readiness, not school grade. Younger athletes start with bench support at Launchpad.',
  },
  {
    q: 'Does my child need any experience?',
    a: 'No. New athletes start with Trial One, which covers safety, range procedures and the rifle before any shooting. Launchpad then builds the shot process from the bench.',
  },
  {
    q: 'What should we bring?',
    a: 'Comfortable clothing and closed-toe shoes. Please arrive ten minutes early. Equipment guidance is provided.',
  },
  {
    q: 'How does the trial work?',
    a: 'Trial One introduces safety, range commands and the rifle, with no shooting. Trial Two is a longer, hands-on session with coached shots from a supported position. You request Trial One online and we confirm a time by email; afterwards we help you book Trial Two.',
  },
  {
    q: 'How much is tuition?',
    a: 'Current rates are available by inquiry. Ask us for the tuition guide and we’ll get back to you as soon as possible.',
  },
  {
    q: 'When are classes?',
    a: 'Ask us for the current class times, or see the hours on our Contact page.',
    hours: true,
  },
  {
    q: 'How do athletes move up?',
    a: 'Formal evaluations happen each quarter. Coaches may recommend an earlier evaluation when skill, safety and physical readiness support the next position.',
  },
  {
    q: 'Can my child compete?',
    a: 'Yes. Development athletes prepare for postal, CMP and school competition, and Performance athletes follow the Sporter or NCAA Precision pathway.',
  },
  {
    q: 'How will I know how my child is doing?',
    a: 'Parents log in to the Sky Arc portal to see class schedules, scores and progress reports, with notes from the coaches.',
  },
]

export const TRIAL = {
  eyebrow: 'Book a trial',
  title: 'Start with Trial One.',
  text: 'Trial One introduces the safety culture and essential knowledge needed before the hands-on Trial Two. Tell us the days that suit you, and we’ll confirm a time.',
  kinds: {
    // How long each trial runs is still to confirm with the academy: no length is shown until then.
    one: { name: 'Trial One', summary: 'Safety, commands and rifle orientation', minutes: null as number | null },
    two: { name: 'Trial Two', summary: 'Longer setup and hands-on coached shooting', minutes: null as number | null },
  },
  covers: {
    title: 'What Trial One covers',
    items: [
      { title: 'Safety', text: 'Core safety rules and the behavior expected whenever athletes enter the range.' },
      { title: 'Range procedures', text: 'Commands, preparation, movement, and how a safe training session flows.' },
      { title: 'Rifle information', text: 'Bare-bones equipment knowledge, responsible handling, and the purpose of key components.' },
    ],
  },
  two: {
    title: 'Now it gets hands-on.',
    text: 'Trial Two is a longer follow-up session because safe setup and coached shooting take time. Coaches review the safety rules and confirm every athlete is ready before anyone shoots.',
    items: [
      { title: 'Review and set up', text: 'Revisit commands, safe handling, and the lessons from Trial One before getting properly set up.' },
      { title: 'Get behind the rifle', text: 'Learn how to settle the rifle safely from a supported position, then experience sight alignment and trigger control.' },
      { title: 'Take coached shots', text: 'Take guided shots through age-appropriate target activities and simple challenges that make learning rewarding.' },
    ],
  },
  steps: {
    athlete: 'The athlete',
    time: 'Pick a time',
    family: 'Your details',
    confirm: 'Confirm',
  },
  fields: {
    firstName: 'Athlete’s first name',
    lastName: 'Athlete’s last name',
    grade: 'Grade',
    experience: 'Experience',
    parentName: 'Parent or guardian name',
    email: 'Email',
    phone: 'Phone',
    language: 'Language for our reply',
    notes: 'Anything we should know? (optional)',
    consent: 'I agree to the privacy policy.',
    privacy: 'Privacy policy',
  },
  grades: [
    ...Array.from({ length: 12 }, (_, i) => ({ id: String(i + 1), label: `Grade ${i + 1}` })),
    { id: 'other', label: 'Other' },
  ],
  experience: [
    { id: 'none', label: 'New to shooting' },
    { id: 'some', label: 'Some experience' },
    { id: 'competed', label: 'Has competed' },
  ],
  buttons: {
    continue: 'Continue',
    back: 'Back',
    book: 'Book Trial One',
    bookTwo: 'Book Trial Two',
    booking: 'Booking…',
    change: 'Change',
  },
  slots: {
    title: 'Open times',
    none: 'No open times this day.',
    noneWeek: 'No open times this week.',
    full: 'Full',
    closed: 'Closed',
    byArrangement: 'By arrangement',
    next: 'Next open',
    note: 'Times shown are open now, from the coaches’ availability and class sizes.',
    demo: 'Demo: these times are made up.',
    week: 'Week of',
  },
  done: {
    title: 'You’re booked.',
    emailed: 'We’ve emailed the details to',
    reference: 'Reference',
    calendar: 'Add to calendar',
    nextTitle: 'What happens next',
    next: 'After Trial One, we’ll email you a link to book Trial Two.',
    change: 'Need to change it? Use the link in the email, or contact us.',
    another: 'Book for another athlete',
  },
  trialTwo: {
    title: 'Done Trial One?',
    text: 'Book Trial Two with the link we emailed you, or enter your Trial One reference here.',
    reference: 'Trial One reference',
    find: 'Find my booking',
    found: 'Found it. Pick a time for Trial Two.',
  },
  errors: {
    required: 'Required',
    email: 'Enter a valid email',
    consent: 'Please agree to continue',
    slot: 'Pick a time',
    reference: 'Enter the reference from your email (SA-…)',
  },
}

export const CONTACT = {
  eyebrow: 'Start a conversation',
  title: 'Let’s connect.',
  text: 'Questions about programs, tuition, equipment, or placement? Send a message and it goes straight to the academy.',
  fields: {
    name: 'Parent or guardian name',
    email: 'Email',
    phone: 'Phone (optional)',
    student: 'Student age or grade',
    topic: 'What can we help with?',
    message: 'Message',
    language: 'Language for our reply',
  },
  topics: [
    { id: 'program', label: 'Program information' },
    { id: 'tuition', label: 'Tuition' },
    { id: 'trial', label: 'Trial session' },
    { id: 'competition', label: 'Competition pathway' },
    { id: 'range', label: 'Open range or private coaching' },
    { id: 'general', label: 'General inquiry' },
  ],
  send: 'Send message',
  sending: 'Sending…',
  sent: { title: 'Message sent.', text: 'Thanks. We’ll reply to', again: 'Send another message' },
  response: 'We’ll reply as soon as possible.',
  delivered: 'Your message goes straight to the academy.',
}

export const PORTAL = {
  eyebrow: 'For Sky Arc families',
  title: 'Your parent portal.',
  text: 'One login for schedules, scores, progress reports and academy news, on any device.',
  features: [
    { title: 'Classes', text: 'See upcoming classes and any changes.' },
    { title: 'Scores', text: 'Every result, with where the shots went.' },
    { title: 'Progress reports', text: 'Shared by the coaches after evaluations.' },
    { title: 'News', text: 'Announcements and results from the academy.' },
  ],
  cta: 'Log in to the portal',
  invite: 'Families get their login from the academy. Coaches and staff sign in here too.',
}

/**
 * The phone app (`/get-app`, the band on the homepage, the footer): what it does for families, in the stores' own words for
 * the stores. The credit line is the stores' required wording, in English on both pages.
 */
export const APP = {
  kicker: 'The Sky Arc app',
  title: 'Sky Arc on your phone.',
  text: 'Classes, scores, progress reports and academy news on your iPhone or Android phone, with a notification when something changes.',
  free: 'Free for Sky Arc families, students and coaches. Sign in with the email you gave the academy.',
  scan: 'Scan with your phone’s camera',
  features: [
    { title: 'Classes', text: 'Today’s class and the week ahead. Cancel one, or ask for a makeup.' },
    { title: 'Scores', text: 'Every result and where the shots went, with the trend over time.' },
    { title: 'Progress reports', text: 'The coaches’ reports, shared after evaluations.' },
    { title: 'Notifications', text: 'Class changes, makeups and academy news as they happen.' },
  ],
  band: {
    title: 'Get the Sky Arc app.',
    text: 'Classes, scores and progress reports on your phone, with a notification when something changes.',
    more: 'About the app',
  },
  footer: 'Get the app',
  appStore: 'Download on the App Store',
  googlePlay: 'Get it on Google Play',
  shots: ['Home: the next class', 'Scores', 'A progress report'],
  credit: 'Apple and the Apple logo are trademarks of Apple Inc., registered in the U.S. and other countries. App Store is a service mark of Apple Inc. Google Play and the Google Play logo are trademarks of Google LLC.',
}

export const FOOTER = {
  tagline: 'Focused athletes. Confident people.',
  text: 'Safe, disciplined training that builds strong fundamentals, resilience, and respect for the sport—from the first shot forward.',
  languageNote: 'Translations support reading access. Coaching, safety commands, and academy communication are conducted in English.',
  copyright: `© ${new Date().getFullYear()} Sky Arc Sports Academy. All rights reserved.`,
  privacy: 'Privacy policy',
  terms: 'Terms of service',
  help: 'Help',
  sections: { explore: 'Explore', visit: 'Visit', families: 'Families' },
}

export const NOT_FOUND = {
  title: 'Page not found.',
  text: 'The page you’re looking for has moved or doesn’t exist.',
}

/** Page titles, for the browser tab. */
export const TITLES: Record<string, string> = {
  '': 'Youth air rifle in Suwanee, GA',
  programs: 'Programs & tuition',
  about: 'About & coaches',
  gallery: 'Gallery',
  news: 'News',
  trial: 'Book a trial',
  contact: 'Contact',
  portal: 'Parent portal',
  '404': 'Page not found',
}
