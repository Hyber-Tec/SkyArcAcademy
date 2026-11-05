import { useState } from 'react'
import { LuDownload } from 'react-icons/lu'
import { toast } from 'sonner'
import type { ContractLink, SignedContract } from '@shared/contracts/types'
import { dateText } from '@shared/i18n'
import { dateKeyOf, formatInstant } from '@shared/time'
import type { WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { useLang, useT } from '@/lib/lang'
import { mySignedCopy } from './api'
import { contractErrorIn } from './contractLang'

/**
 * A child's enrollment contract on the family's profile: who signed it and when ("Signed by Eunji Monroe on Nov 5,
 * 2026"), with their signed copy to download (from the Drive, through the server); one the academy sent, waiting; or
 * none yet (the academy sends it: docs/DECISIONS.md §34).
 */
export function FamilyContractFact({ studentId, signed, waiting }: { studentId: string; signed: WithId<SignedContract> | null | undefined; waiting?: WithId<ContractLink> | null }) {
  const { branchId, branch, timezone, viewAs } = useBranch()
  const [busy, setBusy] = useState(false)
  const lang = useLang()
  const t = useT()
  if (waiting) return <span>{t(`Sent by ${branch.name}: waiting for a parent’s signature`, `${branch.name}에서 보냈어요 · 서명 대기 중`)}</span>
  if (!signed) return <span className="text-muted-foreground">{t(`None yet: ${branch.name} sends it when it’s time to sign`, `아직 없어요. 서명할 때가 되면 ${branch.name}에서 보내 드려요.`)}</span>
  const at = signed.signedAt?.toMillis ? signed.signedAt.toMillis() : null
  const when = at !== null ? formatInstant(at, timezone, { month: 'short', day: 'numeric', year: 'numeric' }) : 'today'
  // "2026년 11월 5일에", or "오늘" (no 에).
  const whenKo = at !== null ? `${dateText(dateKeyOf(at, timezone), 'long', 'ko')}에` : '오늘'
  const text =
    lang === 'ko'
      ? signed.via === 'paper'
        ? `종이로 서명했어요 (${at !== null ? dateText(dateKeyOf(at, timezone), 'long', 'ko') : '오늘'} 기록)`
        : `${whenKo} ${signed.signerName ? `${signed.signerName}님이` : '부모님이'} 서명했어요`
      : signed.via === 'paper'
        ? `Signed on paper (recorded ${when})`
        : `Signed by ${signed.signerName || 'a parent'} on ${when}`
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
      toast.error(t('Couldn’t download the signed copy', '서명한 계약서를 다운로드하지 못했어요'), { description: contractErrorIn((e as Error).message, lang) })
    } finally {
      setBusy(false)
    }
  }
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span>{text}</span>
      {signed.fileId && !viewAs ? (
        <Button variant="link" size="sm" className="h-auto p-0" onClick={() => void download()} disabled={busy} data-testid="download-signed-contract">
          {busy ? <Spinner /> : <LuDownload />} {t('Download', '다운로드')}
        </Button>
      ) : null}
    </span>
  )
}
