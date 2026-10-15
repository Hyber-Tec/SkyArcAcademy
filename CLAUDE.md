# CLAUDE.md: Sky Arc Platform

Project context lives in **`SKYARC_PROJECT_BRIEF.md`**. Read it first.

This project is forked/refactored from **HyberCRM** (`/Users/goomini/Documents/HyberTec/HyberCRM`). **Merge in every rule and convention from HyberCRM's `CLAUDE.md`** that still applies (architecture, folder conventions, Firebase patterns, testing, design system). The rules below are **strict** and apply to every developer and every AI session. If HyberCRM's `CLAUDE.md` conflicts with these, **these win.** The HyberCRM rules that apply are already merged into this file (sections "Conventions" and "Git and commits").

Read next: [`docs/DECISIONS.md`](docs/DECISIONS.md) (Goo's answers; they win over the brief and the review) → [`docs/HYBERCRM_REVIEW.md`](docs/HYBERCRM_REVIEW.md) (the fork plan) → [`docs/DEPLOY.md`](docs/DEPLOY.md) (how `main` reaches production).

---

## Strict Rules

### Branches & pull requests
- `main` is reached **only through a pull request**: CI green, plus the code owner's approval wherever a shared file changed.
- A session works on a **branch**, opens the pull request, and **says so**.
- It **never pushes to `main`** and **never merges** unless the owner asks for exactly that.

### GitHub account
- On Goo's Mac mini this folder uses **only Goo's personal GitHub account, `goochoi913`**, never the work account `goo913`.
- The repository's own git config (`.git/config`) sets `user.name goochoi913`, `user.email goochoi913@gmail.com`, and a credential helper that pushes with goochoi913's token from `gh` (`gh auth token --user goochoi913`), ahead of the macOS keychain (which holds the work login). Don't change or bypass it.

### AI naming (permanent rule)
- The app **never names the AI model or provider** in labels, settings, messages, or errors. It is always **"AI."**

### UI
- **shadcn/ui** components.
- Icons from **react-icons**.
- Follow HyberCRM's design system, themed with Sky Arc brand colors (red / black / white).

### Secrets
- **Never commit** API keys, service-account files, tokens, passwords, or PINs.
- Never copy secrets or `.env` values from HyberCRM. Sky Arc has its own Firebase project.
- Never commit real student data, real SIUS reports, or real target photos. Use anonymized fixtures.

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
- **Web first.** Don't start the mobile app. Keep data and APIs mobile-ready.
- **Don't design the landing page.** Homepage is a minimal placeholder (logo, Login, Book a Trial).
- **Terminology:** Coach (not tutor), Class (not session), Academy (not branch), Position = Standing / Kneeling / Prone.
- **Configurable, not hard-coded:** operating hours, cancellation/makeup/trial rules, capacity, pay rates, pay period.
- **Minors' data:** parents see only their own children. Storage and database rules enforce it. No public file URLs for reports.
- **Kiosk PINs** are stored hashed and never logged.
- **Language:** parent-facing screens support Korean + English.

## Owner, accounts, production

- The owner is **Goo Choi, goochoi913@gmail.com**. Everything run for this project uses that account: Firebase, Google Cloud (organization hybertec.com) and GitHub (`goochoi913`).
- Production is the Firebase project **`skyarcacademy`** (Auth with Google and email/password, Firestore `nam5`, Realtime Database `us-central1`, Hosting). The site is **https://skyarcacademy.web.app** until `skyarcacademy.com` moves here at launch.
- **GitHub deploys `main` to production** after every merge, once CI passes on `main` ([`docs/DEPLOY.md`](docs/DEPLOY.md)). Sessions don't deploy by hand. If GitHub Actions is down, deploy only from an up-to-date `main`, never from a branch: production runs reviewed code only.
- When something in the brief is unclear or conflicts with the code, ask Goo (the brief's rule). Record his answers in `docs/DECISIONS.md`.

## Layout

| Path | What |
|---|---|
| `web/` | The website (Vite). Today only the placeholder homepage: `index.html`, `src/home.*`, brand files in `public/`. The HyberCRM fork adds the app here (React 19, React Router 7, TypeScript, Tailwind v4 + shadcn/ui, react-icons) as `app.html`. |
| `firestore.rules`, `firestore.indexes.json`, `storage.rules`, `database.rules.json` | Security rules (deny-all until the fork) and indexes. |
| `scripts/check-repo.sh` | CI's guard: no client material, `.env` files or secrets tracked. |
| `docs/` | `DECISIONS.md` (Goo's answers), `HYBERCRM_REVIEW.md` (fork plan), `DEPLOY.md` (deploy runbook). |
| `.github/` | `workflows/ci.yml` (checks every pull request and `main`, then deploys `main`), `CODEOWNERS` (the shared files). |

The fork also brings HyberCRM's `shared/` (pure TypeScript business logic used by web and functions), `functions/` (Cloud Functions v2), `tests/` and `scripts/`. Update this table when it lands.

## Commands

- `npm --prefix web install` once, then `npm --prefix web run dev` → http://localhost:5173.
- `npm --prefix web run build` → `web/dist` (what Hosting serves).
- `bash scripts/check-repo.sh` → the repository guard CI runs.
- Local Firebase settings: `web/.env.local` (copy `web/.env.example`; values in the Firebase console, Project settings → Your apps → Sky Arc).

## Conventions

Carried over from HyberCRM, adapted to one academy:

- **Identity:** one person, exactly **one role**: `owner` | `admin` | `coach` | `parent` (`student` comes with the phone app). People sign in with **Google** or an **email and password**; access follows the **verified** email only. People records are referenced by ID only.
- **Rules:** every collection gets explicit security rules; never a catch-all allow. Rules tests run in the emulator.
- **Settings:** defaults live in code (`shared/src/settings/defaults.ts`); the academy stores only its overrides; always read settings through the resolver. Never hard-code values Matt hasn't confirmed.
- **Time:** the academy's IANA time zone only, never the browser's. Wall-clock `dateKey` (`YYYY-MM-DD`) + `startMin`/`endMin`, plus absolute `startAt`/`endAt`.
- **Audit:** every schedule, availability, people, pay and settings change writes an append-only `auditLog` entry in the same batch.
- **Schedule UI:** keep HyberCRM's structure (coaches as rows, time across, Day / Week / Month, the side rail).
- **Month calendars (permanent rule):** every monthly calendar scrolls vertically through months like the iOS Calendar app, built on the shared month scroller. Never static months with ‹ › arrows, including mini calendars and date pickers.
- **Language:** Korean + English on every parent-facing screen. The chosen language is stored under `skyarc.lang` (the homepage already uses it).
- **Secrets:** the Firebase web config lives in `web/.env.local` (git-ignored) and in GitHub Actions secrets for the deploy.

## Git and commits

- The repository is HyberTec's: **https://github.com/Hyber-Tec/SkyArcAcademy** (private).
- **`main` is reached through a pull request** (Strict Rules): CI green, plus the code owner's approval where a shared file changed. `.github/CODEOWNERS` lists the shared files; the code owner is `@goochoi913`.
  - The organization is on GitHub's Free plan, so GitHub can't enforce this on a private repository (no branch protection, and CODEOWNERS doesn't request reviews). It holds because everyone follows it.
  - Start the branch from the latest `main`, named `<type>/<topic>` (`feat/kiosk-pin`). Open the pull request with `gh pr create`: the title is a Conventional Commits subject; the body says what changed, how it was checked, and what the deploy after merging will do (or that it changes nothing in production). Give the owner its link.
  - CI (`.github/workflows/ci.yml`) runs the repository guard and the website build (later also typecheck, unit tests, functions build and rules tests). Run the parts the change touches before pushing.
- Scopes name the part of the app (e.g. `auth`, `access`, `settings`, `schedule`, `availability`, `trial`, `students`, `parents`, `coaches`, `payroll`, `kiosk`, `reports`, `announcements`, `i18n`, `home`, `rules`, `functions`, `shared`, `deploy`). Leave the scope off when a change spans several.
- Breaking changes take `!` before the colon, a `BREAKING CHANGE:` footer, or both.

## Locations (Goo's Mac mini)

- **HyberCRM (reference, read-only):** `/Users/goomini/Documents/HyberTec/HyberCRM`. Never edit, commit, or push there.
- **Client assets + brief:** the `SkyArcAcademy/` folder (schedule PDFs, logos, paper target photos, SIUS PDFs, meeting notes). Folder names contain spaces; always quote paths. Assets are never committed.
- This folder is also the git repository. The client material in it (the asset folders, `logo/`, `SkyArc_Meeting_Notes.md`, and any PDF, spreadsheet or photo at the top level) is git-ignored; the brief is committed without students' names. The app's copies of the logos live in `web/public/brand/`.
