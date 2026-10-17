# To do: the owner's list, and what we agreed to do later

Two lists kept between rounds, so nothing is forgotten (the owner, 2026-10-17: "keep that in your mind so that you can
bring that up later"). Claude Code reads this file at the start of a round and brings up what's due. When something is
done, take it off; when it becomes a decision, record it in `docs/DECISIONS.md`.

## The owner's to-do (left for later on purpose)

From the App Store check of 2026-10-17 (`docs/publishing.md`, "Apple's checklist"):

1. **The privacy policy:** the academy approves the draft at https://skyarcacademy.web.app/privacy. Then Claude Code puts
   it in effect (the App Store doesn't accept a page marked as a draft).
2. **The academy's written permission** to publish its name and logo under HyberTec LLC: an email from the academy's
   owner is enough (Apple asks for it with the first submission).
3. **The academy's email and phone** in the website's Settings → Academy: the Help page (the stores' Support URL) and
   the privacy policy show them.
4. **Public or unlisted on the App Store:** Apple often refuses an app only one business's staff can use (guideline
   3.2), and switching to unlisted can't be undone. Submitting once parents and students use the app makes it an app
   for the academy's customers, which fits a public listing better.
5. **Apple's account:** the Account Holder accepts the developer agreement updated on 2026-10-13, and checks the EU
   trader status answer (App Store Connect → Business → Agreements).
6. **When ready to publish:** the steps in `docs/publishing.md` (the TestFlight build, then App Store Connect).
7. **The questions for the academy:** `docs/QUESTIONS.md` (A1–A14), in the order of the email to send.

## Product questions waiting for the owner

- Should families see each score as soon as it's saved (with the shots played back), or only in the progress reports
  the academy shares (today's rule, `docs/DECISIONS.md` §6, Q11)?
- Should coaches see every class (other coaches' too, and a student's classes with other coaches), or only their own
  (today's rule)?
- Should families get the academy's announcements (news, closed days)? Today announcements reach staff only.

## Later: agreed, not now

- **A web app for phones (PWA).** People on phones use the phone app; the website is used from laptops. Once everything
  works, make the website installable and comfortable on a phone. Until then the website's phone layout only has to not
  break (the schedule's coach column was narrowed on 2026-10-17).
- **Sign in with Apple:** only if Apple insists at review (guideline 4.8). The quicker fallback is email and password
  only in the iPhone app (`docs/publishing.md`, "Sign in with Apple").
- **Push notifications in the phone app**, with Apple's rules for them (guideline 4.5.4) and the App Privacy answer.
- **Korean and other languages:** one pass once everything works (`docs/DECISIONS.md` §6, Q14).
- **Before the real data comes in:** remove the sample data with `npm run seed:sample -- --remove` (it also removes the
  logins made for testing with `--login`), then import the academy's history (A4).
- **Moving to skyarcacademy.com** at launch: `docs/DEPLOY.md`, "Moving to skyarcacademy.com".
