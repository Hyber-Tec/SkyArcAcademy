import { useMemo, useRef, useState } from 'react'
import { LuDownload, LuEraser, LuEye, LuFileText, LuPenLine, LuTrash2, LuUpload } from 'react-icons/lu'
import { toast } from 'sonner'
import { dollarsText, parseContract, pricedChoice } from '@shared/contracts/document'
import { optionHeading, prefillValues } from '@shared/contracts/fill'
import { ACADEMY_SIGNATURE_MAX_CHARS, CONTRACT_PRICE_MAX, type ContractSignRequest } from '@shared/contracts/types'
import { dateKeyOf, formatInstant } from '@shared/time'
import { useBranch } from '@/branch/BranchProvider'
import { useConfirm } from '@/components/app/useConfirm'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { useNow } from '@/lib/useNow'
import { previewContract, removeAcademySigner, saveAcademySigner, setContractPrices, useAcademySigner, useContractLinks, useContractTemplates } from './api'
import { type SignOutcome, ContractSigning } from './ContractSigning'
import { savePdf } from './pdf'
import { SignaturePad, type SignaturePadHandle } from './SignaturePad'

const SAMPLE_STUDENT = 'Sample Student'

const when = (t: { toMillis?: () => number } | null | undefined, timezone: string) => (t?.toMillis ? formatInstant(t.toMillis(), timezone, { month: 'short', day: 'numeric', year: 'numeric' }) : 'just now')

/**
 * Settings → Enrollment contract (owners and admins; docs/DECISIONS.md §31, §33 and §34): the academy's contract as the
 * manager approved it (its words are set up once, by scripts/contract.ts, and never edited here: the owner,
 * 2026-11-05), to preview as a parent sees it and as a sample PDF; its program prices, the one part the office changes
 * (a new version, for the contracts sent from then on); and the academy's signature, put on every contract a family
 * signs. Who has signed is below (ContractsList); each contract is sent from there or from the student's page.
 */
export function ContractSettings() {
  const { branchId, timezone } = useBranch()
  const { data: versions, current, loading } = useContractTemplates()
  const [busy, setBusy] = useState(false)
  const [previewing, setPreviewing] = useState(false)

  async function sample() {
    setBusy(true)
    try {
      const pdf = await previewContract({ branchId })
      savePdf(pdf.bytes, pdf.name)
    } catch (e) {
      toast.error('Couldn’t make the sample PDF', { description: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Enrollment contract</CardTitle>
          <CardDescription>
            The academy’s contract, as families read it in the app and on the website. Send it to each family from the list below or the student’s page, with the program and the discounts. Each signed contract is a PDF in the student’s Contracts folder in the Drive, which only owners and admins see.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <Skeleton className="h-16 w-full" />
          ) : current ? (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3" data-testid="contract-current">
              <LuFileText className="size-7 shrink-0 text-brand-text" aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium" title={current.title}>
                  {current.title || 'Enrollment contract'}
                </div>
                <div className="text-xs text-muted-foreground">
                  Version {current.version}, {current.version > 1 ? 'prices changed' : 'set up'} {when(current.publishedAt, timezone)}
                  {current.publishedBy?.name ? ` by ${current.publishedBy.name}` : ''}.{versions.length > 1 ? ` ${versions.length - 1} earlier ${versions.length === 2 ? 'version is' : 'versions are'} kept for the contracts sent with them.` : ''}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => setPreviewing(true)} data-testid="contract-preview">
                  <LuEye /> Preview
                </Button>
                <Button variant="outline" size="sm" onClick={() => void sample()} disabled={busy} data-testid="contract-current-sample">
                  {busy ? <Spinner /> : <LuDownload />} Sample PDF
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground" data-testid="contract-not-set-up">
              The academy’s contract isn’t set up yet. Families aren’t asked to sign anything until it is and the office sends it.
            </div>
          )}
          <p className="text-xs text-muted-foreground">The contract’s words stay as the manager approved them. Only the prices change here.</p>
        </CardContent>
        {previewing && current ? <PreviewDialog text={current.text} onClose={() => setPreviewing(false)} /> : null}
      </Card>
      {current ? <PricesCard text={current.text} /> : null}
      <SignerCard />
    </>
  )
}

