import { useMemo, useState } from 'react'
import { LuCopy, LuExternalLink, LuFileCheck, LuLock, LuMail, LuRotateCcw, LuSend, LuX } from 'react-icons/lu'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { parseContract } from '@shared/contracts/document'
import { RELATION_LABELS, contractSummary } from '@shared/contracts/fill'
import { signUrl, signedOnText, studentContract } from '@shared/contracts/signing'
import { type ContractTemplate, SIGNED_VIA_LABELS, type SignedContract } from '@shared/contracts/types'
import { contractsFolderId } from '@shared/drive/types'
import { COL } from '@shared/paths'
import { formatInstant } from '@shared/time'
import type { Student, StudentPrivateProfile, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { useConfirm } from '@/components/app/useConfirm'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { branchDocRef, useDoc } from '@/lib/firestore'
import { cn } from '@/lib/utils'
import { useNow } from '@/lib/useNow'
import { askToSignAgain, cancelLink, markSignedOnPaper, useContractTemplates, useSignedContract, useStudentContractLinks } from './api'
import { copyLink } from './links'
import { SendContractDialog } from './SendContractDialog'

const STATE: Record<'none' | 'sent' | 'expired' | 'signed', { label: string; className: string }> = {
  none: { label: 'Not sent', className: 'border-border text-muted-foreground' },
  sent: { label: 'Sent', className: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200' },
  expired: { label: 'Link expired', className: 'border-border text-muted-foreground' },
  signed: { label: 'Signed', className: 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700/60 dark:bg-emerald-950/40 dark:text-emerald-200' },
}

/**
 * A student's enrollment contract, on their page (owners and admins; F4 and docs/DECISIONS.md §31 and §33): signed (by
 * whom, when and how: in the app, on the website, by link or on paper, what the family chose in it, the signed PDF,
 * which opens from the Drive, and "Ask to sign again"), or not yet: then a parent signs it in the app before using
 * it, and the office can send a link (waiting since when, until when, with Copy link, Email and Cancel; or expired) or
 * mark one signed on paper. Its foot leads to the student's Contracts folder, where the signed copies are.
 */
export function StudentContractCard({ student, priv }: { student: WithId<Student>; priv: StudentPrivateProfile | null }) {
  const { branchId, actor, timezone } = useBranch()
  const { data: links, loading: linksLoading } = useStudentContractLinks(student.id)
  const { data: signed, loading: signedLoading } = useSignedContract(student.id)
  const { current: template, loading: templateLoading } = useContractTemplates()
  const loading = linksLoading || signedLoading
  const [dialog, setDialog] = useState<'new' | 'email' | 'paper' | null>(null)
  const { confirm, dialog: confirmDialog } = useConfirm()
  const now = useNow()
  const c = studentContract(links, now)
  const first = student.firstName || student.name.split(' ')[0]
  // A link lasts 30 days: its dates need no year.
  const day = (t: { toMillis?: () => number } | null | undefined) => (t?.toMillis ? formatInstant(t.toMillis(), timezone, { month: 'short', day: 'numeric' }) : 'today')
  const signedLine = (l: NonNullable<typeof c.lastSigned>) =>
    `${l.signer?.name ?? 'Someone'} (${l.signer ? RELATION_LABELS[l.signer.relation].toLowerCase() : 'parent'}) signed it on ${l.signedAt?.toMillis ? signedOnText(l.signedAt.toMillis(), timezone) : 'just now'}.`

  async function again(sc: WithId<SignedContract>) {
    const ok = await confirm({
      title: 'Ask to sign the contract again?',
      description: `${first}’s family is asked to sign the academy’s current contract again before they use the app. The signed copy stays in ${first}’s Contracts folder.`,
      confirmLabel: 'Ask to sign again',
    })
    if (!ok) return
    try {
      await askToSignAgain(branchId, actor, sc)
      toast.success('The family will be asked to sign again')
    } catch (e) {
      toast.error('Couldn’t change it', { description: (e as Error).message })
    }
  }

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
        Publish the academy’s contract in{' '}
        <Link to="/admin/settings/contract" className="font-medium underline underline-offset-2">
          Settings
        </Link>{' '}
        to send it.
      </p>
    )

  // A link signed before the office asked to sign again is history ("Earlier"), not the state.
  const state = signed ? 'signed' : c.state === 'signed' ? 'none' : c.state
  let body: React.ReactNode
  if (loading || templateLoading) body = <Skeleton className="h-16 w-full" />
  else if (signed) {
    body = (
      <>
        <p className="text-sm">{signedText(signed, timezone)}</p>
        {signed.note ? <p className="text-xs text-muted-foreground">“{signed.note}”</p> : null}
        {signed.values && signed.templateId ? <ChosenInContract templateId={signed.templateId} values={signed.values} /> : null}
        <div className="flex flex-wrap gap-2">
          {signed.fileId ? (
            <Button size="sm" variant="outline" asChild>
              <Link to={`/admin/drive/file/${signed.fileId}`}>
                <LuExternalLink /> Open the signed contract
              </Link>
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" onClick={() => void again(signed)} data-testid="contract-sign-again">
            <LuRotateCcw /> Ask to sign again
          </Button>
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
        <p className="text-sm text-muted-foreground">
          {template ? `Not signed yet: ${first}’s parent signs it in the app before using it. You can also send them a link.` : `${first}’s family hasn’t been sent the contract yet.`}
        </p>
        {send('Send the contract')}
      </>
    )
  }

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4" data-testid="student-contract">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Enrollment contract</h2>
        {loading ? null : <span className={cn('inline-flex h-6 items-center rounded-full border px-2.5 text-xs font-medium', STATE[state].className)}>{STATE[state].label}</span>}
      </div>
      {body}
      {!loading && !signed ? (
        <Button size="sm" variant="ghost" className="-ml-2 w-fit" onClick={() => setDialog('paper')} data-testid="contract-mark-paper">
          <LuFileCheck /> Signed on paper? Mark it signed
        </Button>
      ) : null}
      {c.lastSigned && !signed ? (
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
      {dialog === 'new' || dialog === 'email' ? <SendContractDialog studentId={student.id} studentFirst={first} priv={priv} link={dialog === 'email' ? c.link : null} onClose={() => setDialog(null)} /> : null}
      {dialog === 'paper' ? <PaperDialog student={student} onClose={() => setDialog(null)} /> : null}
      {confirmDialog}
    </div>
  )
}

/** "Eunji Monroe (parent) signed it in the app on November 5, 2026 at 3:41 PM EST, as eunji@…": how it was signed. */
function signedText(sc: SignedContract, timezone: string): string {
  const when = sc.signedAt?.toMillis ? signedOnText(sc.signedAt.toMillis(), timezone) : 'just now'
  if (sc.via === 'paper') return `Signed on paper: marked by ${sc.markedBy?.name || 'the office'} on ${when}.`
  const who = `${sc.signerName || 'Someone'}${sc.relation ? ` (${RELATION_LABELS[sc.relation].toLowerCase()})` : ''}`
  return `${who} signed it ${SIGNED_VIA_LABELS[sc.via]} on ${when}${sc.signerEmail ? `, as ${sc.signerEmail}` : ''}.`
}

/**
 * What the family chose in their contract, read with the version they signed (owners and admins read every one): the
 * option and its price, and what they checked. The PDF in the Drive holds the rest.
 */
function ChosenInContract({ templateId, values }: { templateId: string; values: NonNullable<SignedContract['values']> }) {
  const { branchId } = useBranch()
  const { data: template } = useDoc<ContractTemplate>(branchDocRef(branchId, COL.contractTemplates, templateId))
  const text = template?.text ?? ''
  const rows = useMemo(() => (text ? contractSummary(parseContract(text).doc, values) : []), [text, values])
  if (!rows.length) return null
  return (
    <dl className="grid gap-x-3 gap-y-0.5 rounded-lg bg-muted/50 px-3 py-2 text-xs sm:grid-cols-[auto_1fr]" data-testid="student-contract-summary">
      {rows.map((r) => (
        <div key={r.label} className="contents">
          <dt className="text-muted-foreground">{r.label}</dt>
          <dd className="font-medium">{r.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Marks a student's contract signed on paper, with a note: their family isn't asked to sign it in the app. */
function PaperDialog({ student, onClose }: { student: WithId<Student>; onClose: () => void }) {
  const { branchId, actor } = useBranch()
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const first = student.firstName || student.name.split(' ')[0]
  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await markSignedOnPaper(branchId, actor, { id: student.id, name: student.name }, note)
      toast.success(`${first}’s contract is marked signed`)
      onClose()
    } catch (err) {
      toast.error('Couldn’t mark it signed', { description: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form onSubmit={(e) => void save(e)} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Mark {first}’s contract signed?</DialogTitle>
            <DialogDescription>
              For a family who signed the academy’s contract on paper instead: {first}’s family won’t be asked to sign it in the app. Keep the signed paper in {first}’s Contracts folder in the Drive, with the others.
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="paper-note">Note (optional)</FieldLabel>
            <Input id="paper-note" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Signed at the front desk" />
            <FieldDescription>When or how it was signed, for the office.</FieldDescription>
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy} data-testid="contract-paper-save">
              {busy ? <Spinner /> : null} Mark it signed
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
