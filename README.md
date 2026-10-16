# Sky Arc Platform

The platform for **Sky Arc Sports Academy**, a youth air rifle academy (standing, kneeling, prone): class scheduling with
makeups, cancellations and trial booking; coaches' availability, kiosk clock-in, time entries and payroll; and progress
reports (SIUS target PDFs and paper-target photos) that parents can follow over time. English first; Korean and other
languages come once every feature works.

It's forked from HyberTec's **HyberCRM** and runs on Firebase: Auth, Firestore, Storage, Cloud Functions and Hosting.
Today it has HyberCRM's schedule, availability, employees, kiosk, payroll, announcements and access for one academy,
plus Sky Arc's Drive (SIUS PDFs read and filed per student on upload) and progress reports for families; the other
Sky Arc features (class slots, makeups, trials) come next, in the order of
[`docs/HYBERCRM_REVIEW.md`](docs/HYBERCRM_REVIEW.md) §13, with the changes in [`docs/DECISIONS.md`](docs/DECISIONS.md).

- **Start here:** [`CLAUDE.md`](CLAUDE.md) (the rules, layout and commands) →
  [`SKYARC_PROJECT_BRIEF.md`](SKYARC_PROJECT_BRIEF.md) (what we're building) →
  [`docs/DECISIONS.md`](docs/DECISIONS.md) → [`docs/HYBERCRM_REVIEW.md`](docs/HYBERCRM_REVIEW.md).
- **Production:** https://skyarcacademy.web.app, deployed by GitHub from `main` ([`docs/DEPLOY.md`](docs/DEPLOY.md)).
  Until the academy's real data arrives it holds fictional sample data (`npm run seed:sample`; remove it with
  `npm run seed:sample -- --remove`).
- **Phone app:** [`mobile/`](mobile/README.md), the academy office's app (iPhone first, Android too): on a simulator or
  your iPhone with one command ([`docs/running-the-apps.md`](docs/running-the-apps.md)); the stores later
  ([`docs/publishing.md`](docs/publishing.md)).
- **Open questions:** [`docs/QUESTIONS.md`](docs/QUESTIONS.md).

## Development

Node 22 or later, and Java 21 for the Firebase emulators.

```bash
npm ci && npm ci --prefix web && npm ci --prefix functions
npm run emulators                                    # Auth, Firestore, Functions, Storage as the demo-skyarc project
SKYARC_PROJECT=demo-skyarc FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run seed -- --owner you@example.test --owner-name "You"
SKYARC_PROJECT=demo-skyarc FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run seed:sample   # optional: sample people and classes
npm run dev:emulators                                # http://127.0.0.1:5174
```

Sign in from the browser console with `__skyarcSignIn('you@example.test')` (emulators only). The checks CI runs:
`npm run typecheck`, `npm test`, `npm run lint`, `npm run build`, `npm --prefix functions run build`,
`npm run test:rules`.

## Shipping a change

`main` is reached only through a pull request (the full rules: [`CLAUDE.md`](CLAUDE.md), "Git and commits"):

1. Start a branch from the latest `main`: `git switch main && git pull && git switch -c fix/short-topic`.
2. Commit with [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/), one commit per self-contained
   piece of work and no attribution trailers. Push the branch and open a pull request.
3. **CI** checks it. It must be green.
4. A pull request that changes a **shared file** (listed in `.github/CODEOWNERS`) also needs the code owner's approval.
5. After the merge, GitHub deploys `main` to production.
