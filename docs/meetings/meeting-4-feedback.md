# The fourth meeting with the academy: notes and tracker (2026-11-09)

**Meeting:** Monday evening, November 9, 2026, at Sky Arc. HyberTec: Goo and a colleague. Sky Arc: the owner, the
manager, and two coaches. One of the coaches, a computer science student, gave most of the feedback and offered to keep
testing the app.

**What happened:** the coaches got their accounts and kiosk PINs and learned to mark their availability. A coach
explained **SCATT** (an aiming trainer), asked how the app knows the **shot order** on a competition sheet, showed the
tournaments' **public results site**, and went through the website as a tester would. The app's email moved to the
academy's own address during the meeting (`docs/DECISIONS.md` §40). The owner went through the contract's flow.

This file is **both the meeting's notes and the task tracker**, and it continues
[`meeting-3-feedback.md`](meeting-3-feedback.md). The full notes, with names, are in the private notes
(`docs/internal/meetings/SkyArc_Meeting4_Notes.md` and `SkyArc_Meeting4_Prompt.md`, git-ignored here). This repository
is public, so here people are named by role (CLAUDE.md, "Secrets"). The meeting's decisions are `docs/DECISIONS.md` §41.

**How it's ticked:** an item is marked done with ✅ in place of its box when its pull request is merged, with the pull
request's number. Each item's *Plan* says what the code had when the work started.

---

## 0. Instructions for Claude Code (read first)

