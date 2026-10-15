# HyberCRM review and the Sky Arc fork plan

> **Status: for Goo's confirmation (2026-10-15).** Nothing large is deleted or restructured until Goo confirms
> (brief §2). Answers go to [`DECISIONS.md`](DECISIONS.md), which wins over this document.
>
> **Sources.** HyberCRM `main` at `d659d34` (2026-10-05), read-only and never built or run here; the brief; the
> Oct 13 meeting notes; the client assets (4 weekly schedule sheets, 10 SIUS PDFs, 10 paper-target photos, 2 logos).
> No real student names appear in this document.

## Contents

0. [Summary](#0-summary)
1. [HyberCRM at a glance](#1-hybercrm-at-a-glance)
2. [Feature map: Keep / Adapt / Remove / New](#2-feature-map-keep--adapt--remove--new)
3. [Multi-branch: one fixed academy](#3-multi-branch-one-fixed-academy)
4. [Terminology](#4-terminology)
5. [Data model changes](#5-data-model-changes)
6. [Scheduling](#6-scheduling)
7. [Employees, kiosk, time entries, payroll](#7-employees-kiosk-time-entries-payroll)
8. [Progress reports and the SIUS PDFs](#8-progress-reports-and-the-sius-pdfs)
9. [Parents, Korean + English, notifications, announcements](#9-parents-korean--english-notifications-announcements)
10. [Design system and branding](#10-design-system-and-branding)
11. [Security and minors' data](#11-security-and-minors-data)
12. [Testing and CI](#12-testing-and-ci)
13. [How the fork is done: the pull requests](#13-how-the-fork-is-done-the-pull-requests)
14. [Risks](#14-risks)
15. [Questions for Goo](#15-questions-for-goo)

---

## 0. Summary

HyberCRM fits Sky Arc well below the surface: the app shell, sign-in, roles, settings engine, audit log, schedule
grid, availability calendar, employees, kiosk, payroll, announcements and notifications all carry over with
relabeling. What doesn't carry over is everything built around **tutoring**: session logs (which today also drive
attendance, payroll and student hours), the AI-written progress reports, subjects, school records and conferences.
Sky Arc's three priorities are mostly **new work on top of the kept core**:

| Priority | What HyberCRM gives us | What we build |
|---|---|---|
| 1. Scheduling | The grid (coaches as rows, Day / Week / Month, side rail), conflicts, capacity lanes, opening hours by date, events with every-N-weeks recurrence, trash, audit, notifications | Recurring weekly classes (slots + enrollments + a generator), parent cancellation with admin notification, makeups that parents book themselves, a public `/trial` booking page, coach rotation (alternating Sundays) and shifts derived from classes, attendance marking |
| 2. Employees, payroll, kiosk | Directory, calendar, pay rates, pay periods, payroll pages, time entries, auto clock-out, the kiosk PIN flow | A kiosk that is its own locked identity, stronger PIN hashing with attempt limits, an hourly pay model, rates priced by their effective date |
| 3. Progress reports | The draft→published lifecycle, parent-only read rules, view receipts, list page, line charts | File-based reports: SIUS PDF parser and bulk-upload review, paper-target photos, an in-browser viewer, score trend per position, compare two reports, parent notifications |

**Findings that change the brief's assumptions:**

- **SIUS PDFs carry no shooter name and no position** (every sample says "Air Rifle 60"). The upload review
  therefore *suggests* the student (file-name words matched to the roster, ranked by who was booked at that time)
  and the position (from the file name) for the admin to confirm (§8.1). They do carry every score, the group
  statistics and enough per-shot data to rebuild each shot's position, so grouping and miss-direction analysis is
  possible.
- **One SIUS PC's clock is 3 hours behind**, and "20 shot" files are sometimes sighters only (Total 0) or 21–22 shots.
- **The weekly sheets name no coaches**, and blocks hold 5 students; days pair in nine different ways, not just
  Mon/Wed or Tue/Thu (§6).

**Recommendations** (each explained below):

1. **Fork by copying, then stripping**, in one pull request with two commits: an exact import of HyberCRM `d659d34`
   (minus the phone app, landing page, live demo and docs) and then the Sky Arc changes, so the second commit *is*
   the difference from HyberCRM.
2. **Keep one fixed academy internally** (`branches/skyarc`) instead of ripping out multi-tenancy. "Branch" is the
   outer layer of every security rule and every Cloud Function path; removing it means rewriting the rules that
   protect minors' data (§3). Hide all branch and Super Admin UI, and **flatten the URLs** to `/admin`, `/coach`,
   `/parent`, `/kiosk`, `/trial`.
3. **Rename what people see and what is stored as a value** (role `tutor` → `coach`, `/tutor` → `/coach`, every
   label), but not internal field and collection names (`sessions` stays the collection behind "Class"). The
   database is empty, so persisted values cost nothing to rename now.
4. **Remove** the Super Admin platform, landing page, live demo, inquiries, session logs, AI report writing,
   subjects, school and conference features, and tutoring-hours billing.
5. **Fix on the way:** HyberCRM's `storage.rules` admin check is stale (only a Super Admin passes it), uploaded
   files are shared through public download links, the kiosk runs inside a signed-in admin's browser, PIN hashes
   use no secret, and parents can read staff-only fields. None of these may reach Sky Arc, whose files and records
   concern minors (§11).

**Before the fork starts**, §15 lists what Goo needs to confirm. The top ones: the plan itself (fixed academy,
flattened URLs, removals), whether HyberTec keeps a support login, the owners' sign-in emails and the email
sender. (The time zone is known: the academy is in Suwanee, GA, so America/New_York.)

---

## 1. HyberCRM at a glance

- **What it is.** A multi-tenant CRM for tutoring centers, remade from the True Education CRM, built 2026-10-01 to
  10-05 (65 commits, all `goochoi913`). Each center is a **branch** under a Super Admin.
- **Size.** `web/src` 254 files / 43K lines; `shared/src` 74 / 10K (180 unit tests); `functions/src` 17 / 2.2K
  (29 Cloud Functions); `mobile/src` 136 / 15K; `scripts` 19; `tests` 11 (56 rules tests, 7 e2e scenarios and 22 flows).
- **Stack.** React 19.3, React Router 7.18 (data router, lazy routes), Vite 8.3, TypeScript 6.0, Tailwind 4.3 +
  shadcn (style `radix-nova`, neutral, 40 components; icons from `react-icons/lu`), Firebase JS 12.19, sonner,
  date-fns, TipTap (announcements), DOMPurify, motion, Geist font. Functions: firebase-functions 7.4 (v2 API,
  `us-central1`), firebase-admin 14.5, nodemailer (Gmail SMTP), Node 22, bundled by esbuild. Mobile: Expo 57.
- **Layout.** Four npm projects (root, `web`, `functions`, `mobile`) with their own lockfiles; `shared/` is pure
  TypeScript (no React, no Firebase) imported as `@shared/*` by web (Vite alias), functions (esbuild bundle) and
  mobile (Metro).
- **Pages.** `web/index.html` (landing, pre-rendered), `web/app.html` (every portal), `web/demo.html` (the app on
  in-browser stand-ins for Firebase). Hosting sends `/` to the landing page and every other path to `app.html`.
- **Data.** Everything for a center lives under `branches/{branchId}/…` (23 collections). Root: `platformAdmins`,
  `branches`, `users` (+ `devices`, server-only `private`), `inquiries`. Identity is
  `branches/{b}/members/{emailLower}` with exactly one role (`owner | admin | tutor | parent | student`); access
  follows the **verified** email only.
- **Security.** 542 lines of Firestore rules, no catch-all rule, money and lifecycle writes through callables or
  transactions, append-only audit log, past-day and pay-period locks enforced by the rules.
- **Deploys.** From a developer's machine only (`npm run deploy`), from an up-to-date `main`. CI checks typecheck,
  unit tests, builds, rules tests and the phone app's lint; e2e and web lint aren't in CI.
- **Docs drift.** `DATA_MODEL.md` and `BRANCH_SETTINGS.md` disagree with the code in places (e.g. members status
  `active|disabled`, kiosk PIN storage, several setting defaults). For the fork, **`shared/src/types.ts` and
  `shared/src/settings/defaults.ts` are the truth.**

---

## 2. Feature map: Keep / Adapt / Remove / New

**Keep** = carried over with relabeling only. **Adapt** = carried over and changed for Sky Arc. **Remove** = not
carried over. **New** = built for Sky Arc.

### App, sign-in and access

| Feature | HyberCRM | Verdict | For Sky Arc |
|---|---|---|---|
| Routing, guards, providers | `web/src/app/*`, `auth/AuthProvider.tsx`, `branch/BranchProvider.tsx` | Adapt | Fixed academy, flattened URLs, `/coach`, `/trial`, parent pages, locked `/kiosk` |
| Portal shell and nav | `portals/{nav.ts,PortalLayout.tsx}` | Adapt | Coach and parent navs; notification bell for admins and parents too; language switch |
| Shared widgets | `components/app/*` (ConfirmDialog, DatePicker, MonthScroller, ItemMenu, OptionPicker, PageHeader, TimeSelect, ThemeToggle, UserMenu…) | Keep | UserMenu loses "Switch branch", gains Language; `TimeZonePicker` hidden |
| "View as" | `components/app/ViewAs.tsx` (Super Admin only) | Adapt | Owner and admins preview the coach and parent views |
| Sign-in pages | `pages/public/{Login,SignUp,VerifyEmail,ForgotPassword,AuthAction,GoogleButton,authParts}.tsx` | Keep | **Google and email/password sign-in and sign-up** carry over as they are; rebrand; Korean + English |
| App resolver, root page | `pages/public/{AppResolver,RootRoute,Landing}.tsx` | Adapt | Always opens the academy; `/` is the placeholder homepage (added in #1) |
| Account (people, invites) | `features/access/{AccountPage,MemberDialog,invites,api}.tsx`, `functions/src/invites.ts` | Adapt | Owner Sunny, admin Matt; Korean + English invite emails; sender per §15 |
| Access Control | `features/access/AccessControlPage.tsx` | Keep | Per-admin restrictions (pay rates, payroll, time entries, access control) |
| Sign-up requests | `features/signup/BranchSignupPage.tsx`, `features/access/SignupShare.tsx` | Adapt | Coach and parent requests, Korean + English; separate from the public trial page |
| Super Admin platform | `pages/platform/*` (8 files), `functions/src/platform.ts`, `shared/src/{branchFactory,slug}.ts` | Remove | A seed script creates the one academy; see §3 for support access |
| Landing page, live demo, inquiries | `web/src/landing/*`, `web/src/demo/*`, `shared/src/demo/*`, `functions/src/{demoLive,inquiries}.ts` | Remove | The inquiry endpoint's bot protection is the pattern for `/trial` |

### Scheduling

| Feature | HyberCRM | Verdict | For Sky Arc |
|---|---|---|---|
| Schedule grid and views | `features/schedule/{SchedulePage,ScheduleRail,DaySection,SessionCard,MonthView,WeekEventHeader}.tsx` | Adapt | Class-block cards with a fill meter (4/5), roster, MU and Trial chips; no log marks |
| Class records and writes | `features/schedule/api.ts`, `shared/src/types.ts` (`Session`), rules for `sessions` | Adapt | One record per student per class, plus `kind`, `slotId`, `enrollmentId`, `makeupFor`, cancellation fields (§5) |
| Conflicts and capacity | `shared/src/schedule/{conflicts,lanes}.ts`, `settings/businessRules.ts` | Adapt | Capacity per class and per coach, set by the owner in Settings (today: Super Admin only, max 6) and enforced on the server |
| Class dialog | `dialogs/{SessionDialog,SubjectPicker}.tsx` | Adapt | Level instead of subject; "every week" creates an enrollment |
| Duplicate week, copy/paste, drag, menus | `dialogs/DuplicateDialog.tsx`, `dragState.ts`, `ItemMenu` | Keep | Fallback for one-off changes |
| Events and recurrence | `shared/src/schedule/events.ts`, `eventsApi.ts`, `EventDialog.tsx` | Keep | Tournament and closure presets; `occursOn` drives the coach rotation |
| Opening hours by date | `dialogs/DayEditDialog.tsx`, `settings/{DateHoursCard,dateHoursApi}`, `dayConfigs` | Keep | Seed Sky Arc's hours (§6) |
| Trash, coach order, auto-confirm | `TrashDialog`, `TutorOrderDialog`, `functions/src/jobs.ts`, `autoConfirmSessions` | Keep | Generated weekly classes can start confirmed |
| Schedule notices | `shared/src/schedule/notify.ts`, `functions/src/{sessionNotify,notify}.ts` | Adapt | Admins and parents receive notices too, not only coaches |
| Coach schedule, family calendar | `TutorSchedulePage`, `TutorWeekList`, `TutorSessionSheet`, `StudentMonthCalendar` | Adapt | Show the coach's shift; parents get Cancel and Book makeup |
| No-show hour billing | `shared/src/schedule/hours.ts` | Remove | Tutoring-hours ledger |
| Recurring weekly classes | — | **New** | `classSlots` + `enrollments` + an idempotent generator |
| Parent cancellation, makeups | — | **New** | `cancelClass` and `bookMakeup` callables, cutoff rules, makeup credits, admin notification |
| Public trial booking | — | **New** | `/trial` in Korean + English with real availability |
| Coach rotation, derived shifts | — | **New** | Every-N-weeks patterns for any staff; shift = first class − 30 min to last class end |
| Attendance | — (today set by session logs) | **New** | Mark present / absent, also after the day ends |

### Employees, kiosk, payroll

| Feature | HyberCRM | Verdict | For Sky Arc |
|---|---|---|---|
| Directory, detail, calendar | `features/employees/{EmployeeDirectoryPage,EmployeeDetailPage,EmployeeCalendarPage,HoursCalendar}.tsx` | Adapt | Coach labels; calendar modes Paid and Expected shift |
| Availability | `features/availability/*`, `shared/src/availability.ts` | Adapt | Shifts may start before class hours; add time off |
| Pay rates, pay gaps | `PayRatesPage`, `PayRateFields`, `compensation.ts`, `rateDraft.ts`, `payGaps.ts`, `shared/src/pay/rates.ts` | Adapt | One hourly rate; price each shift with the rate in effect on its date |
| Kiosk | `features/timeclock/{KioskPage,KioskPinCard}.tsx`, `functions/src/{index,pins}.ts` | Adapt | Own identity, locked to `/kiosk`; HMAC PIN hashing with a secret; attempt limits (§7) |
| Time entries, auto clock-out | `TimeEntriesPage`, `ShiftDialog`, `timeclock/api.ts`, `autoClockOut` | Keep / Adapt | Drop "Pay as"; approval per §15 |
| Pay periods, payroll | `PayPeriodsDialog`, `PayrollPage`, `TutorPayrollPage`, `shared/src/pay/*` | Adapt | Hourly model; read locked snapshots back; one pricing function in `shared/` |
| Subjects catalog | `SubjectsPage`, `subjectsApi.ts`, `shared/src/subjects.ts` | Remove | Possibly reused for student levels (§15) |

### Students, parents, reports

| Feature | HyberCRM | Verdict | For Sky Arc |
|---|---|---|---|
| Student directory and profile | `features/students/{StudentDirectoryPage,StudentProfilePage,InfoTab}.tsx`, `profile/*` | Adapt | Weekly classes column, Trial status, latest and best score per position, emergency contact |
| Sessions, School, Conference tabs | `SessionsTab`, `SchoolTab`, `ConferenceTab` | Adapt / Remove / Remove | A "Classes & results" tab |
| Parent portal | `features/family/*` | Adapt + **New** | Upcoming classes, cancel, makeups, reports, news, notifications; Korean + English |
| Student portal | `features/family/FamilyPages.tsx` | Keep (dormant) | The student role comes with the phone app |
| Session logs | `features/sessions/**`, `shared/src/sessions/*`, `functions/src/sessions.ts` | Remove | First replace what depends on them: attendance, payroll, student history, Home badges |
| Report lifecycle, rules, receipts | `progressReports` rules, `functions/src/reports.ts` (share, viewed) | Adapt | Draft → published, parents read only their children's published reports |
| Report list, editor, viewer | `features/reports/{ProgressReportsPage,ReportEditorPage,ReportPage}.tsx` | Adapt | Library by date / position / source; detail and publish; PDF-page and photo viewer |
| AI report writing, 3-page document | `shared/src/reports/{facts,status,template,prompt,check,compose}.ts`, `ReportDocument.tsx`, `NewReportDialog.tsx`, `functions/src/ai.ts` | Remove | An AI summary may return later, named only "AI" |
| Charts | `reports/charts.tsx`, `students/profile/charts.tsx` (inline SVG, no library) | Adapt | Score trend per position, compare view |
| SIUS upload, paper photos, compare | — | **New** | §8 |

### Communication, home, settings

| Feature | HyberCRM | Verdict | For Sky Arc |
|---|---|---|---|
| Announcements | `features/announcements/*`, `functions/src/announcements.ts` | Adapt | Parents as an audience; Tournament category; Korean + English reader; files without public links |
| Public news feed | — | **New** (later) | A server-maintained public copy for the future website |
| Notifications | `features/notifications/NotificationBell.tsx`, `functions/src/{notify,push}.ts`, `shared/src/comms.ts` | Adapt | Bell for admins and parents; new types; text rendered in the reader's language |
| Audit log, activity toasts | `lib/audit.ts`, `features/audit/*` | Keep | Parent actions go through callables that write the audit entry |
| Admin Home | `features/home/*` | Adapt | Today by class block; Needs-you: cancellations, makeups, trials, full classes, time entries |
| Coach Today and Profile | `features/tutor/{today,profile}/*` | Adapt | Grouped by class block; attendance instead of logs; no subjects |
| Settings engine | `features/settings/*`, `shared/src/settings/*` | Adapt | Remove tutoring sections; add Classes, Cancellations, Makeups, Trials, Reports, Language (§5) |
| i18n | — | **New** | Korean + English on parent and public screens (§9) |

---

## 3. Multi-branch: one fixed academy

### How deep "branch" goes

| Where | Evidence |
|---|---|
| Firestore rules | Every helper takes the branch (`isMember(b)`, `isAdmin(b)`, …); all 38 document matches sit under `match /branches/{b}`; about 131 lines refer to it |
| Cloud Functions | 12 of 17 files; every trigger path is `branches/{branchId}/…`; every callable takes `branchId` |
| Web | 131 of 256 files (1,058 lines); `useBranch()` in 95 files; 175 call sites of the three path helpers; 91 `` `/${branchId}/…` `` links |
| Shared, scripts, tests | 13, 10 and 9 files; the rules tests run two branches to prove isolation |
| URLs | The branch is the first path segment: `/{branchId}/admin/…`, `/{branchId}/tutor/…` |

### Options

- **A. Remove branches entirely** (root collections, rules without `{b}`): about **210 files and 1,800 changed
  lines**, including a rewrite of every security rule.
- **B. Keep one fixed academy internally** (`branches/skyarc`), hide all branch and Super Admin UI: data paths,
  rules, functions and indexes stay; about 25–30 files change and about 75 are deleted.

**Choice: B**, because:

1. The branch is the foundation of the security rules and the function triggers. Rewriting the rules that protect
   minors' data for no product gain is the riskiest change available.
2. The branch is already resolved in one place (`BranchProvider`) and built into paths by three helpers, so a
   constant academy ID is a one-place change.
3. The scheduled jobs (auto clock-out, purge, auto-confirm) and collection-group queries work unchanged with one
   academy.
4. A second Sky Arc location later would cost nothing.

### Flattened URLs

The brief wants no branch UI, and a visible `/skyarc/` segment is branch UI. Since every `/tutor/…` link is edited
anyway for `/coach/…`, the URLs drop the academy segment in the same pass: `/admin/…`, `/coach/…`, `/parent/…`,
`/kiosk`, `/trial`, `/login`. A `portalPath()` helper builds every link, so a second academy could bring the segment
back in one place. Links in emails and push messages (`shared/src/brand.ts`, `functions/src/push.ts`) change with
it.

### What changes concretely

- `ACADEMY_ID = 'skyarc'` in `shared/src/academy.ts`; `BranchProvider` reads it instead of the URL (renamed
  `AcademyProvider` only if cheap; the internal name can stay).
- `AppResolver` always opens the academy; the branch chooser, "Switch branch", `RESERVED_BRANCH_IDS`, branch tab
  icons and per-branch link pages go.
- The academy document is created by an adapted `scripts/seed.ts` (`status: 'active'`, time zone, settings,
  `public/profile`, the owner's member docs). `isMember` requires an active academy, so the seed is part of setup.
- **Business rules** (capacity, pay model) are Super Admin–only in HyberCRM. Sky Arc moves them into Settings that
  the owner edits, and drops conferences.
- **`platformAdmins`** (Super Admin): the UI goes either way. Whether HyberTec keeps a rules-level support login is
  question Q3 in §15.

---

## 4. Terminology

### What changes and where

| HyberCRM | Sky Arc (UI) | Korean (to confirm) | Persisted values and URLs | Internal code |
|---|---|---|---|---|
| Tutor / Teacher | **Coach** | 코치 | role `tutor` → **`coach`**; `/tutor/*` → `/coach/*`; `schedule.tutorOrder` → `coachOrder` | `tutorId` and similar stay where kept; new code says `coach` |
| Branch / center | **Academy** | 아카데미 | — (internal `branches/skyarc` stays) | `branchId` stays |
| Session | **Class** | 수업 | — | the `sessions` collection stays; one document = one student's class |
| Subject | — (**Position** on reports) | 입사 / 슬사 / 복사 | `position: 'standing' \| 'kneeling' \| 'prone'` | subjects removed |
| Progress report | **Progress Report** (SIUS or paper) | 성적 기록 / 결과 | `source: 'sius' \| 'paper'` | `progressReports` collection kept, schema v3 |
| Makeup | **Makeup (MU)** | 보강 | `kind: 'makeup'` | — |
| Trial | **Trial class** | 체험 수업 | `kind: 'trial'` | — |
| Level (new, from the sheets) | Discovery … Precision | (keep English names?) | `level` | — |

### Rules for the rename

1. **Every label people see** changes, on every screen. Nouns and plurals come from a small `shared/src/terms.ts`;
   parent-facing text goes through the Korean + English dictionary.
2. **Values that are stored or appear in URLs** change now, while the database is empty: the role value, the portal
   paths, the order setting. That is one mechanical `refactor!:` commit with the rules tests updated.
3. **Field and collection names are not renamed in bulk.** About 3,700 identifiers would change for little gain,
   and most kept collections are already neutral (`staff`, `students`, `members`, `clockShifts`, `availability`,
   `announcements`, `notifications`, `auditLog`). New fields and collections use Sky Arc words (`coachId`,
   `classSlots`, `enrollments`, `position`).
4. "Session" also means a sign-in session in a few places; those aren't replaced.

---

## 5. Data model changes

All paths are under `branches/skyarc/` unless marked root.

### Kept

`members/{emailLower}`, `staff/{id}` (+ `private/compensation`, `private/notes`), `students/{id}` (+ `private/profile`),
`availability/{staffId}_{dateKey}`, `dayConfigs/{dateKey}`, `events/{id}`, `clockShifts/{id}`, `openShifts/{staffId}`,
`payroll/state`, `payPeriods/{id}` (+ `lines`), `kioskPins/{hash}`, `kioskPinOwners/{staffId}`, `announcements/{id}`
(+ `reads`, `comments`), `notifications/{id}`, `auditLog/{id}`, `public/profile`; root `users/{uid}` (+ `devices`,
`private`).

### Changed

| Document | Change |
|---|---|
| `members` | `role`: `owner \| admin \| coach \| parent` (+ `student` later). `language: 'en' \| 'ko'` (self-editable) so emails, pushes and inbox text use it. |
| `branches/skyarc` | `settings` gains the sections below; `businessRules` folds into settings. |
| `staff` | `role: owner \| admin \| coach`; `subjectIds` removed. |
| `staff/{id}/private/compensation` | One `hourly` rate; pricing reads `history` by effective date. |
| `students` | `level`; `status` gains `trial`; tutoring fields (`subjectIds`, `schoolRecord`, conference, hours) removed; anything staff-only moves to `private`. |
| `sessions` (a student's class) | Add `kind: 'regular' \| 'makeup' \| 'trial' \| 'practice'`, `slotId`, `enrollmentId`, `makeupFor {sessionId, dateKey}`, `canceledBy`, `canceledAt`, `cancelReason`, `lateCancel`, `attendance`. Remove `subjectId`, `logStatus`, `noShowAppliedHours`. |
| `progressReports` | Schema v3 (§8): `studentId`, `dateKey`, `position`, `source`, `score {…}`, `files[]`, `coachNote`, `status: draft \| published`, `publishedAt`, `firstViewedAt`. |

### New

| Collection | Purpose |
|---|---|
| `classSlots/{id}` | The weekly timetable: weekday, start and end, capacity, coaches, whether makeups and trials may use it, active from and to |
| `enrollments/{id}` | A student in a slot from a date (a Mon/Wed student has two) |
| `makeupCredits/{id}` | Owed → booked → used or expired, linked to the missed class |
| `trialBookings/{id}` | A family's trial request: child, contact, chosen times, status, conversion to a student |
| `coachPatterns/{id}` | Which days a staff member works, every N weeks from an anchor date (the Sunday rotation) |
| `timeOff/{id}` | A coach's dates off, with a reason |
| `kioskDevices/{id}` | Registered kiosk devices (§7) |
| `reportUploads/{id}` (optional) | A bulk upload's review state, if the review table needs to survive a reload |

### Removed

`sessionLogs`, `subjects`, `subjectCategories`, `conferenceCategories`, `students/{id}/conferenceNotes`, root
`inquiries`, the demo data, and `platformAdmins` unless Q3 keeps it.

### New settings (defaults until Matt confirms)

| Section | Settings |
|---|---|
| Classes | class length, capacity per class (5, the sheets' usual cap) and per coach, coach lead time before class (30 min), rotation anchor week, levels (names, order, colors) |
| Cancellations | parents may cancel, cutoff hours (24), late-cancel policy, whether a cancellation earns a makeup, who is notified |
| Makeups | self-booking on, per-month limit, expires after (days), book-ahead window, minimum notice, which classes allow makeups |
| Trials | on, visit length (30 min), visits (2), per-class limit, book-ahead window, minimum notice, page text in Korean and English |
| Reports | publish on upload, notify parents (in-app and email), coaches may upload, coaches see all students |
| Language | default language for new families |

Removed sections: session logs, AI report writing, tutoring-hours rounding, school grades beyond Sky Arc's ages,
conferences, the missing-log Home settings.

---

## 6. Scheduling

### What HyberCRM's schedule is

- A schedule record (`sessions/{id}`) is **one student with one tutor for one time range**. Four students with one
  tutor at 5 PM are four records drawn in "lanes" on that tutor's row; lanes per row = `maxStudentsPerTutor`
  (default 1, max 6, Super Admin only, checked in the browser only).
- **No recurrence for sessions.** True Education's master schedule was removed; weeks are copied with "Duplicate
  week", per-card "Duplicate to next week" and copy/paste. Only **events** recur (daily / weekly / monthly, every N,
  with an end), and every-2-weeks is unit-tested.
- Statuses: `pending` (default) → `confirmed` (hourly job, 24 h ahead, if no conflict) → `present` (set by a
  submitted session log) / `no_show` / `canceled`. There is no makeup, trial, late-cancel or "canceled by".
- Writes are admin-only and only until the day ends; parents, students and tutors can't write. Conflicts (closed,
  outside hours, tutor unavailable, over capacity, double-booked, inactive) are computed live and never stored.
- Notices go to **tutors only**, within 24 hours of the class.

### What Sky Arc's weekly sheets show (structure only)

| Day | Class blocks |
|---|---|
| Mon | 4:30–6, 6–7, 7–8 |
| Tue | 5–6, 6–7, 7–8 |
| Wed | 5–6, 6–7, 7–8 |
| Thu | 5–6, 6–7, **7–8:30** (one week also shows a 4:30–6 group: confirm with Matt) |
| Sun | 2–3, 3–4:30, 4:30–5:30, then 5:30–7:30 "Range Practice" |
| Fri, Sat | No columns: closed. The website says Fri–Sun are "by arrangement" for open range and private coaching. |

- Each day and block has **6 seat cells** (3 rows × 2 columns). A blacked-out cell, usually the bottom-right one,
  closes a seat, so most blocks are **capped at 5**; 6 was used once in four weeks. Typical fill is 3–5.
- **Precision** blocks are 90 minutes (Mon 4:30, Thu 7:00, Sun 3:00). Sunday's 5:30–7:30 **Range Practice** was
  empty in all four weeks.
- Each seat shows a **level** and a student. The ladder has nine levels: Discovery, Scout, Hunter, Hunter+,
  Marksman, Marksman+, Sharp Shooter, Expert, Precision (three appear only in the legend). Also marked: Practice,
  Trial, MU, and an unexplained "Marksman JG" (ask Matt).
- **Trials** are two visits, mostly **30 minutes** inside a block ("Trial 1 (7–7:30)", "Trial 2 (5:30–6:00)"), up to
  three in one block; 18 trial seats in four weeks.
- **Makeups** sit in a regular block as "MU for 10/13": 21 in four weeks, taken from 16 days *before* to 18 days
  *after* the missed class (7 of 19 in advance). A ledger at the top tracks *absence date · name · MU · completed*,
  with notes like "Not returned" or "Starting from Nov.". Absences aren't crossed out; the student just isn't seated
  that week, and the seat often goes to a makeup.
- Partial attendance is written in, e.g. "(7:30–8)" or "stay a little more (10–15 min)".
- **The weekly pattern is stable but varied.** 24 seats are identical in all four weeks; 21 of 29 enrolled students
  come twice a week, but "Mon/Wed or Tue/Thu" covers only 5 of them (9 different day pairs), and Sunday is one of the
  two days for 8. One student alternates Thursday and Sunday.
- **People:** 39 distinct names: 29 enrolled with a level, 1 practice-only, 8 trial prospects, 1 not returned.
  That matches Matt's "about 40".
- **No coach appears anywhere** — not per block, seat column or day. Capacity today is per block. (The two seat
  columns could mean two coaches; ask Matt.)

### The Sky Arc model

1. **`classSlots`** hold the weekly timetable (weekday, start, end, capacity, coaches on duty, whether makeups and
   trials may use it). **`enrollments`** put a student in a slot from a date (a Mon/Wed student has two).
2. **A generator** (nightly, and on demand after a timetable change) creates each student's class records a few
   weeks ahead with deterministic IDs (`{enrollmentId}_{dateKey}`). It skips closed dates and never overwrites a
   record someone edited. Regular classes start `confirmed`. Duplicate week stays as a manual tool.
3. **Class records** keep the `sessions` collection and gain `kind` (regular, makeup, trial, practice), `slotId`,
   `enrollmentId`, `makeupFor`, cancellation fields and `attendance` (§5).
4. **Capacity** = the slot's capacity, and optionally coaches on duty × students per coach (Settings, enforced on
   the server for every parent and trial booking).
5. **The grid** keeps its layout. Within a row, the students of one class show as **one class-block card** with a
   fill meter (4/5), the roster and MU / Trial chips, instead of six stacked lanes. Whether rows are coaches or
   class blocks depends on Q7.
6. **Parent cancellation** (`cancelClass` callable): checks the cutoff (Settings, default 24 h), records who and
   when, marks late cancels, creates a makeup credit if the rules allow, writes the audit entry and notifies the
   admins immediately (Matt at 9 PM the night before).
7. **Makeups** (`makeupCredits` + `bookMakeup` callable): parents see open seats in eligible classes within the
   rules (per month, expiry, book-ahead, notice) and book one in a transaction. Cancelling a future class in time
   creates the credit right away, so a makeup can also come **before** the missed class, as it often does today.
   The admin view lists owed, booked and used makeups, replacing the sheet's ledger.
8. **Trial booking** (`/trial`, public, Korean + English): shows real open seats, books the configured visits
   (default two 30-minute visits) in a transaction, records a `trialBookings` lead, emails the family and notifies
   the admins. Bot protection comes from HyberCRM's inquiry endpoint. A trial converts into a student and
   enrollments.
9. **Coach patterns** (`coachPatterns`, any staff member, Matt included): weekdays every N weeks from an anchor
   date, reusing the events' recurrence code. The Sunday rotation is two patterns with opposite week parity.
10. **Shifts**: shift = first class start − 30 min (Settings) → last class end. Shifts are kept apart from opening
    hours (HyberCRM clips availability to opening hours, which would cut a 4:30 shift on a 5:00 day). They feed the
    rows, Coach Today, Home's "expected" list and payroll's expected-vs-clocked check.
11. **Attendance** (`markAttendance` callable): present / absent / late, allowed after the day ends (the rules'
    past-day lock otherwise blocks it). Absences can create makeup credits.
12. **Opening hours** are seeded from the sheets: Mon 4:30–8, Tue and Wed 5–8, Thu 5–8:30, Sun 2–5:30, Fri and
    Sat closed. All editable, per weekday and per date.

---

## 7. Employees, kiosk, time entries, payroll

### Kiosk: what HyberCRM does and what Sky Arc needs

| | HyberCRM today | Sky Arc |
|---|---|---|
| Who the kiosk is | A signed-in **admin's** browser opened at `/{b}/kiosk`; the kiosk callables require an admin | A **registered kiosk device** with its own identity that can only open `/kiosk` and call the two kiosk functions |
| Leaving kiosk mode | `window.confirm('Exit kiosk mode?')` lands on admin Home, still signed in | Leaving signs the device out; an admin must sign in again |
| PIN storage | `sha256("hyber-kiosk:{branch}:{pin}")`, no secret: a stolen database dump reveals every 4-digit PIN in 10,000 tries | **HMAC-SHA256 with a secret pepper** in Secret Manager; lookup stays deterministic, so uniqueness still works |
| Wrong PINs | Unlimited | Per-device limit (e.g. 5 wrong PINs → 1-minute wait, growing), failures audited without the PIN |
| Copy | "PINs are encrypted" | "PINs are stored hashed" |

**How the device gets its identity** (recommended; HyberCRM's own plan, never built): an admin signs in on the
kiosk computer and chooses "Make this a kiosk". A callable registers `kioskDevices/{id}` and returns a Firebase
**custom token** for the user `kiosk:{id}` with the claim `kiosk: true`. The device signs in with that token, so the
admin's session is gone. Rules and functions accept that identity for the kiosk only, and an admin can revoke a
device from Settings. The alternative is a separate kiosk email login; it needs a password kept on the device and
lets anyone with the password sign in elsewhere.

### Payroll

- HyberCRM pays **teaching time** (inside sessions with a submitted log) at the teaching rate and, under the
  default `teaching_only` model, **nothing for the rest of the shift**. Without session logs a Sky Arc coach would
  be paid $0, so payroll gets an **hourly model**: the whole clocked shift at the coach's rate.
- Rates are priced from the history entry in effect on the shift's date (today the current rate re-prices past
  periods on screen), and locked pay-period snapshots are read back instead of recomputed.
- The duplicate `priceShifts` in `web/src/features/timeclock/api.ts` merges into `shared/src/pay/`.
- **Expected shift** = first class start − 30 min → last class end, from the coach's pattern. Sunny's review can
  compare it with the clocked time.
- Sunny is `owner` (payroll access); Matt is `admin` with whatever restrictions Sunny chooses.
- Pay period type and rates stay settings until Sunny sends them (default: biweekly).

---

## 8. Progress reports and the SIUS PDFs

### What HyberCRM's progress report is

A per-student, per-period **tutoring summary computed from session logs**: facts (attendance, hours by subject,
homework, ratings), a progress level from fixed thresholds, and an 11-section narrative written by AI or a template,
shown as three printable pages. It refuses to generate without submitted logs. **There is no compare view** (True
Education's diagnostics compare didn't make it into HyberCRM, and its source isn't on this Mac). Charts are
hand-drawn SVG; there is no chart library.

What carries over is the **shell**: draft → shared lifecycle, server-only creation, parents and students reading
only their own shared reports (with rules tests), view receipts and the "New" chip, the list page's filters and
menus, the share dialog's recipient preview, and the responsive line chart on the student profile.

### 8.1 The SIUS PDFs

All 10 samples were studied, and a prototype pdf.js parser read all 10 with every check passing.

**The file.** Printed from SIUS through "Microsoft: Print To PDF": 1 A4 page, PDF 1.7, a real text layer (embedded
Arial, clean Unicode), 0.56–0.64 MB. The target face is a **raster image** (594 px PNG), not vector paths.

**What's on the page:**

| Field | Format and notes |
|---|---|
| Event | Always `Air Rifle 60`: the SIUS program, the same for prone, kneeling and standing |
| Date and time | `M/D/YYYY h:mm:ss AM/PM` from the SIUS PC's clock, no time zone |
| Total | One decimal (`186.8`), match shots only; prints `0` when there are no match shots |
| Inner tens | Count of match shots ≥ 10.2 (checked in all 8 files with match shots) |
| Series totals | Match series totals, plus a trailing `0` for the next empty series |
| MPI | Mean point of impact, `X: 0.9 mm; Y: 0.5 mm` (right and up are positive) |
| Group size | `Ø: 24.9 mm` (largest center-to-center distance + 4.5 mm pellet) |
| Series | `Series 1:` (match) or `Series 1P:` (sighters, never counted), each with its total, MPI and group size |
| Shots | Decimal scores 0.0–10.9 in firing order, 10 per row, each with a small **direction-arrow image** |
| Targets | Main target (match shots only) and one thumbnail per series |

**What's not on the page:** **the shooter's name, the position**, lane, shot times, numeric x/y. The meeting's
"the PDF already includes the student's name" doesn't hold for these samples.

**Surprises in the samples:**

- "20 shot" in a file name is literally true for 6 of 10. Two files are **sighters only** (Total `0`; one file name's
  "202" is the sighter total). Others have 21 and 22 match shots, one after 15 sighters.
- One file lists three `0.0` entries **without an arrow** that aren't counted shots (meaning unknown); a real miss is
  `0.0` *with* an arrow.
- **One of the two SIUS PCs runs 3 hours behind** (its clock is on UTC−7): 4 of 10 times fall before opening. Corrected,
  all 10 fall inside a class that student was booked in that day.

**Parsing (in the browser, with pdf.js):**

1. Read text items with their coordinates. pdf.js's text order is **not** reading order (labels and values
   interleave, shot rows come out right to left), so rows are rebuilt by baseline and each label is paired with the
   value to its right.
2. Bold (shot values, Total) is told apart by font. Anchors: `Total:`, `Inner tens:`, `Series totals:`, `MPI:`,
   `Group size:`, `Series N:` / `Series NP:`, `Series total:`, the date pattern.
3. The arrow images are matched to their shots from the drawing operations; a value without an arrow is not a shot.
4. **Checks before anything is saved:** shots sum to each series total, match series sum to the Total, Inner tens
   matches the shots ≥ 10.2, and the rebuilt MPI is within 0.3 mm of the printed one. Any failure sends the row to
   manual review.

**Shot positions and grouping.** Distance from the center follows from the score ((10.95 − score) × 2.5 mm on the
10 m air rifle target) and the direction from the arrow's angle. Rebuilt this way, the MPI matches the printed one
within 0.1 mm in 20 of 21 series. So the app can draw its **own target** for every report (crisp at any size, and
comparable side by side) and show **grouping and miss-direction tendencies**, the brief's "if the PDF data allows it".

**Who and which position.** Since the PDF has neither, the review table **suggests** them and the admin confirms:

- the student, from the file name's words fuzzy-matched against the roster, ranked by who was booked in the class
  covering the report's time (after the PC's clock offset, a setting);
- the position, from the file name (`prone`, `stand…`, `kneel…`), else blank.

Nothing is trusted from the file name without the admin seeing it.

**Tests without real files.** A generator turns small synthetic specs (date, series, shots with angles) into
pdf.js-shaped text and arrow data with the measured geometry and SIUS's quirks; a few synthetic PDFs exercise the
real pdf.js path. Scenarios: 2×10 match, sighters then match, sighters only, 10 + 10 + 2, the arrowless `0.0`, a real
miss, a 1-shot series, negative MPI, a non-SIUS PDF.

**Paper targets.** The photos are Scopos 10-bull "10m Air Rifle" cards scored by hand in whole numbers out of 100,
sometimes as a 3-position set out of 300 with a coach's sticky note and a level ("Marksman"). They are iPhone JPEGs
with **GPS in the EXIF**, and half rely on the EXIF orientation flag to stand upright. They were photographed weeks
after the dates written on them, so **the photo's date is not the evaluation date**. The upload turns them upright,
resizes them to a 2560 px long edge (JPEG quality 0.82: about 380 KB instead of 2 MB, handwriting and holes still
legible), drops all metadata and makes a 512 px thumbnail.

### 8.2 The Sky Arc report

| Field | Meaning |
|---|---|
| `studentId`, `dateKey`, `time` | Whose report and when it was shot (from the PDF, never from the file name) |
| `position` | `standing` / `kneeling` / `prone` |
| `source` | `sius` / `paper` |
| `score` | Parsed SIUS values (§8.1) or the paper total typed in |
| `files[]` | Storage paths: the original PDF or photo, plus rendered page and target images for fast viewing |
| `coachNote` | Optional note for the parent |
| `status` | `draft` / `published`, with `publishedAt`, `publishedBy`, `firstViewedAt` |

### 8.3 Upload

- **Bulk SIUS upload:** drop several PDFs → each is parsed in the browser → a **review table** shows one row per
  file: matched student (fuzzy match on the roster, correctable), position (dropdown, pre-filled when the PDF shows
  it), date and score → Confirm creates the reports in one batch. The parser lives in `shared/` so a Cloud Function
  or the phone app can reuse it.
- **Paper target photos:** choose a photo (JPEG or HEIC) → it's turned upright, resized and re-encoded as JPEG in the
  browser, which drops EXIF and GPS → pick the student, position and date → type the total.
- Edit, replace, delete; optional coach note. **Publish on upload** by default (the brief's suggestion), changeable
  in Settings (Q11).

### 8.4 Parents

- A report **library per child**, by date, filtered by position and source.
- **Viewing without downloading:** PDF pages are shown as images rendered at upload, and photos directly, all read
  through the Storage rules (`getBlob`), never through public links. Download stays an extra button.
- **Trend:** score over time per position (one line each), from the profile's responsive line chart.
- **Compare:** any two reports side by side (default: lowest vs. latest in a position), with the score change and,
  if the PDFs carry shot data, the two targets and their groups.
- **Notification** when a report is published (in-app now, push with the phone app), in the parent's language.
- Coaches: all students, read-only, unless Goo decides otherwise (Q11).

### 8.5 Rules for report files

Storage path `branches/skyarc/reports/{reportId}/{file}`. Admins (and coaches if allowed) write; a parent reads only
if the report is published and its student is one of their children, checked with `firestore.get()` on the report
document. The Storage service agent already holds the role cross-service rules need. Emulator tests cover every case
before release.

---

## 9. Parents, Korean + English, notifications, announcements

### Parents today

Parents can only read: their children's student and class records and shared reports. They can't read
announcements, have no notification inbox (the bell is mounted only for tutors), and can't write anything. Sharing
a report sends an email only. Sky Arc's parent portal (cancel, makeups, reports, news, notifications) is mostly new
on top of the kept family pages.

### Korean + English

HyberCRM has **no internationalization**: no library, no Hangul, English labels in `shared/` maps, `en-US` date
and money formatting, and English text written into inbox items by the server.

**Plan:** a small typed dictionary, no library:

- `shared/src/i18n/{en,ko}.ts`: `en` is the source; `ko` must `satisfy` the same shape, so a missing or extra key
  fails the typecheck.
- `shared/src/i18n/format.ts` passes `ko-KR` to the existing time formatters (they already take a locale), so
  times read "오후 4:30" in Korean.
- `web/src/i18n/LanguageProvider.tsx` with `useT()` and `{name}` interpolation; it sets `<html lang>` and Korean
  line breaking (`word-break: keep-all`).
- The choice is stored under `skyarc.lang` (the homepage already uses it) and, once signed in, on the member
  (`language`), so the server writes emails, pushes and inbox text in the reader's language. Inbox items store a
  type and parameters, and the client renders them.
- **Scope:** the parent portal, the public pages (homepage, `/trial`, sign-in), sign-in errors, and parent emails
  and notifications, roughly **400–600 keys**. Admin and coach screens stay English.
- **Font:** Geist has no Hangul. Add Pretendard (or Noto Sans KR) after Geist in the font stack.
- Korean wording needs a native reviewer (meeting notes: Korean translations, "or who will review them").
- If admin screens ever need Korean, move to i18next; the dictionaries carry over.

### Notifications

The inbox design (written only by functions, deterministic IDs, FCM push mirror, 14-day retention) stays. New:
the bell for admins and parents; recipients resolved for admins and for parents through their children; types
`class_canceled_by_parent` (immediate, regardless of the 24-hour window), `makeup_booked`, `trial_booked`,
`report_published`, and announcements for parents.

### Announcements

Kept, with parents as an audience (rules, a parent reader page, receipts, notifications), a Tournament category
and Korean + English reading screens. Attached files stop using public download links (§11). A public news feed for
the future website would be a separate, server-maintained copy, never the announcements collection, whose receipts
and comments hold emails.

---

## 10. Design system and branding

- **Keep** HyberCRM's shadcn/ui primitives (40 components, `radix-nova` style), layout, sidebar, density, dark
  mode and react-icons (`react-icons/lu`). Six unused components can go.
- **Brand colors from the logo:** black, white and red `#FB0202` (the reticle's dot; the only red). White text on
  `#FB0202` is 4.1:1, below WCAG AA for normal text, so:
  - `--brand: #FB0202` for marks, accents and the first chart series;
  - `--brand-solid: #E00000` (5.0:1 with white) for filled buttons such as Book a trial;
  - `--brand-text`: `#E00000` on light, `#FF5252` on dark;
  - `--primary` stays near-black (light) / near-white (dark), as HyberCRM's neutral theme already is;
  - `--sidebar-primary` becomes brand red in both modes (today the dark one is blue);
  - `--destructive` stays as is. Making the primary red would clash with the ~150 places that use red for
    conflicts and errors.
- **Logo files:** `web/public/brand/skyarc-logo.svg` (on light) and `skyarc-logo-white.svg` (on dark), cropped to
  the artwork. A `SkyArcMark` component draws the lockup in `currentColor` with the dot in `--brand`; the 44 px
  sidebar mark and the app icons use the reticle alone (as the favicon already does).
- **Replace:** `HyberMark`, `CompanyFooter`, the manifest, icons, `og.png`, `privacy.html`, the Apple app-site
  association file, email logos and footers, `hyber:*` storage keys, the `hyber-kiosk:` prefix (replaced by HMAC),
  and the `__hyberSignIn` test hook. `scripts/brand-icons.ts` is reused, minus its rule that turns every path black
  (it would blacken the red dot).
- **Fonts:** Geist, then Pretendard or Noto Sans KR for Hangul.

---

## 11. Security and minors' data

| Issue found in HyberCRM | What Sky Arc does |
|---|---|
| `storage.rules` checks the old `roles` array, so only a Super Admin passes the admin check (owners and admins can't upload); no Storage rules tests | New Storage rules written against the current `role`, with emulator tests |
| Uploaded files are shared with `getDownloadURL`, a link that bypasses the rules and works for anyone who has it | Report files and announcement attachments are read with `getBlob` through the rules. Report access: parents of the linked student, published reports only, checked with `firestore.get()` on the report (the Storage service agent already has the role this needs) |
| The kiosk runs on an admin session; PIN hashes have no secret; wrong PINs are unlimited | §7 |
| Parents can read staff-only fields (`learningNote`, `schoolRecord`, a class's staff note) because the rules allow the whole document | Staff-only fields move to `private` documents; rules tests assert parents can't read them |
| The public inquiry endpoint is the only unauthenticated write | `/trial` reuses its honeypot, timing check and hashed-IP rate limit, checks capacity in a transaction, and may add App Check later |
| Photos carry EXIF data, including GPS | Paper-target photos are re-encoded in the browser before upload (orientation applied, metadata dropped, resized) |
| — | Kiosk PINs never appear in logs, audit entries or errors; real student data and report files never enter the repository (CI's guard) |

---

## 12. Testing and CI

- **Carry over:** the 180 shared unit tests that still apply, the Firestore rules tests (rewritten for one academy
  with a second, decoy academy to keep proving isolation), and the emulator e2e harness with an anonymized seed.
- **Add:** Storage rules tests; SIUS parser tests against synthetic fixtures (no real PDFs in the repository);
  tests for the class generator, cancellation and makeup rules, trial capacity, the coach rotation, shift
  derivation and hourly pay; dictionary completeness is enforced by the typecheck.
- **CI** grows to HyberCRM's set: typecheck, unit tests, website and functions builds, rules tests (Java 21 for the
  emulator), plus web lint, which HyberCRM doesn't run. The deploy job adds Cloud Functions, with the extra roles its
  deploy account needs recorded in `docs/DEPLOY.md`.

---

## 13. How the fork is done: the pull requests

Each step is a branch and a pull request (brief §11). Commits follow CLAUDE.md: a few per pull request, split by
type and scope.

| Step | Pull request | Contents |
|---|---|---|
| 1 | #1 `chore: set up the Sky Arc repository, CI and deploys`, #2 `fix(deploy): make the deploy from main succeed` | Rules and brief, placeholder homepage, CI, deploys from `main`, Firebase config, deny-all rules |
| 2 | `docs: review HyberCRM and plan the Sky Arc fork` | This document |
| 3 | `refactor!: fork HyberCRM as the Sky Arc academy app` | Commit 1: exact import of HyberCRM `d659d34` (`web` minus landing and demo, `shared` minus demo, `functions` minus platform/demo/inquiries, rules, indexes, tests, the useful scripts; no `mobile`, docs or env files). Commit 2: the Sky Arc changes: one fixed academy and flattened URLs, removals (§2), `tutor` → `coach`, rebrand and theme, Google and email/password sign-in on Sky Arc's domain, new Storage rules, academy seed script, full CI and Functions deploy |
| 4 | `feat(schedule): …` | Opening hours, class slots and enrollments with the generator, capacity, coach patterns and the Sunday rotation, derived shifts, attendance |
| 5 | `feat(schedule): parent cancellations, makeups and trial booking` | Callables, rules, notifications, `/trial` (Korean + English) |
| 6 | `feat(kiosk): …` / `feat(payroll): …` | Kiosk identity, PIN hashing and limits, hourly pay, rate history |
| 7 | `feat(reports): …` | SIUS parser and fixtures, bulk upload review, paper photos, viewer, trend, compare, parent notifications |
| 8 | `feat(parents): …` + `feat(i18n): …` | Parent portal in Korean + English |
| 9 | Announcements, dashboard, settings and access clean-up | |
| 10 | Then stop | The phone app is Phase 2 |

---

## 14. Risks

| Risk | Mitigation |
|---|---|
| Rules regressions while reshaping a 542-line rule set that protects minors' data | Keep the branch structure (§3); rules tests first, for every new collection, with a decoy academy |
| Removing session logs breaks attendance, payroll, student history and Home at once | Build attendance and hourly pay before deleting logs, in the same pull request |
| Matt's values (rules, hours, capacity, pay, roster) arrive late or change | Everything is a setting with a sensible default; nothing hard-coded |
| The SIUS PDF layout changes with a SIUS software update | The parser is tolerant, every value can be corrected in the review table, and fixtures cover the variants seen |
| Korean wording that sounds machine-made to Korean parents | A native reviewer before launch; terms collected in one dictionary |
| Big pull requests are slow to review | The fork's import commit is verbatim, so the review reads only the second commit |
| GitHub can't enforce "pull requests only" on a private Free-plan repository | Convention (CLAUDE.md); upgrading the organization to GitHub Team would enforce it |
| End-of-November launch | Web only; the phone app waits; priorities in the brief's order |

---

## 15. Questions for Goo

### Needed before the fork (step 3)

- **Q1. The plan.** One fixed academy internally, Super Admin UI removed, URLs flattened (`/admin`, `/coach`,
  `/parent`, `/kiosk`, `/trial`), and the removals in §2. Confirm?
- **Q2. Copy then strip,** with the verbatim import as its own commit (§13)?
- **Q3. HyberTec support access.** Keep `platformAdmins` in the rules only (no UI) so HyberTec can fix data for
  Sky Arc, or remove it so only Sky Arc's owners and admins exist?
- **Q4. The owners.** Sunny's and Matt's sign-in emails (and Goo's own access during development) for the seed.
- **Q5. Email sender** for invites, trial confirmations and report notices: HyberTec's `hybertecofficial@gmail.com`
  (as HyberCRM does), or a Sky Arc address with its own app password?
- ~~Q6. Time zone.~~ Answered from skyarcacademy.com: the academy is in Suwanee, GA, so **America/New_York**
  (still a setting).

### Product questions (needed before the matching pull request)

- **Q7. Coach assignment.** The sheets list students per class block, not per coach. Rows by coach (students
  assigned to a coach) or rows by class block with coaches on duty?
- **Q8. Levels.** The sheets color-code nine skill levels (Discovery … Precision); the website sells four programs
  (Launchpad, Foundations, Development, Performance). Model a student `level` (and maybe `program`) as catalogs in
  Settings?
- **Q9. Kiosk identity.** Registered device with a custom token (recommended) or a separate kiosk login?
- **Q10. Pay.** Hourly for all clocked time? Approval per time entry, or locking the pay period is the approval?
- **Q11. Reports.** Publish on upload by default (the brief's suggestion)? Coaches see all students' reports,
  read-only (the brief's default)?
- **Q12. Compare.** HyberCRM has no compare view, and the True Education source isn't on this Mac. Screenshots or
  access, or design it fresh?
- **Q13. Matt on the rotation.** Matt is an admin but works every day. Shift patterns apply to any staff member,
  not only coaches. Correct?
- **Q14. Korean review.** Who reviews the Korean wording (Matt, a parent, someone at HyberTec)?

### For Matt (next check-in, Oct 20–21)

1. Can the shooter's name be set on the SIUS lane so it prints on the report? (Today it doesn't.)
2. The second SIUS computer's clock is 3 hours behind (its Windows time zone is UTC−7, most likely Pacific); please
   set it to Eastern.
3. Do sighter-only sessions (Total 0) count as evaluations? With 21–22 match shots, use all shots or the first 20?
4. What do the `0.0` entries without an arrow mean?
5. Show parents decimal scores (SIUS), whole-number scores (paper cards), or both?
6. Do the black cells mean a class is capped at 5? Do the two seat columns mean two coaches?
7. Which day was week 1's unlabeled 4:30–6 Precision block? What does "Marksman JG" mean?
8. Practice and Range Practice: bookable? Do they count toward capacity?
9. Trials: always two 30-minute visits, up to three per class?
10. Makeup rules: how far before and after the missed class, how many per month?
11. Is the 3-position set (10 shots each, out of 300, with a coach note) the standard level test?
12. The rest of the pending list: roster, coach names and days, Sunday rotation, pay rates and period,
    cancellation / makeup / trial rules, Korean reviewer.
