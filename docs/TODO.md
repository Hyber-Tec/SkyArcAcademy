# To-do

Goo's list, short on purpose. The details for each line are in [TODO-notes.md](TODO-notes.md), under the same title.
When something is done, Claude Code ticks it, adds ✅ and the date, and moves it down to **Done**. Checked on 2026-11-10.

## Now

- [ ] **The two signs for the front desk:** print Claude Code's PDFs (the contract and the app), letter size or 5 × 7,
  for the acrylic holders. Then a parent scans one to ask for a contract, or to get the app. Now in English only: if
  the Korean ones were printed, print the new ones instead
- [ ] **Kiosk PINs before Sunday, November 15** (everyone starts then): the two coaches with accounts set theirs at the
  meeting. Three employee records still have none (the manager's, and two people without an account): Employees →
  the person → Kiosk PIN. Coaches can now set and change their own (Profile → Kiosk PIN)
- [ ] **Android 1.2.0 (build 14): try it on your Android phone.** Plug it into the Mac (USB debugging on). If Sky Arc
  came from Google Play, delete it from the phone first. Then, in Terminal, in the Sky Arc folder: `npm run android`.
  Once it looks right, tell Claude Code: it sends this build to Google Play's review, and it goes live by itself once
  approved
- [ ] **iPhone 1.2.0 is in Apple's review** (build 13, the one you tried; sent 2026-11-11): it goes live by itself once
  approved. If Apple writes, give Claude Code the message. The phone's search by other names, and the tour's fix for
  Android (#175), come with the next iPhone build
- [ ] **The results site: your test, then the manager's.** Settings → Results site → **Check now** (the last month, about 9 minutes
  the first time). Open an athlete to see their results as the scores will show them, then link them, or **Confirm all**.
  When you're done trying, the gear → **Start over** removes it all and puts the results sheet scans back as they were,
  so you can show the manager from the start. A result from the last 7 days tells the family, as any new score does
- [ ] **SCATT sessions:** ask the coaches to export a session from SCATT (a `.scatt-basic` file) and drop it in the
  student's folder in the Drive, or on the student's Scores tab: the page then opens its sessions there, for them and
  the family. The name typed in SCATT must be one of the student's names (a first name is enough); if not, the file says
  so, and adding that name to the student's other names, then uploading the file again, brings the sessions in
- [ ] **Scopos's own key for the app:** send them the email in the private notes (price, limits); the estimate is there
  too. Until then the starter key works; a new key goes in with `npx tsx scripts/results-site-key.ts`
- [ ] **Google Search Console:** verified; send the sitemap with its full address, `https://skyarcacademy.com/sitemap.xml`

## The manager

- [ ] **The signature for the contract:** none is drawn yet (a typed name shows). At the fourth meeting the owner said
  she'd send a better signature with her final wording. Draw it in Settings → Enrollment contract, or sign on paper and
  Goo sends a photo. The title is optional
- [ ] **Website content:** coach photos, real families' quotes (with their permission), trial length and price, the
  youngest age, the range's safety rules, tuition, more photos
- [ ] **Legal name and mailing address** for the privacy policy (only if the academy wants them there)
- [ ] **Cancel the old website's ChatGPT subscription:** fine to do. Keep the domain on Squarespace and the Google
  Workspace email

## Soon

- [ ] **Invite the coaches** from the website
- [ ] **Clear the lead coach** from the seats (Claude Code, from 2026-11-13)
- [ ] **The stores' links to skyarcacademy.com:** Google Play once 1.1.0 is approved, the App Store with the next version
- [ ] **The stores in English only:** the next App Store and Google Play submission drops Korean (the build has no
  Korean any more; check the listings have no Korean text or localization)
- [ ] **Google's sign-in window says skyarcacademy.com** (optional: one setting for Goo, then Claude Code)

## Questions for Goo

- [ ] **Students in the private notes:** the academy's answers of October name about 20 students, with levels and
  grades. Keep them in the private repository, or on the Mac mini only?
- [ ] **"To check" on the Scores page:** add a "Looks right" button that clears the mark?

## Later

- [ ] Trial booking online (open times from the coaches' availability, Trial 1 and Trial 2)
- [ ] A student's class that repeats every week (today the office copies weeks)
- [ ] Coaches' notes on a class
- [ ] Competition results from a PDF, not only a photo
- [ ] SIUS PDFs read on the phone
- [ ] The website faster on phones
- [ ] A how-to video for parents, once the website and the app are final
- [ ] Tuition on the website, if the manager asks
- [ ] Coaches' usual days carried on past February 28, 2027 (ask in late February)

## Not doing

- ~~Clocking in from a phone or by location~~: the kiosk only (third meeting)
- ~~Events on the schedule and the website~~: removed at Goo's request
- ~~Other languages~~: English only (the academy, 2026-11-10)
- ~~A merch shop~~: not asked for
- ~~Automatic travel-hour pay~~: added by hand, unless the manager asks
- ~~Several academies or branches~~: one academy, plus the demo
- ~~Automatic level changes, and rules for make-ups and trials~~: labels, and levels changed by hand
- ~~Importing past schedules~~: the manager marks the past weeks' attendance himself
- ~~Asking the manager about the paper scoring rule~~: Goo decided it
- ~~The website as an installable phone app (PWA)~~: the phone apps do that (Goo, 2026-11-07)
- ~~A demo switch for other owners on the phone~~: not needed (Goo, 2026-11-07)
- ~~Telling families a report was drafted with AI~~: the academy checks every report (Goo, 2026-11-07)
- ~~skyarcsports.com~~: not a domain the academy uses (Goo, 2026-11-07)
- ~~The owner reviewing students' school grades from the spreadsheet~~: the import is done; the office edits students in
  the app

## Done ✅

- [x] ✅ 2026-11-11 · Google Play 1.1.0 (build 12) live, after 3 days 16 hours in Google's review
- [x] ✅ 2026-11-11 · iPhone 1.2.0 (build 13) tried on TestFlight (Goo), and sent to the App Store's review
- [x] ✅ 2026-11-11 · The franchise page made better, to show the owner (#169)
- [x] ✅ 2026-11-10 · The results site's key saved (Goo)
- [x] ✅ 2026-11-10 · The owner's franchise page, at the very bottom of the website (#158)
- [x] ✅ 2026-11-10 · The public email is `info@skyarcacademy.com` (Goo, Settings → Academy → Email)
- [x] ✅ 2026-11-10 · The coach card's "Elite Military Rifle Marksman", in capitals (Claude Code, at Goo's word)
- [x] ✅ 2026-11-10 · The fourth meeting's picks: B6 A; R1 build it, automatic; R2 decode it in-house; R3 yes
- [x] ✅ 2026-11-09 · The app's email comes from info@skyarcacademy.com, with the manager's app password
  ([DECISIONS.md](DECISIONS.md) §40)
- [x] ✅ 2026-11-08 · Contracts asked for from the academy's sign: the parent asks at /contract, the office sends it from
  the request, and it opens on their phone filled in ([DECISIONS.md](DECISIONS.md) §39)
- [x] ✅ 2026-11-08 · The app on the website: /get-app, a band on the homepage, the stores' badges in the footer, and one
  link that opens each phone's store (#140)
- [x] ✅ 2026-11-08 · A student's own hours: drag their card past the class (it holds a seat in the next one), and
  canceled students on a line under the seats (Goo's picks, A and 1; [DECISIONS.md](DECISIONS.md) §38). The phone
  app shows them in its next build
- [x] ✅ 2026-11-08 · The terms of service, live at skyarcacademy.com/terms beside the privacy policy (Goo; #134)
- [x] ✅ 2026-11-08 · The private notes in a private repository of their own, on both Macs, brought up to date when a
  session starts (#131); the Mac mini's notes are in it
- [x] ✅ 2026-11-08 · The docs in folders, with a map: meetings, phone, kiosk, publishing, reference (#132)
- [x] ✅ 2026-11-08 · Deploys send only the functions that changed, again (#133)
- [x] ✅ 2026-11-08 · Card photos added from the Drive are filed straightened, so families and students see each bull's
  score, read-only (Goo's pick; #130), live
- [x] ✅ 2026-11-07 · The kiosk fix for a forgotten clock-out while the tablet was offline (#125), live
- [x] ✅ 2026-11-07 · The website's lines wrap between words, as on the phone (#126), live
- [x] ✅ 2026-11-07 · Families' Scores page: kept as it is, with results opening under their row (Goo; #128), live
- [x] ✅ 2026-11-07 · Google Search Console: skyarcacademy.com verified (Goo)
- [x] ✅ 2026-11-07 · A private copy of the old website's pages and photos (docs/internal, before it's cancelled)
- [x] ✅ 2026-11-07 · The contract in Korean, live in the academy: parents read it in Korean, the English counts
- [x] ✅ 2026-11-07 · The contract's prices checked (Goo)
- [x] ✅ 2026-11-07 · The kiosk tablet: the app (#123), on the academy's Samsung tablet as its home screen, registered
- [x] ✅ 2026-11-07 · The kiosk's logic checked against the schedule and the payroll (one fix: #125)
- [x] ✅ 2026-11-07 · AI for report text: the keys are in and report text is on (checked)
- [x] ✅ 2026-11-07 · skyarcacademy.com connected, and every link and email moved there (#119)
- [x] ✅ 2026-11-07 · Access to the domain's Squarespace account
- [x] ✅ 2026-11-06 · Google Play: the Data safety form updated (Goo), and 1.1.0 sent to Google's review
- [x] ✅ 2026-11-06 · App Store privacy: Device ID added (Goo)
- [x] ✅ 2026-11-06 · iPhone app 1.1.0 approved and live in the App Store, within a day of sending it
- [x] ✅ 2026-11-06 · Sign-in and file access accept skyarcacademy.com (Firebase settings)
- [x] ✅ 2026-11-06 · Notifications on iPhones: Apple's push key is in Firebase, and a test push reached Goo's iPhone
- [x] ✅ 2026-11-06 · 1.1.0 (build 12) sent to Apple, and staged on Google Play (#118)
- [x] ✅ 2026-11-06 · Phone app: lines wrap between words, in Korean and English (#117)
- [x] ✅ 2026-11-05 · Korean for parents: the portal, the phone app, the website and the contract (#115)
- [x] ✅ 2026-11-05 · The enrollment contract approved, and live in the academy and the demo
- [x] ✅ 2026-11-05 · Contracts filled in and signed in the app, one per child, sent by the office, a copy by email
  (#111–#113)
- [x] ✅ 2026-11-05 · iPhone app 1.0.0 live in the App Store (sent 2026-10-21; approved after Goo wrote to Apple)
- [x] ✅ 2026-11-04 · The manager's blank contract
- [x] ✅ 2026-11-03 · Google Play: Sky Arc 1.0.0 live (sent 2026-10-26)
- [x] ✅ 2026-11-03 · Sign in with Apple, and Create an account in the app by the email on file (#108)
- [x] ✅ 2026-11-03 · The Scores page, with every student's latest results (#102)
- [x] ✅ 2026-11-03 · Mark the rest of a class or a day, and see what's not marked (#105)
- [x] ✅ 2026-11-03 · Results sheets: the student found by name, and no result added twice (#106, #107)
- [x] ✅ 2026-11-02 · Third meeting with the manager: notes and tracker (#104)
- [x] ✅ 2026-11-02 · The Students list and the Scores tab, as Goo picked them (#100, #101)
- [x] ✅ 2026-11-02 · The schedule's panel floats over it, opened from its corner (#97)
- [x] ✅ 2026-10-30 · AI for report text, and Settings → AI (#90–#95)
- [x] ✅ 2026-10-30 · Competitions shown match by match, series by series (#89, #93)
- [x] ✅ 2026-10-30 · Super admins view the phone app as anyone (#85)
- [x] ✅ 2026-10-30 · The family's Classes remade, with the months as a page (#87)
- [x] ✅ 2026-10-30 · Each student's own Contracts folder (#88)
- [x] ✅ 2026-10-30 · The timeline: equal slots, right-click menus, no events (#86)
- [x] ✅ 2026-10-29 · The office suggests another class, and the family accepts it (#81)
- [x] ✅ 2026-10-29 · Owners and admins change any day, a past one too (#79)
- [x] ✅ 2026-10-29 · The card reader finds holes in uneven light, at a slant and beside other cards (#80, #83)
- [x] ✅ 2026-10-28 · Push notifications on the phone (#45)
- [x] ✅ 2026-10-28 · Families cancel and ask for classes, and the office answers (#46, #58)
- [x] ✅ 2026-10-28 · Contracts signed from a link (#53)
- [x] ✅ 2026-10-28 · The schedule as a timeline of who's in (#67)
- [x] ✅ 2026-10-28 · Each hole measured and scored at its real size (#68, #71)
- [x] ✅ 2026-10-28 · Pay at one hourly rate from the kiosk; coaches add time inside the lock (#44, #54, #57)
- [x] ✅ 2026-10-28 · Result kinds, the written score, and competitions from their sheet (#48, #66)
- [x] ✅ 2026-10-28 · Simpler Settings, with a search and a home page (#49, #72)
- [x] ✅ 2026-10-28 · Deploys send only what changed (#59)
- [x] ✅ 2026-10-27 · Second meeting with the manager: tasks and tracker (#43)
- [x] ✅ 2026-10-27 · A demo academy, for showing the app (#38, #41)
- [x] ✅ 2026-10-26 · The academy's real data in production: staff, students, parents' contacts, classes (#30, #32)
- [x] ✅ 2026-10-26 · Classes taught together, and the schedule as the academy's sheets (#31, #34)
- [x] ✅ 2026-10-26 · Google Play: 1.0.0 sent for review (#35–#37)
- [x] ✅ 2026-10-21 · App Store: 1.0.0 sent for review (#26)
- [x] ✅ 2026-10-20 · The academy's public website, live, and the privacy policy in effect (#24, #25)
- [x] ✅ 2026-10-18 · Every score for parents and students, and the academy's news (#21, #22)
- [x] ✅ 2026-10-18 · Coaches on the phone, "not available" days, and the coach's payroll (#23)
- [x] ✅ 2026-10-17 · Parents and students on the website and the phone (#20)
- [x] ✅ 2026-10-17 · The shot replay, and coaches in the app (#15, #17, #18)
- [x] ✅ 2026-10-16 · The office's phone app, with paper targets scored from a photo (#14)
- [x] ✅ 2026-10-16 · The Drive and progress reports (#11)
- [x] ✅ 2026-10-16 · The academy's official logos everywhere (#12, #13)
- [x] ✅ 2026-10-15 · Pay for classes taught, student levels and sample data (#8, #9)
- [x] ✅ 2026-10-15 · Sky Arc set up from HyberCRM: the repository, checks and deploys (#1–#7)
