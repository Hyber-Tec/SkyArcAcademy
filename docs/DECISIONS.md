# Decisions

Goo's answers and the calls already made. They win over the brief and the review (CLAUDE.md). Add new answers at the
end of the matching section, with the date.

## 1. Product (from the brief and the kickoff meeting, Oct 13, 2026)

- **One academy.** No branch creation, no super-admin layer. *Changed: super admins for the AI page only, with no
  access to the academy's data (§26).*
- **Web first.** The phone app (admin, coach, parent, student) is Phase 2; data and APIs stay ready for it.
- **No landing page yet.** The homepage is a placeholder: logo, one line, Log in, Book a trial. Goo designs the
  landing page last. *Changed: the public website (§18).*
- **Progress reports are uploaded by hand** (bulk SIUS PDFs with a review table, paper-target photos). No SIUS
  integration. Only official evaluations are uploaded (about 1–3 per student per month), starting fresh. *Changed:
  they go into a Drive, and parents see the app's own report (§7).*
- **Coaches clock in and out at a kiosk** with a PIN (stored hashed, never logged).
- **Terminology:** Coach, Class, Academy, Makeup (MU), Position (Standing / Kneeling / Prone).
- **Korean and English** on every parent-facing screen (parent portal, trial booking, homepage). *Changed: English
  first, other languages once every feature is built (§6, Q14).*
- Values the academy hasn't sent yet (hours, rules, capacity, pay) are **settings with sensible defaults**, never hard-coded.
- **Time zone: America/New_York.** The academy is at 730 Peachtree Industrial Blvd, Suwanee, GA (skyarcacademy.com,
  checked 2026-10-15). It is the academy's time-zone setting, used for every class time, the kiosk and payroll.

## 2. Setup (2026-10-15)

- **Repository:** https://github.com/Hyber-Tec/SkyArcAcademy, in the `SkyArcAcademy` folder itself. The client
  material in the folder is git-ignored. The brief is committed with students' names removed from its asset list;
  the meeting notes stay local.
- **Public since 2026-10-15** (Goo: GitHub Actions minutes are unlimited for public repositories). Everything
  committed is world-readable, so client-internal details (people's names, contacts, timeline, money) and findings
  about other HyberTec products stay in the git-ignored `docs/internal/` on Goo's Mac mini, and the public brief and
  review name the academy's people by role.
- **Accounts:** each developer commits and pushes with their own personal GitHub account. Personal setup
  (accounts, credential helpers, local paths) lives in each developer's git-ignored `CLAUDE.local.md`, never in the
  shared files (Goo, 2026-10-15).
- **Firebase project `skyarcacademy`:** sign-in with Google and email/password; Firestore in `nam5`; Realtime
  Database in `us-central1`; Hosting at `skyarcacademy.web.app`. Nothing uses the Realtime Database yet, so its
  rules stay deny-all until a feature needs it.
- **Cloud Storage** default bucket `skyarcacademy.firebasestorage.app` in **`us-central1`** (Goo), next to the
  Realtime Database and Cloud Functions, in Google's free tier region.
- **Deploys:** GitHub deploys `main` after CI passes, signed in to Google Cloud through Workload Identity Federation
  (no service-account keys). See `docs/DEPLOY.md`.
- **Enforcing pull requests:** a ruleset on `main` requires a pull request and green CI (Goo), added with the fork's
  final CI. Code-owner approval stays a convention: GitHub doesn't let authors approve their own pull requests.

## 3. The fork (2026-10-15, Goo)

- **Plan confirmed** (`docs/HYBERCRM_REVIEW.md`): one fixed academy internally (`branches/skyarc`), no branch or
  Super Admin UI, flat URLs (`/admin`, `/coach`, `/parent`, `/kiosk`, `/trial`), the tutoring features removed.
- **Copy, then strip:** an exact import of HyberCRM `d659d34` as its own commit, then the Sky Arc changes.
- **No hidden Super Admin.** HyberTec's support access is an ordinary owner login that the academy can see on the
  Account page and remove at handover.
- **First account:** Goo as the first owner while the app is built; the academy's owner and manager
  are invited from the Account page.

## 4. Built in the fork (2026-10-15)

Calls made while forking, within the confirmed plan. Goo can overrule any of them.

- **Field names say `coach` too** (`coachId`, `coachName`, `maxStudentsPerCoach`), not only the role, the URLs and
  the order setting as the review planned (§4, rule 3). With the tutoring features gone it was about 1,300 mechanical
  changes, checked by the typecheck, the unit, rules and browser tests, and the database is still empty. Classes stay
  `session` in code and data (`class` is reserved in JavaScript).
- **Plain URLs** (`/admin/…`, `/coach/…`), without the review's `portalPath()` helper: a second academy would bring
  the academy segment back with one.
- **Pay starts Hourly** (every clocked hour at the coach's rate). The owner can switch to Teaching only or Teaching +
  Admin in Settings → Academy rules. *Changed: Classes taught (§6, Q10).* **Up to 6 students per coach** at once, as a
  class block on the sheets has six seats. *Changed: 5 (§7).*
- **Opening hours** start from the schedule sheets (Sunday and Monday to Thursday; Friday and Saturday closed), as
  settings the academy can change. *Changed: wider than the classes (§7).*
- **Brand:** HyberCRM's black-and-white theme with Sky Arc red as the brand color; the academy's logo on sign-in
  pages, the reticle mark in the app and the icons. No "Powered by" line. *Changed: the official logos everywhere
  (§9).*
- **Email:** from HyberTec's Gmail under the academy's name (Q5, §5). Until its app password is set, no email goes
  out: invites show a sign-in link to copy, and account emails fall back to Firebase's own. *The app password was
  set on 2026-10-16 (§9).*
- **Cloud Functions** run as their own service account with only the roles they use. Callable functions are opened by
  turning off Cloud Run's invoker check, because HyberTec's organization doesn't allow `allUsers` in IAM policies
  (`docs/DEPLOY.md`).
- **`/trial`** says that online booking opens soon and points to skyarcacademy.com (Korean or English) until trial
  booking is built. *Changed: English only (§6, Q14).*
- **Privacy policy:** HyberCRM's was removed. Sky Arc needs its own before families sign up or book trials. *Drafted
  (§6, Q15).*

## 5. Goo's answers, second round (2026-10-15)

- **Q5. Email sender: HyberTec's Gmail for now.** The academy owns skyarcacademy.com, but moving the app there is
  the last step before launch, and mail from the academy's own domain is less likely to land in spam. Switching the
  sender is on the launch checklist (`docs/DEPLOY.md`, "Moving to skyarcacademy.com"), so it comes up when the domain
  moves.
- **Q7. Schedule rows: by coach, with time across**, as in HyberCRM. The academy's own sheets put time down and days
  across; Sky Arc keeps HyberCRM's layout.
- **Q8. Students have a level and a program.** Both are lists the academy edits in Settings → Students. They start
  with the sheets' nine levels (Discovery, Scout, Hunter, Hunter+, Marksman, Marksman+, Sharp Shooter, Expert,
  Precision) and the website's four programs (Launchpad, Foundations, Development, Performance).
- **Q13. Shift patterns apply to any staff member, and the manager can also coach.** Built with the schedule work
  (step 4): staff of any role can teach and get a row on the schedule.
- **Test data.** The academy's real data (A1–A4 in `docs/QUESTIONS.md`) isn't in yet, so the app runs on sample data:
  fictional coaches, a manager, families and ten weeks of classes, added with `npm run seed:sample` and removed with
  `npm run seed:sample -- --remove` before the real data is imported (`docs/DEPLOY.md`, "Sample data").


## 6. Goo's answers, third round (2026-10-15)

- **Q9. The kiosk is a device registered with a setup PIN.** The owner sets a kiosk setup PIN in Settings; it's stored
  hashed like the coaches' PINs and never written in the code or the docs. Entering it on a tablet or computer makes
  that device the kiosk, and from then on coaches clock in and out there with their own PINs, with nobody signed in.
  Wrong tries lock the setup PIN for a while. Built with the kiosk (step 6); until then the kiosk opens for a signed-in
  admin, as now. Goo has chosen the PIN and gives it when this is built.
- **Q10. Pay: Classes taught, until the academy says how it pays.** Coaches are paid their teaching rate for the
  class blocks they teach, from the schedule, not from the clock: each block pays once however many students are in it,
  and only classes marked as attended count (Settings → Payroll). Clocking in and out stays as a log and doesn't change
  pay. It's the new default pay model, set on production from the start; the owner can switch to Hourly, Teaching only
  or Teaching + Admin in Settings → Academy rules. Owners and admins are still paid their one rate for clocked time.
  How the academy really pays, and whether hours are approved, is now a question for the academy (A3).
- **Q11. Reports.** (a) Parents see a report only after an admin or a coach publishes it, not as soon as it's
  uploaded. (b) Coaches see every student's reports, read-only: they can publish a report but not change or delete it.
- **Q12. Comparing reports: designed fresh, and kept simple.** Not modeled on True Education's view. The reports get a
  professional redesign later, so the first version shouldn't take much effort. *Changed: the reports are to be really
  good, at the level of HyberCRM's progress report (§7).*
- **Q14. Languages come last.** English only while the features are built. Korean, and other languages, come in one
  pass once everything works, on the web and in the phone app. The homepage's and trial page's Korean switch is gone,
  so the whole site is English for now. Keep text in the code (not in images) so it can be translated later.
- **Q15. Privacy policy: HyberTec drafts it from a template, and the academy reviews it.** The draft is at `/privacy`,
  linked from the homepage and the sign-in pages, with the academy's name and contact details from Settings → Academy.
  It says "draft" until the academy approves it (A10), and families aren't invited and trial booking stays closed
  until then. It isn't legal advice: the academy may want a lawyer to read it. **Approved** (the owner, 2026-10-20: "we
  actually reviewed. so it's good now. remove the draft"): in effect from 2026-10-20, now a page of the website
  (`web/src/site/pages/Legal.tsx`, with Help), with one line added that day on what the website's trial and question
  forms keep.
- **Questions for the academy:** the open questions and the data still missing are one numbered list in
  `docs/QUESTIONS.md`, in the order of the email Goo sends the academy, so answers can be matched by number. Whatever
  rules the academy gives become settings it can change later.

## 7. Goo's answers, fourth round (2026-10-16)

Goo's review of the questions for the academy, and the plan for the Drive, the reports and the phone app.

- **Ask the academy only what the app can't know.** The academy sets its own rules in the app, so opening hours,
  closed days, class size and the pay period aren't questions. The first email asks for the real data, how coaches
  are paid, the cancellation rule and four SIUS details (A1–A9 in `docs/QUESTIONS.md`); the before-launch items
  (A10–A14) wait for a later email.
- **Few rules, added only when needed.** A makeup is a class labeled with the class it makes up ("Makeup for Oct 12")
  and a trial is a class labeled Trial, with no limits, credits or booking rules. Levels change by hand: nothing moves
  a student up automatically. Families book classes for their children and nothing else (Practice and Range Practice
  are events on the schedule).
- **Opening hours, not class times.** The schedule shows the academy's opening hours, set wider than its classes so
  coaches who clock in early or leave late show too: 4–9 PM Monday to Thursday and 1–6 PM on Sunday by default,
  Friday and Saturday closed. The academy changes them, and closes dates, in Settings → Schedule or on the schedule.
  Class times come from the classes themselves.
- **Up to 5 students per coach**, as on the sheets: the default, also set on production (with an audit entry). The
  owner changes it in Settings → Academy rules.
- **Payroll shows numbers; the app pays no one.** So it doesn't need paydays (the pay period stays a setting, every two
  weeks to start), and how the manager is paid isn't asked: the academy enters each person's rate.
