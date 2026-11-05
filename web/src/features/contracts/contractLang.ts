import { useMemo, useState } from 'react'
import { type ContractDocument, parseContract } from '@shared/contracts/document'
import { contractIn } from '@shared/contracts/translation'
import type { Lang } from '@shared/i18n'

/**
 * The contract a family reads (docs/DECISIONS.md §36, "Korean to read, English official"): a parent reading Korean
 * gets the academy's translation when the version has one, with the English a tap away; everyone else, and a version
 * without one, the English. `en` stays the one the form's values and the server's checks follow (same IDs either way).
 */
export function useContractRead(lang: Lang, text: string, koText: string | null | undefined) {
  const [original, setOriginal] = useState(false)
  const en = useMemo(() => parseContract(text).doc, [text])
  const read = useMemo(() => contractIn(lang, text, koText), [lang, text, koText])
  const doc: ContractDocument = read.translated && !original ? read.doc : en
  return { doc, en, translated: read.translated, original, setOriginal }
}

/** The server's lines a family can meet while signing (functions/src/contracts.ts), in Korean; others stay English. */
const SERVER_KO: Record<string, string> = {
  'The contract isn’t there any more. Please ask the academy to send it again.': '계약서를 더 이상 찾을 수 없어요. 아카데미에 다시 보내 달라고 요청해 주세요.',
  'Some parts need another look.': '다시 확인할 부분이 있어요.',
  'This contract isn’t waiting for a signature any more.': '이 계약서는 이제 서명할 수 없어요.',
  'This contract is signed already.': '이미 서명한 계약서예요.',
  'The academy withdrew this contract. They’ll send you a new one if it’s needed.': '아카데미가 이 계약서를 철회했어요. 필요하면 새 계약서를 보내 드려요.',
  'This contract isn’t there any more.': '이 계약서를 더 이상 찾을 수 없어요.',
  'Only a student’s family can do this.': '학생 가족만 할 수 있어요.',
  'A parent or guardian signs the contract.': '계약서는 부모 또는 법정 보호자가 서명해요.',
  'Choose your child.': '자녀를 골라 주세요.',
  'There’s no signed contract here.': '서명한 계약서가 없어요.',
  'There’s no signed copy to download. Ask the academy for one.': '다운로드할 서명 사본이 없어요. 아카데미에 요청해 주세요.',
  'That isn’t a contract the office sent.': '아카데미가 보낸 계약서가 아니에요.',
}

export const contractErrorIn = (message: string, lang: Lang): string => (lang === 'ko' ? (SERVER_KO[message] ?? message) : message)
