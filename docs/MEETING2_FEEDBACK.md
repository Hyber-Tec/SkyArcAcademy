# The second meeting with the manager: feedback and tracker (2026-10-27)

**Meeting:** Tuesday evening, October 27, 2026, in person at Sky Arc. HyberTec: Goo and a colleague. Sky Arc: the
manager (listed as Owner in the app).

**What happened:** we showed the manager the new public website, the admin portal on the web, the coach and
parent/student views, the kiosk, and the phone app, which is in App Store review. The manager was very happy ("this is
pretty much everything I asked for and more"), then gave feedback, asked for some changes, explained more about how the
academy and the sport work, and gave us a stack of real paper targets and competition result sheets.

This file is **both the meeting's notes and the task tracker.** Every task has a checkbox; Goo reviewed the list and
their decisions are included. The full notes, with names and pay, stay on Goo's Mac mini (`SkyArc_Meeting2_Feedback.md`
in the project folder, git-ignored): this repository is public, so here people are named by role (CLAUDE.md, "Secrets").

**How it's ticked:** an item is marked done with ✅ in place of its box (`- ✅ **…**`, never `- [x]`, which is hard to
see) when its pull request is merged, with the pull request's number. Each item also says what the code had when the
work started: *already done*, *small change* or *new work*.

---

## 0. Instructions for Claude Code (read first)

1. **Pull the latest `main`** before anything else, at the start of **every** session, on either computer.
2. **Read the context files:** `CLAUDE.md`, `SKYARC_PROJECT_BRIEF.md`, this file, `docs/DECISIONS.md` (§23 records
   this meeting's decisions), and the docs and runbooks in the repository (the phone's publishing docs too). The first
   meeting's notes (`SkyArc_Meeting_Notes.md`) and the full version of this file are on the Mac mini only.
3. **Know the codebase** (public website, web portal, phone app, Firebase rules and functions, settings) before
   changing it: many items were partly built. Change only what's needed.
4. **Find your phase** in Section 4 and do only that phase's items.
5. **Keep this tracker up to date:** mark an item ✅ (in place of its box) when its pull request is merged, with the
   number, in this file and in the full copy on the Mac mini.
6. **Follow every rule in `CLAUDE.md`:** a branch and a pull request, Conventional Commits, few commits, no
   attribution lines, no secrets and no real student data.
7. **Don't break what the manager liked** (Section 2).
8. **The real paper targets and competition sheets are real data, not samples.** Use the photos **locally** to test and
   tune the scoring; never import them into the live system automatically, and never commit them. Goo enters them by
   hand, one by one, through the app (`P2`).
9. **The phone app is in the stores' review.** Phone changes need a new build; follow
   [`docs/publishing/updates.md`](publishing/updates.md).
10. If something is unclear, **ask Goo**. Don't guess.

---

## 1. Quick summary

- The manager loved the website, the portal, the scanner and the reports: we "exceeded his standards."
- The academy wants to **start using it as soon as the app is approved** (1–2 weeks for the stores' review).
- **The phone app is the main product.** Parents, students and coaches will mostly use their phones, not a computer.
  Everything families need (see classes, cancel, request a makeup, get notified, see scores) must work in the app
  without calling or texting the academy.
- The biggest changes:
  1. Families (parents **and** students) can **cancel** up to 24 hours before class and **request** a class, makeup or
     reschedule. The admin approves or rejects.
  2. **Push notifications for everything**, with **notification settings** in the app for every role.
  3. **Coach availability lock: 7 days** (was 14). Coaches can still *add* availability inside the lock.
  4. **One pay rate only** (no admin rate). Paid time comes from the kiosk: 30 minutes early, automatic clock-out at
     class end, and no clock-in means no pay.
  5. **New schedule view options** that show clock-in/out (Goo chooses one from a clickable demo).
  6. **Fix the paper scoring rule** to Sky Arc's "most of the hole" rule (Goo later chose the matches' rule, each hole
     at its real size: `P1`). Support competition results, 20/30/60-shot sessions, and the inner-ten count.
  7. **One composer for announcements and website news**, with rich text and images, posting internally, publicly, or
     both.
  8. **The admin can edit the schedule from the phone.**
  9. **A simpler Settings page** with the new default values.
  10. **Two parents per student** and **admin-only contracts** with online e-signature.
- **Later** (not now): Korean, the domain and email setup, the parent how-to video, tuition on the website, and a merch
  shop.

---

## 2. What the manager saw and liked (keep as is)

Don't remove or redesign these.

- **Website:** the overall design ("looks fabulous"), the **one-time logo intro animation**, the **analytics and score
  visuals** ("very tangible information"), and the overall structure ("maintain the structure you first built").
  Photos can change later in **Settings → Website**.
- **Admin Home:** a one-page summary of today (classes, latest scores, messages from the website's form, who's clocked
  in).