- **The academy's history moves in.** HyberTec imports the academy's schedule sheets, past and current (A4), so nobody
  types them again, and the sheets' odd entries don't need explaining.
- **The Drive.** Every student has a folder in a Drive, with the files inside sorted by date. Whenever the academy
  exports a SIUS PDF (not after every session), someone drags it into the Drive, or uploads it with New or the
  right-click menu. The app reads the date and the scores from the PDF and asks for what it doesn't say: the student
  and the position. The Drive keeps the raw files, and the reports are built from them. It's modeled on the drive of
  another app Goo built, which Goo reuses.
- **Reports: the app's own, and really good.** Parents never see the SIUS PDFs: the app shows its own report, built
  from their data, with both decimal (SIUS) and whole-number (paper card) scores. The bar is HyberCRM's progress
  report: a document-style report with the academy's logo, the student, a status, stat tiles with small trend lines,
  charts and sections; a side panel for staff (what it was built from, checks before sharing, what to show); sharing
  that locks it; and Print / PDF. Comparing tests (first, previous or lowest against the latest, or any two), like the
  SAT score report Goo showed, is a reference.
- **The phone app comes after the web.** Expo, as in HyberCRM, iOS first. The admin app comes first: everything admins
  do, above all making reports, including photographing paper targets. The photo goes into the Drive, and the app
  scores it by reading where the shots hit, so nobody grades by hand; the scores feed the report. Then the coach app
  (the schedule and the rest), then students and parents.
- **The web's coach, student and parent portals** are still close to HyberCRM's and get their own pass after the
  admin side.

## 8. Built: the Drive and progress reports (2026-10-16)

Calls made while building §7, within Goo's direction. Goo can overrule any of them.

- **Who uses the Drive:** admins add, rename, move and trash; coaches can open and download (they see every student's
  reports too, §6 Q11); families never see it. The Trash keeps items for Settings → Trash's days (14), then they're
  deleted for good every night; "Delete forever" works any time.
- **A folder per student, always:** every current student has a folder at the top from the start, named after the
  student (it follows a rename and can't be trashed or moved). Other folders can be made anywhere, also inside a
  student's.
- **SIUS PDFs are read the moment they're dropped**, anywhere in the Drive: the time (moved into the academy's time
  zone when the SIUS computer is set to another one, so A7 no longer causes wrong times), the program, the shots
  with their directions, the totals. The admin confirms whose result it is (suggested from the file name, or fixed
  when dropped into a student's folder) and the position (from the file name when it says). Each result is filed in
  the student's folder as `YYYY-MM-DD Position Total.pdf` (the original name stays in its details), and its scores
  are saved for the reports. The same result dropped twice is skipped. Any other file is stored as it is.
- **Until the academy answers A6–A9:** a sighters-only result is kept as a file without scores; 21 or 22 match shots
  all count, as SIUS's own total does; a `0.0` without an arrow isn't a shot; and the checks the samples passed
  (series add up, inner tens, the printed MPI) flag anything odd for a look, without blocking the save.
- **Paper cards:** their photos go in the Drive like any file; their scores are typed in (each bull, or the total)
  from the photo's menu or the student's Scores tab, until the phone app reads them from the photo (§7).
- **Comparing results:** every result is shown per 10 shots, in whole numbers out of 100 (every source) and in
  decimals for SIUS results (§7: both).
- **Reports** are made from a student's results and classes over a period (since the last report, last month, this
  month, the last 30 or 90 days, or chosen dates). The words start as standard text built only from the figures; no AI
  writes them. *Changed: owners and admins can ask AI for a draft (§26).* Admins edit them; admins and coaches share; a
  shared report is locked until an admin stops sharing it. Families get an inbox item, and an email with a sign-in link
  when whoever shares asks for one.
- **The trend** on a report is calculated: the second half of the period against the first, per position, weighted by
  how many results each has. A point or more per 10 shots up is "Improving", a point and a half down "Dipping"
  (families read "Building back up"), anything between "Steady".
- **Sample data** now includes the sample students' shooting: about 100 results (most as synthetic SIUS PDFs in
  their Drive folders, a few paper cards) and two reports, one shared with a family that has a sign-in. `npm run
  seed:sample -- --remove` deletes them, files included.

## 9. The official logos, and email switched on (2026-10-16)

- **The academy's official logo files** arrived: the full logo (the name and the reticle) and three square versions.
  The full logo is used wherever there's room: sign-in and sign-up pages (centered on the card), the kiosk, progress
  reports, the top of every email and the picture a shared link shows. The square icon is the favicon, the app icons
  and the closed sidebar.
- **The top of the navigation** is the owner's layout from Figma: the square icon with the wordmark beside it
  (`Group 112.svg`, "SKY ARC" over "SPORTS ACADEMY"), in place of the temporary square mark and the academy's name
  typed beside it, and without the portal's name. The phone's top bar shows the same, smaller. Which file goes where is in `CLAUDE.md`, "Brand and logos", for every developer and session, and
  for the phone app later.
- **Settings → Branding is gone.** It came from HyberCRM (an uploaded logo, a brand color, a sidebar title) and could
  replace the official logo; the brand is fixed in the code now. Production had nothing set there, and reports no
  longer keep a copy of a logo address.
- **Email is on:** HyberTec's Gmail app password was saved as `GMAIL_APP_PASSWORD` (Firebase manages the secret since
  then). The deploy after it sends invites, account emails and shared reports. A sender on the academy's own domain
  stays a launch step (A14). Mail sent by Gmail from a Gmail address passes the spam checks that matter (SPF, DKIM,
  DMARC); the website's address doesn't have to match the sender's.


## 10. The phone app: the office's app, and paper targets scored from a photo (2026-10-16)

- **Goo's direction:** the phone app starts now, with Expo for iPhone and Android, iPhone first. The office's part
  first (owners and admins); nothing for coaches, parents or students yet. The website stays the main thing: the app
  helps the office see and do a few things, with a very simple look and feel. Its main job is scoring paper targets:
  take a photo (or choose one from Photos), the app reads it, and the card goes to the student's Drive with its scores
  for the reports. No TestFlight: Goo installs it on their own iPhone over the cable. Public or unlisted: Claude
  recommends (below).
- **Built from HyberCRM's phone app** (Expo SDK 57, React Native Firebase, its scripts): `npm run iphone` puts it on
  the iPhone plugged into the Mac, `npm run iphone:sim` opens it in the iPhone Simulator on the practice copy
  ([docs/running-the-apps.md](running-the-apps.md)). Tabs: Today · Schedule · Scan · Students · More. It only reads,
  except the Scan tab; coaches, parents and students who sign in see that their part comes later.
- **Reading a card** happens on the phone, in `shared/src/targets` (the same code the tests run): it finds the card's
  twelve bulls by their black discs, works out which is which from the 3 × 4 grid and the header (whichever way up the
  photo is), measures each bull's black edge for its centre, size and slant, and finds the holes: bright where the wall
  shows through, or dark with torn white fibres when another card is behind. Shots are scored by ISSF's rule (the 4.5
  mm pellet touching a ring's line counts that ring), the geometry SIUS uses, with the decimal beside it.
