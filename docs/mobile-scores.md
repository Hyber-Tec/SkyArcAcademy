# The phone app: scores and the scanner (M6)

What the phone app (`mobile/`) needs after the second meeting's `P` items (`docs/MEETING2_FEEDBACK.md`,
`docs/DECISIONS.md` §23), for the Claude Code session on Goo's MacBook Pro. The website and the shared code are done.

## What every result has now (shared/src/shooting/evaluation.ts)

- **A kind:** `kind?: 'practice' | 'competition' | 'evaluation'` (missing = practice; `kindOf(e)`, `RESULT_KINDS`,
  `RESULT_KIND_LABELS`). The scanner's save asks "What it was" (Practice by default), as the website's dialogs do
  (`web/src/features/scores/kinds.tsx`: `ResultKindPicker`, `ResultKindChip`, `ResultKindFilter`). The family's and the
  staff's score lists show a chip for Competition and Evaluation, and the family's Scores can filter by kind
  (`web/src/features/family/ScoresPage.tsx`).
- **The official written score:** `official?: { appTotal, by, at }`. For a card the coach already scored by hand, the
  written score is stored in `total` and `wholeTotal` (so everything, the phone's screens included, already shows it)
  and the app's own reading in `official.appTotal`. The scanner's review screen offers "Score written on the card
  (official)" after the bulls; the website's version is `web/src/features/scores/PaperScoreDialog.tsx` (`written`).
- **A match:** `match?: { name, course }` and `source: 'sheet'` for a competition's results sheet. "Add a competition"
  (the website's `web/src/features/scores/CompetitionDialog.tsx`) reads a photo of the sheet with the callable
  `readResultsSheet({ branchId, content (base64 JPEG, ≤ 2000 px), mime })`, which returns `{ reading, found }`
  (`SheetReading` in `shared/src/scores/sheet.ts`); the staff check it and save one result per position, with the
  sheet filed in the student's Drive folder (`saveSheetResults` in `web/src/features/drive/upload.ts`). On the phone the
  camera is the natural way in: the same callable, then the same form.
- **Totals with inner tens:** `totalWithTens(e)` ("491-11").

## The scanner

- **The scoring rule (P1): the match rule, with each hole at its real size** (Goo, 2026-10-28; `docs/DECISIONS.md`
  §23). See "Hole sizes (P1)" below.
- **The photo tip (P3):** holes in the black show only where light comes through, so the card must lie on something
  light, on its own. In the Scan tab's tips (`src/app/(app)/(staff)/(tabs)/scan/index.tsx`, lines 68–70): "On
  something light, on its own" with "A white table or sheet, not the pile of cards: holes in the black show only where
  light comes through. Nothing over the bulls."
- **Any number of shots (P5):** a total typed without bulls says how many shots it's over (`paperEvaluation`'s
  `shotCount`), as the website's dialog does.

## Other names (P12)

A student's `otherNames` (nicknames, other spellings): the scanner's student picker should find a student by them too
(`src/features/scan/StudentPicker.tsx`, its search).

## Hole sizes (P1)

A shot counts a ring when its hole touches the ring's line, as matches score, now with **the hole as the card shows it**
instead of the 4.5 mm pellet's circle (paper closes up a little around a pellet, so the fixed circle reached lines the
real hole doesn't). The reader measures each hole's edge on the photo; a hole it can't read cleanly takes the card's
usual hole, and the pellet's size when too few holes were measured.

**The scoring reaches the phone through `shared/` with its next build:** no phone code is needed for the scores to be
right. What the shared code gives:

- `ScannedShot.radius` (mm, the size its score was taken with) and `radiusFrom` (`'hole' | 'card' | 'pellet'`);
  `CardScan.holeRadius` and `holeRadiusFrom`.
- `ReviewShot.radius` (kept when a shot is moved; null for a typed score or an older saved card) and
  `CardReview.holeRadius` (an added shot takes it). `holeRadiusOf(shot, review)` is the radius to draw and score a shot
  with. `startReview`, `placeShot`, `takeExtra` and `changeShotsPerBull` already carry them.
- `scoreHole(distanceMm, radiusMm)` in `shared/src/targets/score.ts` scores a point at a hole's size; `scoreAt` is the
  same at the pellet's size and stays for SIUS. The decimal's whole part is always the score.
- `closeCall(shot, review)` and `bullState(bull, shotsPerBull, review)` take the review, for the size of a shot without
  its own (both still work without it, at the pellet's size).
- `reviewShots` saves each placed shot's `r`; `reviewFromShots` reads it back. Cards saved before keep their scores and
  are drawn at the pellet's size.

**What the phone must change** (the website's versions: `web/src/features/scores/card/BullCloseUp.tsx`,
`CardPicture.tsx`, `BullTiles.tsx`):

1. `src/features/scan/BullEditor.tsx`:
   - Drop `PELLET_R`. Work out each shot's radius once: `const radii = bull.shots.map((s) => holeRadiusOf(s, review))`.
   - `ShotMark` takes the radius: `r={radii[i]}` for the green circle (instead of `PELLET_R`).
   - The extra marks' dashed circles: `r={holeRadiusOf(s, review)}`.
   - The shot being dragged is scored at its own size: `scoreHole(Math.hypot(moving.x, moving.y), radii[moving.i])`
     instead of `scoreAt(...)`.
   - `bullState(bull, review.shotsPerBull, review)` and `closeCall(s, review)`.
   - The close call's words (no "ISSF counts … by eye it may look like" any more): `` `${how} · close call: its edge
     reaches the ${close.ring} ring’s line by only ${close.byMm.toFixed(2)} mm, so it counts ${close.ring}` ``, and
     after `how`, for a shot with a place, `` ` · hole ${(2 * radii[i]).toFixed(1)} mm across` `` (both as the website
     says them).
2. `src/features/scan/CardView.tsx`: each shot's circle at `holeRadiusOf(t, review) * FLAT.pxPerMm` instead of
   `pellet`, and `bullState(b, review.shotsPerBull, review)`.
3. `src/features/scan/BullTiles.tsx`: `bullState(b, review.shotsPerBull, review)`.
4. The score screens (`src/features/scores/Target.tsx`, `ShotDarts.tsx`, `ShotReplay.tsx`): **no change**. They plot
   results the way the website's `TargetPlot` does, every shot at the pellet's size, SIUS and paper alike; scores aren't
   worked out there.

**Check it** on the simulators (the practice copy): scan a made-up card photo, open a bull up close (the green circle
hugs the hole, and the list says how big it is), drag a shot across a line (the score follows at the hole's size),
save, and open the same card on the website's card page: the same sizes and scores. Upload nothing to the stores.

