import { useEffect, useState } from 'react'
import { LuCopy, LuExternalLink } from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { copyLink } from './links'

/**
 * A contract's link as a QR code, for the front desk: the parent scans it with their phone's camera and signs there,
 * with no account or app (docs/DECISIONS.md §34). Under it, the link to copy, and to open on this device for a parent
 * who signs on the academy's tablet or computer.
 */
export function ContractQr({ url, firstName }: { url: string; firstName: string }) {
  const [qr, setQr] = useState<{ url: string; data: string } | null>(null)
  useEffect(() => {
    let live = true
    void import('qrcode').then(({ toDataURL }) => toDataURL(url, { width: 480, margin: 2, errorCorrectionLevel: 'M' }).then((data) => live && setQr({ url, data })))
    return () => {
      live = false
    }
  }, [url])
  return (
    <div className="space-y-3" data-testid="contract-qr">
      <div className="mx-auto w-fit rounded-xl border bg-white p-2">
        {qr?.url === url ? <img src={qr.data} alt={`QR code to sign ${firstName}’s contract`} className="size-56" /> : <Skeleton className="size-56" />}
      </div>
      <p className="text-center text-sm text-muted-foreground">The parent scans it with their phone’s camera, then reads and signs {firstName}’s contract there. No account or app needed.</p>
      <div className="flex gap-2">
        <Input readOnly value={url} aria-label="The contract’s link" className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
        <Button variant="outline" onClick={() => void copyLink(url)}>
          <LuCopy /> Copy
        </Button>
      </div>
      <Button variant="outline" className="w-full" asChild>
        <a href={url} target="_blank" rel="noreferrer" data-testid="contract-open-here">
          <LuExternalLink /> Sign on this device instead
        </a>
      </Button>
    </div>
  )
}
