# Sky Arc Platform

The platform for **Sky Arc Sports Academy**, a youth air rifle academy (standing, kneeling, prone): class scheduling with
makeups, cancellations and trial booking; coaches' availability, kiosk clock-in, time entries and payroll; and progress
reports (SIUS target PDFs and paper-target photos) that parents can follow over time, in Korean and English.

It's forked from HyberTec's **HyberCRM** and runs on Firebase (Auth, Firestore, Hosting; Storage and Cloud Functions
arrive with the fork).

- **Start here:** [`CLAUDE.md`](CLAUDE.md) (the rules) → [`SKYARC_PROJECT_BRIEF.md`](SKYARC_PROJECT_BRIEF.md) (what
  we're building) → [`docs/DECISIONS.md`](docs/DECISIONS.md) → [`docs/HYBERCRM_REVIEW.md`](docs/HYBERCRM_REVIEW.md).
- **Production:** https://skyarcacademy.web.app, deployed by GitHub from `main` ([`docs/DEPLOY.md`](docs/DEPLOY.md)).

## Development

```bash
npm --prefix web install
cp web/.env.example web/.env.local   # then fill it from the Firebase console (Project settings → Your apps → Sky Arc)
npm --prefix web run dev             # http://localhost:5173
```

## Shipping a change

`main` is reached only through a pull request (the full rules: [`CLAUDE.md`](CLAUDE.md), "Git and commits"):

1. Start a branch from the latest `main`: `git switch main && git pull && git switch -c fix/short-topic`.
2. Commit with [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/), one commit per self-contained
   piece of work and no attribution trailers. Push the branch and open a pull request.
3. **CI** checks it. It must be green.
4. A pull request that changes a **shared file** (listed in `.github/CODEOWNERS`) also needs the code owner's approval.
5. After the merge, GitHub deploys `main` to production.
