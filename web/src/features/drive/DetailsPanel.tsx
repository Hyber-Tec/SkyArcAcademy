import { LuHardDrive } from 'react-icons/lu'
import { Link } from 'react-router'
import { categoryOf } from '@shared/drive/files'
import { type DriveIndex, type DriveItem, countLabel, formatBytes, itemOwner, itemUpdated } from '@shared/drive/model'
import { type Evaluation, POSITION_COLORS, POSITION_LABELS, SOURCE_LABELS, per10, wholePer10 } from '@shared/shooting/evaluation'
import { formatDateKey, formatInstant, formatMinutes } from '@shared/time'
import type { WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { useStudentList } from '@/features/data/hooks'
import { TargetPlot } from '@/features/scores/TargetPlot'
import { FileGlyph, FolderGlyph, PersonChip, updatedText } from './parts'

const CATEGORY: Record<string, string> = { pdf: 'PDF', image: 'Photo', document: 'Document', spreadsheet: 'Spreadsheet', presentation: 'Presentation', video: 'Video', text: 'Text', other: 'File' }

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  if (children === null || children === undefined || children === '') return null
  return (
    <div className="space-y-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  )
}

/** The details of the one selected item, else of the folder you're in, else of the Drive. */
export function DetailsPanel({ index, folderId, selected, scoresByFile }: { index: DriveIndex; folderId: string | null; selected: DriveItem | null; scoresByFile: Map<string, WithId<Evaluation>> }) {
  const { timezone, portal } = useBranch()
  const { data: students } = useStudentList()
  const shown: DriveItem | null = selected ?? (folderId && index.folderOf(folderId) ? { kind: 'folder', id: folderId, folder: index.folderOf(folderId)! } : null)
  const when = (t: unknown) => {
    const ms = (t as { toMillis?: () => number } | null)?.toMillis?.() ?? 0
    return ms ? formatInstant(ms, timezone, { dateStyle: 'medium', timeStyle: 'short' }) : ''
  }

  let body: React.ReactNode
  if (!shown) {
    const c = index.countsOf(null)
    body = (
      <>
        <Header icon={<LuHardDrive className="size-6" />} name="Drive" />
        <dl className="space-y-3">
          <Row label="Folders">{String(c.folders)}</Row>
          <Row label="Files">{`${c.files} · ${formatBytes(c.bytes)}`}</Row>
          <Row label="Students’ folders">{String(index.foldersIn(null).filter((f) => f.studentId).length)}</Row>
        </dl>
      </>
    )
  } else if (shown.kind === 'folder') {
    const f = shown.folder
    const student = f.studentId ? students.find((s) => s.id === f.studentId) : null
    const c = index.countsOf(f.id)
    const u = itemUpdated(shown, index)
    body = (
      <>
        <Header icon={<FolderGlyph student={!!f.studentId} />} name={f.name} />
        <dl className="space-y-3">
          {student ? <Row label="Student">{[student.level, student.program, student.grade ? `Grade ${student.grade}` : null].filter(Boolean).join(' · ') || '—'}</Row> : null}
          <Row label="Owner">{f.createdBy ? <PersonChip person={itemOwner(shown)} /> : f.studentId ? 'Made for the student' : ''}</Row>
          <Row label="Created">{when(f.createdAt)}</Row>
          <Row label="Updated">{updatedText(u.at, u.by, timezone)}</Row>
          <Row label="Contents">{[countLabel(c.folders, 'folder'), countLabel(c.files, 'file'), c.bytes ? formatBytes(c.bytes) : null].filter(Boolean).join(' · ')}</Row>
        </dl>
        {student ? (
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
            <Link className="font-medium underline-offset-2 hover:underline" to={`/${portal}/students/${student.id}`}>
              Student’s page
            </Link>
            <Link className="font-medium underline-offset-2 hover:underline" to={`/${portal}/students/${student.id}/scores`}>
              Scores
            </Link>
          </div>
        ) : null}
      </>
    )
  } else {
    const f = shown.file
    const e = scoresByFile.get(f.id)
    body = (
      <>
        <Header icon={<FileGlyph kind={f.kind} />} name={f.name} />
        {e ? (
          <div className="space-y-3 rounded-lg border p-3">
            {e.source === 'sius' ? (
              <div className="flex justify-center">
                <TargetPlot shots={e.series.flatMap((s) => s.shots)} size={176} color={POSITION_COLORS[e.position]} />
              </div>
            ) : null}
            <dl className="grid grid-cols-2 gap-3">
              <Row label="Position">{POSITION_LABELS[e.position]}</Row>
              <Row label="Shot">{`${formatDateKey(e.dateKey, 'medium')}${e.timeMin !== null ? `, ${formatMinutes(e.timeMin)}` : ''}`}</Row>
              <Row label={`${SOURCE_LABELS[e.source]} total`}>{`${e.source === 'sius' ? e.total.toFixed(1) : e.total} (${e.shots} shots)`}</Row>
              <Row label="Per 10 shots">{e.source === 'sius' ? `${per10(e.total, e.shots)} · ${wholePer10(e)} whole` : String(wholePer10(e))}</Row>
              {e.innerTens !== null ? <Row label="Inner tens">{String(e.innerTens)}</Row> : null}
              {e.groupMm !== null ? <Row label="Group">{`${e.groupMm} mm`}</Row> : null}
            </dl>
            {e.problems.length ? <p className="text-xs text-amber-800 dark:text-amber-300">{e.problems.join(' ')}</p> : null}
            {e.sius?.clockFixMin ? <p className="text-xs text-muted-foreground">Time moved {e.sius.clockFixMin / 60} hours from the SIUS computer’s clock ({e.sius.printed}).</p> : null}
          </div>
        ) : null}
        <dl className="space-y-3">
          <Row label="Type">{`${CATEGORY[categoryOf(f.kind)]} · ${formatBytes(f.size)}`}</Row>
          <Row label="Uploaded">{[when(f.uploadedAt), f.uploadedBy?.name].filter(Boolean).join(' by ')}</Row>
          {f.originalName && f.originalName !== f.name ? <Row label="Original name">{f.originalName}</Row> : null}
        </dl>
      </>
    )
  }
  return (
    <aside className="h-fit space-y-4 rounded-xl border bg-card p-4" aria-label="Details">
      <div className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Details</div>
      {body}
    </aside>
  )
}

function Header({ icon, name }: { icon: React.ReactNode; name: string }) {
  return (
    <div className="flex items-center gap-3">
      {icon}
      <div className="min-w-0 truncate font-semibold" title={name}>
        {name}
      </div>
    </div>
  )
}
