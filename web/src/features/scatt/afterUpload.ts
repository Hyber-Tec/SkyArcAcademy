import { useCallback, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { useBranch } from '@/branch/BranchProvider'
import { type ScattRead, waitForScattReads } from './api'

/** How long a page waits for the server to read a SCATT file just uploaded (a cold start and a long session fit well in it). */
const READ_WAIT_MS = 90_000

/** A SCATT file just uploaded into a student's Drive folder. */
export interface UploadedScatt {
  fileId: string
  name: string
  studentId: string
  studentName: string
}

/** A student's Scores tab with the SCATT sessions open: those of the files given (`?scatt=<file IDs>`), else the section alone. */
export function scattScoresPath(portal: string, studentId: string, fileIds: readonly string[] = []): string {
  return `/${portal}/students/${studentId}/scores?scatt=${fileIds.join(',')}`
}

/** The latest upload's number: only it opens its sessions by itself, so uploads read at the same time move the page once. */
let latest = 0

const plural = (n: number, word: string) => `${n} ${n === 1 ? word : `${word}s`}`

/** A dialog is open on the page: leaving now would close it. */
const dialogOpen = () => !!document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')

/**
 * After SCATT files go up into a student's Drive folder (from the Drive, or dropped on the student's Scores tab): a
 * toast while the server reads them, then the student's Scores tab with their sessions open and in view (Goo,
 * 2026-11-11: "jump me to the score page … and open to see the SCATT file that I just uploaded"). The page moves only for
 * the latest upload, and only when the person is still where they uploaded with nothing open there (`busy`: the page's
 * own work in progress); otherwise the toast holds the link. A file that brought nothing in says why instead, and one
 * still being read after 90 seconds says so, with the link to open later. `toastId`: a toast already up for these files
 * (their upload's), which this one takes over.
 */
export function useScattAfterUpload(busy?: () => boolean) {
  const { branchId, portal } = useBranch()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const mounted = useRef(true)
  const where = useRef(pathname)
  const isBusy = useRef(busy)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  useEffect(() => {
    where.current = pathname
    isBusy.current = busy
  })

  return useCallback(
    async (files: UploadedScatt[], toastId?: string | number) => {
      if (!files.length) return
      const mine = ++latest
      const from = where.current
      const id = toastId ?? `scatt-read-${mine}`
      const single = files.length === 1
      const whose = files[files.length - 1]
      // Dropped on the student's own Scores tab, they open right there.
      const onTheirScores = window.location.pathname === scattScoresPath(portal, whose.studentId).split('?')[0]
      toast.loading(single ? `Reading “${files[0].name}”…` : `Reading ${files.length} SCATT files…`, {
        id,
        description: `Uploaded. ${single ? 'Its' : 'Their'} sessions open ${onTheirScores ? 'here' : `in ${whose.studentName}’s scores`} as soon as they’re in.`,
      })
      const reads = await waitForScattReads(
        branchId,
        files.map((f) => f.fileId),
        READ_WAIT_MS,
      )
      const readOf = (f: UploadedScatt): ScattRead | undefined => reads.get(f.fileId) ?? undefined
      // Files that went meanwhile (a failed upload, moved out, trashed) are left out; the rest are the last one's student's.
      const kept = files.filter((f) => reads.get(f.fileId) !== null)
      if (!kept.length) return void toast.dismiss(id)
      const last = kept[kept.length - 1]
      const studentId = readOf(last)?.studentId ?? last.studentId
      const name = studentId === last.studentId ? last.studentName : 'the student'
      const theirs = kept.filter((f) => (readOf(f)?.studentId ?? f.studentId) === studentId)
      const brought = theirs.filter((f) => (readOf(f)?.sessions ?? 0) > 0)
      const pending = theirs.filter((f) => !reads.has(f.fileId))
      const empty = theirs.filter((f) => readOf(f)?.sessions === 0)
      const notes = [...new Set(theirs.map((f) => readOf(f)?.note).filter((n): n is string => !!n))].join(' ')
      const samePage = (path: string) => window.location.pathname === path.split('?')[0]
      const go = (path: string) => navigate(path, { replace: samePage(path) })

      if (brought.length) {
        const n = brought.reduce((k, f) => k + (readOf(f)?.sessions ?? 0), 0)
        const path = scattScoresPath(portal, studentId, brought.map((f) => f.fileId))
        const title = `Brought in ${plural(n, 'SCATT session')}`
        const description = [
          `For ${name}${brought.length === 1 ? `, from “${brought[0].name}”` : ''}.`,
          notes,
          empty.length ? `${empty.length === 1 ? `“${empty[0].name}”` : plural(empty.length, 'other file')} brought nothing new.` : '',
          pending.length ? `Still reading ${pending.length === 1 ? `“${pending[0].name}”: its` : `${plural(pending.length, 'file')}: their`} sessions come in after.` : '',
        ]
          .filter(Boolean)
          .join(' ')
        const stay = !samePage(path) && (!mounted.current || window.location.pathname !== from || !!isBusy.current?.() || dialogOpen())
        if (mine === latest && !stay) {
          go(path)
          toast.success(title, { id, description, duration: 6000 })
        } else toast.success(title, { id, description, action: { label: 'Watch them', onClick: () => go(path) }, duration: 20_000 })
        return
      }
      if (pending.length) {
        toast.info(pending.length === 1 ? `Still reading “${pending[0].name}”` : `Still reading ${pending.length} SCATT files`, {
          id,
          description: `${pending.length === 1 ? 'Its' : 'Their'} sessions show in ${name}’s scores once ${pending.length === 1 ? 'it’s' : 'they’re'} read.`,
          action: { label: 'Open scores', onClick: () => go(scattScoresPath(portal, studentId, pending.map((f) => f.fileId))) },
          duration: 30_000,
        })
        return
      }
      // Read, and nothing brought in: the server's reason (someone else's sessions, a target it doesn't know, a file it
      // couldn't read), else its sessions were in already.
      const skipped = theirs.reduce((k, f) => k + (readOf(f)?.skipped ?? 0), 0)
      const what = theirs.length === 1 ? `“${theirs[0].name}”` : `the ${theirs.length} SCATT files`
      const title = notes ? `Nothing brought in from ${what}` : `Nothing new in ${what}`
      const description =
        notes ||
        (skipped
          ? `${theirs.length === 1 ? 'Its' : 'Their'} ${skipped === 1 ? 'session was' : `${skipped} sessions were`} already in the app (the same file, added before), or had no shots.`
          : `${theirs.length === 1 ? 'It holds' : 'They hold'} no SCATT session.`)
      if (notes) toast.warning(title, { id, description, duration: 15_000 })
      else toast.info(title, { id, description, duration: 15_000 })
    },
    [branchId, portal, navigate],
  )
}
