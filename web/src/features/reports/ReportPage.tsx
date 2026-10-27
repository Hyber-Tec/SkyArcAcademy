import { doc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore'
import { useEffect, useMemo } from 'react'
import { LuArrowLeft, LuDownload, LuPencil } from 'react-icons/lu'
import { useNavigate, useParams } from 'react-router'
import { COL, branchColPath } from '@shared/paths'
import { reportName } from '@shared/reports/compose'
import type { ProgressReportDoc } from '@shared/reports/types'
import { useBranch } from '@/branch/BranchProvider'
import { FullPageMessage, FullPageSpinner } from '@/components/app/FullPage'
import { Button } from '@/components/ui/button'
import { db } from '@/lib/firebase'
import { branchCol, branchDocRef, useDoc } from '@/lib/firestore'
import { ReportDocument } from './ReportDocument'
import { reportSeenKey } from './model'

/**
 * `/report/{id}`: the report as families see it, ready to print or save as a PDF. Families get Back and Download PDF;
 * staff also get Edit. A family member's first opening is recorded, so staff see "Viewed".
 */
export function ReportPage() {
  const { reportId = '' } = useParams()
  const navigate = useNavigate()
  const { branchId, timezone, role, portal, actor, viewAs } = useBranch()
  const ref = useMemo(() => branchDocRef(branchId, COL.progressReports, reportId), [branchId, reportId])
  const { data: r, loading, error } = useDoc<ProgressReportDoc>(ref)
  const family = role === 'parent' || role === 'student'
  const staffPortal = portal === 'admin' || portal === 'coach' ? portal : null

  useEffect(() => {
    if (r) document.title = `${r.student.name} – Progress report – ${r.period.label}`
  }, [r])

  // The family's view receipt: written once (the rules refuse a second), remembered in this browser. An owner or admin
  // previewing the family's view writes nothing.
  const opened = !!r && family && !viewAs && r.sharedWithParents
  useEffect(() => {
    if (!opened) return
    // Their own "report ready" inbox items are read now, so Home and Reports stop calling it new (for them only).
    void getDocs(query(branchCol(branchId, COL.notifications), where('recipientKey', '==', actor.email), where('refs.reportId', '==', reportId)))
      .then((snap) => Promise.all(snap.docs.filter((d) => !d.data().readAt).map((d) => updateDoc(d.ref, { readAt: serverTimestamp() }))))
      .catch(() => undefined)
    const key = reportSeenKey(reportId, actor.email)
    try {
      if (localStorage.getItem(key)) return
    } catch {
      // Storage can be blocked; the rules still keep only the first view.
    }
    void setDoc(doc(db, `${branchColPath(branchId, COL.progressReports)}/${reportId}/views/${actor.email.toLowerCase()}`), { viewedAt: serverTimestamp(), role })
      .catch(() => undefined)
      .finally(() => {
        try {
          localStorage.setItem(key, '1')
        } catch {
          // As above.
        }
      })
  }, [opened, branchId, reportId, actor.email, role])

  const back = () => {
    if (window.history.length > 1) navigate(-1)
    else navigate(family ? `/${role}/reports` : `/${staffPortal ?? 'app'}/reports`)
  }

  if (loading) return <FullPageSpinner label="Loading the report…" />
  if (!r || error) {
    return <FullPageMessage title="Report not available" description="It may have been deleted, or it isn’t shared with you." actions={[{ label: 'Go back', onClick: back }]} />
  }

  return (
    <div className="report-canvas min-h-svh pb-10 print:pb-0">
      <div className="sticky top-0 z-30 border-b border-black/5 bg-[#efeee9]/90 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-[816px] items-center gap-2 px-3 py-2.5 sm:px-0">
          <Button variant="ghost" size="sm" onClick={back} className="text-[#0b0b0b] hover:bg-black/5">
            <LuArrowLeft /> Back
          </Button>
          {/* On a phone the bar has no room for the title; the report's own header right below names the period. */}
          <div className="min-w-0 flex-1 truncate text-center text-sm font-medium text-[#52514e]">
            <span className="hidden sm:inline">{reportName(r)}</span>
          </div>
          {staffPortal ? (
            <Button variant="ghost" size="sm" className="text-[#0b0b0b] hover:bg-black/5" onClick={() => navigate(`/${staffPortal}/reports/${reportId}`)}>
              <LuPencil /> {staffPortal === 'admin' ? 'Edit' : 'Open'}
            </Button>
          ) : null}
          <Button size="sm" onClick={() => window.print()} className="bg-[#0b0b0b] text-white hover:bg-[#0b0b0b]/90">
            <LuDownload /> Download PDF
          </Button>
        </div>
      </div>
      {staffPortal && r.status === 'draft' ? (
        <div className="mx-auto mt-4 max-w-[816px] rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 print:hidden">
          This is a draft. The family can’t see it until it’s shared.
        </div>
      ) : null}
      <main className="mt-4 sm:mt-8 sm:px-4 print:m-0 print:p-0">
        <ReportDocument report={r} audience="family" timezone={timezone} />
      </main>
    </div>
  )
}