1. **Pull the latest `main`** before anything else.
2. **Read the context files:** `CLAUDE.md`, `SKYARC_PROJECT_BRIEF.md`, this file, `meeting-3-feedback.md`,
   `docs/DECISIONS.md` (§41 records this meeting's decisions) and the code the task touches.
3. **One computer this round:** the MacBook Pro does every task. For this round Goo handed over the pull requests and
   merging too (2026-11-10: "For this round, do all the PR and merging by yourself"): each one merges once CI is green,
   and its deploy is checked.
4. **Two kinds of tasks.** *Build* (section 3): a short plan first (each item's *Plan*), then build. *Research and
   propose* (section 4): no code. A proposal for Goo, who decides before anything is built.
5. **Real data never enters the repository:** the SCATT file, its photos and video, students' names, and anything
   taken from the results site stay on this Mac. Tests use made-up data.
6. **The phone app:** nothing is uploaded to the App Store or Google Play until Goo says. A phone change reaches people
   with the next update.

---

## 1. Quick summary

- **Coaches are onboarding:** accounts, availability, kiosk PINs. **Everyone starts clocking in on the kiosk after
  Sunday, November 15, all at the same time.**
- **Both apps are live.** The iPhone app is up to date; Android's newest update (1.1.0) is still in Google Play's
  review.
- **Korean is done** in the app and the website. **Chinese** was asked about for a few families: not now.
- **The app's email** comes from `info@skyarcacademy.com` (§40). The manager's Gmail receives info@'s mail, and info@
  is the address the public should see.
- **The contract is on hold** until the owner sends her final wording (around Sunday). It stays **English only**.
- **Google reviews:** after the academy expands. The building closes for about a month early next year.
- "Everything else looks really good" (the coach who tested the website).

---

## 2. What the academy explained

### 2.1 SCATT, the aiming trainer
- SCATT records the **path of the rifle's aim**: **yellow** is the approach before the shot, **red** the follow-through,
  and the **impact point**.
- Its impact points aren't very accurate (a real 10 may show as 9.8), so coaches set it up beside a real target and
  **calibrate** it. **The trace is what matters, not SCATT's score.**
- Used **once in a while**, when a student asks. A coach sets it up and talks them through it.
- **The problem:** to show a session to a student or a parent, a coach opens the SCATT program on the academy's
  computer. They want sessions in the app like everything else, and would use SCATT more if sharing were easy.
- SCATT exports its own file type, "SCATT basic". A coach sent one sample, with photos and a video of the screen.

### 2.2 Shot order on competition sheets
- On a competition result, two shots can have the **same score** (two 10.4s). How does the app know which hole is
  which shot? On a sheet it can't be sure: with identical scores the order is a best guess.
- **Why it matters:** the order shows what went wrong. "Left, left, then right" is a position problem; "left, right,
  left" is swaying.
- SIUS prints an arrow on each shot, so its order is certain. The competition sheets have no arrows.
- "Not a big deal": the coach only wants to know when the order is certain and when it's a guess.

### 2.3 The tournaments' results site
- Tournaments post results on a **public website** (no login), with everyone at the match. The academy's team shows as
  **"ARC 10.9"**. A shooter's highlighted score opens their **shot group**: every shot's score, the **order**, and
  **direction arrows**.
- The site's PDF export has the totals only; the shots are only in the web view.
- The **Precision** group got no paper sheets from recent matches, so those results aren't in the app yet. **Sporter**
  athletes shoot in other relays.
- The manager and the coach would rather take results from this site **instead of paper sheets** from now on.

### 2.4 Coaches' PINs
- At the meeting each coach's PIN had to be typed on the office's Employees page, one coach at a time. Coaches should
  set and change their own on their phone.

---

## 3. Build

In this order: B2 (before the kiosk starts), then B3, B4, B5, then B6, then B1.

- ✅ **B2. Coaches set and change their own kiosk PIN.** On the phone, and the website too. (#146)
  - *Plan:* **new work, small.** The office's Employees page was the only way. A server function for one's own PIN,
    with the office's rules: the academy's length, unique (the tablet knows people by their PIN alone), stored only as a
    hash, in the audit log. A taken PIN is refused, which tells the person someone has it, so each person gets five
    tries a day. The website's Profile → Kiosk PIN and the phone's More → Kiosk PIN, typed twice. The office still sets
    or removes anyone's. The website's part is live once merged; the phone's comes with the next app update.
- ✅ **B3. No closing banner.** Remove the black "Ready to find your focus?" banner at the end of every page. (#147)
  - *Plan:* **small change.** It's one component (`FinalCta`) at the end of every page, with its own photo spot in
    Settings → Website ("The closing banner"), which goes with it. The header's Book button and the Contact page stay.
- ✅ **B4. No placeholders.** A spot with nothing in it shows nothing; what the academy adds appears in its place and
  fits, one item or many. (#147)
  - *Plan:* **small change.** Today: the coaches' portraits (none of the four has a photo, so every coach card says
    "Placeholder"), the Gallery (8 photos, padded to 12 with placeholder tiles), and any page photo left empty (all are
    chosen today). A coach without a portrait gets a card without one; when some coaches have portraits, the others show
    their initials in the same frame, so the cards line up. The Gallery shows only its photos. An empty page photo
    leaves the text the full width, with nothing drawn while the content loads.
- [ ] **B5. `info@skyarcacademy.com` as the public email, everywhere.**
  - *Plan:* **already works, no code.** It's one setting, Settings → Academy → Email: the website's header, footer,
    Contact page and privacy policy, the app's contact buttons, the contract's pages and PDF, new progress reports, and
    the reply address of invites all read it. It still holds the manager's Gmail: changing it there changes them all
    (`docs/TODO.md`). No address is written into the code.
  - *2026-11-10:* waiting for the setting to change (Goo or the manager).
- ✅ **B6. "One path, four levels": the scroll animation.** The coach saw something move the wrong way while scrolling.
  - *Plan:* **analyze first.** As the page scrolls down, the section steps through the four levels. The likely
    cause: the highlight on its rank ladder (the highest rank at the top) climbs, against the scroll. Check this and
    anything else that moves against the scroll, show Goo the options with pictures, and change it once Goo picks.
  - *Options shown 2026-11-10:* confirmed: the marker climbs as the page goes down, and nothing else moves against the
    scroll. A, flip the ladder so the marker moves down with the page (recommended); B, the phones' horizontal bar on
    computers too; C, keep the ladder with a marker that jumps instead of sliding.
  - *Goo, 2026-11-10:* **A.** Done: the ladder reads from Scout at the top to Expert at the bottom, so its marker goes
    down as the page does; the NCAA Precision box stays above it. (#152)
- ✅ **B1. A welcome tour in the phone app** after the first sign-in: per role (parent, student, coach, admin), short,
  skip and replay. (#149; phones get it with the next app update)
  - *Plan:* **new work, phone only.** The first step chooses the language for parents (English or Korean, which also
    sets the app's); the staff's and students' screens are English (§36), so their tour is too. Each step opens the tab
    it explains behind a dimmed layer, with a card: what it's for and the one thing to do there (for parents: classes,
    cancelling before the academy's cutoff, asking for a makeup, scores and comparing them, reports, notifications). The
    rules come from the academy's settings, never written in. Skip at any step; "Take the tour" in More replays it.
    Kept on the phone (per account), so no server change.
  - *Goo, 2026-11-10:* **more detail.** "Right now what we have is just really bare minimum. At least it should show and
    tell them most of the stuff we have, like 'hey, click this one (button)', and then 'from here you can see …'." The
    language step goes (English only, W1).
- [ ] **B1b. A detailed tour:** each step points at the real button on the screen ("tap this"), opens what it opens, and
  says what's there, through most of each role's app.

## 4. Research and propose (no code until Goo decides)

- [ ] **R1. Competition results from the results site** into each student's Competition scores: how the site works and
  loads its data, what each shot carries (score, order, direction, position), only the academy's athletes (Precision
  and Sporter, across relays), matching them to students (competitions use legal names), avoiding duplicates, how
  automatic it can be, a PDF in the Drive or the data itself, what could break, and the missing Precision results.
  - *Proposed 2026-11-10:* the site reads Scopos's documented public API (a key, no login; a server function must call
    it). Each shot carries its firing order and exact place, so order and direction are certain. The academy's
    athletes come from the team list; names fit the existing matcher, and each shooter keeps a competitor number.
    Phase 1: paste a link → preview → save (one competition per position); phase 2: a nightly check of the hosts. Store
    the data, not a PDF. Our own (free) Scopos application key first. Missing from the app: the Oct 31 Precision
    match (8 results) and two results from Sep 26.
  - *Goo, 2026-11-10:* **build it, automatic:** the academy has no page of its own on the site and shouldn't paste links
    after each competition, whatever its format: find every match the academy's athletes shot, anywhere on the site.
    The academy will pay for Scopos's key if needed; Goo wants the estimated price first. "Make the technology first,
    then consider the rules later" (Goo takes the responsibility).
- [ ] **R2. SCATT sessions** in the app: what the export holds, how reliably it reads, how a session would come in
  (most likely dropped in the Drive, as SIUS PDFs are) and how a student and a parent would see the trace, its approach
  and follow-through, and the shots. What one sample allows, and which samples are still needed.
  - *Proposed 2026-11-10:* the export is a small database: sessions, shot times and aiming times read cleanly and match
    the screen, but the trace itself is compressed and deliberately scrambled by SCATT, and no scores, impact points or
    calibration are stored. Don't build on it yet: ask the coaches for SCATT's PDF printout and more samples, and SCATT
    for the format or an export (and permission). Meanwhile a screen recording of a replay can go in the Drive.
  - *Goo, 2026-11-10:* **try decoding it in-house**, to see whether everything they want can come out (not for the live
    app yet; the coaches said SCATT can't export a PDF, only this file). What they want is the trace as a video or an
    animation on the website.
- ✅ **R3. Shot order on competition sheets:** how the app orders shots today, especially equal scores; when the
  order is certain (SIUS's arrows, the results site) and when it's a guess; and how to show coaches the difference.
  - *Proposed 2026-11-10:* a sheet prints every score in firing order, so the order is certain; each shot's place is
    found on the circle its score allows, so two shots with the same score in a series can have their places swapped.
    SIUS and the results site are certain. Proposal: mark those shots ("≈") with a note, worked out from the saved
    scores, old results included.
  - *Goo, 2026-11-10:* **yes.** Done: on a results sheet's result, two shots with the same score in one series get
    "≈" by their score (the darts, the match card's shots), the replay says "place may be swapped with shot 3", and a
    line explains why; on the website and the phone. Worked out from the saved shots, so old results have it too. (#153)

## 4b. The academy's website review (2026-11-10)

The owner's first notes after reading the website page by page (more will come in Google Drive), sent by Goo:

- ✅ **W1. English only:** "Please remove all Korean-language content … an English-only website is appropriate for our
  audience", including Korean in photos. Goo: "no Korean language in this project. Please remove all." (§42, #151;
  phones get it with the next app update)
- [ ] **W2. The coaches' backgrounds, worded exactly:** "Every phrase matters, and their experience and qualifications
  must be presented accurately, without ambiguity. For the main page, please use the designation 'Elite Military Rifle
  Marksman.'"

## 5. On hold

- **The contract:** the owner rereads and finalizes the wording (around Sunday). Nothing changes until Goo sends the
  final version. Decided at the meeting: the parent asks for the contract, the office fills in the discounts and
  options (parents never choose discounts), the parent signs, the academy's saved signature goes on it, and both sides
  get a copy by email. It stays English only. Open for later: tuition that changes with the level, and whether the
  academy wants to be told when a student is ready to move up.

## 6. Not doing

- **Chinese:** not now; maybe one day, with a native speaker checking it.
- **Google reviews:** after the expansion.
- **Payment and pricing:** outside these notes.

## 7. What the academy sends

| Who | What | For |
|---|---|---|
| The coaches | More SCATT exports (other students, positions, longer sessions) | R2 |
| The coaches | The results site's links for the Sporter relays | R1 |
| The owner | The contract's final wording, and her signature | Section 5 |
| Every coach | Availability and kiosk PINs before Sunday | B2 |
