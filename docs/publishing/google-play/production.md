# Google Play: the store page and the release

The forms Google asks every app to fill in, the store page, and the release to everyone, after
[testing.md](testing.md) (HyberTec's organization account needs no closed test before it). The texts to paste are in
[docs/store/](../../store/). Checked against Google's help on 2026-10-20.

## Part 1: App content (once)

Play Console → Sky Arc → **Policy and programs** → **App content** (the Dashboard's "Set up your app" list opens the
same forms). Each takes a few minutes.

1. **Privacy policy:** `https://skyarcacademy.web.app/privacy`.
2. **Ads:** **No, my app does not contain ads.**
3. **Sign-in details** (Google's newer name for **App access**): **All or some functionality is restricted** → **Add
   instructions** once, for the review login (the office's, an admin; since 2026-10-26 the only one), its email and
   password from `open -e mobile/.publish/review-logins.json` and its text from
   [review-notes.md](../../store/review-notes.md), "Google Play". Google wants logins that work at all times, from
   anywhere, with no one-time codes: it does.
4. **Content rating:** **Start questionnaire** → your email → category **All other app types** → the answers in
   [listing.md](../../store/listing.md), "Google Play: content rating" → **Save** → **Submit**. Since July 15, 2026
   Google doesn't allow unrated apps.
5. **Target audience and content:** the age groups of the people who use the app: the group of the academy's youngest
   students (ask the academy: its youngest starting age, question A13) up to **18 and over**. Students sign in, some
   under 13, so the app falls under Google's **Families policy**, which Sky Arc meets: no ads, no advertising ID, content
   fit for children, honest forms (https://support.google.com/googleplay/android-developer/answer/9893335). Skip
   "Teacher Approved". Don't pick only 18 and over: Google checks that the audience "is accurate".
6. **Data safety:** the answers in [privacy-answers.md](../../store/privacy-answers.md), "Google". It asks for the web
   page where people can ask to delete their account without the app: `https://skyarcacademy.web.app/help` ("Deleting
   your account").
7. **The other declarations:** **Government apps:** No. **Financial features:** My app doesn't provide any financial
   features. **Health apps:** My app doesn't have any health features. **News apps:** No. **Advertising ID:** No (the
   app doesn't use it). There is nothing to declare for photos: the app uses Android's own photo picker.

## Part 2: The store page (once)

8. **Store settings** (**Grow users** → **Store presence** → **Store settings**): App category **Sports**; tags close to
   Sports and Education; contact details: the academy's email (Settings → Academy on the website) and website
   `https://skyarcacademy.web.app` (a phone only if the academy wants one public).
9. **Main store listing** (**Store presence** → **Main store listing**), from [listing.md](../../store/listing.md),
   "Google Play": app name, short description, full description. Then the graphics, from
   `open mobile/.publish/screenshots/android`:
   - **App icon:** `icon-512.png` (512 × 512);
   - **Feature graphic:** `feature-graphic-1024x500.jpg` (1024 × 500, required);
   - **Phone screenshots:** the eight, in order (Google takes 2 to 8; JPEG or PNG without transparency, the long side
     at most twice the short one);
   - **Video:** optional (a YouTube link): leave it empty. Tablet screenshots: optional, none.

   `npm run publish:screenshots -- --android` made them on 2026-10-26, on a Pixel 9 emulator with the practice copy's
   made-up people: the screenshots are JPEGs of 1368 × 2432 (the phone's screen with white margins to exactly 9:16,
   what Google's recommendations ask for), the icon a 32-bit PNG with an alpha channel, the feature graphic a JPEG. The
   same command makes them again when the app's screens change. Google's rules for the images:
   https://support.google.com/googleplay/android-developer/answer/9866151

## Part 3: The release to everyone

10. **Countries:** **Test and release** → **Production** → **Countries / regions** → **Add countries / regions** →
    **United States** → **Save**.
11. **The release:** **Production** → **Create new release** → **Add from library** (the build the testers used) →
    release notes `First release.` → **Next** → **Save**. Or upload a new build with
    `npm run publish:android -- --track production`.
12. **Send it for review:** **Publishing overview** → **Send changes for review**. Google answers within hours to seven
    days. The first release goes live as soon as it's approved: choosing the moment ("managed publishing") works only
    from the second release on.
13. **Tell Claude Code it's live**, with the Google Play link, so the website and the docs can point to it.

After this, updates: [updates.md](../updates.md).
