# The third meeting with the manager: notes and tracker (2026-11-02)

**Meeting:** Monday, November 2, 2026, at Sky Arc. HyberTec: Goo (a colleague joined at the end). Sky Arc: the
manager (listed as Owner in the app).

**What happened:** Goo showed the manager what changed since the second meeting: the competition scan, comparing
scores, the parent view, the simpler Settings and progress reports. Together they loaded all of the academy's past
results: SIUS PDFs dragged into the Drive, and paper targets and competition sheets scanned with the phone. The manager
explained how competition sheets work, and they talked about contracts, past attendance, the domain and the kiosk. He
was very happy: "This is exactly how I envisioned it."

This file is **both the meeting's notes and the task tracker**, and it continues
[`meeting-2-feedback.md`](meeting-2-feedback.md). The full notes, with names, are in the private notes
(`docs/internal/meetings/SkyArc_Meeting3_Notes.md`, git-ignored here): this repository is public, so here people are
named by role (CLAUDE.md, "Secrets").

**How it's ticked:** as in the second meeting's tracker, an item is marked done with ✅ in place of its box (`- ✅ **…**`)
when its pull request is merged, with the pull request's number. Each item's *Plan* says what the code had when the work
started: *already works*, *small change* or *new work*.

---

## 0. Instructions for Claude Code (read first)

1. **Pull the latest `main`** before anything else.
2. **Read the context files:** `CLAUDE.md`, `SKYARC_PROJECT_BRIEF.md`, this file, `meeting-2-feedback.md`,
   `docs/DECISIONS.md` (§30 records this meeting's decisions) and the code the task touches (website, phone app,
   scanner, Drive, accounts, rules and functions). Check what exists before building.
3. **One computer this round** (Goo, 2026-11-03): the MacBook Pro does every task, the website's, the server's and the
   phone's, instead of splitting them with the Mac mini.
4. **Keep this tracker up to date:** ✅ and the pull request's number when it's merged, here and in the full copy.
   Where an item overlaps the second meeting's tracker (Section 6), tick it there too.
5. **Follow every rule in `CLAUDE.md`:** a branch and a pull request, Conventional Commits, few commits, no attribution
   lines, no secrets, and no real student data in the repository (scans, PDFs, contracts, names).
6. **The phone app:** Google Play has published 1.0.0 (live by 2026-11-03); the App Store is still reviewing it. Phone
   changes wait for the next update, sent once everything is ready (Goo, 2026-11-03): nothing is uploaded to the
   stores until Goo says.
7. If something is unclear, **ask Goo**. Don't guess.

---

## 1. Quick summary

- **The manager loved it.** Adding results is now as easy as he wanted. He especially likes the **comparisons**: the
  students are too young to notice they improve week to week, and seeing it builds their confidence. He wants parents
  to dig into their children's results too.
- **All the academy's past results are in** (about two months: SIUS PDFs, paper targets, competition sheets). Nothing
  more needs to be sent, and **from now on the academy uses the app** instead of its sheets and folders.
- **Past attendance:** the manager marks the past weeks himself on the website, and marks every day from now on.
- **Students' other names** (legal, Korean, English): the manager added them during the meeting.
- **Contracts:** parents **download the app, sign up and sign the contract in the app.** First **design the whole
  sign-up flow**, above all **how a new parent's account is connected to the right student(s)**. Contracts already
  signed stay as they are, and the contract's wording is the academy's: it isn't changed.
- **The competition scan works well.** Next: **read the student's name from the sheet and pick the student** (other
  names included), **catch duplicates**, and **show the position** on each series. Competition PDFs come later.
- **The domain** is on Squarespace. The manager invites Goo to connect the .com; then the coaches get access.
- **The kiosk:** HyberTec provides an Android tablet and a wall mount. Later; nothing to do now.
- **Korean:** asked again. Later, when Goo decides it's time.
- **The app:** Google Play has published it; the App Store is still reviewing it (Goo has written to its support).

---

## 2. What was shown and liked (keep as is)

