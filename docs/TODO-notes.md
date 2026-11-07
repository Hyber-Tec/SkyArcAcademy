# To-do: the details

The steps and background behind each line of [TODO.md](TODO.md), under the same titles. TODO.md stays short for Goo;
this page is for whoever does the work, Claude Code included. When a line is done, its notes can go (git keeps them),
unless they say how something works from then on.

## Now

### Connect skyarcacademy.com

The steps are in [DEPLOY.md](DEPLOY.md), "Moving to skyarcacademy.com". In short:

- **Firebase:** Hosting → Add custom domain, `skyarcacademy.com`, **Advanced setup**, so the old website stays up until
  the new one's certificate is ready.
- **Squarespace:** add the two TXT records Firebase shows. When Firebase says so, swap the two A records for its own.
- **Then `www.skyarcacademy.com`**, redirecting to `skyarcacademy.com`.
- **Done by Claude Code on 2026-11-06:**
  - Sign-in's authorized domains include `skyarcacademy.com` and `www.skyarcacademy.com`.
  - The Storage bucket's CORS allows both.
  - [#119](https://github.com/Hyber-Tec/SkyArcAcademy/pull/119) moves the links, the emails, the site's addresses and
    the phone app's next build to the domain. **Merge it only once Firebase shows the domain Connected.**
- **The phone apps need no update for this.** `skyarcacademy.web.app` serves the same site and keeps working. The
  phone apps 1.0 and 1.1 open it, and so does every email already sent. The next phone build opens skyarcacademy.com by
  itself.

### Google Play 1.1.0

The steps are in [publishing/updates.md](publishing/updates.md), "1.1.0, sent on 2026-11-06", steps 2 and 3:

1. **Data safety:** add the account creation methods, username and password and OAuth.
2. **Roll out:** Production → the draft 1.1.0 (12) → Edit release → Next → Save and publish.

Google reviews it, usually in hours to a few days, and then it goes live by itself.

### App Store privacy

App Store Connect → Sky Arc → App Privacy: add **Identifiers → Device ID** (linked to the user, App Functionality, not
tracking), the phone's notification token, then **Publish**. No review. The answers are in
[store/privacy-answers.md](store/privacy-answers.md).

### Notifications on iPhones

[mobile-push.md](mobile-push.md), "What Goo does":

- Upload one of the team's Team Scoped APNs keys (`.p8`) in Firebase → Project settings → Cloud Messaging → the iOS
  app.
- Then a test push to Goo's iPhone.

Without the key, iPhones get no notifications. Android needs nothing. Whether it was done isn't recorded anywhere:
check the Cloud Messaging page.

## Soon

### Kiosk app

Goo, 2026-11-06. A Samsung Android tablet arrives in a few days. It goes on a wall mount at the front desk, near an
outlet (third meeting, `L-KI`). What Goo asked for:

- **Its own app**, not the website's kiosk page (that one was for showing). It's installed from a file on the tablet,
  with no store.
- **Always on:** the screen never turns off, and the tablet opens only the kiosk.
- **Works without the internet:** clock-ins and clock-outs are saved on the tablet, and sent when it's back online.
- Goo goes over it with Claude Code before it's built.

**What exists:**

- The website's kiosk at `/kiosk`, opened by a signed-in admin.
- Coaches' PINs, stored hashed (Settings, `setKioskPin`).
- The server's `kioskIdentify` and `kioskPunch`.
- `autoClockOut` at midnight.
- Pay starts from the kiosk's clock-in and ends at the day's last class ([DECISIONS.md](DECISIONS.md), the second
  meeting's `K1`–`K6`).
- [DECISIONS.md](DECISIONS.md) Q9 planned the kiosk as a registered device with a setup PIN.

**To settle when Goo goes over it:**

- **Build:** a separate Expo app or a mode of the phone app, built as an APK.
- **The device:** registered, and how. One idea: a device token from a setup PIN, as Q9 planned.
- **Offline:**
  - Checking PINs offline needs the hashes on the tablet, so it's a question how they're kept there.
  - Punches go in a queue with their own time.
  - The server needs a rule for punches sent late: accept the tablet's time within limits, and say on the payroll
    which ones came in late.
  - Firestore's offline cache doesn't help callable functions.
- **Keeping it running:** Android's lock task mode (screen pinning, or Samsung's own kiosk setting), keep the screen
  on, start on boot.
- **Updates:** a new file, or the app checks for one.

### Email from info@skyarcacademy.com

The second meeting's `E1`, the third's `DM3`. The academy's email is Google Workspace, and the domain already
publishes SPF, DKIM (`google._domainkey`) and DMARC for it, so mail sent through the academy's own account passes all
three.

1. **The manager:**
   - On info@'s Google Account → Security, turn on 2-Step Verification if it's off.
   - Then **App passwords** → make one named "Sky Arc", and keep the 16 letters.
   - If Google says app passwords aren't available, the Workspace admin allows 2-Step Verification first.
2. **Goo:** put it in Google Cloud console → Security → Secret Manager → `GMAIL_APP_PASSWORD` → **New version**. Never
   in a chat or a file.
3. **Claude Code:** in a pull request, `SENDER_EMAIL` in `shared/src/brand.ts` becomes `info@skyarcacademy.com`.
   Merging it redeploys the functions that send mail, and they use the new password.

Replies already go to the academy's email. Copies of what the app sends will show in info@'s Sent folder.

### Invite the coaches

The third meeting's `DM2`. After the domain (#119) and ideally the email, so the invitations come from the academy's
address and link to its domain. From the website: each coach's page → **Access** → send the sign-in email. The
real-data import gave nobody access yet ([DECISIONS.md](DECISIONS.md) §21).

### The contract's Korean

[DECISIONS.md](DECISIONS.md) §36:

- In the demo academy, open a parent's contract with the phone or the browser set to Korean, and its signed PDF.
- Read it with the manager.
- When Goo says so, Claude Code puts it in the live academy (`scripts/contract.ts --ko-file`).
- Tell Claude Code wherever the app's Korean reads oddly.

### The contract's settings

Settings → Enrollment contract:

- Check the prices.
- Add the manager's title if you like.
- Upload his signature as an SVG when it comes. It replaces his typed name.

From then on the office sends each family's contract from the student's page or the list there. Every family signs
again, one contract per child, and each signer gets a copy by email.

### Clear the lead coach

`npx tsx scripts/lead-coach.ts --clear`, when Goo says so.

- **Why it's there:** the iPhone app 1.0 opens a class through each seat's lead coach. 1.1.0 and Android's builds
  don't need it.
- **Wait:** 1.1.0 went live on 2026-11-06, and iPhones update by themselves, most within days, so give it about a week.
- **Until then:** run `--apply` again after the office adds students.

### Website: Korean lines wrap between words

The phone's fix (#117) on the website:

- Headings balanced, paragraphs kept from leaving a word alone on the last line.
- The contract's signature date kept on one line.

It's on the local branch `fix/web-line-breaks` on the MacBook Pro, not pushed (Goo, 2026-11-05: the phone first, the
website later).

