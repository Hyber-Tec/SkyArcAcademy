import { useState } from 'react'
import { LuCheck, LuCopy, LuMail } from 'react-icons/lu'
import { toast } from 'sonner'
import { CONTRACT_LINK_DAYS, type ContractLink } from '@shared/contracts/types'
import { formatInstant } from '@shared/time'
import type { StudentPrivateProfile, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { type SendResult, emailLink, makeLink } from './api'
import { contactEmails, copyLink } from './links'

const NO_EMAIL = 'none'

/** Why a link wasn't emailed, and what to do instead. */
const NOT_EMAILED: Record<Exclude<SendResult['emailed'], 'sent' | null>, string> = {
  demo: 'The demo academy doesn’t send email: copy the link instead.',
  test_address: 'That’s a test address, which never gets email: copy the link instead.',
  not_configured: 'Email isn’t set up yet, so it wasn’t emailed: copy the link and text it.',
  failed: 'The email didn’t go. Copy the link and text it instead.',
}

/**
 * "Send the contract": a signing link for the student's parent or guardian (it replaces one still waiting), shown to
 * copy (the office texts it) and, when an address on the student's record is chosen, emailed. With `link`, the same
 * link is emailed again.
 */
export function SendContractDialog({
  studentId,
  studentFirst,
  priv,
  link,
  onClose,
}: {
  studentId: string
  studentFirst: string
  priv: StudentPrivateProfile | null
  link?: WithId<ContractLink> | null
  onClose: () => void
}) {
  const { branchId, timezone, isDemo } = useBranch()
  const emails = contactEmails(priv, studentFirst)
  const [to, setTo] = useState<string>(emails[0]?.email ?? NO_EMAIL)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<SendResult | null>(null)
  const again = !!link

  async function send() {
    setBusy(true)
    setError(null)
    try {
      const email = to === NO_EMAIL ? null : to
      const r = again ? await emailLink(branchId, link!.id, email!) : await makeLink(branchId, studentId, email)
      setResult(r)
      if (again) {
        if (r.emailed === 'sent') toast.success(`Emailed the link to ${email}`)
        onClose()
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const until = result?.expiresAt ? formatInstant(result.expiresAt, timezone, { month: 'long', day: 'numeric', year: 'numeric' }) : null
  // The address on the website the office is using (the email's is the academy's own, from the server).
  const url = result ? result.url.replace(/^https?:\/\/[^/]+/, window.location.origin) : ''
  const emailNote = !result?.emailed ? null : result.emailed === 'sent' ? `Emailed to ${to}.` : NOT_EMAILED[result.emailed]

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{again ? 'Email the link again' : result ? 'The link is ready' : `Send ${studentFirst}’s enrollment contract`}</DialogTitle>
          <DialogDescription>
            {result
              ? `Text it to ${studentFirst}’s parent or guardian${until ? `. It works until ${until}, for one signature.` : '.'}`
              : again
                ? 'The same link, to an address on the student’s record.'
                : `A link for ${studentFirst}’s parent or guardian to read the contract and sign it on their phone, with no account or app. It works for ${CONTRACT_LINK_DAYS} days, for one signature.`}
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input readOnly value={url} aria-label="Signing link" className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
              <Button onClick={() => void copyLink(url)}>
                <LuCopy /> Copy
              </Button>
            </div>
            {emailNote ? (
              <p className="flex items-start gap-2 text-sm text-muted-foreground">
                {result.emailed === 'sent' ? <LuCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" /> : <LuMail className="mt-0.5 size-4 shrink-0" />}
                {emailNote}
              </p>
            ) : null}
          </div>
        ) : (
          <Field data-invalid={!!error}>
            <FieldLabel htmlFor="contract-email">Email it to</FieldLabel>
            <Select value={to} onValueChange={setTo}>
              <SelectTrigger id="contract-email" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {emails.map((e) => (
                  <SelectItem key={e.email} value={e.email}>
                    {e.label} · {e.email}
                  </SelectItem>
                ))}
                {again ? null : <SelectItem value={NO_EMAIL}>Don’t email it: I’ll copy the link</SelectItem>}
              </SelectContent>
            </Select>
            <FieldDescription>
              {emails.length ? 'Addresses on the student’s record.' : 'No email on the student’s record: copy the link and text it.'}
              {isDemo ? ' The demo academy doesn’t send email.' : ''}
            </FieldDescription>
            {error ? <FieldError>{error}</FieldError> : null}
          </Field>
        )}

        <DialogFooter>
          {result ? (
            <Button onClick={onClose}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={() => void send()} disabled={busy || (again && to === NO_EMAIL)}>
                {busy ? <Spinner /> : null} {again ? 'Email the link' : 'Make the link'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
