# The phone app and classes taught together

The website and the data changed: a class is no longer one coach's. This page says what the phone app (`mobile/`)
has to change to match, for the Claude Code session that does it on Goo's MacBook Pro. The decision is
`docs/DECISIONS.md` §21; the website's side is merged (pull request #31) and live, and production has held the
academy's real data since 2026-10-26.

## What changed

- **A class is its own record:** `branches/{b}/classes/{classId}`, the type `AcademyClass` in `shared/src/types.ts`
  (`COL.classes` in `shared/src/paths.ts`): a day (`dateKey`), a time (`startMin`, `endMin`, `startAt`, `endAt`),
  `seats` (six by default; `businessRules.seatsPerClass`), a `note` for the coaches, and `isDeleted` for the Trash.
- **Each student in a class is a session** (`Session`), as before, now with the class's `classId`. Its `note` is its
  label in the sheets' own words: "MU for 10/13" (a make-up), "Practice", "Trial 1". `seatKind(note)` in
  `shared/src/schedule/classes.ts` reads it. A seat can cover part of the class (a half-hour trial): its
  `startMin`/`endMin` then differ from the class's.
- **A seat's `coachId` is the past.** Seats the website adds have `coachId: ''`. Production's imported seats carry their
  class's lead coach for now, only so the phone app 1.0 can open a class (`scripts/lead-coach.ts`); it's cleared once
  the update is out. So the update must not read `coachId` at all (and never build a Firestore path from it): a class
  is `classId`, and its coaches are the ones in.
- **Who's in is each person's availability that day** (`availability/{staffId}_{dateKey}`), which now also carries
  `staffName` and `staffRole`. **Every coach in at a class's time teaches it**; the manager (an admin) can be in
  without teaching. `coachesIn(class, thatDaysAvailability, dayHours, isCoach)` in `shared/src/schedule/classes.ts`
  gives a class's coaches (it already skips anyone whose `staffRole` isn't `coach`), and `uncovered` the parts of a
  class nobody covers. The office sets who's in on the website's schedule; coaches still set their own days in
  Availability.
- **What people can read** (`firestore.rules`):
  - Coaches read every class, every session and everyone's availability, so they see all the academy's classes and
    who's in with them.
  - Coaches still can't read the staff list: other people's names come from `availability.staffName`.
  - Parents and students read their own children's sessions only, and no class records (the class note is for the
    coaches).
- **Shared helpers to use:**
  - `shared/src/schedule/classes.ts`: `takesSeat`, `openSeats`, `makeupLabel`, `makeupsOwed`.
  - `shared/src/schedule/conflicts.ts`: `seatConflicts(seat, ctx)`. It checks a closed day, outside hours, `no_coach`
    (nobody in for all or part of the class), a full class and a student double-booked or not attending. The old
    `sessionConflicts` stays only for sessions that still have a coach.
  - `shared/src/schedule/seatColors.ts`: each level's colour (the sheets' colours, lighter, with dark-mode ones), and
    the label colours (make-up red, practice light blue, trial green).
  - `shared/src/pay/lines.ts`: `payLines({ …, availability })` takes the period's availability, so a class counts for
    every coach in under the "Classes taught" pay model. Under Hourly (the academy's) nothing changes.
- **Settings:** "Students per coach at once" (`maxStudentsPerCoach`) is replaced by "Seats per class"
  (`seatsPerClass`). The phone shouldn't use `maxStudentsPerCoach` any more; it stays in the type only until the phone
  stops reading it.

## What the phone has to change

Everything the phone groups by coach today. These are the places that read `coachId` / `coachName` (from
`grep -rn "coachId\|coachName" mobile/src`), with what each should do now:

- **`features/schedule/classes.ts`.**
  - `ClassGroup`, `classIdOf`, `parseClassId` and `groupClasses` group sessions by `coachId~date~start~end`.
  - A class is now a record: load `classes` for the dates, group sessions by `classId`, and route `/class/[id]` by the
    class's ID.
  - Keep a fallback for sessions without `classId` (group them as before) only if it costs nothing; production will
    have none after the move.
- **`features/data/hooks.ts`: `useSessionsBetween`.** For a coach it reads `where("coachId", "==", staffId)`, which
  finds none of the new sessions. Read every session in the range (coaches may now), plus the classes and that
  range's availability.
- **Staff tabs (the owner and admins; coaches have Home, Schedule, Availability, Scan, More):**
  - **Home** (`(staff)/(tabs)/index.tsx`): today's classes with their coaches in (not "N coaches" counted from
    `coachId`). For a coach: the classes in their hours today, the coaches in with them, and their hours.
  - **Schedule** (`(staff)/(tabs)/schedule/index.tsx`, `features/schedule/ClassRow.tsx`): each day's classes as on the
    website. For each class: its time, its students in their level colours with the rifle code (`student.rifle`) and
    their label, "4/6" seats, and the coaches in. A coach sees every class, with theirs (in their hours) clearly
    marked.
  - **A class** (`(staff)/class/[id].tsx`): load it by class ID. Show its coaches in (from who's in, not one coach with
    contact buttons), its students with their status, and for the office the same marks as the website: Here / No-show
    on today and earlier days, Canceled, and back to Coming. The writes and their audit entries are in
    `web/src/features/schedule/classApi.ts` (`setSeatStatus`); copy their fields.
  - **A coach** (`(staff)/coach/[id].tsx`): their hours each day and the classes in them, not "their" sessions.
  - **A student** (`(staff)/student/[id].tsx`, `student/calendar.tsx`): classes without a coach's name.
  - **Scan** (`features/scan/StudentPicker.tsx`): sections are "time · coach name"; make them "time" (or the time and
    the coaches in).
  - **Pay** (`features/pay/data.ts`): reads sessions `where("coachId", "==", staffId)`. Read the period's sessions and
    availability and pass `availability` to `payLines`.
