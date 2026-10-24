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

### First email: answered (2026-10-24)

The manager answered A2–A9 and sent the schedule sheets (A4); the answers are in [`DECISIONS.md`](DECISIONS.md) §20,
with names, contacts and pay rates in `docs/internal/academy-answers-2026-10.md`. Still open from it:

| | Question | Needed for | Until answered |
|---|---|---|---|
| **A1** | **Students:** their names, levels and programs are in the schedule sheets; their **grades and a parent's or guardian's name, email and phone** come in the spreadsheet the manager is sending. | Importing the real data | [Sample data](DEPLOY.md#sample-data) |

### Follow-up (a text or a short email)

| | Question | Needed for | Until answered |
|---|---|---|---|
| **A16** | **Classes and coaches:** is each time slot on the sheets one class of up to six students that the coaches on duty teach together (two most days)? Or does each coach take some of the students, a column of the sheet each? And which coaches teach on each day? | How the app shows classes, and importing them | The classes aren't imported |
| **A17** | **The codes beside a level:** `C9` is a rifle assignment. What do `(P)` and `JG` mean? | The students' records | Kept as written |
| **A18** | **A SIUS report with a name:** once names are set on the lanes (A6), one PDF that shows it, so the app learns where it prints and files reports by it. | Filing SIUS reports | The app asks whose report it is |

### Later: before launch (a second email)

| | Question | Needed for | Until answered |
|---|---|---|---|
| **A10** | **The academy's legal name and mailing address**, if it wants them in the privacy policy's contact section (Settings → Academy). The policy itself is approved and in effect (2026-10-20), with the academy's email and phone. | The privacy policy's contact details | Its name, email and phone |
| **A12** | **The kiosk:** a tablet or computer at the front desk where coaches clock in? Any device with a web browser works. | The kiosk | The kiosk page, opened by an admin on any computer |
| **A13** | **Website content:** coach portraits, real families' quotes (with their permission), trial length and price, the youngest starting age, the range's safety rules, whether coaching happens in Korean, tuition rates or a guide, more photos and a larger match-day photo (`docs/TODO.md`). The phone number is set (2026-10-20). | The public website | Left out until confirmed (photos marked); sample quotes marked "Sample" |
| **A14** | **The domain:** access to skyarcacademy.com, and an email address on it for the app to send from (the academy already uses an address on it, 2026-10-24). | Launch ([`DEPLOY.md`](DEPLOY.md)) | HyberTec's Gmail sends |
| **A15** | **Paper cards:** when a hole touches a ring's line, do coaches give the higher ring as a 4.5 mm gauge would (ISSF's rule, as SIUS scores), or judge by the hole as it looks? The sample cards look like the second. | Scores read from photos | ISSF's rule |
