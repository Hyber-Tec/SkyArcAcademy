import { classifyFile, cleanFileName } from '@shared/drive/files'
import type { DriveIndex } from '@shared/drive/model'
import { studentFolderId } from '@shared/drive/types'
import type { Evaluation, Position } from '@shared/shooting/evaluation'
import { cardEvaluation, cardFileName } from '@shared/targets/flat'
import type { WithId } from '@shared/types'
import { type CardSave, type FailedUpload, type ResultUpload, type SheetSave, plannedFile, saveScores, siusFileName } from '@/features/drive/upload'
import { sheetEvaluations } from '@/features/scores/sheetDraft'
import type { Actor } from '@/lib/audit'
import { type AddItem, saves } from './items'

/**
 * Saving what Add scores read, as each kind is saved elsewhere: a SIUS result as the Drive files it (its PDF named by
 * its date, with its scores), a card as the Scores tab's Add paper scores does (the card flattened like a scan, with its
 * shots), a sheet as Add a competition does (the sheet, with a result for each position). Each lands in its student's
 * Drive folder. It returns at once with the new results, for the page to show while the server confirms.
 */
export function saveItems(
  branchId: string,
  actor: Actor,
  index: DriveIndex,
  items: readonly AddItem[],
  nameOf: (studentId: string) => string,
): { added: WithId<Evaluation>[]; students: number; sighters: number; saved: Promise<void>; uploaded: Promise<FailedUpload[]> } {
  const results: ResultUpload[] = []
  const cards: CardSave[] = []
  const sheets: SheetSave[] = []
  for (const item of items.filter(saves)) {
    const f = item.found!
    const studentId = item.studentId as string
    const folder = studentFolderId(studentId)
    if (f.kind === 'sius') {
      const reading = f.sius.reading
      const plan = classifyFile(item.file)
      if (!plan.ok) continue
      const up = plannedFile(branchId, item.file, { ...plan, name: siusFileName(reading.dateKey, f.position, reading.noShots ? null : reading.total) }, folder, studentId, { originalName: item.file.name })
      const evaluation =
        reading.noShots || !f.position
          ? null
          : {
              studentId,
              studentName: nameOf(studentId),
              source: 'sius' as const,
              kind: f.resultKind,
              position: f.position,
              dateKey: reading.dateKey,
              timeMin: reading.timeMin,
              shots: reading.shots,
              total: reading.total,
              wholeTotal: reading.wholeTotal,
              innerTens: reading.innerTens,
              mpi: reading.mpi,
              groupMm: reading.groupMm,
              series: reading.series,
              sighters: reading.sighters,
              fileId: up.fileId,
              note: '',
              problems: reading.problems,
              sius: { printed: reading.printed, event: reading.event, clockFixMin: reading.clockFixMin },
            }
      results.push({ up, evaluation })
    } else if (f.kind === 'card') {
      const c = f.card
      const evaluation = cardEvaluation({ student: { id: studentId, name: nameOf(studentId) }, position: c.position as Position, dateKey: c.dateKey, note: c.note, review: c.review, total: null }, null)
      evaluation.kind = c.kind
      const name = cardFileName(c.dateKey, c.position as Position)
      const up = plannedFile(branchId, new File([c.read!.jpeg], name, { type: 'image/jpeg' }), { name, kind: 'jpg', mime: 'image/jpeg' }, folder, studentId, { originalName: item.file.name })
      cards.push({ evaluation, up, driveFileId: null })
    } else if (f.kind === 'sheet') {
      const plan = classifyFile(item.file)
      const label = f.draft.match.trim()
      const up = plan.ok ? plannedFile(branchId, item.file, { ...plan, name: `${cleanFileName(`${f.draft.dateKey} ${label || 'Competition'} results`)}.${plan.kind}` }, folder, studentId, { originalName: item.file.name }) : null
      sheets.push({ up, evaluations: sheetEvaluations(f.draft, { id: studentId, name: nameOf(studentId) }) })
    }
  }
  const { ids, saved, uploaded } = saveScores(branchId, actor, index, { results, cards, sheets })
  const added: WithId<Evaluation>[] = []
  results.forEach((r, i) => {
    const id = ids.results[i]
    if (r.evaluation && id) added.push({ ...r.evaluation, id } as WithId<Evaluation>)
  })
  cards.forEach((c, i) => added.push({ ...c.evaluation, fileId: c.up?.fileId ?? null, id: ids.cards[i] } as WithId<Evaluation>))
  sheets.forEach((s, i) => s.evaluations.forEach((e, j) => added.push({ ...e, fileId: s.up?.fileId ?? null, id: ids.sheets[i][j] } as WithId<Evaluation>)))
  return {
    added,
    students: new Set(items.filter(saves).map((i) => i.studentId)).size,
    sighters: results.filter((r) => !r.evaluation).length,
    saved,
    uploaded,
  }
}
