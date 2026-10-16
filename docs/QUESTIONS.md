# Open questions

Everything still waiting for an answer, in one place. Answers move to [`DECISIONS.md`](DECISIONS.md) with the date,
and the question leaves this page. Until then the app uses the default named next to each question.

## For Goo

Nothing open. Q1–Q15 are answered in [`DECISIONS.md`](DECISIONS.md) §3, §5 and §6, and Goo's review of the academy's
questions is §7.

## For the academy

Only what the app can't know: whatever the academy can set itself in Settings (opening hours, closed days, class
size, the pay period) isn't a question ([`DECISIONS.md`](DECISIONS.md) §7), and any rule the academy gives becomes a
setting it can change later. Numbered as in the email Goo sends the academy, so answers can be matched by number. The email itself, with names, lives in `docs/internal/`.

### First email

**Part 1: the real data (needed first)**

| | Question | Needed for | Until answered |
|---|---|---|---|
| **A1** | **Students:** name, grade, level and program, and a parent's or guardian's name, email and phone. | Importing the real data | [Sample data](DEPLOY.md#sample-data) |
| **A2** | **Coaches and staff:** name, sign-in email, phone, role (manager or coach), the days and hours each one usually works, and how the Sunday rotation works. | The schedule | Sample staff |
| **A3** | **Pay:** for the classes taught, or for all time from clock-in to clock-out? By the hour or a fixed amount per class? Each person's rate. | Payroll | Classes taught, at each coach's hourly rate |
| **A4** | **The schedule sheets:** all of them, past and current, so HyberTec can move the academy's schedule into the app. | Importing the schedule | Sample classes |

**Part 2: rules**

| | Question | Needed for | Until answered |
|---|---|---|---|
| **A5** | **Cancellations:** how much notice? Does a late cancellation or a no-show use up the class? Is the coach paid when every student in a class cancels or doesn't show? | Cancellations | No rule yet; a class nobody attended doesn't pay |

**Part 3: shooting reports**

| | Question | Needed for | Until answered |
|---|---|---|---|
| **A6** | Can the shooter's name be set on the SIUS lane, so it prints on the report? (Today it doesn't.) Fine if not: the app asks whose report it is. | Reports | The app asks, suggesting the student from the file name |
| **A7** | Check the time zone on both SIUS computers: one looks set to Pacific (4 of the 10 sample PDFs show times 3 hours early). Both should be on Eastern. | Reports | The app corrects the time from the PDF (§8), but the printed time stays wrong |
| **A8** | Do sighter-only sessions (Total 0) count? With 21 or 22 match shots, use all of them or the first 20? | Reports | Sighters only: kept as a file, no scores; every match shot counts |
| **A9** | What do the `0.0` shots without a direction arrow mean? | Reports | Not counted as shots |

### Later: before launch (a second email)

| | Question | Needed for | Until answered |
|---|---|---|---|
| **A10** | **Privacy policy:** review the draft at `/privacy`. Also the academy's legal name, mailing address, and the email and phone for privacy questions (they go in Settings → Academy). | Inviting families | Marked as a draft |
| **A11** | **The name:** "Sky Arc Academy" or "Sky Arc Sports Academy" in the app, the emails and the page footers? | Launch | Settings say Sky Arc Academy; the logo and footers say Sky Arc Sports Academy |
| **A12** | **The kiosk:** a tablet or computer at the front desk where coaches clock in? Any device with a web browser works. | The kiosk | The kiosk page, opened by an admin on any computer |
| **A13** | **Website content:** programs, tuition, about, gallery photos, news. | The landing page | — |
| **A14** | **The domain:** access to skyarcacademy.com, and an email address on it for the app to send from. | Launch ([`DEPLOY.md`](DEPLOY.md)) | HyberTec's Gmail sends |
