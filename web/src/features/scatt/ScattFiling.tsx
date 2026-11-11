import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { classifyFile } from '@shared/drive/files'
import { studentFolderId } from '@shared/drive/types'
import { useBranch } from '@/branch/BranchProvider'
import { plannedFile, sendAll, writeRecords } from '@/features/drive/upload'
import { useDriveIndex } from '@/features/drive/useDriveIndex'
import type { UploadedScatt } from './afterUpload'

/**
 * SCATT files dropped on a student's Scores tab, filed in the student's Drive folder as the Drive files a drop (the
 * records, then the bytes), once the Drive is loaded: the folder may still be a stand-in, made with its first file.
 * Draws nothing but its toast. `onFiled` comes once, with what went up (none when nothing could: the toast says why)
 * and the toast, for the server's read to take over.
 */
export function ScattFiling({ files, student, onFiled }: { files: File[]; student: { id: string; name: string }; onFiled: (uploaded: UploadedScatt[], toastId: string | number) => void }) {
  const { branchId, actor } = useBranch()
  const index = useDriveIndex()
  const started = useRef(false)

  useEffect(() => {
    if (started.current || index.loading) return
    started.current = true
    const folderId = studentFolderId(student.id)
    const id = toast.loading(files.length === 1 ? `Uploading “${files[0].name}”…` : `Uploading ${files.length} SCATT files…`, { description: `To ${student.name}’s Drive folder.` })
    const done = (uploaded: UploadedScatt[]) => onFiled(uploaded, id)
    if (index.error || !index.folderOf(folderId)) {
      toast.error('Couldn’t upload the SCATT file', { id, description: index.error?.message ?? `${student.name}’s Drive folder isn’t there.` })
      return done([])
    }
    const refused: string[] = []
    const ups = files.flatMap((file) => {
      const plan = classifyFile(file)
      if (plan.ok) return [plannedFile(branchId, file, plan, folderId, student.id)]
      refused.push(`${plan.name}: ${plan.reason}`)
      return []
    })
    if (refused.length) {
      const what = refused.length === 1 ? 'The SCATT file wasn’t uploaded' : `${refused.length} SCATT files weren’t uploaded`
      // Nothing left to upload: the refusal takes the toast's place.
      if (!ups.length) {
        toast.error(what, { id, description: refused.slice(0, 3).join(' ') })
        return done([])
      }
      toast.error(what, { description: refused.slice(0, 3).join(' ') })
    }
    void (async () => {
      try {
        await writeRecords(branchId, actor, index, ups, [folderId])
        const failures = await sendAll(branchId, ups)
        if (failures.length) toast.error(failures.length === 1 ? 'A file didn’t upload' : `${failures.length} files didn’t upload`, { description: failures.slice(0, 3).join(' ') })
        // What failed is left out by the wait (its record says so).
        done(ups.map((up) => ({ fileId: up.fileId, name: up.record.name, studentId: student.id, studentName: student.name })))
      } catch (e) {
        toast.error('Couldn’t upload the SCATT file', { id, description: (e as Error).message })
        done([])
      }
    })()
    // Once, when the Drive is in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index.loading])

  return null
}
