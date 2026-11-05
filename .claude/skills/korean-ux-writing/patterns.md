# Translationese and machine-Korean, with fixes

Each pattern is something English pushes into Korean. One alone isn't always wrong; a screen full of them reads as a
translation. The fixes use Sky Arc's own screens. Severity: **S1** remove on sight, **S2** fix when it repeats, **S3**
fix when it clusters with others (after the k-skill korean-humanizer catalogue, and Toss's UX writing rules).

## A. Sentence structure from English

| # | Pattern | Translated (avoid) | Korean (use) | S |
|---|---|---|---|---|
| A1 | ~에 대해(서), ~에 관한 | 수업에 대한 알림을 받아요 | 수업 알림을 받아요 | S1 |
| A2 | ~를 통해(서) | 앱을 통해 서명할 수 있어요 | 앱에서 서명할 수 있어요 | S1 |
| A3 | ~에 의해, passive for an agent | 계약서가 아카데미에 의해 발송되었습니다 | 아카데미가 계약서를 보냈어요 | S1 |
| A4 | 되어지다, 보여지다, 만들어지다 (double passive) | 결과가 보여집니다 | 결과가 보여요 / 결과를 볼 수 있어요 | S1 |
| A5 | 가지다/갖다 for "have" | 질문을 가지고 계시면 | 궁금한 점이 있으면 | S1 |
| A6 | Inanimate subject doing things | 이 페이지는 점수를 보여줍니다 | 여기서 점수를 볼 수 있어요 | S2 |
| A7 | 당신, 귀하, 그/그녀/그들 | 당신의 자녀의 수업 | 자녀 수업 | S1 |
| A8 | Plural 들 on everything | 학생들의 점수들을 확인하세요 | 학생 점수를 확인하세요 | S2 |
| A9 | 의 chains | 지우의 계약서의 서명의 날짜 | 지우 계약서에 서명한 날짜 | S1 |
| A10 | ~하는 것 (nominalizing a verb) | 서명하는 것을 잊지 마세요 | 잊지 말고 서명해 주세요 | S2 |
| A11 | ~할 수 있습니다 on every sentence | 여기서 다운로드할 수 있습니다. | 여기서 내려받으세요 / 다운로드하기 | S2 |
| A12 | ~에 있어서, ~로부터, ~와 함께 | 아카데미로부터 온 소식 | 아카데미 소식 | S2 |
| A13 | ~하는 중이다 (progressive) | 계약서를 불러오는 중입니다 | 계약서를 불러오고 있어요 (or a label: 불러오는 중…) | S3 |
| A14 | 성공적으로 ~되었습니다 | 성공적으로 저장되었습니다 | 저장했어요 | S1 |
| A15 | ~하시기 바랍니다 | 확인하시기 바랍니다 | 확인해 주세요 | S1 |
| A16 | Long left-branching modifiers | 아카데미가 보낸 아직 서명하지 않은 지우의 계약서 | 지우 계약서가 아직 서명 전이에요 | S2 |
| A17 | Comma after the object or topic (English rhythm) | 진지한 스포츠를, 세심하게 가르칩니다 | 진지한 스포츠라서 더 세심하게 가르쳐요 | S2 |
| A18 | "X and Y" stacked with 와/과 everywhere | 수업과 점수와 리포트를 | 수업, 점수, 리포트를 | S3 |

## B. Words that come from English

| # | Pattern | Avoid | Use | S |
|---|---|---|---|---|
| B1 | English title case turned into nouns | 나의 계약서들 | 계약서 | S1 |
| B2 | Literal idioms | 이름으로 기억합니다 (Known by name) | 한 명 한 명을 알고 가르쳐요 | S1 |
| B3 | "please" on every sentence (부디, 제발) | 부디 확인해 주십시오 | 확인해 주세요 | S1 |
| B4 | English glossed in parentheses, again and again | 서명(signature)을 해 주세요 | 서명해 주세요 | S2 |
| B5 | Sino-Korean noun piles | 계약서 서명 완료 처리 | 서명을 마쳤어요 | S2 |
| B6 | 진행하다 for every verb | 서명을 진행해 주세요 | 서명해 주세요 | S2 |
| B7 | 해당 (the said) | 해당 수업이 취소되었습니다 | 이 수업이 취소됐어요 | S2 |
| B8 | 제공하다 for "give/show" | 리포트를 제공합니다 | 리포트를 보내 드려요 / 리포트를 볼 수 있어요 | S2 |
| B9 | 사용자, 고객 for the parent | 사용자는 계약서를 확인할 수 있습니다 | 계약서를 확인할 수 있어요 | S1 |

## C. Rhythm and endings

| # | Pattern | Fix | S |
|---|---|---|---|
| C1 | Every sentence the same length and ending | Vary; merge two short ones with -고, -서 | S3 |
| C2 | ~인 것이다, ~라는 것이다 endings | End on the verb | S1 |
| C3 | 합니다체 and 해요체 on one screen | One register per screen (contract text excepted) | S1 |
| C4 | Stacked honorifics: ~하시겠어요?, 계시다, ~께서 | ~할까요?, 있다, ~가 | S2 |
| C5 | 되어요, 되었어요 | 돼요, 됐어요 | S1 |
| C6 | Exclamation marks, tildes, emoji for warmth | Plain sentence; warmth comes from the words | S2 |
| C7 | Sentence-opening connectives everywhere (또한, 그리고, 따라서) | Drop them; the order carries the logic | S3 |
| C8 | Questions the app answers itself ("~할까요? ~하세요.") | State it | S3 |

## D. Before and after, whole strings

- "You can download your signed copy any time from Profile → Account."
  - Translated: 프로필 → 계정에서 언제든지 귀하의 서명된 사본을 다운로드할 수 있습니다.
  - Korean: 서명한 계약서는 언제든 프로필 → 계정에서 내려받을 수 있어요.
- "Jiwoo’s class on Thursday was canceled by the academy."
  - Translated: 지우의 목요일의 수업이 아카데미에 의해 취소되었습니다.
  - Korean: 목요일 Jiwoo 수업을 아카데미에서 취소했어요.
- "Something went wrong. Please try again."
  - Translated: 무언가가 잘못되었습니다. 다시 시도하시기 바랍니다.
  - Korean: 잠시 문제가 생겼어요. 다시 시도해 주세요.
- "No reports yet. They’ll show here once the academy shares one."
  - Translated: 아직 리포트가 없습니다. 아카데미가 하나를 공유하면 여기에 표시될 것입니다.
  - Korean: 아직 받은 리포트가 없어요. 아카데미가 보내면 여기에 보여요.
- "Sign Jiwoo’s contract"
  - Translated: 지우의 계약서를 서명하세요
  - Korean: Jiwoo 계약서 서명하기 (a button), or Jiwoo 계약서에 서명해 주세요 (a sentence)
