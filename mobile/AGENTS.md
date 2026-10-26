# The Sky Arc phone app

Expo (SDK 57) and React Native, for iPhone first and Android too, forked from HyberCRM's phone app (HyberTec's other
product, which runs on the same tools). See `../CLAUDE.md` for the project's rules (one academy, its time zone, the audit
log, the brand, the permanent UI rules, commits) and `README.md` for running it.

## Expo changes with every SDK

APIs you remember may have been renamed, moved or removed. Before writing code that touches an Expo, EAS or React
Native API, read the docs for the SDK in `package.json`: https://docs.expo.dev/versions/v57.0.0/, and
https://docs.expo.dev/llms.txt for everything else. React Native Firebase uses its **modular** API (as the website's
Firebase SDK does): `import { collection, query, where, onSnapshot } from "@react-native-firebase/firestore"`.

## Commands

```bash
npx expo install <package>          # instead of npm install: picks the version that matches the SDK
npx expo start                      # the development server
npm run typecheck                   # the app, with the shared code it uses
npm run lint
```

From the repository root: `npm run iphone:sim` (the iPhone Simulator on the practice copy), `npm run iphone` (the
iPhone plugged into the Mac), and the rest in `../docs/running-the-apps.md`.

A package with native code needs a new build (`npm run iphone:sim -- --rebuild`): don't add one without asking.
Pure JavaScript packages are fine.

## How it is put together

```
app.config.ts          native configuration: ids, Firebase files, permissions, plugins (iOS 27 scene life cycle, signing)
src/app/               screens (Expo Router). Root gates: signed out → sign-in screens; a password account with an
                       unconfirmed email → verify-email; otherwise (app)/, which reads the academy's member doc for the
                       person's email (BranchProvider) and opens the part of their one role.
  (app)/(staff)/       owners, admins and coaches (each seeing what the rules give their role): (tabs) Home · Schedule ·
                       Scan · Students · More for the office, Home · Schedule · Availability · Scan · More for coaches
                       (their Students is More's first row); More's pages (more/: students, coaches, payroll, account,
                       notifications, security); and the screens that open over the tabs (class/[id], coach/[id] and
                       availability-day sheets, student/[id] and student/calendar, score/[id], file/[id], news/ the
                       academy's announcements (the list, news/[id] a post with its comments, news/attachment a post's
                       file), inbox the person's notifications (Home's bell), drive/ the Drive (the top, drive/[id] a
                       folder), reports/ every progress report and report/[id] one, with sharing a draft, and the Scan
                       screens). Its layout anchors (tabs), so a link straight to one of these has the tabs beneath.
                       Addresses the family's part also has ("/reports") are named with their group from inside a tab
                       ("/(app)/(staff)/reports"): from there the router would pick the family's.
  (app)/(family)/      parents and students (a parent their children, a student themself): (tabs) Home · Classes ·
                       Scores · Reports · More, and what opens over them (session/[id] a class's sheet, score/[id] a
                       score to look at, file/[id] its original, report/[id] a progress report, news/ the academy's
                       news: the list, news/[id] a post, news/attachment a post's file); FamilyProvider holds whose
                       they are and the child a parent chose
  (app)/no-access      an email the academy hasn't added (opens the app by itself once it does)
src/state/             AuthProvider (Google, email + password, verification), BranchProvider (the academy: settings,
                       rules, time zone, member, staff record, the actor for the audit log), AppearanceProvider
src/features/<area>/   each area's data and components: data (live Firestore hooks, asking for what the person's role
                       may read; useClassesBetween, a range's classes with their students and the coaches in), schedule
                       (classes.ts; the week strip; ClassCard, a class laid out like the academy's sheets; ClassRow, a
                       class in a list; parts.tsx, the level and label colours, the seats taken, the coaches in, who's
                       in; api.ts, the office's marks), students, drive (downloading a Drive
                       file through the Storage rules; FileView, a file full screen, the staff's and the family's), scan
                       (reading a card, the card and bull views, saving), scores (a score's changes, its shots played
                       back, playback.ts; ScoreParts, what the staff's and the family's score screens both show;
                       CompareCard, a score side by side with another of its position; MiniTarget, a list's small
                       target), access, account (deleting an account), family (what a family reads: their students,
                       classes, scores and shared reports, and the academy's news (news.ts); the child switcher; their
                       classes (classes.ts: brothers and sisters in the same class together) and the class cards; the
                       Classes tab's months (ClassMonth), each child in their colour (tints.ts); a
                       score's row, a post's row and a student's figures), reports (a progress report's figures and
                       charts), announcements (a post's content, read from the website's editor's HTML into blocks
                       (html.ts) and drawn with the app's own text (RichText); its dates and what it holds; PostParts,
                       a post as both portals show it; the staff's posts and what they've read (staffNews.ts) and a
                       post's comments (comments.ts, PostComments)), notifications (the person's inbox and Home's
                       bell), home (a coach's to-do and time clock on Home), availability (a coach's days: the clean
                       month calendar's day (CalendarDay), the day sheet (DayEditor: available or not, the time wheels,
                       Repeat), Copy last week, and the writes with the website's checks (api.ts, from
                       `@shared/availabilityWrites`)), pay (a coach's pay lines from `@shared/pay/lines`, the period
                       chooser), drive (also the staff's Drive: its index, actions, photos added to a folder),
                       reports (also the staff's list, a report's staff card and sharing), account (also a coach's
                       details, notification switches and the sign-in methods, SignInSecurity, for every role)
src/components/        the shared building blocks (Text `T`, Button, Card, ListSection/ListRow, Field, Badge, Avatar,
                       EmptyState, SegmentedControl, FilterChips, Skeleton, Screen, TabHeader, SectionTitle,
                       SearchField, Dialog, IconButton, DatePickerDialog, MonthScroller, TimeWheel, FactRow, SwitchRow,
                       DateField, ContactButtons, SwipeToDelete, ActionSheet, ToastHost, Hatch (an open seat's lines),
                       ZoomCanvas and ZoomScrollView: every zoomable picture and the page around it) and brand/ (the
                       official logos)
src/lib/               firebase, firestore hooks (useDoc, useQuery), callables (api.ts), audit, links (the website,
                       call/text/email, a link the website saved as the practice copy's phones reach it), toast, Google
                       sign-in, env
src/theme/             the website's neutral palette in light and dark with Sky Arc's red, status colors, spacing, type
../shared/src          the business logic the website and the Cloud Functions use, imported as @shared/...
```

