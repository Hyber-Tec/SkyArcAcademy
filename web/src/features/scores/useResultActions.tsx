import { type ReactNode, useState } from 'react'
import { LuExternalLink, LuFileText, LuPencil, LuScanSearch, LuTrash2 } from 'react-icons/lu'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import type { ResultRow } from '@shared/scores/match'
import { type Evaluation, POSITION_LABELS, totalWithTens } from '@shared/shooting/evaluation'
import { wasScanned } from '@shared/targets/flat'
import { formatDateKey } from '@shared/time'
import type { WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { type MenuEntry, menu } from '@/components/app/ItemMenu'
import { useConfirm } from '@/components/app/useConfirm'
import { deleteEvaluation } from './api'
import { cardPath } from './card/parts'
import { PaperScoreDialog } from './PaperScoreDialog'
import { SiusEditDialog } from './SiusEditDialog'

type Result = WithId<Evaluation>

/**
 * What staff do with a result in a list, from its ⋯ button or a right-click: open its file in the Drive; check a card
 * scanned or read from a photo on its picture, or correct a typed card's scores, or a SIUS result's or a results
 * sheet's position and note; and delete it, after saying what goes. A results sheet's row acts on the whole match (each
 * position's result corrected on its own). Admins and coaches alike. `element` holds the dialogs: render it once.
 */
export function useResultActions(mode: 'admin' | 'coach'): { entriesOf: (row: ResultRow<Result>) => MenuEntry[]; element: ReactNode } {
  const { branchId, actor } = useBranch()
  const navigate = useNavigate()
  const { confirm, dialog } = useConfirm()
  const [editing, setEditing] = useState<Result | null>(null)

  async function remove(results: Result[], match: boolean) {
    const e = results[0]
    const name = e.match?.name?.trim() || 'this match'
    const ok = await confirm(
      match && results.length > 1
        ? {
            title: 'Delete this match?',
            description: `The ${results.length} results of ${name} (${formatDateKey(e.dateKey, 'medium')}) leave ${e.studentName}'s scores. ${results.some((r) => r.fileId) ? 'The sheet stays in the Drive, and reports' : 'Reports'} already made keep their figures.${results.some((r) => r.source === 'online') ? ' The results site won’t bring them back.' : ''}`,
            confirmLabel: 'Delete',
            destructive: true,
          }
        : {
            title: 'Delete these scores?',
            description: `The ${POSITION_LABELS[e.position].toLowerCase()} result of ${formatDateKey(e.dateKey, 'medium')} leaves ${e.studentName}'s scores. ${e.fileId ? 'Its file stays in the Drive, and reports' : 'Reports'} already made keep their figures.${e.source === 'online' ? ' The results site won’t bring it back.' : ''}`,
            confirmLabel: 'Delete',
            destructive: true,
          },
    )
    if (!ok) return
    try {
      for (const r of results) await deleteEvaluation(branchId, actor, r.id, r)
      toast.success(match && results.length > 1 ? 'Match deleted' : 'Scores deleted')
    } catch (err) {
      toast.error('Could not delete the scores', { description: (err as Error).message })
    }
  }

  const entriesOf = (row: ResultRow<Result>): MenuEntry[] => {
    if (row.match) {
      const sheet = row.results.find((r) => r.fileId)?.fileId ?? null
      const online = row.results.find((r) => r.online?.url)?.online?.url ?? null
      return menu(
        !!online && { label: 'Open it on the results site', icon: LuExternalLink, onSelect: () => void window.open(online, '_blank', 'noopener') },
        !!sheet && { label: 'Open the sheet in the Drive', icon: LuFileText, onSelect: () => navigate(`/${mode}/drive/file/${sheet}`) },
        row.results.length === 1
          ? { label: 'Edit position or note', icon: LuPencil, separatorBefore: !!sheet, onSelect: () => setEditing(row.results[0]) }
          : {
              kind: 'sub',
              label: 'Edit position or note',
              icon: LuPencil,
              separatorBefore: !!sheet,
              entries: row.results.map((r) => ({ label: POSITION_LABELS[r.position], hint: totalWithTens(r), onSelect: () => setEditing(r) })),
            },
        { label: row.results.length > 1 ? 'Delete the match' : 'Delete', icon: LuTrash2, destructive: true, separatorBefore: true, onSelect: () => void remove(row.results, true) },
      )
    }
    const e = row.results[0]
    return menu(
      !!e.fileId && { label: 'Open the file in the Drive', icon: LuFileText, onSelect: () => navigate(`/${mode}/drive/file/${e.fileId}`) },
      wasScanned(e)
        ? { label: 'Check the card', icon: LuScanSearch, separatorBefore: !!e.fileId, onSelect: () => navigate(cardPath(mode, e)) }
        : { label: e.source === 'paper' ? 'Edit scores' : 'Edit position or note', icon: LuPencil, separatorBefore: !!e.fileId, onSelect: () => setEditing(e) },
      { label: 'Delete', icon: LuTrash2, destructive: true, separatorBefore: true, onSelect: () => void remove([e], false) },
    )
  }

  const element = (
    <>
      {editing?.source === 'paper' ? <PaperScoreDialog open onOpenChange={(o) => !o && setEditing(null)} existing={editing} /> : null}
      {editing?.source === 'sius' || editing?.source === 'sheet' || editing?.source === 'online' ? <SiusEditDialog evaluation={editing} onClose={() => setEditing(null)} /> : null}
      {dialog}
    </>
  )
  return { entriesOf, element }
}
