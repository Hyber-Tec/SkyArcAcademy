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
                       Scan · Students · More, and the screens that open over them (class/[id] and coach/[id] sheets,
                       student/[id], score/[id], file/[id], and the Scan screens)
  (app)/(family)/      parents and students (a parent their children, a student themself): (tabs) Home · Classes ·
                       Reports · More, and what opens over them (session/[id] a class's sheet, report/[id] a progress
                       report); FamilyProvider holds whose they are and the child a parent chose
  (app)/no-access      an email the academy hasn't added (opens the app by itself once it does)
src/state/             AuthProvider (Google, email + password, verification), BranchProvider (the academy: settings,
                       rules, time zone, member, staff record, the actor for the audit log), AppearanceProvider
src/features/<area>/   each area's data and components: data (live Firestore hooks, asking for what the person's role
                       may read), schedule (classes, the week strip, class cards), students, drive (downloading a Drive
                       file through the Storage rules), scan (reading a card, the card and bull views, saving), scores (a score's changes, its shots played
                       back; playback.ts), access, account (deleting an account), family (what a family reads: their
                       students, classes and shared reports; the child switcher; the class cards), reports (a progress
                       report's figures and charts)
src/components/        the shared building blocks (Text `T`, Button, Card, ListSection/ListRow, Field, Badge, Avatar,
                       EmptyState, SegmentedControl, FilterChips, Skeleton, Screen, TabHeader, SectionTitle,
                       SearchField, Dialog, IconButton, DatePickerDialog, MonthScroller, ContactButtons, SwipeToDelete, ActionSheet, ToastHost,
                       ZoomCanvas and ZoomScrollView: every zoomable picture and the page around it) and brand/ (the
                       official logos)
src/lib/               firebase, firestore hooks (useDoc, useQuery), callables (api.ts), audit, links (the website,
                       call/text/email), toast, Google sign-in, env
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
  download links (`getDownloadURL`), and live in the app's cache only.
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
- **Words:** Coach (not tutor), Class (not session; a class is the sessions of one coach at one time, one per student),
  Academy (not branch or center), Position = Standing / Kneeling / Prone. Sentence case, plain words, English only for
  now (Korean and other languages come in one pass later).
- **Month calendars scroll vertically through months**, like the iOS Calendar app (permanent rule): never a static
  month with ‹ › arrows, including date pickers (`DatePickerDialog`, `MonthScroller`).
- **Never name the AI model or provider** (permanent rule): it is always "AI".
- Every route loads its record by ID (links and the back gesture always work). Every interactive element gets an
  `accessibilityLabel` when it has no text, and screens and key controls a `testID` (the Maestro flows use them).
- **No new accounts in the app:** the academy invites people on the website. Signing in is Google or an email and
  password, with Forgot password.
- **Zoomable pictures** use `ZoomCanvas` (in a page: `ZoomScrollView`, or `Screen zoomable`): it follows each finger,
  so a hand's late second finger or first-lifted one never makes the picture jump, and the page waits for it natively.
  Test a gesture as a hand does it (the second finger landing late, one lifting first), not only both at once.
- **A coach's queries ask for what the rules give a coach** (their classes by `coachId`, their own staff record, never
  `students/{id}/private`): a query the rules would refuse fails whole (`src/features/data/hooks.ts`).
- **A family's queries ask for one student at a time** (`where("studentId", "==", id)`, for each linked student), never
  staff records, evaluations or the Drive: the coach's name comes from the class itself (`src/features/family/data.ts`).
- **Permissions:** the camera and the photo library, for the Scan tab only (texts in `app.config.ts`). A new
  permission means new questions from both stores (docs/publishing.md).
