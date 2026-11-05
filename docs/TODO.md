# To do: the owner's list, and what we agreed to do later

Two lists kept between rounds, so nothing is forgotten (the owner, 2026-10-17: "keep that in your mind so that you can
bring that up later"). Claude Code reads this file at the start of a round and brings up what's due. When something is
done, take it off; when it becomes a decision, record it in `docs/DECISIONS.md`.

## The owner's to-do (left for later on purpose)

1. **The App Store:** Sky Arc 1.0.0 (build 2) has been waiting for Apple's review since 2026-10-21 (still on
   2026-10-27). When Apple answers, tell Claude Code: `docs/publishing.md`, "When a store answers", says what each answer
   means (release it, or the reply to a rejection). If Apple asks for the academy's permission (guideline 5.2.1),
   attach the academy's email. Since 2026-10-26 the reviewers' login is an admin with the academy's real data: paste
   the new notes (`docs/store/review-notes.md`) into App Review Information if App Store Connect lets you while it
   waits. No second submission while it's in review (Goo, 2026-10-26). Still waiting on 2026-11-03; Goo has written
   to Apple's support.
2. **Google Play:** Sky Arc 1.0.0 (build 3, with classes taught together) is **published and live** (by 2026-11-03).
   Nothing to do until the next update (1.1.0 is on the internal testing track for trying, below).
3. **The academy:** the academy's owner reviews the grades on the spreadsheet; later A10 and A12–A15
   (`docs/QUESTIONS.md`). A17–A18 aren't asked (§21).
4. **Showing the app** (`docs/DECISIONS.md` §22): turn on **Demo data** in the account menu (your name at the
   bottom of the sidebar) to show the made-up academy, and turn it off for the real one. On a phone (from the update
   below), sign in with one of the demo's own logins to show it ("Demo" shows at the top), and with your own account
   for the real academy. Before a showing, ask Claude Code to refresh the demo (`npm run seed:sample` on production
   moves its classes around the day).
5. **The next update, 1.1.0, for both stores**, once everything is ready (Goo, 2026-11-03: no update before then;
   Google Play has answered, the App Store hasn't yet). **To try it now:** 1.1.0 (build 9, 2026-11-03) is on TestFlight
   and on Google Play's internal testing, with everything built so far (Scan, the families' part, Create an account,
   Sign in with Apple, the contract step). The steps of the release, the forms to update first and which Mac uploads
   which store: `docs/publishing/updates.md`, "The next update: 1.1.0". Then clear the lead coach (below).
