import { useMemo } from 'react'
import { type ContractDocument, parseContract } from '@shared/contracts/document'

/** The contract a family reads and signs: the version's English text, parsed (the form's values follow its IDs). */
export function useContractDoc(text: string): ContractDocument {
  return useMemo(() => parseContract(text).doc, [text])
}
