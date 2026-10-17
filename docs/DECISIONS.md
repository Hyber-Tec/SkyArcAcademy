# Decisions

Goo's answers and the calls already made. They win over the brief and the review (CLAUDE.md). Add new answers at the
end of the matching section, with the date.

## 1. Product (from the brief and the kickoff meeting, Oct 13, 2026)

- **One academy.** No branch creation, no super-admin layer.
- **Web first.** The phone app (admin, coach, parent, student) is Phase 2; data and APIs stay ready for it.
- **No landing page yet.** The homepage is a placeholder: logo, one line, Log in, Book a trial. Goo designs the
  landing page last.
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
