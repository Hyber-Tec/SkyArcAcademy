# Decisions

Goo's answers and the calls already made. They win over the brief and the review (CLAUDE.md). Add new answers at the
end of the matching section, with the date.

## 1. Product (from the brief and the kickoff meeting, Oct 13, 2026)

- **One academy.** No branch creation, no super-admin layer.
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
  until then. It isn't legal advice: the academy may want a lawyer to read it.
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
  writes them. Admins edit them; admins and coaches share; a shared report is locked until an admin stops sharing it.
  Families get an inbox item, and an email with a sign-in link when whoever shares asks for one.
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
  runs the app (4.2.6, 4.3). Steps: [docs/publishing.md](publishing.md#public-or-unlisted).
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
  nothing showed it, so the owner didn't find it.
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
- **The Website page** (owners and admins, `/admin/website`): the trial requests and questions sent from the site
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

