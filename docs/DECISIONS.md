# Decisions

Goo's answers and the calls already made. They win over the brief and the review (CLAUDE.md). Add new answers at the
end of the matching section, with the date.

## 1. Product (from the brief and the kickoff meeting, Oct 13, 2026)

- **One academy.** No branch creation, no super-admin layer.
- **Web first.** The phone app (admin, coach, parent, student) is Phase 2; data and APIs stay ready for it.
- **No landing page yet.** The homepage is a placeholder: logo, one line, Log in, Book a trial. Goo designs the
  landing page last.
- **Progress reports are uploaded by hand** (bulk SIUS PDFs with a review table, paper-target photos). No SIUS
  integration. Only official evaluations are uploaded (about 1–3 per student per month), starting fresh.
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
  class block on the sheets has six seats.
- **Opening hours** start from the schedule sheets (Sunday and Monday to Thursday; Friday and Saturday closed), as
  settings the academy can change.
- **Brand:** HyberCRM's black-and-white theme with Sky Arc red as the brand color; the academy's logo on sign-in
  pages, the reticle mark in the app and the icons. No "Powered by" line.
- **Email:** from HyberTec's Gmail under the academy's name (Q5, §5). Until its app password is set, no email goes
  out: invites show a sign-in link to copy, and account emails fall back to Firebase's own.
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
  professional redesign later, so the first version shouldn't take much effort.
- **Q14. Languages come last.** English only while the features are built. Korean, and other languages, come in one
  pass once everything works, on the web and in the phone app. The homepage's and trial page's Korean switch is gone,
  so the whole site is English for now. Keep text in the code (not in images) so it can be translated later.
- **Q15. Privacy policy: HyberTec drafts it from a template, and the academy reviews it.** The draft is at `/privacy`,
  linked from the homepage and the sign-in pages, with the academy's name and contact details from Settings → Academy.
  It says "draft" until the academy approves it (A17), and families aren't invited and trial booking stays closed
  until then. It isn't legal advice: the academy may want a lawyer to read it.
- **Questions for the academy:** the open questions and the data still missing are one numbered list in
  `docs/QUESTIONS.md`, in the order of the email Goo sends the academy, so answers can be matched by number. Whatever
  rules the academy gives become settings it can change later.
