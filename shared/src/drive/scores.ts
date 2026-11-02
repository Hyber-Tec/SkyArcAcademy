import { type Evaluation, POSITIONS } from '../shooting/evaluation'

type FileScore = Pick<Evaluation, 'fileId' | 'position' | 'dateKey' | 'timeMin'> & { id: string }

/**
 * Every score made from each Drive file, by the file's ID: a SIUS result or a paper card makes one, a competition's
 * results sheet one for each position it lists. A file's scores come in the positions' order (Standing, Kneeling,
 * Prone), then by date, time and ID, so they read the same everywhere. Scores without a file are left out.
 */
export function scoresByFile<E extends FileScore>(evaluations: readonly E[]): Map<string, E[]> {
  const byFile = new Map<string, E[]>()
  for (const e of evaluations) {
    if (!e.fileId) continue
    const list = byFile.get(e.fileId)
    if (list) list.push(e)
    else byFile.set(e.fileId, [e])
  }
  const rank = (e: E) => POSITIONS.indexOf(e.position)
  for (const list of byFile.values()) {
    list.sort((a, b) => rank(a) - rank(b) || a.dateKey.localeCompare(b.dateKey) || (a.timeMin ?? -1) - (b.timeMin ?? -1) || a.id.localeCompare(b.id))
  }
  return byFile
}

/** A score's total as the Drive shows it: one decimal for SIUS (186.8), as the source gives it otherwise (a card's 86). */
export function scoreTotal(e: Pick<Evaluation, 'source' | 'total'>): string {
  return e.source === 'sius' ? e.total.toFixed(1) : String(e.total)
}