### AI for report text

[DECISIONS.md](DECISIONS.md) §26, for super admins:

1. On the website, **Settings → AI**. Report text starts on Claude Sonnet 5.5 at low thinking (about $6 a month).
   Gemini 3.5 Flash-Lite is about $1, and fine to choose: only adults use AI.
2. Add the chosen provider's API key (the page links where to make one).
3. **Test**, turn Report text **on**, and **Save**.
4. Then a draft report → **Write with AI**.

### Google Search Console

After the domain:

1. https://search.google.com/search-console → **Add property** → **Domain** → `skyarcacademy.com`.
2. Add the TXT record it shows in Squarespace (DNS → Custom records; keep every other record).
3. **Verify**.
4. Sitemaps → `https://skyarcacademy.com/sitemap.xml`.

The site's pages already tell search engines that skyarcacademy.com is their address (#119).

### The stores' links to skyarcacademy.com

The old addresses keep working, so this can wait. [store/listing.md](store/listing.md) has the new ones:

- **Google Play**, any time after the domain:
  - Store settings: the website.
  - App content: the privacy policy.
  - Data safety: the account deletion page.
- **App Store:**
  - **Privacy Policy URL** (App Privacy): any time.
  - **Support URL** and **Marketing URL:** only with the next version.

## Waiting on the academy

### Website content

The manager's list of 2026-10-20 (the academy's question A13). The site leaves out anything not confirmed:

- Coach portraits.
- Real families' quotes, with their permission. The website shows its quotes section only once one is added (#119).
- Trial length and price, and the youngest starting age.
- The range's safety rules, and whether coaching happens in Korean.
- Tuition rates or a guide.
- More photos (the range, the equipment, a first trial, the team, results day), and a larger match-day photo (630 px
  wide now).

Photos go in on the Website page; text in `web/src/site/kit/content.ts`.

### Legal name and mailing address

The academy's question A10 ([QUESTIONS.md](QUESTIONS.md)): only if the academy wants them in the privacy policy's
contact section (Settings → Academy). The policy is in effect with its name, email and phone.

### The grades on the spreadsheet

The academy's owner reviews the students' grades on the spreadsheet (carried over from the list of 2026-10-17).

## Questions for Goo

### Card photos from the Drive

#101: the photo becomes the score's file, so nothing is copied, and the website shows it with the bulls' scores. The
phone app and a family's view show it as a plain photo. Two ways:

- **Claude Code's suggestion, no phone work:** save a straightened copy of the card beside it, as the phone's scanner
  does. The folder gets a second file for that card.
- **Or** keep one file, and have the phone app and the family view draw the scores on the photo.

### Families' Scores page

The staff's new Scores tab design (§29) for families too, or as it is?

### "To check" on the Scores page

#102: results the reader marked Check show there for 30 days, since nothing clears the mark yet. A button to say a
result is right would clear it.