## Rules

- **Business logic comes from `@shared`**: the academy's time zone (`@shared/time`), settings (`resolveSettings`),
  rules (`resolveBusinessRules`), roles, people, schedule statuses, the Drive, scores (`@shared/shooting`). Never
  re-implement a rule in the app; if one is missing, add it to `shared/` (pure TypeScript, unit-tested) so the website
  and the functions use the same one.
- **The academy's time zone only.** "Today", dates and times come from the academy's IANA zone
  (`useBranch().timezone`) through `@shared/time`, never the phone's zone. Dates are `dateKey` strings plus minutes, as
  on the website.
- **The server is the authority.** Firestore and Storage rules enforce every rule; the app mirrors them so people
  aren't surprised. Callables are the website's own (`sendAccountEmail`, `deleteMyAccount`).
- **One academy.** Its data lives under `branches/skyarc` (`ACADEMY_ID`); there is no branch chooser. People never see
  "branch".
- **Audit log:** every change the app makes adds an entry in the same batch (`src/lib/audit.ts`, `via: "app"`), as the
  website does.
- **Files of minors:** Drive files are read through the Storage rules (`src/features/drive/download.ts`), never through
  download links (`getDownloadURL`), and live in the app's cache only. A news post's attachments open the same way
  (`useStorageCopy`); the pictures in its text show from the links the website's editor put there, as the website shows
  them.
- **Look:** the website's shadcn neutral theme, light and dark (`useColors()`), on the grouped background of the
  phone's own list screens; Sky Arc's red (`colors.brand`) only as an accent. Use the shared components; a new
  reusable one goes in `src/components/` with its own file.
- **Logos:** only the official files (CLAUDE.md, "Brand and logos"), through `src/components/brand/SkyArc.tsx`:
  `SkyArcLogo` (the full logo: sign-in screens, loading), `SkyArcLockup` (the square icon with the wordmark: the top of
  the navigation) and `SkyArcMark` (the square icon). `src/components/brand/files.ts` holds the official SVG files as
  they are; `npx tsx scripts/brand-icons.ts` writes it and the app's icon and splash images. Never redraw, recolour or
  retype the logo.
