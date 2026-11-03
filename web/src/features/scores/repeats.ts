import { getDocs, query, where } from 'firebase/firestore'
import { COL } from '@shared/paths'
import { type ResultPrint, printOf, repeatOf, resultWords } from '@shared/scores/duplicates'
import type { Evaluation } from '@shared/shooting/evaluation'
import { branchCol } from '@/lib/firestore'

/**
 * Before results are saved from one student's page (Add a competition, Add paper scores): which of them are already in
 * the student's scores (the third meeting, CP2), from their results that day, compared as everywhere else
 * (shared/src/scores/duplicates.ts). The words name each saved result they repeat; none when the check can't be made.
 */
export async function repeatsOf(branchId: string, prints: readonly ResultPrint[]): Promise<string[]> {
  const days = [...new Set(prints.map((p) => `${p.studentId}|${p.dateKey}`))]
  const saved: Evaluation[] = []
  try {
    for (const day of days) {
      const [studentId, dateKey] = day.split('|')
      const snap = await getDocs(query(branchCol(branchId, COL.evaluations), where('studentId', '==', studentId), where('dateKey', '==', dateKey)))
      saved.push(...snap.docs.map((d) => d.data() as Evaluation))
    }
  } catch {
    return []
  }
  const known = saved.map((e) => ({ ...printOf(e), e }))
  return prints.map((p) => repeatOf(p, known)?.e).flatMap((e) => (e ? [resultWords(e)] : []))
}

/** The question before saving them anyway. */
export function repeatQuestion(studentName: string, repeats: readonly string[]) {
  return {
    title: 'Already saved?',
    description:
      repeats.length === 1
        ? `${studentName}’s scores already have ${repeats[0]}, with the same scores. Save it again?`
        : `${studentName}’s scores already have results with the same scores: ${repeats.join('; ')}. Save these again?`,
    confirmLabel: 'Save anyway',
  }
}