- **A person checks every card before it's saved:** each bull's score on the flattened card, and any bull worth a look
  (the scan unsure, a second mark, no hole) up close, where a shot is moved, added, removed or swapped for another mark,
  or its score typed. A bull without a shot counts as a miss (0). One or two shots per bull (found by itself).
- **Checked on the academy's ten sample photos** (on Goo's Mac only, never in git): every card and every bull found,
  photos taken sideways too. The scores match the coaches' pen 68% of the time exactly and 95% within one ring. Most
  differences are close calls the coaches score lower: they judge the hole as it looks (about 4 mm) rather than with
  a 4.5 mm gauge (A15). Two bulls had two holes where the coach counted one: the app shows both and the person picks.
- **Saved as:** the card itself, flattened and cropped like a scan, in the student's Drive folder
  (`YYYY-MM-DD Position paper card.jpg`), and its scores as a paper result with each shot's place on the target. The
  reports and the website's target pictures draw scanned shots and measure their group, as for SIUS results.
- **Publishing:** a public listing; unlisted only if Apple asks for it, since a public app can become unlisted but never
  the other way round. Whose account: decided in §11.

## 11. The phone app, after Goo tried it on their iPhone (2026-10-16)

- **Publishing (Goo):** the app goes out under **HyberTec LLC's own Apple developer account**, as a **public** listing
  anyone can download, not under an account of the academy's. Apple allows it; to be ready for its review, a letter
  from the academy licensing its name and logo to HyberTec (guideline 5.2.1), and review notes that say who builds and
  runs the app (4.2.6, 4.3). Steps: [docs/publishing/apple/rules.md](publishing/apple/rules.md#public-or-unlisted).
- **Checking a card:** pinch to zoom into the card and into a bull; a shot is held and dragged onto its hole (its
  circle is the pellet's size at every zoom, and its score follows as it moves); a tap places a missing one.
- **Close calls get a look:** a hole that touches a ring's line by less than 0.4 mm is marked to check, with the reason
  ("the hole touches the 8 ring's line by 0.22 mm, so ISSF counts 8; by eye it may look like 7"). This is where the app
  and the coaches differ most (one sample card: 80 by the gauge, 77 by the coach); A15 still asks which way the
  academy scores.
- **Saving is instant:** the card's scores are kept on the phone at once (the server confirms them), and the card's copy
  uploads in the background. It waits in the app's own files until the Drive has it, so closing the app or losing the
  connection only delays it (the app tries again when it opens); a copy the Drive refuses says so in a message, and
  its file shows "Upload failed" in the Drive.
- **A score opens its own screen** on the phone (from the student's page): its total, group and where the group sits,
  its shots played back one by one, and what can be changed. A scanned card comes back as it was checked, on the
  card's picture, to move, add or remove shots bull by bull; a typed card takes new scores; the position, the date
  (paper) and the coach's note change; Save keeps the changes, and leaving asks first. A SIUS result's scores stay as
  its PDF gives them, as on the website. A score is deleted from its screen, by swiping its row to the left, or by
  holding the row (Open, Delete); its file stays in the Drive.
- **Shots played back:** a result's shots appear on one target one by one in the order they were fired (the newest in
  amber with its number, earlier ones in the position's colour), with the shot, its score and the running total under
  it; play, pause, step and play again. On the phone's score screen and the website's score details, and later in the
  reports that compare results.

## 12. The phone app and the website, after Goo's second try (2026-10-16)

- **Moving a shot:** a finger dragged anywhere on the bull's picture moves the shot nearest it, by the same amount, so
  the finger never covers the circle (Goo: "hold anywhere and drag"); zoomed in, the same move is finer. Two fingers
  zoom; a tap places a missing shot.
- **Zoom stays where it's left:** a pinch no longer zooms back out or jumps (its fingers counted as taps, and the pinch
  and the one-finger pan shared one starting point), and the page doesn't scroll while two fingers are on the card.
- **Typing a note:** the field moves above the keyboard as it's typed in, a Done bar closes the keyboard, and dragging
  the page down does too. Messages ("Saved") show under the header, so Back is never covered.
- **Right after a scan** the check screen looks like a score's screen: the total, then the shots played back at once,
  then the card to zoom into and correct bull by bull; every change shows in the replay. Closing it with a card not
  saved asks first.
- **A SIUS result's shots as darts:** each series shows one small target per shot with where it hit and its score,
  following the replay as it plays; tapping one shows it large (how far from the centre and which way) with the shots
  before and after a tap away. On the phone and on the website.
- **The replay everywhere the website draws a result:** a student's Scores (shown without opening a row), the reports
  on screen (a still picture when printed), the Drive's details panel.
- **Testing:** every change is tried as the owner uses it, on the iPhone Simulator (taps, drags, two-finger pinches,
  the keyboard, light and dark) and on the website (desktop and phone widths, light and dark), with screenshots looked
  at, before it's called done.

## 13. Coaches in the app, cards corrected on the website, and the zoom fixed for good (2026-10-17)

- **The zoom jumped on a real phone** (Goo, a second time): a hand's second finger lands a moment after the first and
  one finger lifts before the other, which the previous tests (both fingers at once) never did. The page also took the
  first finger to scroll before the picture knew it was a pinch. Every zoomable picture now follows each finger and
  carries on from the fingers that are down, so a late finger or a lifted one never moves the picture, and the page waits
  for the picture on the phone's own gesture thread. A drag on a shot waits a moment for a second finger, so a pinch
  never nudges a shot. A zoomed picture has a button to zoom back out. Tests now pinch as a hand does (late finger,
  either finger lifted first) and measure the picture between events.
- **Coaches have the app** (the same five tabs as the office): their own classes on Today (with their hours) and the
  Schedule, every student (their own first, "Mine"), no family contacts (the office's, as on the website), scanning
  cards and correcting or deleting scores. Parents and students still see "Coming to the app".
- **Coaches keep scores and the Drive like admins** ("they have pretty much the same"): the rules let them add, correct
  and delete scores and add, rename, move and trash Drive files and folders. Emptying the Trash stays the admins'.
- **Correcting a scanned card on the website**, for admins and coaches: the card's picture zooms (wheel, trackpad pinch,
  two fingers, double-click), a bull opens up close, and its green circle is pressed and dragged onto the hole (on the
  website the pointer is the circle, so it moves the circle grabbed; on the phone a finger anywhere moves the nearest
  one, so the finger never hides it). Shots are added, removed or typed, the replay shows the draft, and Save keeps it
  as the phone does. The sample data has a few scanned cards with made-up pictures to try it on.
- **Each tab's title sits at the top** of the phone's pages, as Today's does, without the empty bar of a large header
  above it.
- **In time order, everywhere a list of classes reads as a day:** the phone's Schedule lists the day's classes earliest
  first, each with its coach (the website's grid keeps coaches as rows, in the academy's order). The other lists were
  checked: people A to Z, results and messages newest first, the Drive's folders A to Z with files newest first.
- **The academy's name is its full one, "Sky Arc Sports Academy"** (Goo: "please use its full name"; this answers
  A11): the sign-in heading says "Sign in to Sky Arc Sports Academy", under the full logo too (an exception to the logo
  rule in CLAUDE.md), on the website and the phone, and the other sign-in pages and tab titles use it.
- **The website's schedule on a phone** gives the classes the width: the coach column is a narrow strip (colour,
  initials, first name) instead of almost half the screen.

## 14. Parents and students, Home instead of Today, every student for coaches (2026-10-17)

