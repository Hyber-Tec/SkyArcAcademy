import { useState } from 'react'
import { LuDownload } from 'react-icons/lu'
import { toast } from 'sonner'
import type { ContractLink, SignedContract } from '@shared/contracts/types'
import { formatInstant } from '@shared/time'
import type { WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { mySignedCopy } from './api'

/**
 * A child's enrollment contract on the family's profile: who signed it and when ("Signed by Eunji Monroe on Nov 5,
 * 2026"), with their signed copy to download (from the Drive, through the server); one the academy sent, waiting; or
 * none yet (the academy sends it: docs/DECISIONS.md §34).
 */
export function FamilyContractFact({ studentId, signed, waiting }: { studentId: string; signed: WithId<SignedContract> | null | undefined; waiting?: WithId<ContractLink> | null }) {
  const { branchId, branch, timezone, viewAs } = useBranch()
  const [busy, setBusy] = useState(false)
  if (waiting) return <span>{`Sent by ${branch.name}: waiting for a parent’s signature`}</span>
  if (!signed) return <span className="text-muted-foreground">{`None yet: ${branch.name} sends it when it’s time to sign`}</span>
  const at = signed.signedAt?.toMillis ? signed.signedAt.toMillis() : null
  const when = at !== null ? formatInstant(at, timezone, { month: 'short', day: 'numeric', year: 'numeric' }) : 'today'
  const text = signed.via === 'paper' ? `Signed on paper (recorded ${when})` : `Signed by ${signed.signerName || 'a parent'} on ${when}`
  async function download() {
    setBusy(true)
    try {
      const { name, bytes } = await mySignedCopy(branchId, studentId)
      const url = URL.createObjectURL(new Blob([bytes.slice()], { type: 'application/pdf' }))
      const a = document.createElement('a')
      a.href = url
      a.download = name
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (e) {
      toast.error('Couldn’t download the signed copy', { description: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span>{text}</span>
      {signed.fileId && !viewAs ? (
        <Button variant="link" size="sm" className="h-auto p-0" onClick={() => void download()} disabled={busy} data-testid="download-signed-contract">
          {busy ? <Spinner /> : <LuDownload />} Download
        </Button>
      ) : null}
    </span>
  )
}
