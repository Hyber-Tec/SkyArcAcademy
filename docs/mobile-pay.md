# The phone app: coaches' availability inside the lock, and one hourly rate (M7, and pay)

What the phone app (`mobile/`) needs to match the website after the second meeting's `C1`–`C3` and `K1`–`K6`
(`docs/MEETING2_FEEDBACK.md`, `docs/DECISIONS.md` §23), for the Claude Code session on Goo's MacBook Pro. The server,
the rules and the website are done; until the phone is updated it keeps working (pay shows as clocked, and a locked day
stays read-only for coaches).

## Availability (M7)

- **The rule:** inside the lock (`availability.lockWindowDays`, 7 days) a coach may **add** time (a new range, a wider
  one, or times on a day that had none or was "not available"), never remove or shorten it. After an add, an **Undo**
  for `UNDO_SECONDS` (10) puts the day back exactly as it was; the rules allow it for 15 seconds by the server's clock.
  Admins change any day, as before. The notice period (`availability.leadTimeDays`) is 7 by default now too.
- **The writes are shared:** `withAddedTime` and `undoOf` in `shared/src/availabilityWrites.ts`; the website's version
  is `web/src/features/availability/api.ts` (`addTimeInLock`, and the undo: `deleteField()` on the update, or deleting
  the record when `!undoKeepsRecord`), with audit entries from `addedTimeSummary` and `undoneSummary`.
- **Screens:**
  - `src/features/availability/hooks.ts` (around lines 76–80): an `addOnly` state = locked and not past.
  - `src/features/availability/DayEditor.tsx` (lines 63, 218–257, 395–401): the saved times read-only, new rows
    starting where they end, an "Add time" button, and the notice "Locked: you can add time, not remove it. Ask an admin
    to remove time." Then a toast with Undo.
  - `src/features/availability/api.ts`: `addTimeInLock`, mirroring the website's.
  - `src/app/(app)/(staff)/(tabs)/availability/index.tsx` (line 191): "Within N days you can add time, not remove
    it"; the lock's wording in `mobile/AGENTS.md` to match.

## Pay: one hourly rate, from the kiosk

- **The rule** (`shared/src/pay/paidTime.ts`): everyone is paid their one hourly rate for clocked time; no clock-in, no
  pay. A coach's paid time starts `timeClock.arrivalMinutes` (30) before their first class of the day (an earlier
  clock-in doesn't count) and, with the automatic clock-out at the last class on, ends at the end of their last class.
  Extra time an admin adds to a time entry (`extraMin`, with `extraNote`) is paid at the same rate. `describePay(settings)`
  says it in words.
- **The rate:** `hourlyRate(rates)` (the teaching rate, or the admin rate on older records); a save writes both.
- **Screens:**
  - `src/features/pay/data.ts` (lines 27–44): query the classes for the dates and the coach's availability, and call
    `payLines({ shifts, classes, availability, settings, ratesFor, from, to })`.
  - `src/features/pay/PayLineRow.tsx` (lines 39–50): the `worked` and `extra` line types (extra time has no time of
    day: show `line.note`), and `line.clocked` beside the paid times.
  - `src/app/(app)/(staff)/(tabs)/more/payroll.tsx` (lines 1–6, 62–76, 87, 146–196): drop `payModelsBetween`,
    `payModelOn`, `paysAdmin`, `byClasses`, `forClasses` and the statuses text; one "Hourly rate"; `rateMissing`; the
    totals' `worked` and `extra`; `describePay(settings)` for the note.
  - `src/app/(app)/(staff)/(tabs)/more/account.tsx` (lines 1, 126, 208–209): one "Hourly rate" row.
  - `src/features/home/clock.ts` (lines 42–46) and `ClockCard.tsx` (lines 25, 33, 68): paid minutes with
    `shiftPaidTime` plus `extraMinutes` (the week's classes and the coach's availability), and "Paid from …".
