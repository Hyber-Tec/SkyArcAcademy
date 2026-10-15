# Open questions

Everything still waiting for an answer, in one place. Answers move to [`DECISIONS.md`](DECISIONS.md) with the date,
and the question leaves this page. Until then the app uses the default named next to each question. Any rule the
academy gives becomes a setting it can change later.

## For Goo

Nothing open. Q1–Q15 are answered: see [`DECISIONS.md`](DECISIONS.md) §3, §5 and §6.

## For the academy

One list, numbered as in the email Goo sends the academy, so answers can be matched by number. The email itself, with
names, lives in `docs/internal/`.

### Needed first: the real data

| | Question | Needed for | Default until answered |
|---|---|---|---|
| **A1** | **Students:** name, grade, level and program, the days and times each one comes, and the usual coach. Parents' or guardians' names, emails and phones, and which students are siblings. Any format (a sheet they keep, an export, or our template). | Importing the real data | [Sample data](DEPLOY.md#sample-data) |
| **A2** | **Coaches and staff:** name, sign-in email, phone, role, the days and hours each one works, and how the Sunday rotation goes. | Schedule (step 4) | Sample staff |
| **A3** | **Pay:** paid for classes taught or for all time at the academy; by the hour or a fixed amount per class; each person's rate; how often payday comes, and the next one; paid when every student in a class cancels or doesn't show?; how the manager is paid; does someone approve hours? | Payroll (step 6) | Classes taught at the coach's hourly rate, attended classes only; every two weeks; locking a pay period approves it |
| **A4** | **Hours:** the class times for each day, and the days the academy is closed this year. | Schedule (step 4) | The sheets' hours: Sun 2–5:30, Mon 4:30–8, Tue–Wed 5–8, Thu 5–8:30; Fri–Sat closed |

### Rules (each one becomes a setting)

| | Question | Needed for | Default until answered |
|---|---|---|---|
| **A5** | **Class size:** students per coach in a block (the sheets suggest 5)? Do two seat columns mean two coaches? | Schedule (step 4) | Up to 6 per coach |
| **A6** | **Cancellations:** how much notice? Does a late cancellation or a no-show still use up the class? | Cancellations (step 5) | No rule yet |
| **A7** | **Makeups:** how long before or after the missed class, how many a month, and are any times off-limits? | Makeups (step 5) | About two weeks either way, as on the sheets |
| **A8** | **Trials:** always two 30-minute visits? How many trial students in one class? Which days and times? Is there a fee? | Trials (step 5) | Two 30-minute visits, up to 3 per class |
| **A9** | **Practice and Range Practice:** can families book them? Do they take seats in a class? | Schedule (step 4) | Events on the schedule, not bookable |
| **A10** | **The sheets:** which day was week 1's unlabeled 4:30–6 Precision block, and what do the letters after one level name mean? | Schedule (step 4) | — |

### Shooting reports

| | Question | Needed for |
|---|---|---|
| **A11** | Can the shooter's name be set on the SIUS lane, so it prints on the report? (Today it doesn't.) | Reports (step 7) |
| **A12** | The second SIUS computer's clock is 3 hours behind (its Windows time zone is most likely Pacific). Please set it to Eastern. | Reports (step 7) |
| **A13** | Do sighter-only sessions (Total 0) count as evaluations? With 21–22 match shots, use all of them or the first 20? | Reports (step 7) |
| **A14** | What do the `0.0` shots without a direction arrow mean? | Reports (step 7) |
| **A15** | Should parents see decimal scores (SIUS), whole-number scores (paper cards), or both? | Reports (step 7) |
| **A16** | Is the 3-position set (10 shots each, out of 300, with a coach note) the standard level test? What moves a student up a level? | Reports and levels (step 7) |

### Before launch

| | Question | Needed for | Default until answered |
|---|---|---|---|
| **A17** | **Privacy policy:** review the draft at `/privacy`. Also the academy's legal name, mailing address, and the email and phone for privacy questions (they go in Settings → Academy). | Inviting families, trials | Marked as a draft |
| **A18** | **The name:** "Sky Arc Academy" or "Sky Arc Sports Academy" in the app, the emails and the page footers? | Launch | Settings say Sky Arc Academy; the logo and footers say Sky Arc Sports Academy |
| **A19** | **The kiosk:** a tablet or computer at the front desk where coaches clock in? Any device with a web browser works. | Kiosk (step 6) | The kiosk page, opened by an admin on any computer |
| **A20** | **Website content:** programs, tuition, about, gallery photos, news. | The landing page | — |
| **A21** | **The domain:** access to skyarcacademy.com, and an email address on it for the app to send from. | Launch ([`DEPLOY.md`](DEPLOY.md)) | HyberTec's Gmail sends |
