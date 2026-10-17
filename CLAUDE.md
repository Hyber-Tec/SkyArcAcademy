# CLAUDE.md: Sky Arc Platform

Project context lives in **`SKYARC_PROJECT_BRIEF.md`**. Read it first.

This project is forked/refactored from **HyberCRM**, HyberTec's CRM (a separate repository; its path on your machine goes in your `CLAUDE.local.md`). **Merge in every rule and convention from HyberCRM's `CLAUDE.md`** that still applies (architecture, folder conventions, Firebase patterns, testing, design system). The rules below are **strict** and apply to every developer and every AI session. If HyberCRM's `CLAUDE.md` conflicts with these, **these win.** The HyberCRM rules that apply are already merged into this file (sections "Conventions" and "Git and commits").

Read next: [`docs/DECISIONS.md`](docs/DECISIONS.md) (the owner's answers; they win over the brief and the review) → [`docs/QUESTIONS.md`](docs/QUESTIONS.md) (what's still open, with the defaults used meanwhile) → [`docs/TODO.md`](docs/TODO.md) (the owner's to-do list and what we agreed to do later: bring up what's due) → [`docs/HYBERCRM_REVIEW.md`](docs/HYBERCRM_REVIEW.md) (the fork plan) → [`docs/DEPLOY.md`](docs/DEPLOY.md) (how `main` reaches production).

---

## Strict Rules

### Branches & pull requests
- `main` is reached **only through a pull request**: CI green, plus the code owner's approval wherever a shared file changed.
- A session works on a **branch**, opens the pull request, and **says so**.
- It **never pushes to `main`** and **never merges** unless the owner asks for exactly that.

### Your accounts and local setup
- Commit and push with **your own personal GitHub account**, never a shared or work account. If your global git identity is another account, set `user.name` and `user.email` in this repository's `.git/config`; never change another developer's setup.
- Your machine-specific setup (accounts, credential helpers, local paths) goes in **`CLAUDE.local.md`** at the repository root. It's git-ignored, and Claude Code reads it together with this file. Never put personal details in this file.

### AI naming (permanent rule)
- The app **never names the AI model or provider** in labels, settings, messages, or errors. It is always **"AI."**

