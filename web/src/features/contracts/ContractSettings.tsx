import { getBlob, ref as storageRef } from 'firebase/storage'
import { useEffect, useRef, useState } from 'react'
import { LuExternalLink, LuFileText, LuLock, LuUpload } from 'react-icons/lu'
import { Link } from 'react-router'
import { toast } from 'sonner'
import type { ContractTemplate } from '@shared/contracts/types'
import { formatBytes } from '@shared/drive/model'
import { CONTRACTS_FOLDER_ID } from '@shared/drive/types'
import { formatInstant } from '@shared/time'
import type { WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { useConfirm } from '@/components/app/useConfirm'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { storage } from '@/lib/firebase'
import { ensureContractsFolder, readContractPdf, uploadTemplate, useContractTemplates } from './api'

/**
 * Settings → Enrollment contract (owners and admins): the academy's blank contract, as a PDF. A new upload replaces it
 * for the links sent from then on; the earlier ones stay listed, as contracts already signed (and links already sent)
 * keep theirs. Opening it makes the Drive's Contracts folder, where the signed copies go.
 */
export function ContractSettings() {
  const { branchId, actor, timezone } = useBranch()
  const { data: templates, current, loading } = useContractTemplates()
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<{ name: string; url: string } | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const { confirm, dialog } = useConfirm()
  const earlier = templates.filter((t) => !t.current)

  // The Contracts folder, once per academy (a second admin opening it at the same moment is refused by the rules).
  const folderMade = useRef<string | null>(null)
  useEffect(() => {
    if (folderMade.current === branchId) return
    folderMade.current = branchId
    ensureContractsFolder(branchId, actor).catch(() => undefined)
  }, [branchId, actor])
  useEffect(() => () => (preview ? URL.revokeObjectURL(preview.url) : undefined), [preview])

  const when = (t: { toMillis?: () => number } | null | undefined) => (t?.toMillis ? formatInstant(t.toMillis(), timezone, { month: 'short', day: 'numeric', year: 'numeric' }) : 'just now')

  async function upload(file: File) {
    setBusy(true)
    try {
      const read = await readContractPdf(file)
      if (current) {
        const ok = await confirm({
          title: 'Replace the enrollment contract?',
          description: `Links you send from now on will have “${file.name}”. Contracts already signed, and links already sent, keep the one they have.`,
          confirmLabel: 'Replace',
        })
        if (!ok) return
      }
      await uploadTemplate(branchId, actor, file, read, current)
      toast.success(current ? 'The contract is replaced' : 'The contract is uploaded', { description: 'Send it from a student’s page.' })
    } catch (e) {
      toast.error('Couldn’t upload the contract', { description: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  async function open(t: WithId<ContractTemplate>) {
    try {
      const blob = await getBlob(storageRef(storage, t.path))
      setPreview({ name: t.name, url: URL.createObjectURL(new Blob([blob], { type: 'application/pdf' })) })
    } catch {
      toast.error('Couldn’t open the contract.')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Enrollment contract</CardTitle>
        <CardDescription>
          The academy’s blank contract, as a PDF. From a student’s page you send the family a link: they read the contract on their phone, type their name and sign with a finger, with no account or app. The signed copy goes to the Drive’s Contracts folder, which only owners and admins see.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <Skeleton className="h-16 w-full" />
        ) : current ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3" data-testid="contract-current">
            <LuFileText className="size-7 shrink-0 text-red-600" aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium" title={current.name}>
                {current.name}
              </div>
              <div className="text-xs text-muted-foreground">
                {current.pages} {current.pages === 1 ? 'page' : 'pages'} · {formatBytes(current.size)} · Uploaded {when(current.uploadedAt)} by {current.uploadedBy?.name || current.uploadedBy?.email}
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => void open(current)}>
              <LuExternalLink /> Open
            </Button>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No contract yet. Upload the academy’s blank contract to send it to families.</div>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button onClick={() => input.current?.click()} disabled={busy || loading}>
            {busy ? <Spinner /> : <LuUpload />} {current ? 'Replace with a new PDF…' : 'Upload the contract (PDF)'}
          </Button>
          <Link to={`/admin/drive/f/${CONTRACTS_FOLDER_ID}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
            <LuLock className="size-3.5" aria-hidden /> Signed contracts, in the Drive
          </Link>
        </div>
        <input
          ref={input}
          type="file"
          accept="application/pdf,.pdf"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) void upload(file)
          }}
        />
        {earlier.length ? (
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">Earlier versions (kept for the contracts signed with them)</div>
            <ul className="divide-y rounded-lg border text-sm">
              {earlier.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate" title={t.name}>
                    {t.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Uploaded {when(t.uploadedAt)}
                    {t.replacedAt ? ` · replaced ${when(t.replacedAt)}` : ''}
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => void open(t)}>
                    Open
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
      {preview ? (
        <Dialog open onOpenChange={(o) => !o && setPreview(null)}>
          <DialogContent className="flex h-[90svh] max-w-[min(1000px,96vw)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(1000px,96vw)]">
            <div className="border-b px-4 py-3 pr-12">
              <DialogTitle className="truncate text-sm font-semibold">{preview.name}</DialogTitle>
              <DialogDescription className="text-xs">The academy’s blank contract</DialogDescription>
            </div>
            <iframe title={preview.name} src={preview.url} className="min-h-0 flex-1 border-0 bg-white" />
          </DialogContent>
        </Dialog>
      ) : null}
      {dialog}
    </Card>
  )
}