### The demo on the phone

From 1.1.0, a demo login opens the demo on the phone too, and a super admin switches to it with View the app as (§27).
Other owners in both academies could get a switch too.

### AI in shared reports

A shared report doesn't say its words were drafted with AI and checked by the academy; only staff see that. Anthropic's
guidance for apps that serve minors asks to tell users when AI is involved.

### Terms of service

The academy's earlier website (on skyarcacademy.com until the move) had a Terms of Service page at `/terms`. The new
site has none, so #119 sends `/terms` to the privacy policy, and `/tuition` and `/schedule` to their closest pages.
Terms would be a new page, written from the academy's own.

### skyarcsports.com

A second domain of the academy's, registered at GoDaddy, with Microsoft email and no website (it shows Wix's "connect
your domain" page). Not part of the move. To send it to the website, someone with its GoDaddy login adds a
forward to `https://skyarcacademy.com` (GoDaddy → the domain → DNS → Forwarding). Leave its email records alone.

## Later

### Trial booking online

Can be built now; the privacy policy it waited on is approved (§6 Q15).

- **Today:** the website's "Book a trial" sends a request (the days that suit the family) to the Website page and the
  office's email.
- **Booking proper:**
  - Open times from the coaches' availability.
  - A class labeled Trial 1, and the family's confirmation email.
  - Trial 2 by an emailed link ([DECISIONS.md](DECISIONS.md) §18).

### A student's class that repeats every week

Today the office copies whole weeks (Duplicate week) or uses Repeat weekly.

### Coaches' notes on a class

A session log, "if they want". Today only the office writes a class's note.

### Competition results from a PDF

The third meeting's `L-CP`: a competition's results PDF, laid out like the paper sheet, as well as photos, on the
website and in the app, once match directors give them.

### SIUS PDFs read on the phone

The phone can pick files already, but reading a SIUS result is the website's. A reader on the server would do it.

### The website faster on phones

Lighthouse on a simulated slow phone, 2026-10-20: performance 82, accessibility 96, SEO 100. The pages show once their
scripts have loaded. Building each page's first screen into its HTML would make it show sooner.

### The website installable on a phone (PWA)

People on phones use the phone app; the website is used from laptops. Once everything works, make the website
installable and comfortable on a phone. Until then its phone layout only has to not break.

### A how-to video for parents

The second meeting's `W1`: recorded once the website and the app are final.

### Tuition on the website

The second meeting's `W2`, if the manager asks. The contract has the prices meanwhile.

### Coaches' usual days

Carried on through February 28, 2027 (`C4`, 2026-10-28). In late February, ask Claude Code to carry them on again, or
the office uses Repeat weekly.

### Google's sign-in window

It names `skyarcacademy.firebaseapp.com`, Firebase's address for sign-in (`authDomain`). To show
`skyarcacademy.com`:

1. Add `https://skyarcacademy.com/__/auth/handler` to the Google OAuth web client's redirect URIs (Google Cloud console
   → APIs & Services → Credentials).
2. Add it to Apple's Services ID return URLs ([publishing/apple/sign-in-with-apple.md](publishing/apple/sign-in-with-apple.md)).
3. Set the `VITE_FIREBASE_AUTH_DOMAIN` secret to `skyarcacademy.com`.

## Not doing

Kept so they aren't brought up again. Each was decided:

- **Clocking in from a phone or by location:** turned down at the third meeting; the kiosk only.
- **Events:** Goo, "I never asked for it; just get rid of it" ([DECISIONS.md](DECISIONS.md) §25).
- **Other languages:** Korean for parents only (§36).
- **A merch shop:** the second meeting's `W3`, not asked for.
- **Automatic travel-hour pay:** `K7`, added by hand unless the manager asks.
- **Several academies:** one academy, plus the demo (CLAUDE.md, "Single academy").
- **Automatic levels, and rules for make-ups and trials:** labels on a class, and levels changed by hand (§7).
- **Importing past schedules:** `D1` and `S9`. The manager marks the past weeks' attendance himself.
- **Asking the manager about the paper scoring rule:** Goo decided it (`P1`, `P9`).

## Good to know

These are notes, not tasks.

- **Showing the app** ([DECISIONS.md](DECISIONS.md) §22):
  - **On the website:** turn on **Demo data** in the account menu to show the made-up academy, and turn it off for
    the real one.
  - **On a phone:** sign in with one of the demo's own logins ("Demo" shows at the top), or with your own account for
    the real academy.
  - **Before a showing:** ask Claude Code to refresh the demo (`npm run seed:sample` on production moves its classes
    around the day).
- **Sundays:** the coach in turn isn't on the sheets, so Sundays show the every-Sunday coach and the manager only. The
  office adds that week's coach in "Who's in".
- **October 23:** the make-up Friday has nobody in, and one student was in two classes at once that day.
- **The manager's changes** go in through the app since the third meeting (2026-11-02), no longer by import.