- **Parents and students get their part, on the website and in the phone app**, alike ("what they're seeing will be
  very similar"): Home, Classes, Reports and Profile (More on the phone). A parent sees their children, with a child
  switcher; a student sees themself. What families see follows the rules: their children's classes and the progress
  reports the academy shares; not every score as it's saved (a question for the owner, `docs/TODO.md`).
- **A report is "New" for each person until they open it**: every family member gets their own "report ready" notice,
  read when they open the report (on the website or the phone), so a parent opening it doesn't clear it for the
  student.
- **"Home", not "Today"**, for the first page on the website and the phone, for every role ("realistically we don't
  need to name 'Today' for the page"). The page still shows the day.
- **Coaches see every student** ("no need to filter for the coaches"): the Students list is the whole academy on the
  website and the phone, with "All" first; a coach still sees only their own classes (a question for the owner).
- **The owner's to-do list and what we agreed to do later** live in `docs/TODO.md` (a web app for phones comes later:
  people on phones use the phone app, and the website is used from laptops).
- **A keyboard jumping back to letters after each digit in a password field** (the owner, signing in) didn't happen in
  the app or on the website in the iPhone Simulator, typed key by key on the on-screen keyboard, with the English and
  the Korean keyboards. The app doesn't change the keyboard; iPhone users report the same in other apps' password
  fields, where iOS picks the keyboard itself (Apple's English one; never a third-party one). Which keyboard the owner
  uses is a question for them; meanwhile the eye that shows the password lets their usual keyboard type it. (The owner,
  2026-10-18: it didn't happen again; maybe it was a glitch.)

## 15. Families see every score (2026-10-18)

- **Parents and students see every score, not only the reports** ("reports ... you probably going to have one or two
  ... but you're going to have a bunch of score"), on the website and in the phone app: each SIUS result and paper card
  as staff see it, read-only: the shots played back on the target, the series, the scores over time, personal bests,
  and the file the score came from (the SIUS result's PDF, the paper card's picture). A **Scores** page on the website
  and a Scores tab in the app sit between Classes and Reports, and Home shows the latest scores. A result that beat
  every earlier one in its position is marked **"New best"**, for staff as for families. Until now families saw results
  only in the reports the academy shares (§6 Q11, which still holds for reports); the Drive itself stays staff-only.
- **The coach's note on a score is the family's to read too**, as a class's note already is; the forms say so.
- **Within the rules**: a family reads its own children's scores, one student at a time, and only the files those
  scores came from (a score's file in the child's folder, out of the Trash), never the rest of the Drive. A score's
  file stops being one when the score is deleted or the file moves to another student. Storage rules may read only two
  documents per request, so the file's own record carries what the rule needs. A family can read the whole record of
  its own child's score (the rules can't hide a field): that includes the PDF reader's notes (a series that doesn't add
  up) and which staff email added it, which the pages don't show; never anything about another student.
- **The rest is unchanged**: staff add, correct and delete scores; reports stay the academy's summaries to share.
- **Staff see the latest scores on Home** (owners, admins and coaches, on the website and in the app): the newest
  results of the last two weeks across the academy, each with its target in small, opening that result.
- **Signing out of the phone app forgets the files it downloaded** (SIUS PDFs, card photos), and the family's screens
  show only their own students' records, so whoever signs in next on a shared phone never sees the last person's.
- **Confirmations are the app's own dialogs**, never the browser's pop-up (deleting a class, emptying the Trash,
  removing a kiosk PIN, leaving kiosk mode and the rest), with words that say what will happen.
- **Approving a parent's request** offers the children the request names, when a student has that exact name, as one
  click to add (the admin still chooses: a parent's access to a child's records is theirs to grant).

## 16. The academy's news for families (2026-10-18)

- **An announcement can be shown to families too** (the owner's open question, built to try: "if there's something I
  don't like I'm going to tell you to delete"): a "Families too" switch in the editor, off unless the admin turns it on.
  Parents and students see those posts on their Home and a News page (the website) or screen (the app), marked "New"
  until they open them; archived posts leave their view. Comments stay with staff: families neither read nor write them.
  Families aren't notified yet (they have no inbox on the website, and push isn't on); the "New" mark is the signal.
- **Within the rules**: a family lists only posts shown to families and not archived (the query must ask for both), and
  writes only its own read receipt. A family reads a score's file record one at a time by its ID, never as a list (a
  query could have left the Trash check unasked; found while writing these rules).


## 17. Coaches on the phone, "not available" days, and the Drive's drop area (2026-10-18)

The owner, as a coach on the phone: "I don't have availability section here … I need to have every ability to do
whatever I'm able to do as a coach on the website … on the phone too … Not only for the coach, but also for students
and parents. Except admin."

- **Availability on the phone, as clean as the owner's True Education design**: a tab of its own for coaches. Months
  scroll down; each day is only its number, in a light green circle when available, a grey one when marked not
  available, plain when nothing is set (an amber dot when it's inside the notice window and still to set); closed and
  past days are light grey. A day opens a sheet: Available or Not available, start and end time wheels inside that
  date's hours (up to the academy's number of times a day), Repeat every weekday (2–12 weeks, or every other week), and
  Cancel, Remove and Save; a day inside the lock window says it's locked and shows what's saved. The top says the
  academy's rule ("Set availability 2 weeks ahead · Changes within 7 days need an admin"); Today and the ⋯ menu (Copy
  last week, Repeat weekly) sit by the title. HyberCRM's phone app (times in each day) was "really complicated".
- **A coach's tabs: Home · Schedule · Availability · Scan · More.** A phone's tab bar holds five, so the coach's
  Students is More's first row; the office keeps Home · Schedule · Scan · Students · More.