- **Schedule:** matches their Google Sheet, with the same colour legend, Here / No-show, cancel, move to another day,
  Trial (30 minutes or 1 hour), and makeups (MU). *(Goo wants new view options anyway; see `V1`. The current one stays as
  Option 1.)*
- **Coach portal:** coaches only see days they're available, set availability with double-click and copy-paste, and see
  their schedule, hours and payroll.
- **Drive:** drag in SIUS PDFs. The app reads the name, date and scores and files them into the student's folder.
- **Paper target scanner** in the app: photo, instant score, review and fix shots, pick the student, position and date,
  add a note, and save. "A game changer for us."
- **Student page:** classes, calendar, scores, graph, compare two results, and shot replay.
- **AI progress reports:** pick a student and a period, and a report is ready in about 30 seconds. Families can see,
  share and print it.
- **Kiosk:** any tablet; a coach enters their own PIN to clock in or out. Coaches see their own pay log.
- **Payroll:** filter by coach and date range.
- **Access Control:** other admins with limited access (for example, no payroll).
- **Parent view:** a parent with two kids sees both and can filter by child.
- **Colours:** black, white and red. Light and dark mode both look good.

---

## 3. Business context (new information)

| Item | Details |
|---|---|
| Reopened | **Mid-August 2026**, under new management. Real data only goes back to then. |
| Staff | The manager and four coaches; more will join over time. One coach lives far away and gets an hour of travel time a week (`K6`). |
| Students | About 32 in the app now; new students join often. |
| "Bench" | Brand-new students shoot from a bench for a week or two. **It is not a position. Don't add it.** |
| Precision athletes | Mostly high schoolers who use electronic targets only. |

---

## 4. Build phases

Goo has two computers:
- **Mac mini:** the main machine. All website, web portal, backend and data work runs here.
- **MacBook Pro:** **only phone work**, because the iOS and Android emulators need its memory and disk space.

**Order:** Phase 1 → Phase 2 on the **Mac mini**, then Phase 3 on the **MacBook Pro**.

**Two sessions at once (optional, to go faster):** Phase 3 can start on the MacBook Pro **while Phase 2 runs on the Mac
mini**, but **only after Phase 1 is merged into `main`**: Phase 1 builds the shared parts both the website and the app
depend on (the data model, database and storage rules, Cloud Functions, notification events, settings). While both run:
- Each session works on its **own branch**, and each **pulls `main`** before starting.
- The **Phase 3 (phone) session doesn't change shared backend files** (database and storage rules, Cloud Functions,
  shared types). If it needs a backend change, it stops and tells Goo, and the change goes through the Mac mini session.
- Merge one pull request at a time, and pull `main` again after each merge.

To start a phase, paste this into Claude Code on the right computer:
> *"Read `docs/MEETING2_FEEDBACK.md` and do **Phase N**. Pull the latest from GitHub first and follow Section 0."*

---

### Phase 1: Mac mini · Foundation (backend + web admin)

#### V: Schedule view options (first)
- ✅ **V1. A clickable HTML demo with 3 schedule view options.** (ready 2026-10-28: `schedule-options.html`; round 2 the same day: `schedule-timeline-options.html`; Goo picked B)
  - **Round 2 (Goo, 2026-10-28):** option 1 is today's view, option 2 is out, and the timeline (option 3) is the one,
    made like HyberCRM's: a row per coach whose background is their day (grey when not in, white for their hours, a
    quiet band from clock-in to clock-out), with the classes on top, and clock times as clocked (no "late", no pay
    rule). Four ways to do it: A · a row per coach with each class on every row it's taught in, B · each class drawn
    once across its coaches' rows, C · slim rows with a dot per seat, D · time running down the page, a column per
    coach.
  - *Plan:* **New work**, under way: `schedule-options.html` in the project folder, built from the current schedule's
    code.
  - **Why:** the manager likes the current view (Option 1) because it looks like their Google Sheet. Now that coaches
    clock in and out at the kiosk, Goo wants the schedule to show **clock-in and clock-out** clearly and to be easier
    to read at a glance.
  - **Option 1** = the current view, recreated in the demo for comparison. **Options 2 and 3** = two new designs.
  - Every option shows:
    - **Coaches:** scheduled time vs. actual clock-in/out, clocked in now, late, not clocked in yet, no-show, automatic
      clock-out.
    - Classes and time slots, seats (filled / open).
    - Students with their **level colour** (the same legend), rifle number, grade and status (Here, No-show, Canceled,
      MU, Trial, Practice).
    - **Pending family requests** (`S3`) waiting for approval.
    - Day and week navigation.
  - Each option at **desktop size and phone size** (the app uses the chosen design too).
  - At least one new option keeps the **Google Sheet feel** the manager liked.
  - **Made-up names and data**, no real students.
  - One standalone HTML file Goo opens in a browser and clicks through (switch options, click a class, a student, a
    coach): `schedule-options.html` in the project folder, **never committed**.
  - **Goo picks one**, then the chosen view is built in the web portal (`V2`).
