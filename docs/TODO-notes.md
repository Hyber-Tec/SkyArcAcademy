# To-do: the details

The steps and background behind each line of [TODO.md](TODO.md), under the same titles. TODO.md stays short for Goo;
this page is for whoever does the work, Claude Code included. When a line is done, its notes can go (git keeps them),
unless they say how something works from then on.

## Now

### The two signs for the front desk

From Claude Code, as PDFs, letter size (8.5 × 11 in) and 5 × 7 in, for acrylic sign holders ([DECISIONS.md](DECISIONS.md)
§39):

- **The contract:** its QR code opens `skyarcacademy.com/contract`, where a parent asks for each child's contract. The
  office is told, sends it from Settings → Enrollment contract (or Home's "families waiting for a contract"), and it
  opens on the parent's phone, filled in from what they typed.
- **The app:** its QR code opens `skyarcacademy.com/get-app?go`, which sends an iPhone to the App Store and an Android
  phone to Google Play.

To make them again (another size, a new address): `npx tsx scripts/signs.ts --out <folder>` writes both signs in both
sizes, with a picture of each.

### Kiosk PINs before Sunday, November 15

Everyone starts clocking in on the kiosk after Sunday, November 15 (the fourth meeting). On 2026-11-10 the two coaches
with accounts had their PINs (set at the meeting); three employee records had none: the manager's and two people's
without an account. Either way works:

- **The office:** Employees → Directory → the person → **Kiosk PIN** → 4 digits → Set PIN.
- **The coach** (since the fourth meeting's B2): signed in on the website, Profile → **Kiosk PIN**, typed twice; in the
  phone app, More → Kiosk PIN, once the next update is out. Five tries a day.

PINs are unique, and kept only as fingerprints. The tablet picks a new PIN up within a minute, then that person can
clock in.

### The public email

The website, the phone app's contact buttons, the contract's pages and PDF, new progress reports and the reply address
of invites all show Settings → Academy → **Email**. On 2026-11-10 it still held the manager's Gmail; the academy wants
`info@skyarcacademy.com` there (the fourth meeting's B5). Change it once and every place follows. Reports made before
keep the address they were made with.

### Google Search Console

Tells Google the website lives at skyarcacademy.com, and lets it find every page.

1. https://search.google.com/search-console → **Add property** → **Domain** → `skyarcacademy.com` → Continue.
2. Copy the TXT record it shows (`google-site-verification=…`).
3. Squarespace → Domains → skyarcacademy.com → **DNS** → **ADD RECORD**: Type **TXT**, Name `@`, Data the copied text
   → Save. Keep every other record.
4. Back in Search Console: **Verify**. If it fails, try again in a few minutes.
5. **Sitemaps** (left menu) → type the full address, `https://skyarcacademy.com/sitemap.xml` → **Submit**. A Domain
   property refuses `sitemap.xml` alone ("Invalid sitemap address").

The site's pages already name skyarcacademy.com as their address (#119).

### Google Play 1.1.0 is in Google's review

Sent on 2026-11-06, in the evening:

- **Goo:** updated the Data safety form (account creation methods: Username and password, and OAuth; the delete
  account link `https://skyarcacademy.web.app/help#delete`) and sent it for review from the Publishing overview.
- **Claude Code:** right after, rolled out 1.1.0 (12) to all of production through Google Play's API. That sends it for
  review by itself.
- **Order:** the form went first, so Google reviews the new version against the new answers.

Google reviews an update in a few hours to a few days, and "up to a week, and in rare cases even longer". Our first
review, a new app on a new account, took up to eight days. Once approved, it goes live by itself, and Android phones
update on their own. If Google rejects it or asks something, it says so in the Play Console's inbox and by email: send
it to Claude Code.

## The manager

### The signature for the contract

The contract's academy line shows the manager's typed name until a signature is set (`docs/DECISIONS.md` §35). Either:

- **Draw it:** Settings → Enrollment contract → the signature → draw with a finger, on a phone or a tablet.
- **On paper:** sign with a black pen on white paper, and Goo sends Claude Code a photo, taken flat and in good light.
  Claude Code makes the file, and it goes in on the same page.

The title (Director, Head coach…) is optional. At the fourth meeting the owner said she'd send a better signature
with her final wording of the contract.

### Website content

The manager's list of 2026-10-20 (the academy's question A13). The site leaves out anything not confirmed:

- Coach portraits.
- Real families' quotes, with their permission. The website shows its quotes section only once one is added (#119).
- Trial length and price, and the youngest starting age.
- The range's safety rules, and whether coaching happens in Korean.
- Tuition rates or a guide.
- More photos (the range, the equipment, a first trial, the team, results day), and a larger match-day photo (630 px
  wide now).

Photos go in on the Website page (Settings → Website); the text goes to Goo or Claude Code for
`web/src/site/kit/content.ts`.

### Cancel the old website's ChatGPT subscription

The manager asked on 2026-11-07. The academy's earlier website was made and hosted with ChatGPT's site builder (its
pages loaded from a `chatgpt.site` address). Since 2026-11-07, skyarcacademy.com points to this website, so the old
one serves nobody, and canceling changes nothing for the website, the app, email or contracts.

- **What to keep:** the **domain on Squarespace** (renews in August 2027; everything uses it) and **Google Workspace**
  (info@'s email).
- **Saved first:** a private copy of its ten pages' text (the Terms of Service among them) and nine photos, in
  `docs/internal/old-website/` (git-ignored), on 2026-11-07.
- **Afterwards, optional:** delete the old site's leftover DNS records in Squarespace: `_cf-custom-hostname`,
  `_openai-site-verification`, and the `send`, `rsend` and `resend._domainkey` mail records. They do no harm if they
  stay.

### Legal name and mailing address

The academy's question A10 ([QUESTIONS.md](QUESTIONS.md)): only if the academy wants them in the privacy policy's
contact section (Settings → Academy). The policy is in effect with its name, email and phone.

## Soon

### Invite the coaches

The third meeting's `DM2`. The invitations come from info@ (since 2026-11-09). From the website:
each coach's page → **Access** → send the sign-in email. The real-data import gave nobody access yet
([DECISIONS.md](DECISIONS.md) §21).

### Clear the lead coach

A leftover for the old iPhone app 1.0:

- **Why it's there:** 1.0 could only open a class through one coach written on each student's seat, so every seat
  got its class's lead coach.
- **Since 1.1.0:** classes are taught together and the app doesn't need it. The iPhone app 1.1.0 is in the App Store
  since 2026-11-06, and iPhones update by themselves, most within days.
- **What Claude Code does:** from about 2026-11-13, it clears those names (`npx tsx scripts/lead-coach.ts --clear`).
  Nothing changes for anyone on 1.1.0. Until then, it runs `--apply` again after the office adds students.

### The stores' links to skyarcacademy.com

The old addresses keep working, so this can wait. [store/listing.md](publishing/store/listing.md) has the new ones:

- **Google Play**, once 1.1.0 is approved:
  - Store settings: the website.
  - App content: the privacy policy.
  - Data safety: the account deletion page.
- **App Store:** the **Privacy Policy URL**, **Support URL** and **Marketing URL** change only with the next version.
  Apple refused a change of the privacy link through its API on 2026-11-07: "can not be modified in the current
  state".

### Google's sign-in window

Signing in with Google on the website says "to continue to skyarcacademy.firebaseapp.com", Firebase's address for
sign-in (`authDomain`). It can say skyarcacademy.com. It's optional, and the phone apps don't use it. It's two steps:

1. **Goo:**
   - Google Cloud console → APIs & Services → **Credentials** → OAuth 2.0 Client IDs.
   - Open **Web client (auto created by Google Service)** → **Authorized redirect URIs** → **Add URI**:
     `https://skyarcacademy.com/__/auth/handler` → **Save**.
2. **Claude Code:** sets the `VITE_FIREBASE_AUTH_DOMAIN` secret to `skyarcacademy.com`, then checks Google sign-in on
   the website. The website has no Sign in with Apple, so Apple's settings don't change.

## Questions for Goo

### Students in the private notes

The private notes ([CLAUDE.md](../CLAUDE.md), "Local files") keep no students' records: scores, target photos, SIUS
reports, the academy's sheets and the real data import stay on the Mac mini. One file is in between: the academy's
answers of October (`academy-answers-2026-10.md`), which name about 20 students in their notes on what the sheets
show, with a few levels and grades. The Mac mini kept it in the private repository, since the docs point to it. Keep
it there, or move it to the Mac mini only?

### "To check" on the Scores page

When the reader of a SIUS PDF or a card photo isn't sure of something, it marks the result **Check**. The Scores page
(#102) lists those results under "To check" for 30 days. Nothing clears the mark today, even after someone has looked
and found the result right. The question: add a **Looks right** button on the result, which clears it?

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

### A how-to video for parents

The second meeting's `W1`: recorded once the website and the app are final.

### Tuition on the website

The second meeting's `W2`, if the manager asks. The contract has the prices meanwhile.

### Coaches' usual days

Carried on through February 28, 2027 (`C4`, 2026-10-28). In late February, ask Claude Code to carry them on again, or
the office uses Repeat weekly.

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
- **The website as an installable phone app (PWA):** the phone apps do it (Goo, 2026-11-07).
- **A demo switch on the phone for other owners:** not needed (Goo, 2026-11-07).
- **Telling families a shared report was drafted with AI:** not wanted (Goo, 2026-11-07): the academy reads and
  checks every report before sharing it.
- **skyarcsports.com:** not a domain the academy uses (Goo, 2026-11-07).
- **The owner reviewing students' school grades from the spreadsheet** (2026-10-25): the import is long done, and the
  office edits students in the app.

## Good to know

These are notes, not tasks.

- **The private notes** (2026-11-08, [DECISIONS.md](DECISIONS.md) §2): the private repository
  [Hyber-Tec/SkyArcAcademy-internal](https://github.com/Hyber-Tec/SkyArcAcademy-internal), in `docs/internal/` on both
  Macs. Each meeting's own notes, the full brief and review, the academy's answers, the contract's texts, the old
  website, the design demos and the designer's logo files. A session's start brings it up to date. Never passwords or
  students' records: the demo logins' password stays on the Mac mini. The Mac mini's folder from before is kept at
  `~/SkyArc-internal-backup-2026-11-08` there, until Goo says to delete it.
- **The docs** are in folders since 2026-11-08: [README.md](README.md) maps them.
- **A student staying longer** (2026-11-08, [DECISIONS.md](DECISIONS.md) §38): on the website's schedule, drag the
  right edge of the student's card (or ⋯ → Change hours). It holds a seat in the next class until they leave, and
  refuses when that class is full then. The phone app shows it in its next build; nothing needs one now.
- **The terms of service** are live at `/terms` since 2026-11-08 ([DECISIONS.md](DECISIONS.md) §37). Worth a lawyer's
  read some day, the liability and dispute parts above all; "Governing law" names no state, and the academy's legal
  name isn't on them (A10).

- **The kiosk tablet** ([kiosk/README.md](kiosk/README.md)), 2026-11-07:
  - **The device:** a Samsung Galaxy Tab A9+ (SM-X218U), Android 16, on the academy's Wi-Fi, registered as "Front desk".
  - **Set over USB:** Sky Arc Kiosk is its home app, and its swipe lock screen is off, so a press of the power button
    or a restart comes straight back to the kiosk.
  - **Left off (Goo's choice):** no screen-lock PIN and no app pinning. App pinning is turned on in Android, unused.
  - **Updating it:** `npm run kiosk:install`, with it plugged into the MacBook Pro.

- **skyarcacademy.com** is the website's address since 2026-11-07. It was connected in Firebase (Advanced setup, so the
  old website stayed up until the certificate was ready) and Squarespace.
  - **Squarespace's DNS:**
    - A `@` → `199.36.158.100`;
    - TXT `@` `hosting-site=skyarcacademy`;
    - TXT `_acme-challenge` (Firebase's certificate);
    - CNAME `www` → `skyarcacademy.web.app` (Firebase sends www to skyarcacademy.com).
  - **Left as they were:** the academy's Google Workspace email (MX, SPF, DKIM, DMARC) and the earlier website's
    leftovers (`_cf-custom-hostname`, `_openai-site-verification`, the `send`, `rsend` and `resend._domainkey` mail
    records), which do no harm.
  - **Still working:** skyarcacademy.web.app keeps serving the same site, for the phone apps 1.0 and 1.1 and older
    emails ([DEPLOY.md](DEPLOY.md), "Moving to skyarcacademy.com").

- **Notifications on iPhones work:** Apple's push key is in Firebase. Claude Code sent a test push to Goo's iPhone on
  2026-11-06, and it arrived. If iPhones ever stop getting them, check Firebase → Project settings → Cloud Messaging
  → the iOS app's APNs key ([phone/push.md](phone/push.md)).

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