- **Coach Home's to-do** (`features/home/useCoachToDo.ts`): classes "waiting" because of a conflict use
  `sessionConflicts` per coach. Use `seatConflicts` with the class's coaches, or drop what no longer applies to a
  coach (a class with no coach in is the office's to sort out).
- **Availability** (`features/availability/api.ts`):
  - Every day a coach saves stores `staffName` and `staffRole: 'coach'`: `availabilityRecord(staffId, day, tz, via,
    staffName, staffRole)` in `shared/src/availabilityWrites.ts`.
  - The warning when a coach removes hours reads their own sessions by `coachId`. It should warn about classes that
    would be left with no coach in, using that day's availability and `uncovered`. The website's version is in
    `web/src/features/availability/api.ts`.
- **Family tabs** (`features/family/ClassCards.tsx`, `(family)/session/[id].tsx`): "with {coachName}" and the coach
  row go away. Families can't read who's in, and a class has no single coach. Keep the label ("Makeup for 10/12"),
  the time and the status.
- **Colours:** use `shared/src/schedule/seatColors.ts` for a student's level and a seat's label, in light and dark
  mode, so the phone matches the website.
- **Notifications:** links stay `coach/schedule?date=…`. Notices about a class now reach every coach in at its time
  (done in `functions/`).

## How to try it

- The practice copy (the emulators) has sample data in the new shape: classes like the academy's week (Monday 4:30,
  6 and 7 PM, and so on), six seats each, make-ups, practice and trials, and who's in each day (Monday three coaches
  from 4 PM, one leaving at 6). `npm run iphone:sim` seeds it (`docs/running-the-apps.md`). Try things there:
  production holds real people now, and its only extra account is the App Store's review login (an admin).
- The website on the same emulators shows the same week: `npm run dev:emulators`, then the Schedule page.
- Checks, as CI runs them: `npm --prefix mobile run typecheck` and `npm --prefix mobile run lint`. Also run
  `npm test` when shared code changes.

## Rules for that session

- CLAUDE.md and `mobile/AGENTS.md` apply.
- Branch from `main` (the website's side is merged). Open a pull request.
- When the update is out, the website's last step is `npx tsx scripts/lead-coach.ts --clear` (`docs/TODO.md`).
- The update's App Store review: the review login is now an admin with the academy's real data, the only account
  (`docs/store/review-notes.md`); say in the notes what changed.
- Don't upload a build to App Store Connect or Google Play: 1.0 is in Apple's review. The update goes up later, when
  Goo says.

## The prompt to paste (MacBook Pro, Claude Code, in the repository)

```text
Pull the latest main (git checkout main; git pull) and make a new branch from it, feat/mobile-classes. Read
CLAUDE.md, mobile/AGENTS.md, docs/DECISIONS.md §21 and docs/mobile-classes.md: the website now has classes taught
together (a class is its own record, every coach in at its time teaches it, coaches see every class), it's live with
the academy's real data, and the phone app (mobile/) still groups classes by one coach. Bring the phone app to the
new model, screen by screen, as docs/mobile-classes.md lists: the staff tabs (Home, Schedule, a class, a coach, a
student, Scan, Pay), the coach's to-do and Availability, and the family tabs. Never read a seat's coachId. Use the
shared helpers it names, and the level colours in shared/src/schedule/seatColors.ts. Try every changed screen on the
iPhone simulator with the practice copy (npm run iphone:sim), in light and dark mode, and run npm --prefix mobile run
typecheck and lint. Don't upload anything to App Store Connect or Google Play. Open a pull request when it works,
and tell me what you changed and what I should look at.
```
