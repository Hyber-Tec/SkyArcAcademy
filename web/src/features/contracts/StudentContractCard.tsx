import { useMemo, useState } from 'react'
import { LuExternalLink, LuFileCheck, LuLock, LuMail, LuQrCode, LuRotateCcw, LuSend, LuX } from 'react-icons/lu'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { parseContract } from '@shared/contracts/document'
import { type ContractValues, RELATION_LABELS, contractSummary } from '@shared/contracts/fill'
import { signUrl, signedOnText, studentContract } from '@shared/contracts/signing'
import { type ContractLink, SIGNED_VIA_LABELS, type SignedContract } from '@shared/contracts/types'
import { contractsFolderId } from '@shared/drive/types'
import { formatInstant } from '@shared/time'
import type { Student, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { useConfirm } from '@/components/app/useConfirm'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import { emailContract, markSignedOnPaper, useContractTemplate, useContractTemplates, useContractToken, useSignedContract, useStudentContractLinks, withdrawContract } from './api'
import { ContractQr } from './ContractQr'
import { linkHere } from './links'
import { SendContractDialog } from './SendContractDialog'

type State = 'none' | 'sent' | 'signed' | 'withdrawn'

const STATE: Record<State, { label: string; className: string }> = {
  none: { label: 'Not sent', className: 'border-border text-muted-foreground' },
  sent: { label: 'Waiting to sign', className: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200' },
  signed: { label: 'Signed', className: 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700/60 dark:bg-emerald-950/40 dark:text-emerald-200' },
  withdrawn: { label: 'Withdrawn', className: 'border-border text-muted-foreground' },
}

/**
 * A student's enrollment contract, on their page (owners and admins; F4 and docs/DECISIONS.md §31, §33 and §34): sent
 * (when, by whom, with the program suggested and the discounts, and the price after them; its QR code for the front
 * desk, the link, Email, Change and send again, Withdraw), signed (by whom, when and how: in the app, on the website,
 * by link or on paper, what was chosen in it, the signed PDF, which opens from the Drive, and Send a new one), or not
 * sent yet. Its foot leads to the student's Contracts folder, where the signed copies are.
 */
export function StudentContractCard({ student }: { student: WithId<Student> }) {
  const { branchId, actor, timezone } = useBranch()
  const { data: links, loading: linksLoading } = useStudentContractLinks(student.id)
  const { data: signed, loading: signedLoading } = useSignedContract(student.id)
  const { current: template, loading: templateLoading } = useContractTemplates()
  const loading = linksLoading || signedLoading || templateLoading
  const [dialog, setDialog] = useState<'send' | 'qr' | 'paper' | null>(null)
  const [emailing, setEmailing] = useState(false)
  const { confirm, dialog: confirmDialog } = useConfirm()
  const c = studentContract(links)
  const first = student.firstName || student.name.split(' ')[0]
  const day = (t: { toMillis?: () => number } | null | undefined) => (t?.toMillis ? formatInstant(t.toMillis(), timezone, { month: 'short', day: 'numeric', year: 'numeric' }) : 'today')

  async function withdraw(link: WithId<ContractLink>) {
    const ok = await confirm({
      title: `Withdraw ${first}’s contract?`,
      description: `${first}’s family can’t sign it any more, in the app or with its link. Send it again with the right program or discounts.`,
      confirmLabel: 'Withdraw it',
      destructive: true,
    })
    if (!ok) return
    try {
      await withdrawContract(branchId, actor, link)
      toast.success(`${first}’s contract is withdrawn`)
    } catch (e) {
      toast.error('Couldn’t withdraw it', { description: (e as Error).message })
    }
  }

  async function email(link: WithId<ContractLink>) {
    setEmailing(true)
    try {
      const r = await emailContract(branchId, link.id)
      if (r.emailed === 'sent') toast.success(`Emailed to ${r.emailedTo.join(', ')}`)
      else toast.error('It wasn’t emailed', { description: r.emailed === 'demo' ? 'The demo academy doesn’t send email.' : r.emailed === 'no_address' ? 'There’s no email on the student’s record.' : 'Show the QR code, or copy the link and text it.' })
    } catch (e) {
      toast.error('Couldn’t email it', { description: (e as Error).message })
    } finally {
      setEmailing(false)
    }
  }

  const sendButton = (label: string, variant: 'default' | 'outline' | 'ghost' = 'default') =>
    template ? (
      <Button size="sm" variant={variant} onClick={() => setDialog('send')} data-testid="contract-send-open">
        <LuSend /> {label}
      </Button>
    ) : (
      <p className="text-xs text-muted-foreground">The academy’s contract isn’t set up yet.</p>
    )

  const state: State = c.waiting ? 'sent' : signed ? 'signed' : c.withdrawn ? 'withdrawn' : 'none'
  let body: React.ReactNode
  if (loading) body = <Skeleton className="h-16 w-full" />
  else if (c.waiting) {
    const l = c.waiting
    body = (
      <>
        <p className="text-sm">
          Sent {day(l.createdAt)} by {l.createdBy?.name?.split(' ')[0] || 'the office'}. Waiting for a parent to sign it in the app, on the website, or with its QR code.
        </p>
        <Offered link={l} />
        {l.emailedTo?.length ? <p className="text-xs break-all text-muted-foreground">Emailed to {l.emailedTo.join(', ')}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setDialog('qr')} data-testid="contract-show-qr">
            <LuQrCode /> QR code and link
          </Button>
          <Button size="sm" variant="outline" onClick={() => void email(l)} disabled={emailing}>
            {emailing ? <Spinner /> : <LuMail />} Email it
          </Button>
          <Button size="sm" variant="outline" onClick={() => setDialog('send')} data-testid="contract-change">
            <LuRotateCcw /> Change and send again
          </Button>
          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => void withdraw(l)} data-testid="contract-withdraw">
            <LuX /> Withdraw
          </Button>
        </div>
        {signed ? <p className="text-xs text-muted-foreground">Signed before: {signedText(signed, timezone)}</p> : null}
      </>
    )
  } else if (signed) {
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
          {sendButton('Send a new contract', 'ghost')}
        </div>
      </>
    )
  } else {
    body = (
      <>
        <p className="text-sm text-muted-foreground">
          {c.withdrawn ? `The contract sent ${day(c.withdrawn.createdAt)} was withdrawn ${day(c.withdrawn.canceledAt)}.` : `Not sent yet: ${first}’s family is asked to sign once you send it.`}
        </p>
        {sendButton('Send the contract')}
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
      {!loading && !signed && !c.waiting ? (
        <Button size="sm" variant="ghost" className="-ml-2 w-fit text-muted-foreground" onClick={() => setDialog('paper')} data-testid="contract-mark-paper">
          <LuFileCheck /> Signed on paper? Mark it signed
        </Button>
      ) : null}
      <Link
        to={`/admin/drive/f/${contractsFolderId(student.id)}`}
        className="flex w-fit items-center gap-1.5 text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        data-testid="student-contracts-folder"
      >
        <LuLock className="size-3.5" aria-hidden /> {first}’s Contracts folder, in the Drive
      </Link>
      {dialog === 'send' ? <SendContractDialog student={student} start={c.waiting?.preset ?? null} onClose={() => setDialog(null)} /> : null}
      {dialog === 'qr' && c.waiting ? <QrDialog link={c.waiting} firstName={first} onClose={() => setDialog(null)} /> : null}
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

/** What the office set on a contract it sent: the program suggested, the price after the discounts, the discounts. */
function Offered({ link }: { link: WithId<ContractLink> }) {
  return <ChosenInContract templateId={link.templateId} values={link.preset ?? {}} offered />
}

/**
 * What was chosen in a contract, read with its version: the option and its price after the discounts, and what was
 * checked. The PDF in the Drive holds the rest.
 */
function ChosenInContract({ templateId, values, offered = false }: { templateId: string; values: ContractValues; offered?: boolean }) {
  const template = useContractTemplate(templateId)
  const text = template.data?.text ?? ''
  const rows = useMemo(() => (text ? contractSummary(parseContract(text).doc, values) : []), [text, values])
  if (!rows.length) return null
  return (
    <dl className="grid gap-x-3 gap-y-0.5 rounded-lg bg-muted/50 px-3 py-2 text-xs sm:grid-cols-[auto_1fr]" data-testid="student-contract-summary">
      {rows.map((r, i) => (
        <div key={r.label} className="contents">
          <dt className="text-muted-foreground">{i === 0 && offered ? 'Program suggested' : r.label}</dt>
          <dd className="font-medium">{r.value === '—' && offered ? (i === 0 ? 'The family chooses' : 'Once the family chooses') : r.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** A contract still waiting: its QR code for the front desk, and its link. */
function QrDialog({ link, firstName, onClose }: { link: WithId<ContractLink>; firstName: string; onClose: () => void }) {
  const token = useContractToken(link.id)
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Sign {firstName}’s contract here</DialogTitle>
          <DialogDescription>For a parent at the front desk.</DialogDescription>
        </DialogHeader>
        {token.data?.token ? <ContractQr url={linkHere(signUrl(token.data.token))} firstName={firstName} /> : token.loading ? <Skeleton className="h-72 w-full" /> : <p className="text-sm text-muted-foreground">The link couldn’t be read.</p>}
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Marks a student's contract signed on paper, with a note (for a family who can't sign on a phone). */
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
              For a family who signed the academy’s contract on paper instead. Scan the signed paper into {first}’s Contracts folder in the Drive, with the others.
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