### UI
- **shadcn/ui** components.
- Icons from **react-icons** (the phone app: `lucide-react-native`, the same set, as `mobile/AGENTS.md` says).
- Follow HyberCRM's design system, themed with Sky Arc brand colors (red / black / white).
- **Logos:** only the academy's official files, as "Brand and logos" below says. Never draw, recolor or retype the
  logo, and never put the academy's name in text next to the full logo (the logo already says it), except the sign-in
  heading, which names the academy in full: "Sign in to Sky Arc Sports Academy" (the owner's call, 2026-10-17).

### Secrets
- **Never commit** API keys, service-account files, tokens, passwords, or PINs.
- Never copy secrets or `.env` values from HyberCRM. Sky Arc has its own Firebase project.
- Never commit real student data, real SIUS reports, or real target photos. Use anonymized fixtures.
- **This repository is public.** Never commit client-internal details (people's names, contacts, schedules, money) or
  findings about other HyberTec products (e.g. HyberCRM's weaknesses). They go in `docs/internal/` (git-ignored).
  In committed docs, name the academy's people by role (the owner, the manager, coaches).

### Commits: no attribution
- Commits carry **no attribution trailers**: no `Co-authored-by` line, no session line, no "generated with" footer, in commit messages **or** pull request bodies.
- Every commit is authored **solely as the git user is configured**.

### Commits: Conventional Commits v1.0.0
```
<type>[(scope)][!]: <imperative description>

<body>

<footers>
```
- Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`, `build`, `ci`, `style`.

### Commits: commit far less often
- **One commit per meaningful, self-contained piece of work**: a feature, a fix, a refactor, or a runbook.
- Small things join the commit they belong to.
- **Never** commit per file, per review round, or per step of a session.
- A day's work is **a handful of commits split by type and scope**, not by when the edits were made.

---

## Project Rules

- **Single academy.** No multi-branch or super-admin UI (see the brief for how to handle HyberCRM's branch model).
- **Web first.** The website is the main thing; the phone app (`mobile/`, Expo, iOS first) helps the office see things
  and do a few things (owner, 2026-10-16). Its part for owners and admins came first; coaches have it too since
  2026-10-17 (the same tabs, with what a coach may see), and parents and students have theirs since then too (Home,
  Classes, Reports, More).
- **Don't design the landing page.** Homepage is a minimal placeholder (logo, Login, Book a Trial).
- **Terminology:** Coach (not tutor), Class (not session), Academy (not branch), Position = Standing / Kneeling / Prone.
- **Configurable, not hard-coded:** opening hours, closed dates, the cancellation rule, capacity, pay rates, pay period.
- **Few rules.** Add a rule only when the academy needs one: makeups and trials are labels on a class, and levels
  change by hand (`docs/DECISIONS.md` §7). Ask the academy only what the app can't know; what it can set in Settings
  isn't a question.
- **Samples teach, they never answer** (owner, 2026-10-16, permanent): the academy's sample photos and PDFs are for
  learning how its cards and results look and for measuring how well a reader does. Never hard-code anything from them
  (their scores, file names, positions, or a rule that only makes them come out right): the readers must get better
  for every card, not perfect on the samples. Tests use made-up cards and results.
- **Minors' data:** parents see only their own children. Storage and database rules enforce it. No public file URLs for reports.
- **Kiosk PINs** are stored hashed and never logged.
- **Language:** English only while the features are built. Korean and other languages come in one pass once
  everything works (`docs/DECISIONS.md` §6, Q14).

## Owner and production

- The project owner is **Goo Choi** (HyberTec; `@goochoi913` on GitHub). The owner makes the product decisions, approves changes to the shared files (`.github/CODEOWNERS`) and gives developers access to the production accounts. Each developer uses their own Google and GitHub accounts.
- Production is the Firebase project **`skyarcacademy`** (Auth with Google and email/password, Firestore `nam5`, Realtime Database `us-central1`, Storage and Cloud Functions in `us-central1`, Hosting). The site is **https://skyarcacademy.web.app** until `skyarcacademy.com` moves here at launch.
- **GitHub deploys `main` to production** after every merge, once CI passes on `main` ([`docs/DEPLOY.md`](docs/DEPLOY.md)). Sessions don't deploy by hand. If GitHub Actions is down, deploy only from an up-to-date `main`, never from a branch: production runs reviewed code only.
- **When skyarcacademy.com moves to the app** (the last step before launch), follow `docs/DEPLOY.md`, "Moving to skyarcacademy.com". It includes **asking the owner about the email sender**: mail goes from HyberTec's Gmail until then, and an address on the academy's domain is less likely to land in spam.
- **Production holds sample data** until the academy's real data arrives: fictional people with `sample-` IDs. Remove it with `npm run seed:sample -- --remove` before importing real data (`docs/DEPLOY.md`, "Sample data").
- When something in the brief is unclear or conflicts with the code, ask the owner (the brief's rule). Open questions live in `docs/QUESTIONS.md`; record the answers in `docs/DECISIONS.md` and take them off that list.

## Layout

| Path | What |
|---|---|
| `web/` | The website (Vite, React 19, React Router 7, TypeScript, Tailwind v4 + shadcn/ui, react-icons). `index.html` + `src/home.css` is the placeholder homepage at `/`; `app.html` + `src/main.tsx` is the app at every other address. In `src/`: `app/` routes and guards, `branch/` the academy context (`useBranch()`), `features/<area>/` pages with their Firestore code (`drive/` the Drive and its SIUS upload, `scores/` evaluations and the target picture, `reports/` progress reports), `components/ui/` shadcn components, `pages/public/` sign-in, the trial page and the privacy policy. `public/` holds the brand files and icons. |
| `mobile/` | The phone app (Expo SDK 57, React Native, Expo Router, React Native Firebase), iPhone first: the staff's tabs (Home, Schedule, Scan, Students, More) for owners, admins and coaches, and the family's (Home, Classes, Reports, More) for parents and students. How it's built and its rules: [`mobile/README.md`](mobile/README.md), [`mobile/AGENTS.md`](mobile/AGENTS.md). |
| `shared/` | Pure TypeScript used by the website, the functions and the phone app: time, settings and their defaults, roles, paths, schedule conflicts and notices, pay, email templates; `sius/` (reading SIUS result PDFs), `shooting/` (the target and evaluations), `targets/` (reading a photo of the academy's paper card: its bulls, the holes and their scores, and the review before saving; tested on made-up photos of the card), `drive/` (the Drive's index), `reports/` (a report's figures and standard text). Unit tests sit next to the code. |
| `functions/` | Cloud Functions v2 (Node 22, bundled by esbuild): invite and account emails, class notifications, announcements, kiosk, report sharing, nightly jobs (the Drive's Trash among them). |
| `firestore.rules`, `firestore.indexes.json`, `storage.rules`, `database.rules.json` | Security rules and indexes. The Realtime Database stays deny-all until a feature needs it. |
| `tests/rules/` | Firestore and Storage rules tests (emulators). |
| `scripts/` | `check-repo.sh` (CI's guard), `seed.ts` (the academy and its first owner), `seed-sample.ts` (sample data, and its removal), `lib/sius-pdf.ts` (synthetic SIUS PDFs for the sample data and tests, never real ones), `test-rules.sh`, `deploy.sh` and `open-callables.sh` (CI's deploy), `brand-icons.ts` (PNG copies of the official logos, the phone app's icons and its logo files), `smoke.ts` (pages in headless Chrome), `phone.mjs` (the phone app's commands: simulators, a phone over the cable, tests, setup) and `publish.mjs` (the stores' builds). |
| `docs/` | `DECISIONS.md` (the owner's answers), `QUESTIONS.md` (open questions), `TODO.md` (the owner's to-do and what's agreed for later), `HYBERCRM_REVIEW.md` (fork plan), `DEPLOY.md` (deploy runbook), `running-the-apps.md` (the phone app on simulators and phones), `publishing.md` and `store/` (the App Store and Google Play, later). |
| `.github/` | `workflows/ci.yml` (checks every pull request and `main`, then deploys `main`), `CODEOWNERS` (the shared files). |

## Commands

- Install once: `npm ci && npm ci --prefix web && npm ci --prefix functions`.
- Local, against the emulators (Java 21): `npm run emulators`, then `SKYARC_PROJECT=demo-skyarc FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run seed -- --owner you@example.test --owner-name "You"`, then `npm run dev:emulators` → http://127.0.0.1:5174. The emulators run as the `demo-skyarc` project, so nothing reaches production. Sign in from the browser console with `__skyarcSignIn('you@example.test')` (emulators only).
- `npm run dev` → http://localhost:5173 against **production** Firebase (needs `web/.env.local`: copy `web/.env.example`; values in the Firebase console, Project settings → Your apps → Sky Arc). Real data: prefer the emulators.
- Checks, as CI runs them: `bash scripts/check-repo.sh`, `npm run typecheck`, `npm test` (unit: `shared/` and `scripts/`), `npm run lint`, `npm run build` (website → `web/dist`), `npm --prefix functions run build`, `npm run test:rules` (rules, emulator).
- `npm run seed -- --owner <email> --owner-name "<name>"` → creates the academy and its first owner (production already has them; safe to run again; uses your gcloud login).
- `npm run seed:sample` → adds the sample data (fictional people and ten weeks of classes) to production, or to the emulators with `SKYARC_PROJECT=demo-skyarc FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`; `npm run seed:sample -- --remove` deletes it; `npm run seed:sample -- --login coach=<email>` (or `parent=`, `student=`) gives an email a sample person's access, to see the app as they do.
- `npx tsx scripts/smoke.ts /login /trial` → opens pages in headless Chrome and reports console errors (dev server running).
- The phone app ([`docs/running-the-apps.md`](docs/running-the-apps.md)): `npm run iphone:sim` → the iPhone Simulator on
  the practice copy (the emulators, the sample data, made-up logins with a password kept in `mobile/.expo`);
  `npm run iphone` → the iPhone plugged into the Mac, on production; `npm --prefix mobile run typecheck` and `lint`
  (CI runs both). Nothing goes to TestFlight or the stores until the owner says so ([`docs/publishing.md`](docs/publishing.md)).

## Conventions

Carried over from HyberCRM, adapted to one academy:

- **Identity:** one person, exactly **one role**: `owner` | `admin` | `coach` | `parent` | `student`. People sign in with **Google** or an **email and password**; access follows the **verified** email only. People records are referenced by ID only.
- **One academy in the code:** its data lives under `branches/skyarc` (`ACADEMY_ID` in `shared/src/academy.ts`). HyberCRM's internal names stay (`branchId`, `useBranch()`, `BranchSettings`); people never see "branch".
- **Words in code:** stored values and code say `coach` (`coachId`, `/coach`). A class is a `session` in code and data (`class` is reserved in JavaScript) and **Class** on screen.
- **Rules:** every collection gets explicit security rules; never a catch-all allow. Rules tests run in the emulator.
- **Settings:** defaults live in code (`shared/src/settings/defaults.ts`); the academy stores only its overrides; always read settings through the resolver. Never hard-code values the academy hasn't confirmed.
- **Time:** the academy's IANA time zone only, never the browser's. Wall-clock `dateKey` (`YYYY-MM-DD`) + `startMin`/`endMin`, plus absolute `startAt`/`endAt`.
- **Audit:** every schedule, availability, people, pay and settings change writes an append-only `auditLog` entry in the same batch.
- **Schedule UI:** keep HyberCRM's structure (coaches as rows, time across, Day / Week / Month, the side rail).
- **Month calendars (permanent rule):** every monthly calendar scrolls vertically through months like the iOS Calendar app, built on the shared month scroller. Never static months with ‹ › arrows, including mini calendars and date pickers.
- **Language:** English for now. Keep text in the code, never in images, so the translation pass (several languages, not
  only Korean) can come later.
- **Brand:** HyberCRM's black-and-white theme, plus Sky Arc red as the `brand`, `brand-solid` and `brand-text` color tokens. The logos are fixed in the code ("Brand and logos" below); Settings can't change them.
- **Cloud Functions** run as `functions@skyarcacademy.iam.gserviceaccount.com` with only the roles they use (`docs/DEPLOY.md`). A function that needs another Google service needs that role added there first.
- **Secrets:** the Firebase web config lives in `web/.env.local` (git-ignored) and in GitHub Actions secrets for the deploy. The email app password is the Secret Manager secret `GMAIL_APP_PASSWORD`.

## Brand and logos

The academy's official logo files (sent by the owner on 2026-10-16) live in `web/public/brand/`. Use them as they are:
don't redraw, recolor, stretch, crop or rebuild them from other images.

| File | What it is | Where it goes |
|---|---|---|
| `skyarc-logo.svg` | **The full logo**: "SKY ARC", "SPORTS ACADEMY" and the reticle, black with the red dot, on transparent (1128 × 541, about 2.1 : 1) | Light backgrounds with room: sign-in, sign-up and message cards (centered), reports and printouts, the kiosk's welcome. **The first choice wherever there's room.** |
| `skyarc-logo-white.svg` | The full logo in white with the red dot (made from the file above) | Dark backgrounds and dark mode: the homepage, the kiosk's header |
| `skyarc-wordmark.svg` | **The wordmark**: "SKY ARC" over "SPORTS ACADEMY", black, without the reticle (360 × 83) | Only beside the square icon, in the lockup below |
| `skyarc-wordmark-white.svg` | The wordmark in white (made from the file above) | The lockup in dark mode |
| `skyarc-icon-black.svg` | **The square icon**: the white reticle and red dot on a black square (512 × 512) | Square places: the favicon, app icons (and the phone app's icon), the closed sidebar, the lockup |
| `skyarc-icon-white.svg` | The square icon on white: the black reticle and red dot | A square icon where black would be too heavy (on white paper, next to other light icons) |
| `skyarc-mark-white.svg` | The reticle alone, white with the red dot, on transparent (512 × 512) | Over dark colors or photos: a splash screen, a banner, a watermark |

- **The lockup** is the top of the navigation: the square icon with the wordmark beside it (the owner's layout,
  2026-10-16). The sidebar's top shows it with the open/close button on the right, and nothing else (no academy name
  in text, no portal name); the closed sidebar shows the icon alone; the phone's top bar shows a small lockup.
- **In the website**, use the components in `web/src/components/app/SkyArcMark.tsx`, not the files directly:
  `SkyArcLogo` for the full logo (`tone="auto"` follows dark mode; `tone="black"` on white paper whatever the theme,
  as reports are; `tone="white"` on dark), `SkyArcLockup` for the icon and wordmark (`size="md"` in the sidebar,
  `"sm"` in a top bar), and `SkyArcMark` for the square icon (`tone="black"` or `"white"`).
- **Placement:** on a card that opens with the logo (sign-in, sign-up, messages), the logo is centered above the
  card's content; in headers and on report pages it sits on the left.
- **Sizes:** the full logo needs room to read ("SPORTS ACADEMY" is small): 36 px tall at the least, 64 px on sign-in
  cards and reports. Where there's less room, use the lockup (the icon 44 px and the wordmark 28 px tall in the
  sidebar) or the square icon alone.
- **PNG copies** for places that can't show SVG are built by `scripts/brand-icons.ts` (`npx tsx scripts/brand-icons.ts`,
  rerun it when the files change): the app icons in `icons/`, `brand/skyarc-logo-email.png` (the top of every email,
  through `shared/src/email/logo.ts`), `brand/skyarc-email.png` (the small mark older emails show) and
  `brand/skyarc-og.png` (the picture a shared link shows).
- **The phone app** (Expo, later): the app icon from `skyarc-icon-black.svg`; the full logo on the splash and sign-in
  screens (white on black, or black on white); the lockup at the top of its navigation.
- **Colors** from the logo: black `#0A0A0A`, white, and red `#FB0202` for the dot (the `brand` tokens).
- The designer's file names, for when new versions arrive: `Group 92.svg` is the full logo, `Group 112.svg` the
  wordmark, `Group 96.svg` the white reticle, `Group 97.svg` the black icon, `Group 98.svg` the white icon. The
  originals are kept, git-ignored, in `logo/official/` on the owner's machine.

## Git and commits

- The repository is HyberTec's: **https://github.com/Hyber-Tec/SkyArcAcademy** (public).
- **`main` is reached through a pull request** (Strict Rules): CI green, plus the code owner's approval where a shared file changed. `.github/CODEOWNERS` lists the shared files; the code owner is the project owner.
  - GitHub enforces the first part with a ruleset on `main`: a pull request, with the CI checks "Typecheck, tests and builds" and "Security rules tests" passing. Code-owner approval stays a convention: GitHub doesn't let authors approve their own pull requests.
  - Start the branch from the latest `main`, named `<type>/<topic>` (`feat/kiosk-pin`). Open the pull request with `gh pr create`: the title is a Conventional Commits subject; the body says what changed, how it was checked, and what the deploy after merging will do (or that it changes nothing in production). Give the owner its link.
  - CI (`.github/workflows/ci.yml`) runs the repository guard, typecheck, unit tests, lint, the website and functions builds, and the rules tests. Run the parts the change touches before pushing.
- Scopes name the part of the app (e.g. `auth`, `access`, `settings`, `schedule`, `availability`, `trial`, `students`, `parents`, `coaches`, `payroll`, `kiosk`, `reports`, `announcements`, `i18n`, `home`, `rules`, `functions`, `shared`, `deploy`). Leave the scope off when a change spans several.
- Breaking changes take `!` before the colon, a `BREAKING CHANGE:` footer, or both.

## Local files

- **HyberCRM (reference, read-only):** never edit, commit, or push there from a Sky Arc session. Its path on your machine goes in `CLAUDE.local.md`.
- **Client material** (schedule sheets, logos, paper target photos, SIUS PDFs, meeting notes) can sit in the repository folder on the owner's machine, but it's git-ignored and never committed: the asset folders, `logo/`, `SkyArc_Meeting_Notes.md`, `docs/internal/`, and any PDF, spreadsheet or photo at the top level. Folder names contain spaces; always quote paths. The brief is committed without students' or staff names, and the app's copies of the logos live in `web/public/brand/`.
- **`docs/internal/`** (local only): the full brief with the academy's people, the full HyberCRM review including findings about HyberCRM's code, and anything else that can't be public.
