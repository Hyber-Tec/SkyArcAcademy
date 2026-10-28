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

- **The scoring rule (P1) is waiting for the manager** (Friday, 2026-10-30): today's rule stays; nothing changes in
  `shared/src/targets` until he answers.
- **The photo tip (P3):** holes in the black show only where light comes through, so the card must lie on something
  light, on its own. In the Scan tab's tips (`src/app/(app)/(staff)/(tabs)/scan/index.tsx`, lines 68–70): "On
  something light, on its own" with "A white table or sheet, not the pile of cards: holes in the black show only where
  light comes through. Nothing over the bulls."
- **Any number of shots (P5):** a total typed without bulls says how many shots it's over (`paperEvaluation`'s
  `shotCount`), as the website's dialog does.

## Other names (P12)

A student's `otherNames` (nicknames, other spellings): the scanner's student picker should find a student by them too
(`src/features/scan/StudentPicker.tsx`, its search).