6. **The second meeting's tasks** (2026-10-27): [`docs/MEETING2_FEEDBACK.md`](MEETING2_FEEDBACK.md), by phase, ticked as
   each is merged. Phase 1 is merged (contracts with #53); Phase 3 runs on the MacBook Pro. Yours:
   - **The schedule (`V2`) and the hole sizes (`P1`)** are merged (#67, #68, and the phone's part in #71). The manager
     isn't asked about the scoring rule.
   - **The manager's files:** all in: the past results (the third meeting) and the contract (2026-11-04, `CT2`).
7. **Push notifications:** Apple's push key into Firebase, once (`docs/mobile-push.md`, "What Goo does", and #45), then
   a test push to your iPhone from the MacBook Pro when you say.
8. **AI for report text** (`docs/DECISIONS.md` §26): you're a super admin (HyberTec's other developer too, §29). On
   the website, **Settings → AI**:
   - **Models:** Report text starts on Claude Sonnet 5.5 at low thinking (about $6 a month); Gemini 3.5 Flash-Lite is
     about $1 (fine to choose: only adults use AI, §26).
   - **Keys:** add the chosen provider's API key (the page links where to make one), then **Test**, turn Report text
     **on** and **Save**. Then a draft report → **Write with AI**.
9. **Your round of 2026-11-02** (`docs/DECISIONS.md` §29): your three picks are built. The Students list (#100) and
   the Scores tab (#101) are merged; **review the Scores page (#102)**. What they left for you to decide is the first
   three questions below.
10. **The third meeting's tasks** (2026-11-02): [`docs/MEETING3_FEEDBACK.md`](MEETING3_FEEDBACK.md), ticked as each is
    merged, all on the MacBook Pro this round (Goo, 2026-11-03). The sign-up and the contract in the app are built
    (`CT1`, `CT2`; `docs/DECISIONS.md` §31). Yours:
    - **Sign in with Apple, once, before the next store update:** the steps in
      [`docs/publishing/apple/sign-in-with-apple.md`](publishing/apple/sign-in-with-apple.md) (Apple's developer site and
      the Firebase console).
    - **The contract** (approved 2026-11-05; `docs/DECISIONS.md` §33 and §34): once the sending flow is merged, Claude
      Code sets it up in the live academy and the demo one (`scripts/contract.ts`, from `docs/internal/contract/`).
      Then, in Settings → Enrollment contract: check the prices, and add the academy's signature (the manager's SVG,
      or drawn there). From then on the office sends each family's contract from the student's page or the list there
      (every family signs again, one contract per child).
    - **The domain** once he invites you to Squarespace (`DM1`–`DM3`).

## Product questions waiting for the owner

- **Card photos picked from the Drive** (#101): the photo becomes the score's file, so nothing is copied, and the
  website shows it with the bulls' scores. The phone app and a family's view show it as a plain photo. Either save a
  straightened copy of the card beside it, as the phone's scanner does (the folder gets a second file for that card;
  Claude Code's suggestion, no phone work), or keep one file and have the phone app (on the MacBook Pro) and the
  family view draw the scores on the photo.
- **Families' Scores page:** the staff's new Scores tab design (§29) for families too, or as it is?
- **"To check" on the Scores page** (#102): results the reader marked Check show there for 30 days, since nothing
  clears the mark yet. A button to say a result is right would clear it.
- **The demo academy on the phone:** a demo login opens the demo there too, from 1.1.0, and a super admin switches to it
  with View the app as (§27). Other owners in both academies could get a switch too, if wanted.
- **AI and families:** should a shared report say its words were drafted with AI and checked by the academy? Today it
  doesn't (only staff see it). Anthropic's guidance for apps that serve minors asks to tell users when AI is involved.
- **From the meeting notes, still to build** (checked on 2026-10-18; the rest is built, or waits on a decision already
  recorded: languages, push, the stores; the public website is live since 2026-10-20, `docs/DECISIONS.md` §18):
  - **Families cancel, and request a class or a makeup in an open seat:** the second meeting's `S1`–`S3`
    (`docs/MEETING2_FEEDBACK.md`).
  - **A student's class that repeats every week.** Today the office copies whole weeks (Duplicate week).
  - **Coaches' notes on a class** (a session log, "if they want"). Today only the office writes a class's note.
  - **The kiosk as a registered device** with a setup PIN (§6 Q9); until then it opens for a signed-in admin.
  - **Trial booking online** can be built now: the privacy policy it waited on is approved (2026-10-20, §6 Q15). Today
    the website's "Book a trial" sends a request (the days that suit the family) to the Website page and the office's
    email. Booking proper: open times from the coaches' availability, a class labeled Trial 1, the family's
    confirmation email, Trial 2 by an emailed link (`docs/DECISIONS.md` §18).
- **The website's missing content** (the list for the academy's manager, 2026-10-20): coach portraits, real families'
  quotes (with permission), trial length and price, the youngest starting age, the range's safety rules, whether
  coaching happens in Korean, tuition rates or a tuition guide, more photos (the range, the equipment, a first trial,
  the team, results day) and a larger copy of the match-day photo (630 px wide now). The phone number is set
  (2026-10-20). Until each is confirmed the site leaves it out (photos go in on the Website page; text in
  `web/src/site/kit/content.ts`).
- **Before skyarcacademy.com points to the website**: real testimonials, or the samples come off (`docs/DEPLOY.md`,
  "Moving to skyarcacademy.com").

## Later: agreed, not now

- **The website, faster on phones**: the pages show once their scripts have loaded (Lighthouse on a simulated slow
  phone, 2026-10-20: performance 82, accessibility 96, SEO 100). Building each page's first screen into its HTML
  would make it show sooner; worth doing before skyarcacademy.com points here.
- **A web app for phones (PWA).** People on phones use the phone app; the website is used from laptops. Once everything
  works, make the website installable and comfortable on a phone. Until then the website's phone layout only has to not
  break (the schedule's coach column was narrowed on 2026-10-17).
- **Sign in with Apple:** only if Apple insists at review (guideline 4.8). The quicker fallback is email and password
  only in the iPhone app (`docs/publishing/apple/rules.md`, "Sign in with Apple").
- **SIUS PDFs from the phone**, if coaches get them there: the phone can pick files already, but reading a SIUS result
  is the website's (a server-side reader would do it).
- **Korean and other languages:** one pass once everything works (`docs/DECISIONS.md` §6, Q14). The public website
  too: any language, added late, even after the site is live (the owner, 2026-10-19). The owner reviews the Korean by
  hand, since machine-written Korean doesn't read naturally, so until then the site's Korean stays a draft: don't spend
  time polishing it.
- **The real data moved in on 2026-10-26** (Goo's call, during Apple's review: `docs/DECISIONS.md` §21). The sample
  data, the owner's test coach and the coach, parent and student review logins are gone; pay is Hourly from the start
  and Sunday is open 1–7:30 PM; the import brought in the staff, the students and their parents' contacts, and the
  classes from August 31 to November 30 with who's in each day (from the sheets and the spreadsheet of 2026-10-25).
  Nobody got access or email. Still to do:
  1. **The manager's later changes:** none by import: since the third meeting (2026-11-02) the academy uses the app,
     and the manager marks the past weeks' attendance himself on the website.
  2. **Who's in on Sundays:** the coach in turn isn't on the sheets, so Sundays show the every-Sunday coach and the
     manager only; the office adds that week's coach in "Who's in". The make-up Friday of October 23 has nobody in,
     and one student was in two classes at once that day.
  3. **Access**, from the website, when the office is ready: each sends that person's sign-in email (the academy's
     owner as an owner, A18).
  4. **The phone's lead coach:** `scripts/lead-coach.ts` gives each seat its class's lead coach so the phone app 1.0 can
     open a class. Android's build 3 already reads classes; once the iPhone's 1.1.0 is out, run
     `npx tsx scripts/lead-coach.ts --clear`. Until then, run `--apply` again after the office adds students.
  5. **Coaches' usual days run through February 28, 2027** (carried on from November's on 2026-10-28, `C4`). In late
     February, ask Claude Code to carry them on again, or the office uses Repeat weekly.
- **Moving to skyarcacademy.com** at launch: `docs/DEPLOY.md`, "Moving to skyarcacademy.com".