- ✅ **V2. Build the chosen schedule view** in the web portal. It replaces or sits next to the current one, as Goo
  decides. The phone version comes in Phase 3 (`M5`). (#67)
  - *Plan:* **Goo's pick (2026-10-28): B, one block per class, on the website**, with these changes:
    - **Students first:** each student gets a much bigger card (name, level colour, rifle, status) with a ⋯ menu for
      their actions. "The main thing is the students," not the coaches.
    - **Week:** B's stacked days, at the same bigger sizes (each day is taller, which is fine).
    - **The right panel** opens and closes.
    - **Any number of coaches:** usually two or three are in at once, but one to four (or more) must lay out well.
    - **On phones:** the website keeps today's schedule at narrow widths, and the phone app keeps its Schedule tab
      (`M5`).
  - *Done (#67):* the website's Day and Week are the timeline wherever there's room: a row per person in, their
    hours and clock-in behind it; each class one block across its coaches' rows (in parts when they can't sit
    together); its students as big cards with ⋯. Every action of the old schedule is still there. Phones and narrow
    windows keep today's schedule.

#### ST: Settings
- ✅ **ST1. A much simpler Settings page.** (#49)
  - *Plan:* **Small change:** the sections regrouped with the most-used first, plain labels, a search box, and the
    strays moved (the Trash's days, the clock-out lookback, the first-class bell, seats per class).
  - When the manager asked a question during the meeting, even Goo had to scroll around to find the right setting. That
    shouldn't happen.
  - Group settings clearly, use plain words, put the most-used settings first, and put each rule where people would
    look for it.
  - **Suggested:** a search box at the top of Settings.
- ✅ **ST2. Move the class confirmation and cancellation policy into Schedule settings.** It was under Students. (#49)
  - *Plan:* **Small change:** the confirmation already sits under Schedule; the new cancel rule (`S1`) joins it there as
    "Confirmation and cancellation".
- ✅ **ST3. The new default values** (Section 5): the 7-day coach availability lock, the 24-hour family cancel cutoff,
  the 24-hour confirmation, 30 minutes' early arrival, automatic clock-out at class end, and so on. All stay editable. (#49)
  - *Plan:* **Small change:** the lock is already 7 days; the 14 the manager saw is the coaches' notice period, which
    becomes 7 too. New: the cancel cutoff (24 hours, the same as the confirmation), the arrival window (30 minutes) and
    the clock-out at the end of the last class.

#### S: Scheduling, cancellations, makeups (backend + web)
- ✅ **S1. Families can cancel a class.** Cutoff: **24 hours before class** (editable). After the cutoff, the cancel
  button is disabled with a short note explaining why. (#46)
  - *Plan:* **New work:** families can't cancel today (the class says to contact the academy). A Cancel button until the
    class is confirmed, then disabled with the reason; the office and the coaches in are told.
- ✅ **S2. Parents and students can both cancel**, with **no age or level limits**: any linked parent, or the student. (#46)
  - *Plan:* **New work**, with `S1`: any linked parent, or the student.
- ✅ **S3. Families can request a class, a makeup or a reschedule.** (#46)
  - *Plan:* **New work:** requests for a class, a makeup or a reschedule. Families see how many seats are open in each
    class, never who's in them; the admin approves or rejects.
  - Parents or students see the **open seats** for the week and **request** one. They don't change the schedule
    directly: the manager doesn't want families deciding the schedule.
  - The **admin approves or rejects**. If rejected, the family can request another slot.
  - The admin can still book anything directly.
  - Example: a student cancels today's 4 PM class and requests tomorrow's open 4:30 PM seat; the manager approves.
- ✅ **S4. Everyone is notified.** Cancellations, changes, new requests, and approvals or rejections notify the right
  people: **parents, students, coaches and admins**. Build the notification **events** here; the phone's push and
  notification settings come in Phase 3 (`M3`, `M4`). (#46)
  - *Plan:* **New work:** coaches' notices exist (announcements, class changes). New: notices for families and the
    office (cancellations, requests, decisions, class changes, new scores), a bell for them on the website, and each
    person's switches. The phone's push is `M3`, started early on the MacBook Pro (`docs/mobile-push.md`).
- ✅ **S5. No-show (ghosting) policy.** A student who doesn't show up without telling anyone **still gets a makeup**. If
  they **also miss that makeup**, they **lose the credit**. Track it and show it clearly to the admin. (#46)
  - *Plan:* **Small change:** makeups owed count canceled seats only; no-shows join them, and a missed makeup loses its
    credit. Shown on the student's page and when adding a student.
- ✅ **S6. 24-hour confirmation.** Classes become **Confirmed** 24 hours before they start, so coaches see who's
  confirmed. Consistent with the cancel cutoff. (#46)
  - *Plan:* **Already done:** classes confirm themselves 24 hours before (Settings → Schedule); a seat shows Confirmed.
    The cancel cutoff follows the same setting.

#### C: Coaches and availability
- ✅ **C1. Availability lock: 7 days** (was 14; editable). (#44)
  - *Plan:* **Already done:** the lock is 7 days (`availability.lockWindowDays`). See `ST3` for the 14.
- ✅ **C2. Inside the lock, coaches can ADD availability but not REMOVE it.** The lock exists so coaches don't bail at
  the last minute; picking up extra time is fine. A short **undo** after adding (about 10 seconds, or until they leave
  the screen) in case of a mis-tap. After that, removing it means asking the admin. (#44)
  - *Plan:* **New work:** a locked day is read-only for coaches today. Adding inside the lock, with Undo; the rules
    allow adding only (the phone's side is `M7`).
- ✅ **C3. The admin can always change any coach's availability**, inside the lock too: open a day for a coach who's
  covering, or turn off a coach who can't come. This is how coach emergencies are handled; no separate "cover another
  coach" feature. (#44)
  - *Plan:* **Already done** on the website: Employees → Calendar, and "Who's in" on the schedule.
- ✅ **C4. Pre-fill each coach's fixed weekly schedule** before launch, so a coach's usual days are set when they
  first open the app (for example Mon/Tue/Wed/Thu/Sun). They can still edit outside the lock. (carried on through
  February 28, 2027, on 2026-10-28)
  - *Plan:* **Already done through November 30:** the import set each coach's usual days from August 31. **Small
    change:** carry them further before launch.

#### K: Kiosk, time clock, payroll
- ✅ **K1. One pay rate only. Remove the "admin rate"** and everything related to it (website, app, settings,
  payroll, data). Coaches come **30 minutes early** to set up and get their **normal rate** for that time. (#44)
  - *Plan:* **Small change:** two rates and four pay models exist (from HyberCRM). One rate stays; the admin rate goes,
    with the pay models that need it or pay from the schedule (`K5`). Hourly from the kiosk, the academy's model, stays.
- ✅ **K2. Early clock-in doesn't count.** A class at 6:00 with a 30-minute window means paid time starts at **5:30**,
  even if the coach clocks in at 5:20. (#44)
  - *Plan:* **New work:** paid time starts at the clock-in today. It will start at the arrival window (30 minutes before
    the coach's first class), never earlier.
- ✅ **K3. Automatic clock-out at the end of the last class** (for example 8:00 PM). A setting. (#44)
  - *Plan:* **Small change:** automatic clock-out exists at a fixed time (midnight); it moves to the end of the day's
    last class.
  - **Changed (Goo, 2026-10-28):** no automatic clock-out at the last class. Coaches clock out themselves and the
    clock-out is kept as clocked; **pay still ends at the end of the last class** (8:00, even for an 8:10 clock-out).
    Anyone who forgets is clocked out at midnight. Home and a coach's clock card show the clock-in as clocked (3:21, no
    "paid from 3:30"); the payroll shows the paid times; coming in after the arrival window opens isn't late.
- ✅ **K4. Arrival minutes are editable** (30 now; might become 15). (#44)
  - *Plan:* **New work**, with `K2`: the arrival minutes setting.
- ✅ **K5. Paid time comes only from the kiosk.** A coach who was scheduled but never clocked in (no-show) **isn't paid**
  for that shift. Payroll is never based on scheduled hours alone. (#44)
  - *Plan:* **Already done** under Hourly (no clock-in, no pay); with `K1`, Hourly is the only model.
- ✅ **K6. Manual time adjustments are quick and clear, with a note.** The manager adds an extra hour by hand to one
  coach's weekly entry (travel compensation). No automation. (#44)
  - *Plan:* **Already done:** Time Entries adds and edits shifts with a note, audited. **Small change:** an "extra time"
    field (+1 hour), so the clock times stay true.

#### P: Scores, paper scanner, competitions
- ✅ **P1. The paper scoring rule: the matches' rule, each hole at its real size** (Goo's decision, 2026-10-28). (#68)
  - *Plan:* **Small change:** the reader already scored by the matches' rule (touching a line = the higher ring), with
    every hole taken at the 4.5 mm pellet's size. It now measures each hole in the photo and scores it at that size.
  - **The rule:** a shot scores the highest ring whose line its hole touches, as matches do. The competition sheets
    show it (`docs/proposals/scoring-rule-2026-10-28.html`): a shot that sits mostly in the 3 but whose edge reaches the
    4 line is a 4, and "most of the hole" would have taken about 50 points off a three-position score.
  - **The hole as it really is:** a pellet tears a hole about 4.2 mm across, not 4.5, so the pellet's circle reached
    lines the real hole doesn't, where the coaches saw the lower ring. Each hole is measured on the photo; one that
    can't be read cleanly takes the card's usual hole, and the pellet's size when too few holes could be read. The
    website's card page draws each hole at its size (the phone's: `docs/mobile-scores.md`).
  - Paper scores are **whole numbers only**. Rings run from **10 (centre) down to 1**. A card the coach already scored
    keeps the written score (`P4`).
  - *Done (#68):* on the manager's 36 hand-scored cards (local only), the app's totals went from 2.6 points per 10
    shots over his coaches' to 1.7, and the shots scored as the coach wrote from 68% to 76% (cards within 3 points: 26
    to 28 of 36; within 5: 32 to 33). The manager isn't asked; "most of the hole" is dropped.
- ✅ **P2. Test and tune the scoring with the real paper targets, locally only.** (reported 2026-10-28: 36 cards; the rule: `P1`)
  - *Plan:* **New work:** a local test on the manager's cards (38 paper cards, 8 competition sheets), never imported or
    committed; the results go to Goo.
  - Goo has photos of the real paper cards and competition sheets the manager gave us (on the Mac mini). Use them **on
    that machine** to test accuracy, and report the results to Goo.
  - **Don't import them into the system.** Goo scans and enters each one by hand, through the app: that's the real
    test, and Goo's feedback drives further fixes.
  - Goal: within **about 3–5 points** of the coach's score. **7–10+ points off is a problem.**
- [ ] **P3. Photo background.** The scanner seems to work on a black background (the target itself is black). Check it.
  If a light background works better, show a short tip in the scanner: card flat, nothing covering it, good light, a
  lighter background if possible.
  - *Plan:* **Small change:** holes in the black show only when light is behind them, so a dark surface hides them. The
    tip "a light surface under the card" (the phone's scan tips, `M6`).
- ✅ **P4. Official score override.** When entering a card that was already scored by hand (past data), the admin can
  type the **written score as the official score**. The app's own score is kept for reference only: parents shouldn't
  see their 74 turn into a 70. (#48)
  - *Plan:* **New work:** the official score, typed by the admin; the app's own score kept for reference. Families,
    charts and reports use the official one.
- ✅ **P5. Any number of shots.** Sessions can be **20, 30 or 60 shots** (any number). The maximum is shots × 10 for
  whole-number scoring. With electronic decimal scoring a shot can be up to **10.9**, so **60 shots can total more than
  600**. Never assume a fixed shot count or maximum. (#48)
  - *Plan:* **Already done** for SIUS, charts and reports (they count per 10 shots). **Small change:** a paper result of
    several cards (20, 30, 60 shots).
- ✅ **P6. Inner-ten ("X") count.** Results show the **number of inner tens** (for example "491-11"). It's the
  **tiebreaker**: same total, more inner tens wins. Store it and show it next to totals (from SIUS PDFs and competition
  sheets). (#48)
  - *Plan:* **Already done** for SIUS (stored and shown). **Small change:** "491-11" next to totals; competition results
    carry it too.
- ✅ **P7. Competition results from a photo.** After a match, the match director gives a results sheet (paper or
  digital). The admin **takes a photo of it and gets it into the student's record** as a **Competition** result,
  separate from practice. Read the total and inner-ten count automatically if possible; otherwise the admin types them.
  Show competitions apart from practice in graphs and reports. Students see their whole competition history, bad days
  included, to see their growth. (#48)
  - *Plan:* **New work:** a Competition result from a photo of the results sheet. The total and inner tens are read with
    Google's text reader (Goo's pick, 2026-10-28), and the admin checks them before saving.
- ✅ **P8. Evaluations.** Every student was re-evaluated in **all three positions** in late August / early September
  (stapled packets with notes). An **Evaluation** type (or tag) for these: they're the most valuable history. (#48)
  - *Plan:* **New work**, with `P9`: the Evaluation label.
- ✅ **P9. Practice / Competition / Evaluation labels** on every result, used in filters, graphs, compare and reports. (#48)
  - *Plan:* **New work:** results have no kind today. Practice, Competition or Evaluation on every result, in filters,
    graphs, compare and reports.
- ✅ **P10. One position for a while.** Some students shoot only one position for weeks (for example, standing only
  for a school tryout). Reports and compare handle periods with just one or two positions. (#48)
  - *Plan:* **Already done:** reports and compare keep only the positions a period has. **Small change:** a report's
    change since the last one, compared per position.
- ✅ **P11. SIUS zero shots.** Electronic target #3 sometimes records a **0** because of a sensor problem; the student
  reshoots, so a "20 shot" PDF may show 24 shots. **No feature to remove zeros**; the PDF reader handles these files
  without breaking or mislabelling them. (#48)
  - *Plan:* **Already done:** a 0.0 without an arrow isn't a shot. **Small change:** a test for reshoots, and the
    reader's note kept.
- ✅ **P12. Nicknames and aliases.** Some students go by another name than their legal one. A preferred name plus
  aliases, so name matching (PDFs, scans) and display both work. (#48)
  - *Plan:* **New work:** a preferred name and other names, used by the PDF matching and in searches.
- ✅ **P13. A new score or report notifies the family.** The manager: "Every time I upload something: hey, there's
  been a new file." Build the event here; push comes in Phase 3. (#46)
  - *Plan:* **Already done** for reports (a shared report notifies the family). **New work** for scores.

#### N: Announcements and website news
- ✅ **N1. One composer for announcements and website news.** (#47)
  - *Plan:* **Already done:** one editor writes to coaches, families and/or the website (its News page, linked in the
    site's menu). **Small change:** one clear "Where it goes: Internal / Public / Both", and "Write news" in Settings →
    Website.
  - Internal **Announcements** (coaches, parents, students) and **website news** (Settings → Website) are separate
    today. The manager asked whether posting one also posts the other.
  - **One place to write a post**, where the writer chooses where it goes: **Internal** (announcement), **Public**
    (website news), or **Both**.
  - Fun activity posts belong here too, for example "here's the air rifle bingo game your kids played today" with a
    photo and no scores.
  - Make the website's news page easy to find.
- ✅ **N2. A rich text editor** for posts: formatting (headings, bold, lists, links) and **images inside the post**.
  Posts look good on the website, the portal and the app. (#47)
  - *Plan:* **Already done:** rich text with pictures, shown on the website, in the portal and in the phone app.

#### F: Families, contracts, Drive
- ✅ **F1. Two parents per student.** Each parent has their own login and sees the same child. Some kids have one
  involved parent, some have both. (#50)
  - *Plan:* **Already done:** two parents' logins can share a child. **Small change:** the student's page shows which
    parents can sign in, and gives a parent access in one click.
- ✅ **F2. Siblings.** One parent account with several kids (for example, two brothers) keeps working with `F1`. (#50)
  - *Plan:* **Already done.**
- ✅ **F3. Parent names are optional.** Without a name, show something like "Alex's parent." (#50)
  - *Plan:* **Small change:** a parent's name becomes optional ("Alex's parent").
- [x] **F4. Online enrollment contract with e-signature.** New families sign the academy's contract on their phone,
  without printing. A Google form tried before failed (parents couldn't sign), so it must be simple and reliable. The
  signed copy is saved automatically. *(Needs the blank contract from the manager.)* (#53)
  - *Plan:* **New work:** a link the office sends (Goo's pick, 2026-10-28). The family reads the contract on any phone,
    types their name and signs with a finger; no app or account needed. The signed PDF goes to the Contracts folder
    (`F5`). The text waits for the blank contract.
- [x] **F5. Contracts are admin-only.** They hold tuition and other sensitive information. They're stored in the Drive,
  **visible only to the manager and owners, not coaches.** (#53)
  - *Plan:* **New work**, with `F6`: a Contracts folder only owners and admins see.
- [x] **F6. The Drive as general storage, "like a Google Drive":** any file type (PDFs, images, game sheets,
  documents), folders, and **per-folder access** (some folders admin-only). (#53)
  - *Plan:* **Already done** for file types (PDFs, pictures, documents, videos) and folders. **New work:** folders for
    owners and admins only.

---

### Phase 2: Mac mini · Family web portal + real data

- ✅ **S7. The family side of `S1`–`S3` on the web portal:** parents and students cancel, see open seats, request a
  class, makeup or reschedule, and see their requests' status. (#46)
  - *Plan:* **New work.**
- ✅ **S8. The admin's request inbox on the web:** one clear place (plus a badge on Home and the schedule) to approve
  or reject family requests. (#46)
  - *Plan:* **New work.**
- [ ] **S9. Verify the imported schedule.** Some entries looked wrong in the demo (for example, a student marked
  canceled who actually came). Compare against the **latest schedule sheet** from the manager and fix the differences.
  *(Needs the latest sheet.)*
  - *Plan:* Waits for the latest sheet.
- [ ] **D1. Past data, September 2026 on**, so parents see history and can use compare and graphs from day one.
  **Blocked until the manager sends the data** (Section 7). Sources:
  - *Plan:* Waits for the manager's data.
  - **All SIUS PDFs** (one complete folder, replacing the old one). They're electronic and go through the Drive's PDF
    upload.
  - **Past schedules** (the manager's Google Sheets).
  - **Paper targets, evaluations and competition sheets:** **Goo enters these by hand** through the app (`P2`). No bulk
    import.
- [ ] **D2. Imported data can have mistakes.** Mark imported items so they're easy to review and fix, and give Goo a
  summary (counts per student, anything unmatched or flagged).
  - *Plan:* **New work**, with `D1`.
- [ ] **D3. Real student data never goes into the repository.** Import straight into the app's database and storage.
  - *Plan:* The rule for `D1`.
- ✅ **X1. The academy owner's account**, with payroll access: the owner runs payroll but isn't in the app yet.
  *(Needs their email from the manager.)* (not needed, Goo 2026-10-28: the manager's account is the owner)
  - *Plan:* **Already possible:** Account → Add person → Owner sends the sign-in email. Waits for the email.

---

### Phase 3: MacBook Pro · The phone app

The phone app is what parents, students and coaches actually use. Families must be able to do everything they need
from the app, without calling or texting the academy.

- ✅ **M1. Families in the app:** cancel (the 24-hour rule), see open seats, request a class, makeup or reschedule, and
  see their requests' status. The same rules as `S1`–`S3`. (#58)
  - *Plan:* **New work** (the rules and functions come from `S1`–`S3`).
  - *Done (#58):* a class's sheet cancels (until the cutoff) and asks to move it; "Ask for a class" (a makeup or an
    extra class, in the open seats); the makeups to book and the requests with their answers at the top of Classes,
    with Withdraw; and an inbox for families (Home's bell), whose notices open their class, score, report or post.
- ✅ **M2. The admin edits the schedule in the app.** Today the admin's app only cancels and marks attendance. Add the
  main **schedule** edits: add or remove a student, move a student to another class or day, book a makeup or trial,
  and approve or reject family requests. **Only scheduling:** don't copy every web feature into the app. (#58)
  - *Plan:* **New work:** the phone marks attendance today. The website's schedule writes move to `shared/` in Phase 1,
    for the phone to use.
  - *Done (#58):* the requests on Home and the schedule, each approved or declined with a note; on a class's sheet,
    "Add a student" (make-ups owed first, Practice, Trial, Evaluation), and each student's ⋯ to move them to another
    class that week or take them out. The writes are the website's `classApi.ts`, mirrored in the phone (they're not in
    `shared/`). The class itself (time, seats, note, who's in) stays on the website.
- ✅ **M3. Push notifications** for every event from `S4` and `P13`: cancellations, changes, requests, approvals and
  rejections, new scores, new reports, announcements, for parents, students, coaches and admins. (#45)
  - *Plan:* **Started early** (Goo, 2026-10-28): the server already pushes every notice; the phone registers.
    `docs/mobile-push.md`.
  - *Done (#45):* the phone keeps its token, asks once after sign-in, shows a push while open as a toast, opens a
    tapped one (and marks it read), and keeps the badge; More → Notifications for every role. The notices `S4` and
    `P13` add reach phones by themselves: their taps go in `appTargetOf`, their words in `pushReason`. Still: Apple's
    push key in Firebase (Goo, `docs/mobile-push.md`), then a push to a real iPhone.
- ✅ **M4. Notification settings in the app, for every role:** a list of notification types each person turns on or
  off, so nobody is flooded. Parents, students, coaches and admins each see the types that apply to them. (#58)
  - *Plan:* **Coaches already have four switches**; the rest come with `S4`.
  - *Done (#58):* More → Notifications for parents, students, owners and admins (`noticeSwitchesFor`); coaches keep
    their four.
- ✅ **M5. The chosen schedule view (`V1`) in the app**, for admins and coaches, with clock-in/out. (decided 2026-10-28: the phone keeps today's Schedule tab)
  - *Plan:* **Nothing to build (Goo, 2026-10-28):** the phone keeps its Schedule tab as it is ("Option 1 on a phone":
    who's in with their clock, then each class with its seats two across). Option B is for the website.
- [ ] **M6. The scanner in the app:** the holes at their size (`P1`), photo tips (`P3`), the official score (`P4`), labels
  (`P9`), and the **competition sheet photo** (`P7`).
  - *Plan:* **Partly done:** the phone scans with the shared reader and shows tips. New: `P1`, `P3`'s tip, `P4`, `P7`,
    `P9`.
  - *Done (#66), all but `P1`:* the scanner asks what a card was (`P9`), takes the score written on it as the official
    one (`P4`), types a total over any number of shots (`P5`), says to lay the card on something light (`P3`), and
    finds a student by another name (`P12`); "Add a competition" reads a photo of the results sheet (`P7`); the score
    lists show the kinds. **Still:** `P1`, whose scoring comes with the shared code (#68); drawing each hole at its
    size is in `docs/mobile-scores.md`. Then M6 gets its ✅.
- ✅ **M7. Coach availability in the app:** the 7-day lock, add-only with undo (`C1`, `C2`). (#54)
  - *Plan:* **Already done** for the lock; new: add-only with Undo (`C2`).
  - *Done (#54):* inside the lock a coach's day sheet keeps the saved times and adds new ones ("Add time"), with Undo
    for 10 seconds, as the website does; past days stay read-only. With it, the phone's pay follows `K1`–`K6`
    (`docs/mobile-pay.md`): one hourly rate, paid time from the kiosk as the shared rule says, and extra time with its
    note.
- [ ] **M8. Posts in the app:** the rich text and images from `N1`/`N2` display correctly.
  - *Plan:* **Already done:** the phone draws the editor's rich text and pictures.
- [ ] **M9. A new build and release** following the release process, after the current review.

---

### Later (not now)

These wait until everything else is ready, some even after launch.

- [ ] **L1. Korean + English** across the parent portal, the phone app and the website. Many parents don't speak
  English, so it matters, but it's done in one go later. **Don't work on languages now.**
- [ ] **E1. Emails going to spam.** Move to the academy's .com domain and send from its `info@` address. Goo does this
  **in person with the manager** (domain and email access). Until then, invitation emails may land in spam.
- [ ] **W1. A parent how-to video** on the website and app, recorded once both are final.
- [ ] **W2. Tuition** on the website, if the manager asks.
- [ ] **W3. A merch shop** (the academy just got merchandise to sell to parents). Not requested yet.
- [ ] **K7. (Optional)** An automatic recurring pay adjustment per coach (the travel hour), only if the manager asks;
  it's done by hand for now.

---

## 5. Decided rules and numbers

| Rule | Value | Editable? |
|---|---|---|
| Family cancel cutoff | **24 hours** before class | Yes |
| Who can cancel | **Parents and students**, no age or level limits | — |
| Makeup / reschedule / extra class | The family **requests**, the admin **approves** | — |
| A class becomes "Confirmed" | 24 hours before class | Yes |
| No-show (student) | Still gets a makeup; missing the makeup loses the credit | — |
| Coach availability lock | **7 days** (was 14) | Yes |
| Inside the lock | Coaches can **add** (with a short undo), not **remove** | — |
| Admin | Can change any coach's availability at any time | — |
| Pay rate | **One rate only**, no admin rate | — |
| Early arrival | **30 minutes** before class, normal rate | Yes |
| Clock-in before the window | Doesn't count | — |
| Clock-out | Coaches clock out themselves; **pay ends at the end of the last class** (a later clock-out is kept, not paid) | Yes |
| Coach no-show | No clock-in = no pay | — |
| A coach's travel time | +1 hour a week, added by hand | By hand |
| Paper scoring | **The matches' rule** (a hole touching a ring's line counts it), each hole at its real size; whole numbers, 10 to 1 | — |
| Acceptable scan difference | Up to about 3–5 points | — |
| Past hand-scored cards | The written score is official | — |
| Shot counts | Any (20, 30, 60…) | — |
| Electronic shot maximum | 10.9 (60 shots can exceed 600) | — |
| Tiebreaker | Inner-ten count | — |
| "Bench" | Not a position | — |
| Contracts | Owners and admins only | — |
| Language | English now; Korean later | — |

---

## 6. Still open

- ✅ **Payroll details, once the manager talks to the academy's owner:** the final clock-out rule, 30 or 15 arrival
  minutes, and the pay period (the manager reviews payroll weekly). (not asked, Goo 2026-10-28: the academy sets them
  itself in Settings)
- ✅ **The academy owner's account** (email and role). (not needed, Goo 2026-10-28: the manager's account is the owner)

---

## 7. What we need from the manager

### Received at the meeting (Goo has photos of each page)
- ✅ Paper target practice cards in different positions
- ✅ Evaluation packets (all three positions, with notes) from late August / early September
- ✅ Competition result sheets
- ✅ Practice sessions with 20/30/60 shots
- ✅ An "air rifle bingo" game sheet (an example of a fun post)

These are **real data**. Goo enters them by hand through the app; Claude Code may test with them locally but never
imports them automatically, and they're **never committed**.

### Still needed
- [ ] **The complete SIUS PDF folder** (everything since reopening) → `D1` (asked 2026-10-28: a shared Drive folder)
- [ ] **Past schedules** (Google Sheets, September on) → `D1` (asked 2026-10-28)
- [ ] **The latest weekly schedule sheet** (this week) → `S9` (asked 2026-10-28: the sheet shared view-only, this week on)
- ✅ **A short rules summary** (scoring, practice vs. competition) the manager offered to write, plus the rules email
  mentioned → `P9` (not needed, Goo 2026-10-28: the scoring rule is decided, `P1`)
- [ ] **The blank enrollment contract (PDF)** → `F4` (asked 2026-10-28)
- [ ] **The signed contracts** (the academy's Google Drive folder) → `F5` (asked 2026-10-28)
- ✅ **Parents' names and second parents' emails** (optional) → `F1`, `F3` (not asked, Goo 2026-10-28)
- ✅ **Students' nicknames and preferred names** → `P12` (not asked now, Goo 2026-10-28)
- ✅ **The academy owner's email**, for their owner account → `X1` (not needed: the manager's account is the owner)
- ✅ **Payroll decisions with the academy's owner:** the clock-out rule, arrival minutes, the pay period → Section 6 (not asked: set in Settings)
- ✅ **Honest feedback** after using the portal (three design options for anything, on request) (not asked, Goo 2026-10-28)
- [ ] *Later, in person:* domain access and the `info@` email account → `E1`

---

## 8. Next steps

| When | What |
|---|---|
| Now | The manager and the coaches start using the portal. The manager tells parents they'll cancel in the app. |
| Now | Remind the manager about the data and files in Section 7 (no rush). |
| The next meetings | Show the progress and whatever past data we have by then. |
| 1–2 weeks | The stores approve the app, then **it goes live**. |
