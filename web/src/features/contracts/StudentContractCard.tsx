import { useState } from 'react'
import { LuCopy, LuExternalLink, LuLock, LuMail, LuSend, LuX } from 'react-icons/lu'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { signUrl, signedOnText, studentContract } from '@shared/contracts/signing'
import { SIGNER_RELATIONS } from '@shared/contracts/types'
import { contractsFolderId } from '@shared/drive/types'
import { formatInstant } from '@shared/time'
import type { Student, StudentPrivateProfile, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { useConfirm } from '@/components/app/useConfirm'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useNow } from '@/lib/useNow'
import { cancelLink, useContractTemplates, useStudentContractLinks } from './api'
import { copyLink } from './links'
import { SendContractDialog } from './SendContractDialog'

const STATE: Record<'none' | 'sent' | 'expired' | 'signed', { label: string; className: string }> = {
  none: { label: 'Not sent', className: 'border-border text-muted-foreground' },
  sent: { label: 'Sent', className: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200' },
  expired: { label: 'Link expired', className: 'border-border text-muted-foreground' },
  signed: { label: 'Signed', className: 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700/60 dark:bg-emerald-950/40 dark:text-emerald-200' },
}

/**
 * A student's enrollment contract, on their page (owners and admins; F4): not sent, waiting (since when, until when,
 * with Copy link, Email and Cancel), expired, or signed (by whom, when, and the signed PDF, which opens from the Drive).
 * Its foot leads to the student's Contracts folder, where the signed copies are (and where the office files a paper one).
 */
export function StudentContractCard({ student, priv }: { student: WithId<Student>; priv: StudentPrivateProfile | null }) {
  const { branchId, actor, timezone } = useBranch()
  const { data: links, loading } = useStudentContractLinks(student.id)
  const { current: template, loading: templateLoading } = useContractTemplates()
  const [dialog, setDialog] = useState<'new' | 'email' | null>(null)
  const { confirm, dialog: confirmDialog } = useConfirm()
  const now = useNow()
  const c = studentContract(links, now)
  const first = student.firstName || student.name.split(' ')[0]
  // A link lasts 30 days: its dates need no year.
  const day = (t: { toMillis?: () => number } | null | undefined) => (t?.toMillis ? formatInstant(t.toMillis(), timezone, { month: 'short', day: 'numeric' }) : 'today')
  const signedLine = (l: NonNullable<typeof c.lastSigned>) =>
    `${l.signer?.name ?? 'Someone'} (${l.signer ? SIGNER_RELATIONS[l.signer.relation].toLowerCase() : 'parent'}) signed it on ${l.signedAt?.toMillis ? signedOnText(l.signedAt.toMillis(), timezone) : 'just now'}.`

  async function cancel() {
    if (!c.link) return
    const ok = await confirm({
      title: 'Cancel the signing link?',
      description: `The link stops working: ${first}’s family can’t sign with it any more. You can send a new one.`,
      confirmLabel: 'Cancel the link',
      destructive: true,
    })
    if (!ok) return
    try {
      await cancelLink(branchId, actor, c.link)
      toast.success('The link is canceled')
    } catch (e) {
      toast.error('Couldn’t cancel the link', { description: (e as Error).message })
    }
  }

  const send = (label: string, variant: 'default' | 'outline' = 'default') =>
    template ? (
      <Button size="sm" variant={variant} onClick={() => setDialog('new')}>
        <LuSend /> {label}
      </Button>
    ) : (
      <p className="text-xs text-muted-foreground">
        Upload the academy’s contract in{' '}
        <Link to="/admin/settings/contract" className="font-medium underline underline-offset-2">
          Settings
        </Link>{' '}
        to send it.
      </p>
    )

  let body: React.ReactNode
  if (loading || templateLoading) body = <Skeleton className="h-16 w-full" />
  else if (c.state === 'signed' && c.link) {
    body = (
      <>
        <p className="text-sm">{signedLine(c.link)}</p>
        <div className="flex flex-wrap gap-2">
          {c.link.fileId ? (
            <Button size="sm" variant="outline" asChild>
              <Link to={`/admin/drive/file/${c.link.fileId}`}>
                <LuExternalLink /> Open the signed contract
              </Link>
            </Button>
          ) : null}
          {send('Send it again', 'outline')}
        </div>
      </>
    )
  } else if (c.state === 'sent' && c.link) {
    const l = c.link
    body = (
      <>
        <p className="text-sm">
          Sent {day(l.createdAt)} by {l.createdBy?.name?.split(' ')[0] || 'the office'}, waiting for a signature. The link works until {day(l.expiresAt)}.
        </p>
        {l.emailedTo?.length ? <p className="text-xs break-all text-muted-foreground">Emailed to {l.emailedTo.join(', ')}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => void copyLink(signUrl(l.token, window.location.origin))}>
            <LuCopy /> Copy link
          </Button>
          <Button size="sm" variant="outline" onClick={() => setDialog('email')}>
            <LuMail /> Email
          </Button>
          <Button size="sm" variant="ghost" className="text-destructive" aria-label="Cancel the link" onClick={() => void cancel()}>
            <LuX /> Cancel
          </Button>
        </div>
      </>
    )
  } else if (c.state === 'expired' && c.link) {
    body = (
      <>
        <p className="text-sm">The link sent {day(c.link.createdAt)} expired on {day(c.link.expiresAt)} without a signature.</p>
        {send('Send a new link')}
      </>
    )
  } else {
    body = (
      <>
        <p className="text-sm text-muted-foreground">{first}’s family hasn’t been sent the contract yet.</p>
        {send('Send the contract')}
      </>
    )
  }

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4" data-testid="student-contract">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Enrollment contract</h2>
        {loading ? null : <span className={cn('inline-flex h-6 items-center rounded-full border px-2.5 text-xs font-medium', STATE[c.state].className)}>{STATE[c.state].label}</span>}
      </div>
      {body}
      {c.lastSigned && c.state !== 'signed' ? (
        <p className="text-xs text-muted-foreground">
          Earlier: {signedLine(c.lastSigned)}{' '}
          {c.lastSigned.fileId ? (
            <Link to={`/admin/drive/file/${c.lastSigned.fileId}`} className="font-medium underline underline-offset-2">
              Open it
            </Link>
          ) : null}
        </p>
      ) : null}
      <Link
        to={`/admin/drive/f/${contractsFolderId(student.id)}`}
        className="flex w-fit items-center gap-1.5 text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        data-testid="student-contracts-folder"
      >
        <LuLock className="size-3.5" aria-hidden /> {first}’s Contracts folder, in the Drive
      </Link>
      {dialog ? <SendContractDialog studentId={student.id} studentFirst={first} priv={priv} link={dialog === 'email' ? c.link : null} onClose={() => setDialog(null)} /> : null}
      {confirmDialog}
    </div>
  )
}
