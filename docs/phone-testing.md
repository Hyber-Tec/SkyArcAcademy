# Testing the phone app on your own phones

How to try every part of the phone app on an iPhone and an Android phone, with made-up data, before the academy's past
data comes in (`S9`, `D1`–`D3` in [MEETING2_FEEDBACK.md](MEETING2_FEEDBACK.md)). The app is the same on both phones, so
one checklist covers both. When something looks wrong, tell Claude Code (the last section says what to send).

## 1. Get the newest app

**iPhone, through TestFlight:** open **TestFlight** → **Sky Arc** → **Update** (or **Install**). The newest build is
**1.1.0 (6)**; it reaches the HyberTec group by itself once Apple has processed it (up to about half an hour after
the upload). In the app, **More → Version** shows `1.1.0 (6)`.

**Android, over the cable** (Google Play and its review of 1.0.0 stay untouched):

1. The first time only, on the phone: **Settings → About phone → Software information** → tap **Build number** seven
   times; back in Settings → **Developer options** → **USB debugging: on**.
2. Plug the phone into the Mac. On "Allow USB debugging?", tick **Always allow from this computer** → **Allow**.
3. On the Mac, in Terminal, in the Sky Arc folder: `git switch main && git pull`, then `npm run android`. It ends with
   `✓ Sky Arc is on <your phone>, and runs without the Mac.` The first time takes about 10 minutes.
4. If it says the app is "signed differently" (a copy from Google Play is on the phone), delete Sky Arc from the phone
   and run `npm run android` again.

Both are the real Sky Arc (production): what you do in them is saved for real.

## 2. Sign in with the demo logins

The demo academy holds made-up coaches, students and families, ten weeks of classes (each with a seat or two open
ahead), families' requests in every state, scores with their SIUS PDFs, reports and posts. Its own logins see only the demo, with **Demo** in amber beside the logo and each tab's title, so
nothing you do there reaches a real family.

| Who | Email | What the phone shows |
| --- | --- | --- |
| The office (an admin) | `office@skyarc-sample.test` | Home · Schedule · Scan · Students · More |
| A coach (Daniel Reed) | `daniel.reed@skyarc-sample.test` | Home · Schedule · Availability · Scan · More |
| A parent of two (Jiyeon Hwang: Jiwoo and Minjun) | `jiyeon.hwang@skyarc-sample.test` | Home · Classes · Scores · Reports · More |
| A student (Seoyeon Lim) | `seoyeon.lim@skyarc-sample.test` | The same tabs, for the student's own classes |

- **The password** is the demo logins' one password, in `docs/internal/` on the Mac mini. It's never written in git.
- **To change who you are:** More → **Sign out**, then sign in with another email.
- **Your own account shows the real academy** (the phone has no demo switch). Use it only to look, or for the
  manager's real cards (section 5): anything it changes notifies real families.
- **Never use `paige.sutton@skyarc-sample.test`:** it's the App Store's review login, and its password must not change
  while the stores review the app.
- **Don't delete an account** (More → Delete my account) unless you're testing exactly that: the demo login is gone
  until someone makes it again.

**The demo sends no push notifications and no emails.** Its notices still arrive, in each person's inbox (Home's bell).
A push to a phone needs the real academy, and on iPhone Apple's push key in Firebase ([mobile-push.md](mobile-push.md)).

## 3. What's on the website, not the phone

The phone is for what people do day to day. These stay on the website (`https://skyarcacademy.web.app`, the same
logins; your own account switches to the demo from the account menu, **Demo data**):

- **SIUS PDFs:** drag them into the Drive; the app reads each one and files it in the student's folder.
- A class itself (its time, seats and note), Settings, payroll and pay rates, people and access, contracts, writing
  posts, and making progress reports.

## 4. What to check

Tick them off as you go (on GitHub's page they're boxes). The section letters are the tracker's items.

**Everyone**
- [ ] Signing in, and More → **Version** shows the newest build.
- [ ] Home's **bell**: the inbox; tapping a notice opens what it's about.
- [ ] More → **Notifications**: the switches, as that role sees them (`M4`).
- [ ] More → **Appearance**: light, dark, and the phone's setting.
- [ ] News: write a post on the website (in the demo) with headings, a list, a link and a picture, then open it on the
      phone: it looks the same (`M8`).

**A parent and a student** (`M1`)
- [ ] **Classes:** the list and the month (the whole page; a tap on a day opens its sheet from the bottom: its classes or
      "No classes", and **Ask for a class on this day**); a class's sheet. Nothing is cut short with a larger text size.