- **Icons from `lucide-react-native`**: the phone app's version of the website's react-icons rule (react-icons doesn't
  run in React Native; lucide is the same set as the website's `react-icons/lu`). The tab bar uses the phone's own
  symbols (SF Symbols on iPhone, Material on Android).
- **Words:** Coach (not tutor), Class (not session; a class is its own record, one time on one day with its seats, and
  each student in it is a session), Academy (not branch or center), Position = Standing / Kneeling / Prone. Sentence
  case, plain words, English only for now (Korean and other languages come in one pass later).
- **Classes are taught together** (`docs/DECISIONS.md` §21): a class is `classes/{id}`, and `/class/[id]` opens it by
  that ID; its students are the sessions with its `classId`; its coaches are everyone in at its time (who's in: each
  person's availability that day). The shared `classViews` and `coachesIn` (`@shared/schedule/classes`) put them
  together, as on the website. **Never read a seat's `coachId`** (production's seats keep their class's lead coach only
  for the 1.0 build, until `scripts/lead-coach.ts --clear`). A student's level and a seat's label take the shared
  colours (`@shared/schedule/seatColors`), light and dark. The office marks students (Coming, Here and No-show on the
  day, Canceled) as the website does (`src/features/schedule/api.ts`); every other change is the website's.
- **Month calendars scroll vertically through months**, like the iOS Calendar app (permanent rule): never a static
  month with ‹ › arrows, including date pickers (`DatePickerDialog`, `MonthScroller`). Their weeks start on Sunday, as
  calendars do; the academy's week (the schedule's week strip, "this week") runs Monday to Sunday
  (`settings.general.weekStartsOn`).
- **Never name the AI model or provider** (permanent rule): it is always "AI".
- Every route loads its record by ID (links and the back gesture always work). Every interactive element gets an
  `accessibilityLabel` when it has no text, and screens and key controls a `testID` (the Maestro flows use them).
- **No new accounts in the app:** the academy invites people on the website. Signing in is Google or an email and
  password, with Forgot password.
- **Zoomable pictures** use `ZoomCanvas` (in a page: `ZoomScrollView`, or `Screen zoomable`): it follows each finger,
  so a hand's late second finger or first-lifted one never makes the picture jump, and the page waits for it natively.
  Test a gesture as a hand does it (the second finger landing late, one lifting first), not only both at once.
- **A coach's queries ask for what the rules give a coach** (every class, every seat and everyone's availability, so
  they see all the academy's classes and who's in with them; their own staff record only, so other people's names come
  from who's in, `availability.staffName`; never `students/{id}/private`): a query the rules would refuse fails whole
  (`src/features/data/hooks.ts`).
- **A coach's availability** is the website's: one record a day (`availability/{staffId}_{dateKey}`), holding times or
  "not available" (an answer: the day no longer counts as one to set), removed when the day is cleared, written through
  `@shared/availabilityWrites` with their name and role (`staffName`, `staffRole`: the other coaches see who's in with
  them) and the audit entry; days inside the lock window are the admin's (the rules refuse them). A save asks first
  when classes would be left with no coach in (`classesLeftUncovered`), then returns at once (the server confirms in
  the background) and waits for the question's alert to leave before closing the sheet.
- **Circles** (a day, a dot, an avatar with a fill) take `radius.full`: with a radius of exactly half their size,
  Android drew some fills as squares.
- **The staff's announcements and notifications** are the website's queries: a coach's posts are the two the rules can
  check (`where("audienceType", "==", "all")` and `where("audienceKeys", "array-contains", email)`, merged), the
  office's every post not archived; their own read receipts (collection group `reads` by email: a coach opening a post
  writes theirs once, owners and admins none, as on the website); a post's comments (the staff's only); and their
  notifications (`recipientKey` = their email, the newest 100). Marking a notification read stamps the phone's time, so
  it shows read at once, offline too (`src/features/announcements/staffNews.ts`, `src/features/notifications/inbox.ts`).
- **A family's queries ask for one student at a time** (`where("studentId", "==", id)`, for each linked student:
  classes, scores, shared reports), never staff records, class records (a class's note is for the coaches), who's in or
  the Drive's lists: a class shows no coach to a family (every coach in teaches it), and a score's file is read by its
  ID, which the rules allow only for a score's own file in their child's
  folder (`src/features/family/data.ts`). The family's screens show only their own students' records, whatever the
  phone's copy still holds from another account. The academy's news is one query, exactly as the rules allow it
  (`where("families", "==", true), where("archived", "==", false)`, no order: the phone sorts, pinned first), plus the
  person's own read receipts (collection group `reads` by their email); opening a post writes their receipt once, with
  only the fields the rules allow (`src/features/family/news.ts`). Families never see a post's comments.
- **A post's content** is the website's editor's HTML: the app reads it into its own blocks and draws them with its own
  text and colours (`src/features/announcements/`), never in a web view and never running anything in it; links open in
  the phone's browser (or its mail and phone apps).
- **Permissions:** the camera and the photo library, for the Scan tab only (texts in `app.config.ts`). A new
  permission means new questions from both stores (docs/publishing.md).
