import { useState } from 'react'
import { LuEye, LuSend } from 'react-icons/lu'
import { toast } from 'sonner'
import { reportName } from '@shared/reports/compose'
import { useBranch } from '@/branch/BranchProvider'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import { renameReport, shareReport } from './api'
import { useReportAudience } from './data'
import { type Report, errorMessage } from './model'

/** Share with the family: who will see it (admins can list them), an email with a link, and a last check. */
export function ShareDialog({ report: r, stale, onClose }: { report: Report; stale: boolean; onClose: () => void }) {
  const { branchId, actor, isAdmin } = useBranch()
  const audience = useReportAudience(r.studentId, isAdmin)
  const [emailFamily, setEmailFamily] = useState(true)
  const [busy, setBusy] = useState(false)
  const checks = [
    { ok: !!r.narrative.overview.trim(), text: 'The overview is written' },
    { ok: !stale, text: 'The figures are up to date with the evaluations' },
    { ok: !!r.narrative.coachNote.trim(), text: 'A note from the coach (optional)' },
  ]

  async function share() {
    setBusy(true)
    try {
      await shareReport(branchId, actor, r, emailFamily)
      toast.success(emailFamily ? 'Shared. The family will get an email with a link.' : 'Shared with the family')
      onClose()
    } catch (e) {
      toast.error('Could not share the report', { description: errorMessage(e, 'Try again.') })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share with family</DialogTitle>
          <DialogDescription>
            {r.student.name}’s {r.period.label} report will appear in the family’s portal. Shared reports are locked until an admin stops sharing them.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div>
            <div className="mb-1.5 text-xs font-medium text-muted-foreground">Who can see it</div>
            {!isAdmin ? (
              <p className="text-muted-foreground">The parents linked to {r.student.firstName || r.student.name}, and {r.student.firstName || 'the student'} if they have an account.</p>
            ) : audience.loading ? (
              <Spinner />
            ) : audience.data.length ? (
              <ul className="space-y-1">
                {audience.data.map((m) => (
                  <li key={m.email} className="flex min-w-0 items-center gap-2">
                    <LuEye className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{m.displayName || m.email}</span>
                    <span className="truncate text-xs text-muted-foreground">{m.email}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">No parent or student account is linked to {r.student.name} yet. The report will appear for them once one is added.</p>
            )}
          </div>
          <label className="flex items-center gap-2">
            <Checkbox checked={emailFamily} onCheckedChange={(v) => setEmailFamily(v === true)} />
            Email them a link to the report
          </label>
          <ul className="space-y-1 rounded-lg border bg-muted/30 p-3 text-xs">
            {checks.map((c) => (
              <li key={c.text} className={cn('flex items-center gap-2', c.ok ? 'text-foreground' : 'text-amber-700 dark:text-amber-400')}>
                <span aria-hidden>{c.ok ? '✓' : '•'}</span>
                {c.text}
              </li>
            ))}
          </ul>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void share()} disabled={busy}>
            {busy ? <Spinner /> : <LuSend />} Share
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function RenameDialog({ report: r, onClose }: { report: Report; onClose: () => void }) {
  const { branchId, actor } = useBranch()
  const [name, setName] = useState(r.customName ?? '')
  const [busy, setBusy] = useState(false)
  const fallback = reportName({ ...r, customName: null })
  async function save() {
    setBusy(true)
    try {
      await renameReport(branchId, actor, r, name)
      toast.success('Report renamed')
      onClose()
    } catch (e) {
      toast.error('Could not rename the report', { description: errorMessage(e, 'Try again.') })
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rename report</DialogTitle>
          <DialogDescription>Leave it empty to use “{fallback}”.</DialogDescription>
        </DialogHeader>
        <Input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder={fallback} aria-label="Report name" onKeyDown={(e) => e.key === 'Enter' && void save()} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={busy}>
            {busy ? <Spinner /> : null} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
