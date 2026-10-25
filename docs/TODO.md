# To do: the owner's list, and what we agreed to do later

Two lists kept between rounds, so nothing is forgotten (the owner, 2026-10-17: "keep that in your mind so that you can
bring that up later"). Claude Code reads this file at the start of a round and brings up what's due. When something is
done, take it off; when it becomes a decision, record it in `docs/DECISIONS.md`.

## The owner's to-do (left for later on purpose)

1. **The App Store:** Sky Arc 1.0.0 (build 2, uploaded 2026-10-21) is waiting for Apple's review (still on 2026-10-25,
   submitted 2026-10-21). When Apple
   answers: release it (`docs/publishing/apple/app-store.md`, steps 25–26), or give Claude Code Apple's message. If
   Apple asks for the academy's permission (guideline 5.2.1), attach the academy's email. Keep the sample data and the
   reviewers' logins in production until then.
2. **Google Play:** which kind of developer account HyberTec has (personal or organization): it decides whether a
   two-week closed test comes first (`docs/publishing/google-play/account.md`).
3. **The academy:** text the manager A17–A18 (four students' parents and grades, the academy owner's email); the
   academy's owner reviews the grades on the spreadsheet; later A10 and A12–A15 (`docs/QUESTIONS.md`).

## Product questions waiting for the owner

- **Classes taught by every coach on duty together** (A16, confirmed 2026-10-25, `docs/DECISIONS.md` §20): the
  schedule needs a new shape (today a class is one coach's, from HyberCRM's tutoring), and with it, which classes a
  coach sees (today only their own). Goo picks from design options before it's built; the classes are imported in
  that shape.
- Families and the academy's announcements: built to try (`docs/DECISIONS.md` §16): keep it, change it, or remove it?
  Should families also be notified (email, or the phone app's push once it's on)?
- **From the meeting notes, still to build** (checked on 2026-10-18; the rest is built, or waits on a decision already
  recorded: languages, push, the stores; the public website is live since 2026-10-20, `docs/DECISIONS.md` §18):
  - **Families cancel a class themselves**, with the academy's notice rule (24 hours, preferably: §20), and the office
    is told (an inbox for owners and admins on the website, an email, or both). Today a class's sheet says to contact
    the academy.
  - **Families book a makeup or extra practice in an open seat** (§7: families book classes for their children; the
    manager, 2026-10-24: students who come for extra practice should "be able to book whenever extra space opens
    up"). Not built.
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
- **Push notifications in the phone app**, with Apple's rules for them (guideline 4.5.4) and the App Privacy answer.
- **SIUS PDFs from the phone**, if coaches get them there: the phone can pick files already, but reading a SIUS result
  is the website's (a server-side reader would do it).
- **Korean and other languages:** one pass once everything works (`docs/DECISIONS.md` §6, Q14). The public website
  too: any language, added late, even after the site is live (the owner, 2026-10-19). The owner reviews the Korean by
  hand, since machine-written Korean doesn't read naturally, so until then the site's Korean stays a draft: don't spend
  time polishing it.
- **Moving the real data in** (`docs/DECISIONS.md` §20), once Apple has finished its review (the manager answered A16
  and sent the spreadsheet on 2026-10-25):
  1. Take away the reviewers' logins and the sample data: `npx tsx scripts/review-logins.ts --remove`, then
     `npm run seed:sample -- --remove` (it also removes the logins made for testing with `--login`).
  2. Settings: the **Hourly** pay model from the start (Settings → Academy rules); Sunday's hours to cover classes until
     7:30 PM (the default is 1–6 PM); the month's make-up Friday opened on its date.
  3. The import (Claude Code builds it in the shape Goo picks for classes; the sheets and the spreadsheet are read, in
     `docs/internal/schedule-import/`): the staff with their rates and usual days; the students with their levels,
     rifle codes, grades and parents; the classes from August 31 (past weeks as they happened, with absences and
     make-ups) through November's standing week. Download November's sheet and the spreadsheet again just before:
     the manager is still editing both. Nobody gets access or email.
  4. Access, from the website, when the office is ready: each sends that person's sign-in email.
  5. The next App Store update needs review logins that see no real student (`docs/publishing/updates.md`).
- **Moving to skyarcacademy.com** at launch: `docs/DEPLOY.md`, "Moving to skyarcacademy.com".
