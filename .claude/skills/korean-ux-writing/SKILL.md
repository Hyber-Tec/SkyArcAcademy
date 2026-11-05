---
name: korean-ux-writing
description: Write or review Korean text for Sky Arc that reads like a Korean product wrote it, not like a translation. Use before writing any Korean for the parent portal, the parent app, the public website, notifications, or the enrollment contract's Korean translation, and before reviewing Korean someone else wrote. Covers the register for each surface (해요체, 합니다체), the anti-translationese rules, particles after names, dates and money, spacing, the app's glossary, and a review checklist.
---

# Korean for Sky Arc

Parents of Sky Arc's students read the parent portal, the parent app, the website and the contract in Korean
(docs/DECISIONS.md §36). The owner is Korean and notices at once when Korean "sounds translated". The goal is Korean a
Korean company would ship (Toss, Kakao, 당근), written from what the screen means, never word by word from the English.

Read `glossary.md` (the app's words) and `patterns.md` (translationese, with fixes) in this folder before writing.

## 1. Write from the meaning, not the English

1. Read the English and ask: who reads this, at which moment, and what do they do next?
2. Close the English. Write what a Korean app would show at that moment, in Korean word order.
3. Cut it in half. Korean UI is shorter than English: drop subjects (당신, 귀하, 사용자), drop "your" (내/나의 only
   when it disambiguates), drop articles and filler.
4. Check it against `patterns.md` and the checklist below. Read it aloud: if you wouldn't say it to a parent at the
   front desk, rewrite it.

The English is a spec, not a source text. "Known by name" is not 이름으로 기억합니다; it means each athlete is
coached as a person: 한 명 한 명을 알고 가르쳐요.

## 2. Register by surface

| Surface | Register | Example |
|---|---|---|
| Parent portal and app: screens, buttons' helper text, empty states, toasts, errors | 해요체 | 계약서에 서명했어요. |
| Phone notifications (push and inbox) | 해요체, short | 지우 수업이 취소됐어요 |
| Public website (landing, programs, trial) | 해요체; headings as short phrases | 첫 수업은 안전 교육부터 시작해요 |
| Enrollment contract translation, privacy notes, legal consent | 합니다체 (formal), faithful | 보호자는 다음 사항에 동의합니다. |
| Labels, buttons, tab names, column headers | Noun or noun+하기, no ending | 저장, 서명하기, 수업 |

Never mix 해요체 and 합니다체 on one screen (the contract's text may be 합니다체 inside a 해요체 screen: that's two
voices, the academy's legal text and the app).

### 해요체 the Toss way

- **해요체 everywhere** in the app: 했어요, 있어요, 돼요. Not 하였습니다, 됩니다, 되어요.
- **돼요, never 되어요**; 됐어요, never 되었어요.
- **Active voice:** say who did it. 계약서를 보냈어요 (the office), not 계약서가 전송되었습니다.
  Passive is fine for endings and results: 링크가 만료됐어요, 할인이 적용돼요.
- **Positive framing:** say what they can do. "Not available until signed" → 서명하면 볼 수 있어요.
- **Light honorifics.** Requests take -세요/-해 주세요 (확인해 주세요, 서명해 주세요). Avoid stacked honorifics:
  ~하시겠어요?, ~하셨나요?, ~께서, 계시다, 여쭈다. Use 에게 not 께, 있다 not 계시다. A question to the parent
  may use -시나요 sparingly (비밀번호를 잊으셨나요?).
- **No noun stacking.** 수업 일정 변경 요청 승인 → 수업 시간을 바꿔 달라는 요청을 승인했어요.
  Unpack Sino-Korean nouns into verbs when it reads better: 다운로드 가능 → 다운로드할 수 있어요.

### Buttons

- Name the result, so the next step is predictable: 서명하기, 계약서 저장, 다시 보내기.
- Standard actions are one noun: 저장, 확인, 다음, 완료, 닫기, 삭제.
- A dialog's dismiss button is 닫기 when nothing is lost; 취소 only when it cancels something in progress.
- Destructive buttons say what goes: 계정 삭제, not just 확인.

## 3. Names and particles

Names come from the records in English letters ("Jiwoo Hwang"). Keep them as they are. Korean particles depend on
the last sound of the word before them (받침), which a variable can't know from code. In order of preference:

1. **Attach the particle to a fixed word, not the variable:** `${first} 학생이`, `${first}의 수업`, `${name}님이`.
   의 never changes: `${first}의 계약서` always works.
2. **Rephrase so no particle follows the variable:** `수업 취소: ${first}` is a label; 
   `${first} · 11월 5일 수업이 취소됐어요` puts the variable before a separator.
3. **When neither works**, use `josa()` from `shared/src/i18n.ts`: exact for Hangul, a pronunciation guess for English
   names (Sam → 이, Jiwoo → 가).

Address parents without names in most UI. When a greeting names them, use the first name + 님: 안녕하세요,
Jiyeon님. Children are named by first name, with 학생 only where it helps the sentence: Jiwoo 학생의 계약서 or
Jiwoo의 계약서 (both fine; be consistent within a screen).

## 4. Dates, times, money and numbers

- Dates: 11월 5일 (목), or 2026년 11월 5일 목요일 in full. Use `formatDateKey(key, style, 'ko-KR')` and the
  helpers in `shared/src/i18n.ts`; never build Korean dates by hand from English parts.
- Times: 오후 3:41 (`formatInstantTime` with 'ko-KR'). Ranges: 오후 4:30~8:00 (tilde between times is normal Korean;
  keep the en dash only inside numbers like 250–275).
- Relative: 오늘, 내일, 어제, 이번 주, 다음 주, 3일 전.
- Money stays in dollars: $545, 월 $545, 매월 $545. "$545 / Month ($565, less $20 in discount)" →
  월 $545 (정가 $565에서 $20 할인).
- Counts take counters: 20발, 3명, 2개, 4회, 1시간 30분. Arabic numerals attach to the counter (20발, not 20 발).
- Ordinals: 1차 체험, 2차 체험; 1회차.

## 5. Spelling and spacing (국립국어원)

- Auxiliary verbs are spaced: 해 주세요, 할 수 있어요, 하고 있어요, 볼 수 없어요.
- 하다 verbs from nouns are one word: 로그인하다, 서명하다, 저장하다, 다운로드하다; but 로그인 페이지, 서명 완료.
- 안 (not) is spaced: 안 돼요; 않다 attaches: 하지 않아요.
- Common app words: 로그인, 로그아웃, 이메일, 비밀번호, 계정, 알림, 설정, 프로필, 다운로드, 링크, 앱, QR 코드.
- Punctuation: no exclamation marks except a real celebration; no tildes for tone (~요~); no em dashes; quotes
  are "…" for UI text. A trailing period on full sentences in body text and toasts; none on buttons, labels, titles.

## 6. The contract translation (합니다체, faithful)

The English contract is the official text (DECISIONS §36); the Korean helps parents read it. So:

- Translate every sentence; add nothing, soften nothing, summarize nothing. Keep the section numbers and the order.
- Formal 합니다체: 학부모 또는 법정 보호자는 … 동의합니다. Defined terms keep one Korean term throughout (Equipment →
  장비, Agreement → 본 계약, Renter → 임차인) with the English in parentheses the first time: 본 계약(“계약”).
- Names of the company and documents stay in English: Y&S Enrichment LLC DBA Sky Arc Sports Academy.
- Money, dates and percentages exactly as written.
- Keep the file's markers ([[choose: …]], `- … = signer`, `| $20 | except: …`) and option order; translate only the
  words people read (scripts/contract.ts checks that both files line up).

## 7. Checklist before you're done

- [ ] Written from the meaning; no English word order (the verb comes last, the topic first).
- [ ] No pattern from `patterns.md` (에 대해, 를 통해, 되어지다, 가지다, 들, 당신, 의 chains, 것이다, 수 있습니다 everywhere).
- [ ] One register per screen; 해요체 with 돼요/됐어요; no stacked honorifics.
- [ ] Active voice, positive framing, short.
- [ ] Glossary words, the same word for the same thing on every screen.
- [ ] Particles never directly after a name variable (or `josa()`).
- [ ] Dates, times, money, counters as in §4; spacing as in §5.
- [ ] Buttons name their result; 닫기 vs 취소 right.
- [ ] Fits the phone: a button label of 2–8 characters, a title on one line.
- [ ] Read aloud once: would a Korean app say this?