- **The competition scan** (phone): a photo of the match's results sheet; it reads the match, the date and every
  series, adds up the totals and inner tens, and saves a **Competition** in the student's Scores. Each series opens to
  its shots, and the photo opens too. "This is so much easier than scanning paper, because we also have actual points."
- **The paper target scan** (phone): photo, instant score, check and fix each shot. "All pretty accurate." It already
  handles students who put two shots on one bull: **don't change that.**
- **The Drive's bulk upload:** several SIUS PDFs dragged at once, each read and filed in the right student's Scores in
  about two clicks.
- **Student → Scores:** every result, a filter by position, the chart over time, and **comparing two results** (one
  student shot 0.8 better a week later; another did better at their second competition).
- **The parent view** (website and app): the same scores and comparisons; parents with several children pick one.
- **Progress reports** (AI).
- **Settings:** much easier now. The manager will go through it one setting at a time.
- **Coaches:** the manager showed a few coaches their pages. One of them liked it a lot and offered to help teach the
  others.

---

## 3. What the manager explained

### 3.1 Competition results sheets
- A **3P match (3×20)** is 20 shots in each of three positions, **60 shots**. The sheet splits each position into **two
  series of 10**, so it shows **6 series** in this order: **kneeling, kneeling, prone, prone, standing, standing**. The
  sheet doesn't print the positions' names: the order tells them apart. The app already assumed this order, and the
  manager confirmed it.
- A **60-shot** match is **all standing**.
- **"PR"** on a sheet means a **personal record** (a personal best).
- Each position's total is the sum of its two series. **Inner tens** are added up and saved.
- Sometimes there's **no sheet**: some results (the Precision group's, for example) are only **online**. The manager
  types those in by hand.
- **Later, match directors may give PDFs**, laid out like the paper sheet the app already reads from photos.