- **"Not available" is an answer**, on the website and the phone: a day holds times, "not available", or nothing. Only
  open days with nothing set count as days still to set (the calendar's amber days, the "N days aren't set" notice, the
  website's and the phone's Home to-do), so a coach is no longer pushed to give times for a day off (the owner: "kind of
  forcing them to actually mark their availability, which is a huge error"). The notice offers "Not available on all"
  in one tap; the website's selection bar and day editor mark days not available; copying, pasting and repeating days
  carry the mark. The schedule tells an admin "marked not available" from "hasn't given availability", and the admin's
  day editor "Not set" from "Not available". The rules keep a day marked not available without times. Repeat weekly
  can skip a week (every other week): the Sunday rotation in the meeting notes.
- **A coach's payroll looks like the office's**, on the website and the phone ("we have a filter feature … so much
  easier and clean"): the pay period or dates with Generate and Clear, a summary with the coach's rate and pay, the
  records (the same ones the office lists, from one shared builder) and CSV; it opens on the current pay period.
- **What coaches do on the website, on the phone too**: News (the academy's posts, with comments) and their
  notifications (Home's bell); Home's to-do (classes waiting for the admin, days to set, unread posts) and time clock;
  the Drive (browse, search, open, rename, move, Trash, new folders, photos added to a folder); Reports (every report;
  sharing a draft with the family, with the email link or not); their details, notification switches and sign-in
  (changing or adding a password: for parents and students too); a student's details and calendar. Comparing two
  results (lowest, previous, first or any two) is on the phone's score screens, and families' Classes have a month view.
  Still on the website only: SIUS PDFs (the phone can pick files, but reading a SIUS result is the website's), typing
  paper scores for a photo already in the Drive, and the Trash.
- **The Drive opens with its drop area** ("Drop SIUS PDFs here · one or several", and Choose PDFs), for admins and
  coaches: the app reads each result's date and scores, asks whose it is and the position (suggested from the file
  name, marked so, with "Set all" for several), files each in the student's folder named by its date, and saves its
  scores; a PDF that isn't a SIUS result is kept as a file. It always worked by dropping anywhere on the page, but
  nothing showed it, so the owner didn't find it. (Replaced on 2026-10-30, §28: no drop area; a drag over the page says
  where the files will land.)
- **The meeting notes, checked** (the notes stay out of git): what's still missing is in `docs/TODO.md`.


## 18. The public website (2026-10-19)

The owner: "It's time to build the public website … the landing page / homepage and the public pages that go with it."
After five clickable design options (local only, in `docs/internal/site-demos/`), the owner picked option 3,
"Academy" ("it's very clean"), asked for refinements, then: "deploy the option 3 as the main landing page, main
homepage now … I'll actually test and verify from the live website".

- **The site** (`web/src/site`): Home, Programs (with tuition), About (with the coaches), Gallery, News and each post,
  Book a trial, Contact and the Parent portal page, in English at `/` and a Korean draft at `/ko/`. Log in is the
  app's sign-in page, unchanged; on a browser that's signed in, the header says "Open the app". Each page's HTML is
  built with its own title and description for search engines and link previews.
- **What the owner asked for in the refinements**: the logo intro a little longer (about 2.2 s, "but not too long"),
  played on the homepage once per visit; the academy's match-day photo at the top of the homepage; the iPad showing a
  parent's progress report upright like the PDF it is, held in place while the page scrolls the report inside it, as
  on HyberCRM's website, so it can't be skipped; "One path, four levels" joining option 2's tightening shot group to
  option 4's rank chart (the scores and groups are illustrations; the rank ranges are the academy's, on its 3×10
  format); a Google Map at 730 Peachtree Industrial Blvd ("technically Eyelevel Learning Center Suwanee … the same
  building … you can just point eye level and then you can just say that skyarc"); News showing 12 posts, then more as
  the reader scrolls, with no button; and words for parents only ("think of that we're showing this to the parents":
  nothing about how the site or the app works).
- **The plan's five calls, accepted with the deploy**: (1) two trials, as on the academy's earlier site: Trial One
  (safety, no shooting) is asked for online, Trial Two follows; (2) instant booking that the office can move or cancel,
  built when booking opens; (3) **booking stays closed until the academy approves the privacy policy** (§6, Q15):
  until then "Book a trial" sends a request (the days that suit the family, the athlete and the parent) and the office
  replies; (4) the academy's photos never go into git: they live in Storage and are managed on the CRM's Website page
  (HyberTec loaded the earlier site's photos, coaches, hours and news once, after the deploy); (5) tuition is a section
  of Programs while rates are "by inquiry".
- **Testimonials are real or marked.** The owner asked to make up many reviews when none could be found online. The
  site never presents made-up quotes as real (the brief's rule, and the FTC's 2024 rule on fake reviews): until the
  academy adds real ones on the Website page (with the family's permission), it shows sample quotes, each marked
  "Sample". They must be real, or gone, before skyarcacademy.com points here (`docs/DEPLOY.md`).
- **The Website page** (owners and admins; Settings → Website since 2026-10-27, §22): the trial requests and questions sent from the site
  (newest first, New and Done), the photo library (several at a time, from a phone too, resized in the browser to a few
  widths; caption, album, focus point, hide, order, delete), which photo goes where on the site, the coaches' cards,
  families' quotes, the hours the site shows (not the schedule's own hours, which are wider) and the Instagram link.
- **News from the CRM**: an announcement's "On the website" switch (with a category and a cover picture) puts it on the
  site's News; a Cloud Function keeps a public copy holding only the title, text, category, cover, pin and dates (no
  author, audience, comments or attachments). Switching it off, archiving or deleting the post takes it off the site.
  Its address is fixed the first time it goes on the site. Children's names and photos only with their parents'
  permission (the editor says so).
- **Messages from the website** (`websiteMessage`): checked again on the server, dropped when a bot fills a field people
  never see, and limited per sender (5 an hour from one network address, 3 per email, 200 a day in all). Each is kept
  for the Website page, owners and admins get a notification, and the office an email they can reply to: the
  academy's email in Settings → Academy, or the owners' and admins' own until it's set.
- **Public data, public rules**: anyone reads the site's photos (unless hidden), its content (`public/website`) and its
  news copies; only admins write them, and nobody but the function writes a message. The public pages read these over
  Firestore's REST API and send messages over HTTPS, without the Firebase SDK.
- **Languages**: the site's Korean is a draft the owner reviews by hand ("when we trying to create something with
  Korean from AI it's not really accurate"); more languages come later, even after launch (`docs/TODO.md`). What the
  academy writes in the CRM (news, captions, coaches) shows as written.
- **The owner's first review of the live site (2026-10-20)**:
  - *One path, four levels*: each level's first line rests level with the panel's ("they're starting at the same
    point"), and the page glides to a level "like a magnet" when the reader stops between two: on to the one they were
    heading for, back if they hardly moved. It follows the wheel, the trackpad, touch and the page keys; the arrow keys
    move freely, and nothing moves by itself with reduced motion.
  - *Programs* in the header goes to the Programs page; its menu opens on hover ("I'm okay with having drop-downs …
    but program just make me move to programs").
  - *Unconfirmed facts are left out, not marked*: the trials' price and length, tuition, the youngest age and coaching
    in Korean aren't on the pages until the academy confirms them (the owner, of the "Placeholder" note: "if we can get
    rid of it, please get rid of it"). Photos still to come stay marked.
  - *Contact*: the phone and email the site shows are Settings → Academy's (the academy's own Gmail, never
    HyberTec's); an address or an email never breaks across lines.
  - *Official logos*: SIUS's own logo where the site names its scoring system ("so that you look more official and
    professional"). Another organisation's logo only where the academy belongs to it and the organisation allows it
    (the NCAA's rules don't let a club use its logo).
  - *The closing banner*, on every page, shows a photo the academy chooses on the Website page, melting into the black
    ("smoothly blends with a black background"). A photo can be **Pages only**: used in a spot (a banner, a coach's
    portrait), kept out of the gallery.
  - More pictures and fewer words where the text was a list: the two advanced pathways (the Sporter ranks on their
    score scale; where Precision leads) and the three placement steps (each step's parts with icons).


## 19. Publishing the phone app (2026-10-20)

- **The App Store first, as soon as possible, then updates** (the owner). Android follows once it has been tried on
  Android phones. **TestFlight is optional**: Apple reviews a build without it, so the owner uses it only to try a build
  first. The owner uploads and submits; Claude Code prepares everything else, and runs the upload only when asked.
- **The guides**: `docs/publishing.md` is the map ("should be just a summary to navigate which one to follow"), with
  step-by-step guides and their links in `docs/publishing/`: `apple/` (`app-store.md`, `testflight.md`, and
  `rules.md`, the reasons behind the answers), `google-play/` (`testing.md`, `production.md`) and `updates.md`. The
  texts to paste stay in `docs/store/`.
- **Screenshots from the owner's iPhone** ("can't i just take screenshot from my iphone and just use that?"): eight of
  them, the families' first (a progress report, its target, Scores, Home), then the office's (Home, Schedule, Scan,
  Students). At 1179 × 2556 they are the 6.3-inch size Apple now requires; a 6.9-inch copy waits in case App Store
  Connect asks for that size too. Android's were made on an Android emulator from the practice copy (the owner,
  2026-10-26), at the sizes Google's page gives.
- **The reviewers' logins**: four sample people in production (the office, a coach, a parent, and a student for trying
  Delete my account), made by `scripts/review-logins.ts`, their passwords only on the owner's Mac.
- **Expo's modules are built from source** (`mobile/app.config.ts`): the prebuilt image module carried SDWebImage
  without the privacy manifest Apple requires of it (ITMS-91061). The first build after the change takes longer.
- **Store answers**: staff comments make the honest answers to Apple's "User-Generated Content" and "Messaging and
  Chat" Yes (neither changes the 9+ rating); the privacy answers add what coaches enter (their phone, address, birth
  date and availability), comments and what people opened. On Google Play the target audience includes the academy's
  youngest students, which puts the app under Google's Families policy (no ads or advertising ID, as already).
- **Google Play account**: an organization account for HyberTec LLC was the recommendation (no two-week closed test).
  **It is one** (the owner, 2026-10-26): HyberTec LLC's developer account is verified as an organization, so the
  Android app goes from internal testing to the release with no closed test (`docs/publishing/google-play/`).

## 20. The academy's answers to the first email (2026-10-24)

The manager's answers to A1–A9 (`docs/QUESTIONS.md`), and Goo's calls on them. Names, contacts and pay rates are in
`docs/internal/academy-answers-2026-10.md`.

- **The staff:** the manager (an admin, at the academy every day) and four coaches, two of them also coordinators (the
  program, the facility), each with their usual days. Sundays: the manager and one coach every week, the other coaches
  in turn. Everyone may fill in on other days. The manager signs in with a personal address (Goo), not the academy's
  own.
- **Pay: Hourly.** Everyone is paid by the hour for all their time at the academy, from clock-in to clock-out, at
  their own rate. They clock in 30 minutes before the first class to set up (Mondays: 4:00 PM for 4:30). That is the
  app's **Hourly** pay model (Settings → Academy rules), which replaces Classes taught (§6, Q10) when the real data
  moves in. Coaches are paid for an hour even when every student cancels: the clock pays it.
- **Cancellations:** 24 hours' notice, preferably. A missed class is made up during the week when there's room, and on
  a make-up day near the end of the month (a Friday on the sheets). Nothing in the app enforces it: families don't
  cancel in the app, and make-ups stay labels on a class ("MU for 10/13", the sheets' own words; §7).
- **Extra practice:** students in light blue on the sheets come for extra practice. The manager would like them to book
  it themselves when seats open (`docs/TODO.md`).
- **SIUS reports:**
  - The shooter's name can be set on the lanes (A6). None of the ten reports so far prints one, so the reader keeps
    every other word on a report and the Drive looks for a student's name there first, wherever SIUS prints it, then
    in the file name as before (built 2026-10-24). Nothing to ask the academy for.
  - The SIUS computers' clocks will be set to Eastern (A7); meanwhile the app keeps correcting them (§8).
  - **A session shot without switching to match mode counts** (A8). SIUS then prints sighters only (Total 0), and the
    app now scores the sighters as the session's shots (built 2026-10-24); two of the ten sample reports are such
    sessions, 20 shots each. Every shot counts, however many: 20, 40 or 60, and several positions in one session.
  - A `0.0` without a direction arrow is a fault of one target's sensor, not a shot (A9), as the app already treats it.
- **The schedule sheets** (A4): monthly sheets give each month's standing week, and weekly sheets give what happened
  each week from August 31: make-ups, practice, trials, absences, and the monthly make-up Friday. Under each day, each
  time slot has six seats in two columns. Each seat holds a level with the student's rifle (`C9`; also `(P)` or `JG`,
  kept as written), then the student's name. No sheet names the coaches, but their days are known (A2): Monday three
  coaches, Tuesday to Thursday two, Sunday two plus one in rotation, and the manager every day.
- **Classes are taught by every coach on duty together** (A16, the manager, 2026-10-25): the coaches help each other,
  and a class usually has four or five students. Mondays, three coaches come at 4 PM and one leaves after the first
  class ends at 6 PM; the other days have two. So a class belongs to the academy, not to one coach, and the app's model
  (one coach per student per class, from HyberCRM's tutoring) changes. Goo picks how classes look from design options
  first (`docs/TODO.md`); the classes are imported in that shape.
- **The students' spreadsheet** (A1, 2026-10-25): each student's school grade and a parent's email and phone, two
  parents for some families, no parents' names. The grades are for the academy's owner to review; where both tabs give
  one, they agree. Every student on it is on the sheets (a few seats use a first name only, or another spelling). Four
  students on November's sheet aren't on it: not asked (§21). Grades now start at 1st (the list began at 3rd).
- **Moving the real data in** (Goo, 2026-10-24): only after Apple's review, since the App Store's review logins are
  sample people. The import adds everyone's records but no access, so nobody is emailed. The office gives access from
  the website when it's ready, and that sends the sign-in emails. The steps are in `docs/TODO.md`.

## 21. Classes taught together: the design (2026-10-26)

Goo looked at the four design options for classes taught together (clickable demos, local only in
`docs/internal/class-demos/`) and picked **option 1, "Like the sheets"**, with changes: "very clean, simple, easy,
modern, professional", without changing much more.

- **The schedule looks like the academy's sheets.** Week: a column per open day, who's in at the top, then each class
  with its time on the left and its seats two across (six by default), every student in their level's colour with
  their rifle code; make-ups, extra practice and trials in the sheets' label colours; open seats hatched. Day: the same
  classes larger, to mark who's here. Drag a student to an open seat to move them; open a class to change it. Fridays
  and Saturdays fold into one "closed" marker. **No Month view**: the academy plans a week at a time.
- **The week runs Monday to Sunday** (Goo, the same day: "i want Monday to be first and sunday to be last"), as the
  sheets do: the schedule's week on the website and the phone, Duplicate a week, Copy last week and the week's totals
  (Settings → Schedule, "Weeks start on", now Monday by default). **Month calendars start on Sunday** ("that's how
  calendar works"): every month view, the schedule's mini calendar and the date pickers (`CALENDAR_WEEK_START`).
- **Gentler colours:** the sheets' own colours, lighter (Goo: "same colour, just lighter"), and a dark wash of each in
  dark mode (`shared/src/schedule/seatColors.ts`, for the phone too).
- **A floating panel on the right** that closes and opens again (Esc, or the button in the header), like the schedule's
  side rail before: the day, ‹ Today ›, Day / Week, the scrolling month calendar, who's in (with a dot on whoever has
  clocked in), and the legend. With the panel closed, the header keeps the day's controls; on a phone it's a sheet.
- **No absence list:** a canceled seat shows on its class; "Add a student" lists the make-ups still owed first.
- **Here / No-show** only on today and earlier days: a class next week has nothing to mark yet.
- **The model:**
  - A class is the academy's own record (`classes`): a day, a time, its seats (Settings → Academy rules, "Seats per
    class", six by default; each class can have its own) and a note for the coaches.
  - Each student in it is a session with the class's `classId`. Its note is its label in the sheets' words ("MU for
    10/13", "Practice", "Trial 1"), which also gives its colour. A seat can be part of the class (a half-hour trial).
  - **Who's in** is each coach's availability that day: every coach in at a class's time teaches it. The office sets
    it from the schedule ("Who's in"); coaches set their own as before. The manager can be in without teaching.
  - Coaches see every class and its students, and who else is in, not only "their" students.
  - Sessions keep an empty `coachId` (older ones keep theirs), so the phone app in the App Store keeps working until
    its update.
  - Pay: under Hourly (the academy's), nothing changes. Under the other models, a class counts for every coach in at
    its time.
  - Notices about a student's class go to the coaches in at its time.
- **Not asked** (Goo): the manager answered well twice, so the four students missing from the spreadsheet come in
  without parents, and the academy owner's sign-in email waits for access (A17, A18 dropped). The office fills both
  in from the website.
- **The phone app changes in its own session** (Goo's MacBook Pro), from `docs/mobile-classes.md`. No second App Store
  submission while 1.0 is in review: the change ships as an update afterwards.
- **When it goes live:** Goo merged it on 2026-10-26 and moved the real data in the same day, during Apple's review
  of 1.0: Apple doesn't check whether data is real, and Goo chose to let the review account, an admin, see the
  academy's real data rather than wait (the trade-off, the reviewers seeing real children and their parents' contacts,
  was laid out first). The office login keeps its email and password as an admin of its own; the coach, parent and
  student logins went with the sample people. So the 1.0 build can still open a class (it finds one by a single coach),
  each seat carries its class's lead coach until the phone's update (`scripts/lead-coach.ts`, `docs/TODO.md`).

## 22. A demo academy to show the app, and the website's messages on Home (2026-10-27)

The owner shows the app to the academy with plenty of data, then switches to the real academy ("in fact, we've moved
in all the data you sent, so you can start using it"). Production has held only the real academy since 2026-10-26
(§21), which is still thin. The owner asked for a switch between demo and real data, and to tidy things before the
first presentation.

- **A second academy in production, `demo`** (`DEMO_ACADEMY_ID`, `shared/src/academy.ts`), beside the real one
  (`skyarc`), holding the sample data (`shared/src/sample/`): made-up coaches, students, families, ten weeks of classes,
  scores with their SIUS PDFs, reports, announcements, and a few trial requests and questions from the website.
  - The first `npm run seed:sample` on production makes it from the real academy: its name, contact, settings and
    rules, its website (the pages' content and the photos' records; the files stay the real academy's, and the demo
    never deletes them), and its owners, as owners.
  - On production the script fills only the demo academy and refuses the real one. Running it again moves the demo's
    weeks to the new today.
  - The same security rules and functions serve both (they were already written per academy). The demo sends no
    email and no phone notification: its notices stay in the website's bell and the phone's inbox. The public website
    shows only the real academy.
  - **Demo logins** (2026-10-27, for showing the phone): an office admin, a coach, a parent of two and a student, on the
    reserved `@skyarc-sample.test` addresses, in the demo academy only. Their one password stays on the Mac mini
    (`docs/internal/`). On the website they open the demo straight away; the phone app opens it from its next build
    (1.1.0; "On the phone", below).
- **The switch** is for people in both academies (the owners): **Demo data** in the account menu, remembered per
  browser. Switching opens the person's Home in the other academy and starts every page afresh. While the demo is on,
  "Demo data" shows under the logo (a dot when the sidebar is closed, "Demo" in a phone's top bar), so it's never taken
  for the real academy. Someone in the demo academy alone sees only the demo.
- **On the phone** (the owner, 2026-10-27, to show the demo on phones too): the app picks the academy by account, as the
  website does. A member of the real academy sees the real one; a member of the demo academy alone (the demo's own
  logins, made-up people) sees the demo, with "Demo" in amber beside the logo and each tab's title. The phone has no
  switch: someone in both sees the real academy there.
- **The App Store's review login** has the sample manager's email, so it's also an admin of the demo academy. The
  website offers it the switch; the phone app shows it the real academy.
- **Alternatives set aside:**
  - A separate Firebase project: a second set of services, billing and deploys, for the same result.
  - The emulators on a laptop: no live address to share, and a developer's sign-in.
- **The Website page moved under Settings** (Settings → Website, `/admin/settings/website/…`; the old address
  redirects): it's where the public website is set up.
- **Its messages come to Home:**
  - A **Messages** card on Home lists the trial requests and questions not yet marked done, newest first, with a red
    count. Each opens in Settings → Website → Messages, marked.
  - Home's sidebar badge adds them to what needs the admin.
  - A message's notification opens the message itself.

## 23. The second meeting with the manager (2026-10-27), and Goo's picks (2026-10-28)

The manager saw the website, the portal, the kiosk and the phone app, and asked for changes; the academy will start
using the app once the stores approve it. Every task is in [`MEETING2_FEEDBACK.md`](MEETING2_FEEDBACK.md), by phase,
ticked as its pull request is merged (the full notes, with names and pay, are on Goo's Mac mini only). The phone app is
the main product: families do everything they need there, without calling or texting the academy.

- **Families cancel and request** (`S1`–`S3`): parents and students cancel up to 24 hours before a class (editable; the
  same moment the class is confirmed, so one setting), and request a class, a makeup or a reschedule in an open seat;
  the admin approves or rejects and can still book anything. Families see how many seats are open, never who's in them.
  A student who doesn't show up still gets a makeup; missing that makeup too loses it (`S5`).
- **Everyone is notified** of what concerns them (cancellations, changes, requests, decisions, new scores and reports,
  announcements), with switches per person and push on the phone (`S4`, `P13`, `M3`, `M4`). Goo started the phone's
  push early on the MacBook Pro (`docs/mobile-push.md`): the server already pushes every notice.
- **Coaches' availability:** the lock is 7 days (the notice period becomes 7 too); inside it coaches can add time,
  with an undo, but not remove it; the admin can always change any day (`C1`–`C3`).
- **Pay: one rate, from the kiosk only** (`K1`–`K6`): no admin rate; paid time starts 30 minutes before the coach's first
  class (editable), never earlier; pay ends at the end of the day's last class; no clock-in, no pay. The
  pay models other than Hourly go, since each needs the second rate or pays from the schedule. A coach's extra hour is
  added by hand. The final clock-out rule, the arrival minutes and the pay period wait on the academy's owner.
- **Clock times stay as clocked (Goo, 2026-10-28):** nobody is clocked out at the end of the last class: coaches clock out
  themselves, and the clock-out is kept as they clocked it (8:10 for a class that ended at 8:00), while their pay still
  ends at 8:00 (`timeClock.payEndsAtLastClass`). Anyone who forgets is clocked out at midnight, and Home lists them. The
  pay rule shows only in the payroll: Home, the schedule and a coach's clock card show a clock-in as clocked (3:21, with
  no "paid from 3:30"), and a coach who comes in after the arrival window opens isn't late: Home calls a coach "not
  clocked in" only once their first class has started.
- **Paper cards are scored by the matches' rule, each hole at its real size** (Goo, 2026-10-28; this answers A15 and
  `P1`): a hole touching a ring's line counts that ring, as the competition sheets show matches score (a hole whose
  edge only reaches the 4 line is a 4, even sitting mostly in the 3). The reader measures each hole as the card shows
  it (a 4.5 mm pellet tears a hole about 4.2 mm across) and scores it at that size; a hole it can't read cleanly takes
  the card's usual size, and the pellet's when too few could be read (#68). Whole numbers, 10 to 1. A card the coach
  already scored keeps the written score as the official one (`P4`). The reader is checked on the manager's real cards
  on the Mac mini only; they're never imported or committed (`P2`). "Most of the hole", the meeting's first answer, is
  dropped: no match scores that way.
- **Results have a kind:** Practice, Competition or Evaluation (`P7`–`P9`). Sessions have any number of shots, and an
  electronic shot reaches 10.9; the inner-ten count breaks ties and shows next to totals. **"Bench"** (a new student's
  first week or two) is not a position.
- **Competition sheets from a photo** (`P7`): Google's text reader (Cloud Vision) reads the total and inner tens from the
  photo on the server, and the admin checks them before saving (Goo, 2026-10-28). It needs the Cloud Vision API switched
  on in the Firebase project, which Goo approved.
- **Contracts** (`F4`, `F5`): the office sends a link; the family reads the contract on any phone, types their name and
  signs with a finger, with no app or account; the signed PDF goes to a Contracts folder in the Drive that only owners
  and admins see (Goo, 2026-10-28). The text waits for the academy's blank contract.
- **One post, several places** (`N1`): the announcement editor already writes to coaches, families and the website's
  News; it says so plainly (Internal, Public or Both).
- **A simpler Settings page** with a search box (`ST1`), and **a new schedule view** that shows clock-in and clock-out,
  picked from three clickable options (`V1`).
- **Later:** Korean, the academy's domain and email (the spam fix), a how-to video for parents, tuition on the website,
  a merch shop, and an automatic weekly pay adjustment.
- **Goo's picks, the evening of 2026-10-28:**
  - **The schedule on the website is option B** of the second round: a row per coach whose background is their day
    (not in, their hours, clocked in), each class drawn once across its coaches' rows, clock times as clocked. The
    students come first: each gets a much bigger card with a ⋯ menu; the Week view stacks the days at the same sizes;
    the right panel opens and closes; one to four coaches (usually two or three) all lay out well. Narrow screens keep
    today's schedule, and **the phone app keeps its Schedule tab as it is** (`M5`: nothing to build).
  - **Paper cards keep the match rule** (option A of `scoring-proposal.html`): a hole touching a ring's line counts
    that ring, as the competition sheets show matches do. The manager isn't asked. One change: the reader measures each
    hole at its real size in the photo instead of drawing every hole at the pellet's 4.5 mm (paper closes up around the
    hole, so the fixed circle reached lines the real hole doesn't, where coaches saw the lower ring). "Most of the hole"
    (`fix/paper-scoring`) is dropped. Built in #68; the page that led to it, without the academy's names or photos:
    `docs/proposals/scoring-rule-2026-10-28.html`.
  - **Settings is option 1, "Settings home"** (of three in `settings-options.html`, local; #49's page wasn't simple
    enough): Settings opens on big tiles in three groups (Day to day, People, The academy), each saying in a sentence
    what it's set to now, and a search that finds any setting by its words. Each tile opens a short page at its own
    address (`/admin/settings/hours`, `…/classes`, `…/pay`…) with plain labels, a worked example under the settings it
    helps (pay above all: "in at 3:21 → paid from 3:30"), the fine-tuning under "More options", and a bar at the bottom
    while something isn't saved (Save, Discard; leaving asks first). Only overrides are stored, as before; seats per
    class stay the owners' (admins see them). The addresses from before (`/admin/settings/payroll`,
    `…/schedule?find=…`) open the page their setting is on now.
- **Built on 2026-10-28** (Phase 1 on the Mac mini, merged the same day; the phone's side is Phase 3 on the MacBook Pro):
  - **Availability and pay (#44):** inside the lock the rules let a coach only add time, and undo an add for 15 seconds
    (the website offers it for 10). One hourly rate, written to both stored rate fields until the phone's update; Hourly
    is the only pay model. A coach is paid from `max(clock-in, first class − arrival minutes)` to the clock-out, never
    past the end of their last class (`payEndsAtLastClass`, on; Goo's change of the same day above); their first and
    last class are the ones they're in for (as on the schedule), else the class not over at their clock-in and the
    day's last. Owners and admins are paid as clocked. Extra time on a time entry needs a reason.
  - **Push on the phone (#45, MacBook Pro):** the phone registers for the notices the server already pushed.
  - **Families cancel and ask (#46):** the cancel deadline is the confirmation setting; requests go through the server
    (`cancelClass`, `requestClass`, `decideClassRequest`) and are labeled in the sheets' words on approval; families see
    seats taken (`classSeats`), never names; requests whose class passes unanswered close at night. Notices go to
    families, students, coaches and the office, each with switches; every role has the website's bell.
  - **Posts (#47):** one "Where it goes" choice (inside the academy, the website, or both), and Write news in Settings →
    Website.
  - **Results (#48):** a kind on every result; a card's written score is official (stored as its total, the app's
    reading kept); competitions from their results sheet, read with Google's text reader (Cloud Vision, switched on in
    the project with Goo's OK; on the manager's 8 sheets, 5 read whole and 3 with one or two shots to type); reports list
    competitions apart and compare positions both periods shot; students' other names match SIUS reports and search.
  - **Settings (#49):** regrouped in plain words, the most used first, with a search. **Parents (#50):** a student's
    Family card shows who can sign in and gives a parent access in one click; a parent's name is optional.
  - **The schedule's timeline (V2, #67):** where the page has room, Day and Week show a row for each person in:
    the coaches, a "No coach in" row when a class has nobody, then owners and admins (who don't teach). Behind each
    row are their hours, the time they're not in, and their clock-in to clock-out as clocked (still in: to now).
    Each class is one block across its coaches' rows, ordered so they sit together; a class whose coaches can't
    shows in parts. Its students are cards with the marks and ⋯, then families' requests and open seats. The rows
    grow to fit; the Week stacks the days at one scale. The panel's open or closed is kept per browser. Phones and
    narrow windows keep the sheets' layout (§21).
- **Waiting:**
  - **The paper scoring rule (P1):** decided by Goo on 2026-10-28 ("Goo's picks" above), without the manager: the
    matches' rule, each hole at its real size (#68). On his 36 hand-scored cards it brings the app from 2.6 points
    over his coaches per 10 shots to 1.7, and the shots scored as the coach wrote from 68% to 76%; his coaches still
    give the lower ring to a hole that only just touches a line, where matches give the higher.
  - **Coaches' usual days after November 30 (C4):** the import set them through November 30. Done 2026-10-28 with
    Goo's OK: each person's week as production had it (November's standing week: Monday to Thursday and Sunday, as
    each one's days) carried on from December 1 through February 28, 2027 (191 days), leaving any day already set
    alone. After that, carry them on again or the office uses Repeat weekly (`docs/TODO.md`).
- **Contracts and admin-only folders (F4–F6, 2026-10-28):** every Drive folder and file carries `access` (`staff` or
  `admins`); coaches ask only for `staff` ones, and the rules refuse anything else. A document written without it (the
  phone builds in the stores write Drive documents without it) is read as staff, and a function fills it in; once the
  phone writes it, the rules can require it. Existing documents were marked by a one-time script right after the
  deploy (`scripts/drive-access.ts`, 2026-10-28: everything the Drive held, in both academies, for everyone on staff). The enrollment contract is a
  PDF the office uploads (Settings → Enrollment contract); a student's page sends a signing link (30 days, one
  signature) by copy or email; the family signs on `/sign/:token` with no account (typed name, relationship, a drawn
  signature, consent); the server adds a signature page (the signer, the time in the academy's zone, the IP address and
  browser, the link, the blank contract's SHA-256) and files the PDF in Contracts, which only owners and admins see.
  Signers' names are in English letters (the PDF's standard fonts). **Each student has their own Contracts folder**
  (the owner, 2026-10-29: "each student needs a contract folder, that's where we hold that student's contract"): it sits
  in the student's folder, only owners and admins see it, and their signed contracts go there; the one folder at the top
  that held every contract is emptied into them, and removed, by `scripts/contracts-to-students.ts`.

## 24. Goo's round on the phones (2026-10-28)

Goo tried TestFlight 1.1.0 (5) on an iPhone 15 with the demo logins and asked for these (all merged that night, #78–#81):

- **Owners and admins change anything, any day** (#79): "let's not put too much rules unless I actually ask". A class
  and its seats no longer lock once their day is over, in the rules, on the website (the schedule, Settings → Opening
  hours) and on the phone; a seat shown canceled that wasn't can be put right. Coaches and families still never write
  the schedule. The one lock left is the pay period, which the office locks and unlocks itself in payroll.
- **The office suggests another time** (#81): besides approve and decline, the office suggests another class with a
  seat open, with a note; the family accepts it (booked at once) or asks for another, back and forth until it's booked,
  withdrawn or declined. Requests have one place (waiting on the office, waiting on a family, decided), a badge on the
  schedule, and notices both ways. Two families after the last seat: the first booking wins and the second is told the
  class is full (the server counts the seats in the booking's transaction).
- **The phone, simpler** (#78): the Scan tab shows the paper card first, then "Add a competition", then the latest
  cards, with the tips folded at the bottom; a coach's Home shows classes and students (hours and pay are in More); a
  family's Home shows the next class, the news and the latest scores ("Contact the academy" only before a student is
  linked); Classes → Month scrolls its day's classes; bottom buttons sit clear of the iPhone's rounded edge.
- **Cards on any desk** (#80): the reader finds holes whatever is behind the card (white, brown, black). On Goo's cards
  the app stays a point or so over the coaches where a hole touches the next ring's line: the matches' rule Goo chose
  (§23, P1); the closest calls are shown orange for a look.

## 25. Goo's round on the schedule (2026-10-29)

Goo used the website's timeline (§23) and asked for these:

- **Every slot the same size, in one column** ("the empty slot must be the same size as a student's card, underneath,
  not next to it"): inside a class, its students, families' requests and open seats are each a student card's height
  and the block's full width, one under the other. First the students, then the requests (those waiting on the office,
  then those suggested to a family), each in an open seat's place, then the seats still open; more requests than open
  seats go on under them. A block is as wide as its class is long, and classes with as many seats are as tall.
- **A no-show is obvious:** the whole card turns grey (like a canceled one, without the line through it), says
  "No-show" and keeps its mark; Here keeps the level's colour. The narrow day and week do the same.
- **Everyone in shares the classes** ("just put them in; I know each row gets narrower, I don't mind"): a class's block
  spans the rows of everyone in at its time, owners and admins too; someone in at no class's time keeps a row of their
  own. Coaches stay above the people who don't teach wherever that keeps every class in one piece. Who teaches doesn't
  change: the "No coach in" row and its warning still mean that no coach is in for a class.
- **Right-click** ("if we can right-click the student session card or other places, that'll be really cool"): a
  student's card (here or no-show, then what its ⋯ has), a class (open it, add a student, who's in, remove it), an open
  seat, a request, a person's name and a day's empty space (add a class, who's in) have menus, for the office only. The
  ⋯ buttons and clicks stay as they were. The Students directory and the Drive had right-click menus already.
- **No events on the website** ("I never asked for it; just get rid of it"): the timeline's Events row, adding and
  changing an event, the events on Home and in the narrow day and week, and the event names in Settings are gone.
  Events' data, rules and the phone app stay as they are; the sample data makes none, and its next run deletes the old.
- **Two pages off the menu, still at their addresses:** Employees → Pay Rates (a person's rate is on their page in
  Employees → Directory, where the links that led to Pay Rates go now) and Access Control ("we only have one admin;
  don't delete it, hide it, in case we need it back").

## 26. AI for report text, and the AI page (2026-10-29)

Goo: reports keep the real data and add words written by AI; there should be a page to manage the API keys and see the
spend; more AI features will come, each free to use a cheaper model, and Claude, Gemini or any other provider. Built
within that (Goo can overrule any of it):

- **"Write with AI" on a report** (changes §8's "no AI writes them"): on a draft report, owners and admins see it once
  AI is set up for report text. It asks first, then fills the overview, strengths, focus areas and goals (never the
  coach's note) with a draft written from the report's figures and the student's first name only, as unsaved changes
  they read, edit and save. Those sections show "AI draft: check it" while editing, and the report's side panel says
  the words came from AI. The standard text stays the starting text, what's used without AI, and what Restore brings
  back. The instructions: plain, warm, factual English for parents; only the figures given, never a made-up number;
  no comparing with other students; no medical or psychological claims; never mention AI. A draft whose shape is wrong
  is refused, and a number that isn't in the figures is pointed out to check before saving. Coaches and families never
  see the button; the families' report never says how its words were written.
- **Super admins** (`superAdmins/{email}`, the phone's "View the app as" reads them too): HyberTec's, not the
  academy's. Being one opens Settings → AI and gives no access to the academy's data, so §3's "no hidden Super Admin"
  still holds. Super admins add and remove each other on the page, and there's always one; the first is added with
  `npx tsx scripts/super-admin.ts --add <email>`.
- **Settings → AI**, for super admins only, the one page that names providers and models (everywhere else it's "AI",
  CLAUDE.md): **Models** (each feature's provider, model from the list or typed in with its prices, thinking level
  Minimal, Low, Medium, High or Default, on or off, and Test), **Keys** (Google Gemini, Anthropic Claude, OpenAI: add,
  replace, remove), **Spend** (this month, last month, the last 30 days or chosen dates: requests, input, output and
  thinking tokens, dollars; by feature, model and person; the month against its limit), **Requests** (each one: its
  tokens, cost, time, who, and the provider's error when it failed), **Changes** (every change, who and when) and
  **Super admins**.
- **Every AI request runs in Cloud Functions**: the keys are kept where only the functions read them (the page shows
  their last 4 characters) and never reach a browser or a phone. Each request is logged with its tokens and its cost
  from the prices (thinking billed as output), and refused once the month's logged cost reaches the monthly limit, or
  when the person has made 30 requests in the last hour; both are set on the page ($10 a month and 30 an hour until a
  super admin changes them). The providers are called over their own HTTP APIs, without their SDKs; OpenAI is asked
  not to keep the requests.
- **The model list** (`shared/src/ai/models.ts`) has each provider's models with their prices as checked on
  2026-10-29, a recommended (cheap) one first; a price typed on the page wins over the list's, as providers change them.
- **The model list, checked against the providers' pages (2026-10-30, #91):** Claude Sonnet 5.5, Haiku 5.5 and Opus 5.5;
  Gemini 3.5 Flash-Lite, 3.8 Flash, 4 Argon and 3.1 Flash-Lite; OpenAI's GPT-6 Luna and GPT-6.1 Terra and Sol, with the
  dates their prices change or they shut down. A feature starts on **Claude Sonnet 5.5 at low thinking**. At 400 reports
  a month, that's about $6 (Sonnet 5.5), under $1 (Haiku 5.5) or about $1 (Gemini 3.5 Flash-Lite). Goo chooses
  (`docs/TODO.md`).
- **Gemini is fine to choose** (Goo, 2026-10-30): its API terms' line on apps "likely to be accessed by individuals under
  the age of 18" doesn't stop it here, because only adults use AI: super admins on Settings → AI and the academy's
  owners and admins with "Write with AI". Students and parents never reach it. The AI page no longer warns about it.
- **The monthly spending total needs a Firestore index** (`aiUsage`: `at`, `costUsd`), which the emulators don't ask
  for: without it, every Test and "Write with AI" failed on production with "INTERNAL" (2026-10-30). While the index
  builds, the functions add the month's requests up themselves, and a failure of the server's own shows on the Test in
  its words.

## 27. Goo's round on the phones and the scanner (2026-10-29)

Goo tried TestFlight 1.1.0 (6) on an iPhone and the Android build on a Samsung, scanned the manager's cards on every
desk, and added a competition from its sheet. Built that night (#83–#93; the schedule is §25, the AI §26):

- **The card reader on any desk, in any light** (#83): a card photographed at a slant (the near bulls larger), in uneven
  light (its far end in shadow) or beside other cards' bulls (a pile) no longer fails or numbers the bulls from the wrong
  row. On the 45 real photos kept on the Mac, 43 read as before and the 2 Samsung photos that had failed read every
  bull (82 against the coach's 80: two holes touching the next line, the matches' rule, §23). A hole that shows the same
  grey as the card behind it, on a blurred photo, still needs a person to place it.
- **More colour** (#84): each place's colour (classes red, scores blue, competitions and the Drive amber, reports
  violet, news teal, people green) on section titles and row icons; a score green or amber against the student's own
  average in that position; class statuses in their colours. A coach's day marked **not available** is red, on the
  phone and the website, never the grey of a day not set yet. The Schedule tab's badge no longer shows "0".
- **View the app as** (#85): super admins (§26) see the phone as any of the academy's people (an admin, a coach, a
  parent, a student), or the demo academy, without signing out; "As Jiyeon" beside each tab's title, **Yourself** to go
  back. Only the view changes, as on the website. Apple's and Google's rules don't stop a feature only the developer's
  account sees; the next review notes say so.
- **The family's Classes, remade** (#87): "Needs your answer" (a time the academy suggests: Accept, Ask for another
  time, Withdraw, full width), "Waiting for the academy", "Makeups to book" (**Book**), then the classes, each part
  with its colour and nothing when empty. **Month** is the page: the months scroll as one, a day's tap opens it from the
  bottom (its classes, or "No classes", and **Ask for a class on this day**). Nothing is cut short with large text.
- **A competition as its match** (#89): a results sheet's competition shows its total and inner tens, each position's,
  then each series of ten as the sheet prints it ("K1–K10 · 71 - 1"); a series opens its shots (inner tens starred)
  and plays them back where they have places. A sheet's shots read in tenths. Reports compare each competition with
  the same position's match before it, from before the period too ("+1.2 vs Sep 12"). "Decimal scoring" is now
  "Totals with a decimal point", set from the sheet. **Each shot's place** is read from the sheet's own target
  pictures (#93): on the circle its decimal score allows, kept only when the series' mean lands on the centre printed
  under its picture (on the manager's 9 sheets, kept on the Mac: 54 of 54 series, within 0.09 mm). A picture that can't
  be read leaves its shots with scores only; a very tight group can put one shot up to 1.5 mm off.
- **Each student's Contracts folder** (#88, §23): signed contracts land in the student's own folder; production's empty
  top-level Contracts folder was removed.
- **Not done:** the camera on Goo's Samsung wasn't tried again (the same photos read on the Android emulator); the
  website's day plan for a "Write with AI" button on the phone; telling families that a report's words were drafted with
  AI (a question for Goo, `docs/TODO.md`).

## 28. The Drive: right-click menus, drops anywhere, and each student's Drive tab (2026-10-30)

Goo's asks after trying the website:

- **Right-click menus in the Drive**: on the page (anywhere but a row) **New folder**, **Upload files**, **Upload
  folder** and **Add paper scores…**, then List or Grid and the details; on a folder, its menu with **New** (a folder,
  files or a folder into it, without opening it); on one of several selected, one menu for all of them (Move to…,
  Move to Trash, Clear the selection); on a crumb, its folder's menu. The ⋯ buttons keep the same menus, for touch.
- **No drop area at the top** (it replaces §17's): files dropped anywhere on the page go into the folder open, and SIUS
  PDFs among them are read as before (whose result each is and its position, then filed in the student's folder with
  its scores). While files are dragged over the page, it says where they'll land and what happens to SIUS results;
  PDFs being read show as a notice. **New → Upload files** does what the drop area's "Choose PDFs" did.
- **A Drive tab on the student's page** (Classes, Scores, Info, Calendar, Drive): the student's folder, with everything
  the Drive does inside it (folders, uploads and drops, SIUS results filed as theirs, the menus, a search of their
  folder alone); **Open in the Drive** opens the same folder on the Drive page. Coaches have it too, without the
  Contracts folder (owners' and admins' only). A finished student whose folder is empty shows that it is.