/**
 * The program prices, the one part of the contract the office changes (the owner, 2026-11-05: "the admin is able to
 * see the program and fix the price"). Saving makes a new version, for the contracts sent from then on; one already
 * sent keeps its prices until it's sent again.
 */
function PricesCard({ text }: { text: string }) {
  const { branchId } = useBranch()
  const doc = useMemo(() => parseContract(text).doc, [text])
  const choice = pricedChoice(doc)
  const links = useContractLinks()
  const { confirm, dialog } = useConfirm()
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const options = (choice?.options ?? []).filter((o) => o.amount !== null)
  if (!choice || !options.length) return null

  const typed = (id: string, amount: number) => draft[id] ?? String(amount)
  const parsed = Object.fromEntries(options.map((o) => [o.id, Number(typed(o.id, o.amount!).replace(/[$,\s]/g, ''))]))
  const bad = options.filter((o) => !Number.isFinite(parsed[o.id]) || parsed[o.id] < 0 || parsed[o.id] > CONTRACT_PRICE_MAX || Math.round(parsed[o.id] * 100) !== parsed[o.id] * 100 || !typed(o.id, o.amount!).trim())
  const changed = options.filter((o) => !bad.includes(o) && parsed[o.id] !== o.amount)
  const waiting = links.data.filter((l) => l.status === 'sent').length

  async function save() {
    const ok = await confirm({
      title: 'Save the new prices?',
      description: `${changed.map((o) => `${o.title}: ${dollarsText(o.amount!)} → ${dollarsText(parsed[o.id])}`).join('. ')}. The contracts you send from now on show them.${waiting ? ` The ${waiting === 1 ? 'one' : waiting} sent and waiting keep${waiting === 1 ? 's' : ''} ${waiting === 1 ? 'its' : 'their'} prices: send ${waiting === 1 ? 'it' : 'them'} again to change ${waiting === 1 ? 'it' : 'them'}.` : ''}`,
      confirmLabel: 'Save the prices',
    })
    if (!ok) return
    setBusy(true)
    try {
      const r = await setContractPrices(branchId, Object.fromEntries(changed.map((o) => [o.id, parsed[o.id]])))
      setDraft({})
      toast.success('The new prices are saved', { description: `The contract is now version ${r.version}.` })
    } catch (e) {
      toast.error('Couldn’t save the prices', { description: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card data-testid="contract-prices">
      <CardHeader>
        <CardTitle>Program prices</CardTitle>
        <CardDescription>{choice.priceLabel || 'The price'} of each program in the contract. The contracts you send from now on show the new prices; ones already signed keep theirs.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="divide-y rounded-lg border">
          {options.map((o) => {
            const { name, sub } = optionHeading(o.title)
            const per = o.price.replace(/\$\s?[\d,]+(\.\d+)?/, '').trim()
            return (
              <li key={o.id} className="flex items-center gap-3 px-3 py-2">
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block text-sm font-semibold">{name}</span>
                  {sub ? <span className="block text-[11px] tracking-wider text-muted-foreground">{sub}</span> : null}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="text-sm text-muted-foreground">$</span>
                  <Input
                    value={typed(o.id, o.amount!)}
                    onChange={(e) => setDraft((d) => ({ ...d, [o.id]: e.target.value }))}
                    inputMode="decimal"
                    className="h-8 w-24 text-right tabular-nums"
                    aria-label={`${o.title}: price in dollars`}
                    aria-invalid={bad.includes(o) || undefined}
                    data-testid={`price-${o.id}`}
                  />
                  {per ? <span className="w-14 text-xs text-muted-foreground">{per}</span> : null}
                </span>
              </li>
            )
          })}
        </ul>
        {bad.length ? <p className="text-sm text-destructive">Type each price in dollars, like 495 or 495.50.</p> : null}
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => void save()} disabled={busy || !changed.length || !!bad.length} data-testid="prices-save">
            {busy ? <Spinner /> : null} Save prices
          </Button>
          {changed.length ? (
            <Button variant="ghost" onClick={() => setDraft({})} disabled={busy}>
              Undo
            </Button>
          ) : null}
        </div>
      </CardContent>
      {dialog}
    </Card>
  )
}

/**
 * An image the office chose (an SVG or a PNG, as the designer sent it), drawn as a PNG on transparent: an SVG at 900
 * pixels wide in its own proportions (its viewBox, as an exported signature often has no width or height), a PNG at
 * most that wide; never taller than 300.
 */
async function imageToPng(file: File): Promise<string> {
  const svg = file.type === 'image/svg+xml'
  let viewBox: number | null = null
  if (svg) {
    const box = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(await file.text())
    if (box && Number(box[1]) > 0 && Number(box[2]) > 0) viewBox = Number(box[1]) / Number(box[2])
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    const aspect = viewBox ?? (img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 3)
    let w = svg ? 900 : Math.min(900, img.naturalWidth || 900)
    let h = Math.round(w / aspect)
    if (h > 300) {
      h = 300
      w = Math.round(h * aspect)
    }
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, w)
    canvas.height = Math.max(1, h)
    canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png')
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * The academy's signature (the owner, 2026-11-05: an SVG from the manager, or a digital one, "autofill"): who signs for
 * the academy and the signature, uploaded (SVG or PNG) or drawn here. It's put on every contract a family signs from
 * then on, with the date they sign; without one, the academy's line stays blank.
 */
function SignerCard() {
  const { branchId, actor, timezone } = useBranch()
  const signer = useAcademySigner()
  const { confirm, dialog } = useConfirm()
  const [name, setName] = useState<string | null>(null)
  const [title, setTitle] = useState<string | null>(null)
  const [image, setImage] = useState<string | null>(null)
  const [drawing, setDrawing] = useState(false)
  const [busy, setBusy] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const current = signer.data
  const shownName = name ?? current?.name ?? ''
  const shownTitle = title ?? current?.title ?? ''
  const shownImage = image ?? current?.image ?? null
  const dirty = name !== null || title !== null || image !== null

  async function pick(f: File | undefined) {
    if (!f) return
    if (!/^image\/(svg\+xml|png)$/.test(f.type)) return void toast.error('Choose an SVG or a PNG of the signature')
    try {
      const png = await imageToPng(f)
      if (png.length > ACADEMY_SIGNATURE_MAX_CHARS) return void toast.error('That image is too large', { description: 'Use a smaller signature image.' })
      setImage(png)
    } catch {
      toast.error('That image couldn’t be read')
    }
  }

  async function save() {
    if (!shownName.trim() || !shownImage) return
    setBusy(true)
    try {
      await saveAcademySigner(branchId, actor, { name: shownName, title: shownTitle, image: shownImage })
      setName(null)
      setTitle(null)
      setImage(null)
      toast.success('The academy’s signature is saved', { description: 'It’s on every contract signed from now on.' })
    } catch (e) {
      toast.error('Couldn’t save the signature', { description: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    const ok = await confirm({
      title: 'Remove the academy’s signature?',
      description: 'The contracts signed from now on leave the academy’s signature line blank. The ones signed already keep it.',
      confirmLabel: 'Remove it',
      destructive: true,
    })
    if (!ok) return
    try {
      await removeAcademySigner(branchId, actor)
      toast.success('The academy’s signature is removed')
    } catch (e) {
      toast.error('Couldn’t remove it', { description: (e as Error).message })
    }
  }

  return (
    <Card data-testid="contract-signer">
      <CardHeader>
        <CardTitle>The academy’s signature</CardTitle>
        <CardDescription>Put on every contract a family signs, on the academy’s line, with the date they sign. Upload the signature (SVG or PNG), or draw it here.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {signer.loading ? (
          <Skeleton className="h-28 w-full" />
        ) : (
          <>
            <div className="flex min-h-24 items-center justify-center rounded-lg border bg-white p-3" data-testid="signer-image">
              {shownImage ? <img src={shownImage} alt="The academy’s signature" className="max-h-24 w-auto max-w-full object-contain" /> : <span className="text-sm text-muted-foreground">No signature yet: the academy’s line is left blank.</span>}
            </div>
            <div className="flex flex-wrap gap-2">
              <input ref={file} type="file" accept="image/svg+xml,image/png" className="hidden" onChange={(e) => void pick(e.target.files?.[0]).finally(() => (e.target.value = ''))} data-testid="signer-file" />
              <Button variant="outline" size="sm" onClick={() => file.current?.click()}>
                <LuUpload /> Upload (SVG or PNG)
              </Button>
              <Button variant="outline" size="sm" onClick={() => setDrawing(true)} data-testid="signer-draw">
                <LuPenLine /> Draw it
              </Button>
              {current && !dirty ? (
                <Button variant="ghost" size="sm" className="text-destructive" onClick={() => void remove()}>
                  <LuTrash2 /> Remove
                </Button>
              ) : null}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="signer-name">Signed by</FieldLabel>
                <Input id="signer-name" value={shownName} maxLength={100} onChange={(e) => setName(e.target.value)} placeholder="Full name" data-testid="signer-name-input" />
              </Field>
              <Field>
                <FieldLabel htmlFor="signer-title">Title (optional)</FieldLabel>
                <Input id="signer-title" value={shownTitle} maxLength={100} onChange={(e) => setTitle(e.target.value)} placeholder="Director" />
              </Field>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => void save()} disabled={busy || !dirty || !shownName.trim() || !shownImage} data-testid="signer-save">
                {busy ? <Spinner /> : null} Save the signature
              </Button>
              {dirty ? (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setName(null)
                    setTitle(null)
                    setImage(null)
                  }}
                >
                  Undo
                </Button>
              ) : null}
              {current && !dirty ? (
                <span className="text-xs text-muted-foreground">
                  Set {when(current.updatedAt, timezone)} by {current.updatedBy?.name || 'the office'}.
                </span>
              ) : null}
            </div>
          </>
        )}
      </CardContent>
      {drawing ? (
        <DrawDialog
          onDone={(png) => {
            setImage(png)
            setDrawing(false)
          }}
          onClose={() => setDrawing(false)}
        />
      ) : null}
      {dialog}
    </Card>
  )
}

/** The academy's signature, drawn with a finger, a pen or the mouse. */
function DrawDialog({ onDone, onClose }: { onDone: (png: string) => void; onClose: () => void }) {
  const pad = useRef<SignaturePadHandle>(null)
  const [ink, setInk] = useState(false)
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Draw the academy’s signature</DialogTitle>
          <DialogDescription>As the person who signs for the academy signs.</DialogDescription>
        </DialogHeader>
        <SignaturePad ref={pad} onChange={setInk} label="The academy’s signature: draw it" />
        <DialogFooter>
          <Button variant="ghost" onClick={() => pad.current?.clear()}>
            <LuEraser /> Clear
          </Button>
          <Button
            disabled={!ink}
            onClick={() => {
              const png = pad.current?.toPng()
              if (png) onDone(png)
            }}
            data-testid="signer-draw-done"
          >
            Use this signature
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * The contract as a parent sees it, for a made-up student, with the academy's signature: signing it makes the sample
 * PDF a family's signing would (filed nowhere, nobody told).
 */
function PreviewDialog({ text, onClose }: { text: string; onClose: () => void }) {
  const { branchId, actor, timezone } = useBranch()
  const now = useNow()
  const signer = useAcademySigner()
  const doc = useMemo(() => parseContract(text).doc, [text])
  const initial = useMemo(() => prefillValues(doc, { studentName: SAMPLE_STUDENT, signerName: actor.name.includes('@') ? '' : actor.name, email: actor.email }), [doc, actor.name, actor.email])
  async function onSign(request: ContractSignRequest): Promise<SignOutcome> {
    try {
      const pdf = await previewContract({ branchId, studentName: SAMPLE_STUDENT, ...request })
      savePdf(pdf.bytes, pdf.name)
      toast.success('The sample PDF is downloading', { description: 'Nothing was filed and nobody was told.' })
    } catch (e) {
      return { problem: (e as Error).message }
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>The contract, as a parent sees it</DialogTitle>
          <DialogDescription>For a made-up student. Signing it downloads the sample PDF: nothing is filed and nobody is told.</DialogDescription>
        </DialogHeader>
        <ContractSigning
          doc={doc}
          studentFirst="Sample"
          initial={initial}
          today={dateKeyOf(now, timezone)}
          onSign={onSign}
          signLabel="Make the sample PDF"
          academySigner={signer.data ? { name: signer.data.name, title: signer.data.title, image: signer.data.image } : null}
          note={<>A preview: the PDF is marked as a sample on every page.</>}
        />
      </DialogContent>
    </Dialog>
  )
}
