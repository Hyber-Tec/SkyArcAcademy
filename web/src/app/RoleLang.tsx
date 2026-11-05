import { useBranch } from '@/branch/BranchProvider'
import { EnglishOnly } from '@/lib/LangProvider'

/** A parent reads the portal in their language; students and staff in English (docs/DECISIONS.md §36). */
export function RoleLang({ children }: { children: React.ReactNode }) {
  const { role } = useBranch()
  return role === 'parent' ? children : <EnglishOnly>{children}</EnglishOnly>
}