- [ ] **Cancel a class** more than 24 hours ahead: it's canceled, and it shows under "Makeups to book" (**Book**).
- [ ] A class less than 24 hours away: **Cancel** is greyed out, with the rule.
- [ ] **Move to another time:** the class stays booked, with "waiting for the academy", until the office answers.
- [ ] **Ask for a class:** a makeup or an extra class, from the open seats (never who's in them), with a message.
- [ ] **Requests:** "Waiting for the academy", with **Withdraw**; each answer under "Recent requests" (approved, or not
      with the office's note).
- [ ] **A time the academy suggests** comes first in Classes ("Needs your answer"), with its note and seats left:
      **Accept** (booked at once, after a check), or **Ask for another time** (a class with a seat open, and a message).
      Each request's **History** folds open under it. (The Hwang family has one waiting in the demo.)
- [ ] As the parent: each child gets their own sheet, cancel and move.
- [ ] **Scores:** filter by child and by kind (Practice, Competition, Evaluation); a score's shots play back; Compare.
- [ ] **Reports:** a shared report opens, with its target.

**The office** (`M2`)
- [ ] Home: the **requests** card, who's in with their clock, the latest scores.
- [ ] The **Schedule** tab's badge counts the requests waiting on you; Schedule → **Requests** lists them, then those
      waiting on a family, then the last two weeks' answers.
- [ ] A request: approve one; decline one with a note (the family sees the note in their app).
- [ ] **Suggest another time:** type a note, tap a class with a seat open, confirm. The request waits on the family;
      their answer (accepted, or another time asked) comes back to you, with its **History**. Back and forth as long
      as it takes.
- [ ] A class's sheet: marks **Here** and **No-show**.
- [ ] A day that's over (Schedule → an earlier day): change a mark (a seat shown **Canceled** → **Here**), add a
      student, take one out. Owners and admins change any day; coaches only look.
- [ ] A class's sheet → **Add a student**: make-ups owed come first, labelled ("MU for 11/2"); also Practice, Trial 1/2
      and Evaluation.
- [ ] A student's **⋯**: **Move to another class** that week, and **Take out of this class** (it asks first).
- [ ] **Students:** search by name, and by a nickname ("Goes by …").
- [ ] A student's page: family, classes, calendar, scores, files.
- [ ] **Drive:** folders, moving a file, a new folder; the Contracts folder (the office's only).

**A coach** (`M7`)
- [ ] Home: today's classes and their students; hours and pay are in More → **Payroll**.
- [ ] **Availability:** set a day more than 7 days ahead (times, not available, repeat every week).
- [ ] Inside the 7 days: **Add time** only, with **Undo** for 10 seconds; removing time isn't offered.
- [ ] Marking a day not available when you're the only coach in: it asks first.
- [ ] Schedule: Day and Week, who's in with their clock-ins, a class's sheet.
- [ ] Students and Drive: what a coach may see (no family contacts on a student's page).

**Scan: a paper card** (the office and coaches; `M6`, `P1`)
- [ ] The Scan tab: the paper card first (**Take a photo**, **Choose from Photos**), then **Add a competition result**,
      the latest cards, and the tips folded at the bottom.
- [ ] Lay the card flat on its own, on any desk (white, wood or black), nothing over the bulls; photograph it from
      straight above, filling the frame.
- [ ] The total, the bulls worth a look (orange), and the card with a circle on each hole.
- [ ] A bull up close: the green circle hugs the hole, and it says how big the hole is ("hole 4.2 mm across").
- [ ] Drag a shot: its score follows, at that hole's size. **Remove** a shot, and **Type the score instead**.
- [ ] **Score written on the card (official):** type the coach's total; families see it, and the app's reading stays
      as a reference.
- [ ] **What it was:** Practice, Competition or Evaluation; the student (search by a nickname too), position and date;
      **Save**.
- [ ] Open the saved score (a student's page → Scores): change its note and save; its kind and written score stay.
- [ ] **Add a competition:** photograph a results sheet; check what it read (the total, inner tens), then save.

## 5. The manager's real cards

To compare the app with the coaches, **scanning** is enough: photograph a card, read the total, and close without
saving. In the demo, save only to made-up students.

To **enter** a real card for good (`P2`, your job by hand), sign in as yourself (the real academy), pick the real
student, and type the coach's written score as the official one.

## 6. When something's wrong

Tell Claude Code:
- **Which phone** (iPhone or Android) and **the version**, from More → Version.
- **Who you were signed in as.**
- **What you did, step by step, and what you expected.**
- A screenshot or a screen recording, if you can.

It fixes it in a pull request, and the fix reaches your phones with the next TestFlight build or `npm run android`.
