# To do: the owner's list, and what we agreed to do later

Two lists kept between rounds, so nothing is forgotten (the owner, 2026-10-17: "keep that in your mind so that you can
bring that up later"). Claude Code reads this file at the start of a round and brings up what's due. When something is
done, take it off; when it becomes a decision, record it in `docs/DECISIONS.md`.

## The owner's to-do (left for later on purpose)

Publishing the phone app (the owner, 2026-10-20: the App Store as soon as possible, then updates; Android once it has
been tried). Everything else is ready (the texts, the screenshots, the reviewers' logins, a signed App Store build);
`docs/publishing.md` lists what only the owner can do, with each step-by-step guide:

1. **The academy's written permission** to publish its name and logo under HyberTec LLC: an email from the academy's
   owner is enough (Apple asks for it with the first submission).
2. **The App Store:** Apple's updated agreement and the EU question (the Account Holder), the App Store Connect key and
   the app's record, the upload, the pages, and Submit (`docs/publishing/apple/app-store.md`).
3. **Google Play:** which kind of developer account HyberTec has (personal or organization): it decides whether a
   two-week closed test comes first (`docs/publishing/google-play/account.md`).
4. **The questions for the academy:** `docs/QUESTIONS.md` (A1–A14), in the order of the email to send.

## Product questions waiting for the owner

- Should coaches see every class (other coaches' too, and a student's classes with other coaches), or only their own
  (today's rule)?
- Families and the academy's announcements: built to try (`docs/DECISIONS.md` §16): keep it, change it, or remove it?
  Should families also be notified (email, or the phone app's push once it's on)?
- **From the meeting notes, still to build** (checked on 2026-10-18; the rest is built, or waits on a decision already
  recorded: languages, push, the stores; the public website is live since 2026-10-20, `docs/DECISIONS.md` §18):
  - **Families cancel a class themselves**, with the academy's notice rule (A5), and the office is told (an inbox for
    owners and admins on the website, an email, or both). Today a class's sheet says to contact the academy.
  - **Families book a makeup in an open slot** (§7: families book classes for their children). Not built.
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
- **Before the real data comes in:** remove the sample data with `npm run seed:sample -- --remove` (it also removes the
  logins made for testing with `--login`), then import the academy's history (A4).
- **Moving to skyarcacademy.com** at launch: `docs/DEPLOY.md`, "Moving to skyarcacademy.com".