### 3.2 Paper targets
- **Bench** (a Discovery student's first week or two) is **not a position** and isn't counted.

### 3.3 The weekly schedule and attendance
- The academy made a new Google Sheet each week; a student who was absent was moved to their rebooked class.
- Without past attendance every student shows **100%**, so **the manager marks the past weeks himself** and keeps
  marking every day.

### 3.4 Phone cameras
- One scan was **2 points off** on a kneeling series; a second photo fixed it (the first was probably a little
  blurred). Goo warned that phones with poor cameras may read worse; the manager: as long as the phone isn't broken, it
  should be fine.

---

## 4. Tasks

### CT: The contract and parents' sign-up (design first, build later)
- ✅ **CT1. Design the parents' sign-up flow, and propose it to Goo. Don't build it yet.** (proposed 2026-11-03; Goo
  decided the same day: `docs/DECISIONS.md` §31)
  - *Plan:* **New work: a proposal**, built on how accounts work today (the office adds a person's email; a parent's
    access follows their verified email; the contract link of the second meeting, `F4`).
  - **The goal:** when the academy moves to the app, the manager tells parents "download the app and sign up". Right
    after signing up, the parent **reads and signs the contract in the app**. No paper, no separate website.
  - **The question to answer:** a parent signs up on their own; **how does the app know which student(s) are theirs?**
    The students are already in the database. How does a new parent's account reach the right child (or children, for
    siblings), and a second parent too, **safely**, so that nobody can attach themselves to someone else's child? And a
    brand-new family whose child isn't in the app yet?
  - Cover the whole path: download → sign up → linked to the student(s) → read and sign the contract → what they see
    next. Include what the office sees and does (checking or approving a link, who has or hasn't signed) and what
    happens when a parent stops halfway.
  - A recommendation and its trade-offs. **Build only once Goo has decided.**
  - *Proposed (2026-11-03, a page sent to Goo):* **link by the email the academy already has.** A parent signs up in the
    app (Google, or an email and password, confirmed); the server links a confirmed email to every student whose
    record lists it as a parent's (siblings at once, each parent by their own email), tells the office (with Undo),
    and the contract step opens. An email not on file asks the academy in the app (the child's name, or "we're new"),
    and the office approves in one tap with the students it could mean. A Contracts list shows who has signed, who's
    waiting, and who has no parent in the app yet. The alternatives weighed: a family code, an invite per family,
    approval for everyone. Goo's questions: the way; accounts made in the app (and Sign in with Apple at review); one
    contract per child or per family; Later or must sign first; one parent's signature enough; students' own logins.
  - *Goo's answers (2026-11-03):* the email on file, with "Ask the academy" behind it; accounts made in the app, with
    Sign in with Apple as Apple asks; one contract per child or per family, the manager decides (Goo asks him with the
    contract); they sign before using the app; one parent's signature is enough; students' own logins the same way.
- ✅ **CT2. The contract signed in the app**, once `CT1` is decided **and** the academy's blank contract arrives. Turn it
  into a document parents read and sign easily, in the app and on the website. **Don't change its wording.** The signed
  copy goes to the student's folder by itself and is **for owners and admins only**. Contracts parents already signed
  stay as they are; the manager uploads those himself. *(Website and phone)*
  - *Plan:* **New work**, waiting for `CT1` and the contract. The signing link (`F4`, #53) already reads a contract,
    takes a typed name and a finger's signature, and files the signed PDF in the student's Contracts folder.
  - *Built (2026-11-03), with the sign-up of `CT1`:* anyone makes an account in the app (Google, Apple on iPhones, or a
    password) or on the website; a confirmed email on a student's record links them (siblings at once), anyone else
    asks the academy and the office approves on the Account page with suggested students. Once the academy has a
    contract, a parent's app and website open only after they read it (its pages, as uploaded: not a word changed) and
    sign it for each child, once for several (a copy each, in each child's Contracts folder, owners and admins only); a
    student waits for their parent. Contracts signed before count once the manager files them in the student's
    Contracts folder (or marks them signed on paper), and Settings → Enrollment contract lists who has signed. **What's
    left is the manager's:** the blank contract, uploaded in Settings → Enrollment contract when it comes.
  - *The contract came (2026-11-04), with the manager's answers:* every family signs again in the app (a filed
    contract no longer counts by itself), one contract per child, each signed on its own. It's an electronic contract
    now: the academy's words, unchanged, read on the phone as a page, with the program, the discounts, the initials,
    the student's and the parent's details filled in where the paper has them, then the signature; the signed copy is a
    PDF of it as filled in. The office writes it in Settings → Enrollment contract and publishes it once the manager
    approves the e-version ([`DECISIONS.md`](../DECISIONS.md) §33).
  - *Approved (2026-11-05), and sent by the office:* the manager and Goo approved the e-version. Its words are set up
    once and never edited in the app; the office changes only the prices. The office sends each family's contract from
    the student's page (the website or the phone) or the families' list in Settings, with the program it suggests and
    the discounts only it can check. The family sees the price after them, signs in the app, on the website or with the
    QR code at the front desk, and is asked whether to download their copy. The academy's signature fills itself in
    from the one on file ([`DECISIONS.md`](../DECISIONS.md) §34).
  - *Live (2026-11-05):* each signer gets their copy by email, the manager's name is typed as the academy's signature
    until his SVG comes, and the demo has families' contracts in every state to try ([`DECISIONS.md`](../DECISIONS.md) §35).

### CP: Competitions
- ✅ **CP1. Read the student's name from the sheet and pick the student**, by their name **and their other names**
  (legal, Korean, English). Today whoever scans has to choose the student. *(Phone scanner and the server)*
  - *Plan:* **Small change:** the reader already finds the shooter's name ("Park, Mina") and the phone only says "The
    sheet names …". New: the name matched to a student (their name and other names) and picked, read from more of the
    ways a sheet prints it; a warning when the student already chosen isn't the one the sheet names; the website's Add
    a competition does the same.
  - *Done (#106):* the shooter's name is matched to a student by their name or another name, whole, in any order
    ("Seo-yeon" is "Seoyeon"), or found in the sheet's heading; the phone picks them ("From the name on the sheet"),
    says when the sheet names someone else, and offers the students it could be; the website's Add a competition says
    so with "It's X's", and Add scores picks by the same rule.
- ✅ **CP2. Catch duplicates.** Whenever a result is added (the competition scan, the paper scan, a SIUS PDF in the
  Drive, an upload on a student's Scores), check whether it's already there (the same student, date and scores) and
  warn instead of saving it twice. The manager uploaded the same PDF twice during the meeting.
  - *Plan:* **New work:** only the Drive's SIUS upload skips a result already saved (the same printed time and total).
    A shared check (the same student, day, position and scores) for every way a result is added, on the website and
    the phone, that says which result it repeats.
  - *Done (#106):* every way of adding a result compares it with the student's saved results and the others added with
    it (`shared/src/scores/duplicates.ts`): a SIUS report by its printed time and total, anything else by its day,
    position, shots and total (and its shots). The Drive leaves a repeat out and names it (two copies in one drop got
    through before); Add scores leaves it out with Save it anyway; Add a competition, Add paper scores and the phone's
    scans ask "Already saved?" first.
  - *Then (Goo, 2026-11-03):* the Drive says it in its drop dialog, beside the student and position, the moment the
    PDFs are dropped ("… is already in Arin’s scores, so it won’t be added again"), with **Add it anyway**, instead of
    a note after adding.
- ✅ **CP3. Show the position on each series** of a competition (kneeling, prone, standing). Goo found it confusing
  without them.
  - *Plan:* **Small change:** a competition's card names the position beside each series on the phone and in small
    print above it on the website; the results list shows a match's positions as coloured dots only. The position in
    words wherever a competition's series or positions show.
  - *Done (#106):* each series of a match's card leads with its position ("Kneeling", then K1–K10), and a match's row
    names its positions (K, P, S, the words on wide screens).
- ✅ **CP4. Check the reader follows 3.1:** 3×20 = 6 series in the order kneeling, kneeling, prone, prone, standing,
  standing; 60 shots = all standing.
  - *Plan:* **Already works**, to check with tests: the reader takes each shot's position from its letter on the sheet
    (K, P, S), keeps the order kneeling, prone, standing, and splits each position into series of ten.
  - *Done (#106):* tests read a 3×20 sheet as six series in that order (its two columns interleaved too) and a 60-shot
    match as standing, six series.
- ✅ **CP5. Typing a competition by hand**, for results that are only online: the match, the date, the scores per
  position or series, and the inner tens. Check it works and is easy to find.
  - *Plan:* **Already works:** Add a competition (a student's Scores on the website, the Scan tab on the phone) takes
    each position's total and inner tens with no photo. **Small change:** fill the positions from the course of fire
    (3×20, 60 shots) in one tap, and an easier button to find (`SC1`).
  - *Done (#106):* "No sheet? Fill in: 3×20 · 3×10 · 60 shots · 40 shots" fills the positions and their shots in one
    tap, on the website and the phone.

### AT: Attendance
- ✅ **AT1. Check that past attendance is easy to change.** The manager is marking the past weeks himself (Here,
  No-show, Canceled, moved). Past classes must be easy to mark and change on the website, and the attendance figures
  must follow. *(He starts right away, so this comes first.)*
  - *Plan:* **Already works:** on the website's schedule a past day's student cards have Here and No-show, and their
    menu cancels or moves a seat; the student page's attendance and the family's Home count them at once. The imported
    weeks to October 25 are all Here and the ones since are unmarked (production, counted on 2026-11-03), so most of
    the work is marking the exceptions, then Here for the recent weeks. **Small change:** mark the rest of a class
    Here in one click, and past classes still unmarked easy to see.
  - *Done (#105):* a day that has started says how many students aren't marked yet (the Day view's title, the week's
    strip, each day's header); **Mark the rest here** for a class (its sheet and menu) and for a day (after a
    confirmation), each seat audited as by hand.

### SC: The Scores tab
- ✅ **SC1. Finding where to add scores.** On the website the manager couldn't find how to add a score from a student's
  Scores tab ("This is what I missed. I don't know why I didn't see that part"), so he used the Drive. Keep it in mind
  for that screen.
  - *Plan:* **Small change:** the tab's add buttons are outlined, beside a filled New report (the tab was remade the
    same day, #101). Adding scores becomes the tab's main action, and files dropped on the tab are read as the Drive
    reads them.
  - *Done (#106):* the tab's add buttons are its main (filled) buttons, New report outlined, and files dropped anywhere
    on the tab (SIUS PDFs, card photos, results sheets) are read there, all the student's.

### DM: The domain and access
- ✅ **DM1. Connect the .com** (on Squarespace), 2026-11-07: Firebase and Squarespace (Goo), then the links (#119).
  - *Plan:* Goo, with `docs/DEPLOY.md`, "Moving to skyarcacademy.com" (the steps for Firebase and Squarespace,
    2026-11-06); sign-in and Storage accept the domain already; then #119 moves the links to it.
- [ ] **DM2. Invite the coaches** once the domain is connected.
- [ ] **DM3. Send email from the academy's domain** (the second meeting's `E1`), with `DM1`, so it stops landing in
  spam.

### Later (not now)
- [ ] **L-CP. Competition PDFs.** Accept a competition's results **PDF** (laid out like the paper sheet) as well as
  photos, on the website and in the app, once match directors give them.
- [ ] **L-KI. The kiosk on an Android tablet.** HyberTec provides the tablet and a wall mount, at the front desk near an
  outlet. When Goo asks, make the kiosk **installable on the tablet from a file** (no store) and keep it running there.
  Clocking in from a phone or by location was turned down: the kiosk only. Goo, 2026-11-06: a Samsung tablet is on
  its way; the kiosk is its own app that keeps working without the internet (`docs/TODO-notes.md`, "Kiosk app").
- ✅ **L-LG. Korean** for parents (the second meeting's `L1`), 2026-11-05 (#115): what parents see, in Korean (the
  parent portal, the phone app's family part, the public website, the contract and what families hear), as Goo decided
  that day; students and staff stay English (`docs/DECISIONS.md` §36). The contract's Korean, read with the manager, is
  in the live academy since 2026-11-07.

---

## 5. Needs no work

- The past results are all in; the academy sends nothing more and uses the app from now on.
- Students' other names: the manager added them.
- Two shots on one paper bull: the app handles it already; leave it.
- A photo that loaded slowly in the meeting: the academy's Wi-Fi, not the app.

---

## 6. Changes to the second meeting's tracker

| Item | Update |
|---|---|
| `D1` Past data | **Done** by the academy: all SIUS PDFs, paper targets and competition sheets are in. Past schedules aren't needed: the manager marks attendance himself (`AT1`). |
| `S9` Check the imported schedule | The manager fixes the past weeks himself by marking attendance (`AT1`). |
| `P2` Real paper targets | **Entered** in the app. |
| `P7` Competitions from a photo | **Works.** Follow-ups `CP1`–`CP5`; PDFs later (`L-CP`). |
| `P12` Other names | **Filled in** by the manager; used to find the student on a sheet (`CP1`). |
| `F1`, `F4`, `F5` Parents and contracts | The sign-up flow (`CT1`) and the contract in the app (`CT2`): built, `docs/DECISIONS.md` §31. |
| `E1` Email and the domain | The domain is on Squarespace: `DM1`–`DM3`. |
| `L1` Korean | **Done** for parents: `L-LG`. |

---

## 7. What we need from the manager

- ✅ **The blank contract** (digital), 2026-11-04, with his answer: one contract per child (`CT2`). Next: he reviews the
  e-version, then it's published in Settings → Enrollment contract.
- ✅ **An invitation to the domain's Squarespace account**, 2026-11-07 → `DM1`

Everything else is in hand, or the manager's own work in the app.

---

## 8. Next steps

| When | What |
|---|---|
| Now | The academy uses the app from now on, and the manager marks attendance every day, the past weeks included. |
| Now | The sign-up and the contract in the app are built (`CT1`, `CT2`); Goo sets up Sign in with Apple once (`docs/publishing/apple/sign-in-with-apple.md`). |
| When the contract arrives | The office files the contracts signed before in each student's Contracts folder, then uploads the blank one: parents sign it before using the app. |
| This week | The manager invites Goo to Squarespace → the domain connected → the coaches invited. |
| When the App Store approves | Parents are told to download the app and sign up; the kiosk tablet is set up. |
| Later | Competition PDFs, the kiosk's install file. |
