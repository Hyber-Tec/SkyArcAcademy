import { useDeferredValue, useMemo, useRef, useState } from 'react'
import { LuDownload, LuFileText, LuPencil, LuSend } from 'react-icons/lu'
import { toast } from 'sonner'
import { parseContract } from '@shared/contracts/document'
import { prefillValues } from '@shared/contracts/fill'
import { CONTRACT_TEXT_MAX, type ContractPreviewUse, type ContractSignRequest, type ContractTemplate } from '@shared/contracts/types'
import { dateKeyOf, formatInstant } from '@shared/time'
import type { WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { useConfirm } from '@/components/app/useConfirm'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { useNow } from '@/lib/useNow'
import { cn } from '@/lib/utils'
import { previewContract, publishContract, saveDraft, useContractDraft, useContractTemplates } from './api'
import { type SignOutcome, ContractSigning } from './ContractSigning'
import { savePdf } from './pdf'

const SAMPLE_STUDENT = 'Sample Student'

const when = (t: { toMillis?: () => number } | null | undefined, timezone: string) => (t?.toMillis ? formatInstant(t.toMillis(), timezone, { month: 'short', day: 'numeric', year: 'numeric' }) : 'just now')

/**
 * Settings → Enrollment contract (owners and admins; docs/DECISIONS.md §31 and §33): the academy's contract, written
 * here as text with its parts to fill in marked (shared/src/contracts/document.ts), saved as a draft, tried as a
 * parent would (a sample PDF, filed nowhere) and published. Once it's published, each family fills it in and signs it
 * in the app or on the website before using it, one contract per child; who has signed is below (ContractsList). A
 * newer version is for the signatures from then on: earlier ones stay listed, as contracts already signed (and links
 * already sent) keep theirs. The signed copies go in each student's Contracts folder in the Drive.
 */
export function ContractSettings() {
  const { branchId, timezone } = useBranch()
  const { data: versions, current, loading } = useContractTemplates()
  const draft = useContractDraft()
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState<ContractPreviewUse | null>(null)
  const earlier = versions.filter((t) => !t.current)
  const draftText = draft.data?.text ?? null
  // A draft saved since the last publish (or before the first).
  const waiting = draftText !== null && draftText !== (current?.text ?? null)

  async function sample(use: ContractPreviewUse) {
    setBusy(use)
    try {
      const pdf = await previewContract({ branchId, use })
      savePdf(pdf.bytes, pdf.name)
    } catch (e) {
      toast.error('Couldn’t make the sample PDF', { description: (e as Error).message })
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Enrollment contract</CardTitle>
        <CardDescription>
          The academy’s contract, as families read it in the app and on the website, with the parts they fill in. Once it’s published, each parent fills it in and signs it before using the app, one contract for each of their children. For a family without the app, send a link from the student’s page: it works on any phone, with no account. Each signed contract is a PDF in the student’s Contracts folder, inside their folder in the Drive, which only owners and admins see.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading || draft.loading ? (
          <Skeleton className="h-16 w-full" />
        ) : current ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3" data-testid="contract-current">
            <LuFileText className="size-7 shrink-0 text-brand-text" aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium" title={current.title}>
                {current.title || 'Enrollment contract'}
              </div>
              <div className="text-xs text-muted-foreground">
                Version {current.version}, published {when(current.publishedAt, timezone)} by {current.publishedBy?.name || current.publishedBy?.email || 'the office'}. Families sign it before using the app.
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => void sample('current')} disabled={busy !== null} data-testid="contract-current-sample">
              {busy === 'current' ? <Spinner /> : <LuDownload />} Sample PDF
            </Button>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground" data-testid="contract-not-published">
            Not published yet: families aren’t asked to sign until you publish it.
          </div>
        )}

        {!loading && !draft.loading && waiting ? (
          <p className="text-sm" data-testid="contract-draft-waiting">
            A draft is saved ({when(draft.data?.updatedAt, timezone)}, by {draft.data?.updatedBy?.name || 'the office'}), not published yet.{' '}
            <button type="button" className="font-medium underline underline-offset-2" onClick={() => void sample('draft')} disabled={busy !== null}>
              {busy === 'draft' ? 'Making the sample…' : 'Download it as a sample PDF'}
            </button>
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button onClick={() => setEditing(true)} disabled={loading || draft.loading} data-testid="contract-edit">
            <LuPencil /> {current || draftText ? 'Edit the contract' : 'Write the contract'}
          </Button>
        </div>

        {earlier.length ? (
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">Earlier versions (kept for the contracts signed with them)</div>
            <ul className="divide-y rounded-lg border text-sm">
              {earlier.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate" title={t.title}>
                    {t.title || 'Enrollment contract'} · version {t.version ?? '?'}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Published {when(t.publishedAt, timezone)}
                    {t.replacedAt ? ` · replaced ${when(t.replacedAt, timezone)}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
      {editing ? <ContractEditor start={draftText ?? current?.text ?? ''} saved={draftText} current={current} onClose={() => setEditing(false)} /> : null}
    </Card>
  )
}

/** The text format, in plain words, beside the box where it's written. */
const SYNTAX: [string, string][] = [
  ['# Title', 'The contract’s title, on the first line.'],
  ['## Heading', 'A section’s heading. ### makes a smaller one.'],
  ['- text', 'A bullet. 1. text is a numbered item.'],
  ['> text', 'A line in a box (lines one after the other share the box).'],
  ['**words**', 'Bold words, anywhere in a line.'],
  ['[[choose: Label | Price label]]', 'One option to choose, each on a line under it: - Name | Price | detail | detail…'],
  ['[[check: Label]]', 'Boxes to check (any of them), each on a line under it: - text'],
  ['[[initials: Label]]', 'Where the parent types their initials.'],
  ['[[family: Title]]', 'Fields the parent fills in, each on a line under it: - Label. Add = student, = signer, = date, = phone or = email to fill one in for them (signer: their own name, their typed signature).'],
  ['[[academy: Title]]', 'Fields the academy fills in (the parent sees them as the academy’s).'],
  ['[[sign: Label]]', 'Where the parent signs, with the date (once).'],
  ['[[academy sign: Label]]', 'Where the academy signs, with the date.'],
  ['[[footer: text]]', 'A line at the foot of every page of the PDF.'],
]

/**
 * Writing the contract: its text on one side and, beside it, the contract as a parent sees it (with a made-up
 * student), to fill in and try; trying it makes the sample PDF signing would make. Saving keeps a draft, which only
 * owners and admins see; publishing (once saved, with nothing to fix) makes it the contract families sign.
 */
function ContractEditor({ start, saved, current, onClose }: { start: string; saved: string | null; current: WithId<ContractTemplate> | null; onClose: () => void }) {
  const { branchId, actor, timezone } = useBranch()
  const today = dateKeyOf(useNow(), timezone)
  const [text, setText] = useState(start)
  const [savedText, setSavedText] = useState<string | null>(saved)
  const [pane, setPane] = useState<'write' | 'preview'>('write')
  const [busy, setBusy] = useState<'save' | 'sample' | 'publish' | null>(null)
  const area = useRef<HTMLTextAreaElement>(null)
  const { confirm, dialog } = useConfirm()
  const typed = useDeferredValue(text)
  const { doc } = useMemo(() => parseContract(typed), [typed])
  const now = useMemo(() => parseContract(text), [text])
  const dirty = text !== (savedText ?? '')
  const tooLong = text.length > CONTRACT_TEXT_MAX
  const published = !dirty && current?.text === text
  const initial = useMemo(() => prefillValues(doc, { studentName: SAMPLE_STUDENT, signerName: actor.name, email: actor.email }), [doc, actor.name, actor.email])

  async function close() {
    if (dirty && !(await confirm({ title: 'Close without saving?', description: 'The changes since you last saved the draft will be lost.', confirmLabel: 'Close without saving', destructive: true }))) return
    onClose()
  }

  /** Puts the cursor on a line of the text (a problem's). */
  function goToLine(line: number) {
    const ta = area.current
    if (!ta) return
    setPane('write')
    const lines = text.split('\n')
    const start = lines.slice(0, line - 1).reduce((n, l) => n + l.length + 1, 0)
    ta.focus()
    ta.setSelectionRange(start, start + (lines[line - 1]?.length ?? 0))
    const height = parseFloat(getComputedStyle(ta).lineHeight) || 18
    ta.scrollTop = Math.max(0, (line - 4) * height)
  }

  async function save() {
    if (tooLong) return toast.error('The contract is too long to save.')
    setBusy('save')
    try {
      await saveDraft(branchId, actor, text)
      setSavedText(text)
      toast.success('The draft is saved', { description: 'Families don’t see it until you publish it.' })
    } catch (e) {
      toast.error('Couldn’t save the draft', { description: (e as Error).message })
    } finally {
      setBusy(null)
    }
  }

  async function sample(request?: ContractSignRequest): Promise<SignOutcome> {
    setBusy('sample')
    try {
      const pdf = await previewContract({ branchId, use: 'draft', text, ...(request ? { studentName: SAMPLE_STUDENT, ...request } : {}) })
      savePdf(pdf.bytes, pdf.name)
      toast.success('The sample PDF is downloaded', { description: 'It’s marked as a sample, and nothing was saved.' })
    } catch (e) {
      const f = e as { message?: string; details?: { errors?: Record<string, string> } }
      if (request && f.details?.errors) return { errors: f.details.errors }
      if (request) return { problem: f.message || 'The sample PDF couldn’t be made.' }
      toast.error('Couldn’t make the sample PDF', { description: f.message })
    } finally {
      setBusy(null)
    }
  }

  async function publish() {
    if (dirty || now.problems.length) return
    const ok = await confirm({
      title: 'Publish the contract?',
      description: 'From now on, each parent fills in and signs this contract in the app or on the website before using it, one contract for each of their children. Families who signed an earlier version aren’t asked again.',
      confirmLabel: 'Publish',
    })
    if (!ok) return
    setBusy('publish')
    try {
      const r = await publishContract(branchId)
      toast.success(`Version ${r.version} is published`, { description: 'Families fill it in and sign it before using the app.' })
      onClose()
    } catch (e) {
      toast.error('Couldn’t publish the contract', { description: (e as Error).message })
    } finally {
      setBusy(null)
    }
  }

  const status = tooLong ? 'Too long to save' : dirty ? 'Changes not saved' : published ? 'Saved: this is the published contract' : savedText !== null ? 'Draft saved' : 'Not saved yet'
  return (
    <Dialog open onOpenChange={(o) => !o && void close()}>
      <DialogContent
        className="flex h-[94svh] max-w-[min(1400px,98vw)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(1400px,98vw)]"
        onInteractOutside={(e) => e.preventDefault()}
        data-testid="contract-editor"
      >
        <div className="border-b px-4 py-3 pr-12">
          <DialogTitle className="text-base font-semibold">Edit the enrollment contract</DialogTitle>
          <DialogDescription className="text-xs">Keep the academy’s words as they are; mark the parts families fill in. Beside it is what a parent sees: fill it in and try signing to see the PDF it makes.</DialogDescription>
        </div>
        <div className="flex gap-1.5 border-b px-4 py-2 lg:hidden" role="group" aria-label="Show">
          {(['write', 'preview'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setPane(k)}
              aria-pressed={pane === k}
              className={cn('h-7 rounded-full border px-3 text-xs font-medium', pane === k ? 'border-foreground bg-foreground text-background' : 'text-muted-foreground hover:bg-muted')}
            >
              {k === 'write' ? 'Write' : 'Preview'}
            </button>
          ))}
        </div>
        <div className="grid min-h-0 flex-1 lg:grid-cols-2">
          <div className={cn('flex min-h-0 flex-col gap-3 overflow-y-auto p-4', pane !== 'write' && 'hidden lg:flex')}>
            <Textarea
              ref={area}
              value={text}
              onChange={(e) => setText(e.target.value)}
              spellCheck={false}
              aria-label="The contract’s text"
              className="min-h-[55svh] flex-1 resize-none font-mono text-xs leading-relaxed field-sizing-fixed md:text-xs lg:min-h-0"
              placeholder={'# THE CONTRACT’S TITLE\n\n## 1. FIRST SECTION\nThe academy’s words…\n\n[[sign: Parent Signature]]'}
              data-testid="contract-editor-text"
            />
            {now.problems.length ? (
              <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive" data-testid="contract-problems">
                {now.problems.map((p, i) => (
                  <li key={`${p.line}-${i}`}>
                    <button type="button" className="text-left underline-offset-2 hover:underline" onClick={() => goToLine(p.line)}>
                      Line {p.line}: {p.message}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-emerald-700 dark:text-emerald-400">Nothing to fix.</p>
            )}
            <details className="rounded-lg border bg-muted/30 p-3 text-xs">
              <summary className="cursor-pointer font-medium">How to write it</summary>
              <p className="mt-2 text-muted-foreground">One thing per line. A line that isn’t one of these is a paragraph; empty lines only separate.</p>
              <dl className="mt-2 grid gap-x-3 gap-y-1.5 sm:grid-cols-[auto_1fr]">
                {SYNTAX.map(([code, words]) => (
                  <div key={code} className="contents">
                    <dt>
                      <code className="rounded bg-muted px-1 py-0.5 font-mono whitespace-nowrap">{code}</code>
                    </dt>
                    <dd className="text-muted-foreground">{words}</dd>
                  </div>
                ))}
              </dl>
            </details>
          </div>
          <div className={cn('min-h-0 overflow-y-auto border-t bg-muted/40 p-4 lg:border-t-0 lg:border-l', pane !== 'preview' && 'hidden lg:block')} data-testid="contract-preview">
            {typed.trim() ? (
              <ContractSigning
                doc={doc}
                studentFirst="Sample"
                initial={initial}
                today={today}
                onSign={(request) => sample(request)}
                signLabel="Try signing"
                note={<>Trying it makes the PDF a family’s signing would make, marked as a sample, with what you filled in here. Nothing is saved or sent.</>}
              />
            ) : (
              <p className="rounded-lg border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">The contract shows here as you write it.</p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t px-4 py-3">
          <span className={cn('text-xs', dirty || tooLong ? 'font-medium text-amber-700 dark:text-amber-400' : 'text-muted-foreground')} data-testid="contract-editor-status">
            {status}
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void sample()} disabled={busy !== null || !text.trim()} data-testid="contract-sample-pdf">
              {busy === 'sample' ? <Spinner /> : <LuDownload />} Download a sample PDF
            </Button>
            <Button variant="outline" onClick={() => void save()} disabled={busy !== null || !dirty || tooLong} data-testid="contract-save-draft">
              {busy === 'save' ? <Spinner /> : null} Save draft
            </Button>
            <Button
              onClick={() => void publish()}
              disabled={busy !== null || dirty || published || savedText === null || now.problems.length > 0}
              title={dirty ? 'Save the draft first' : now.problems.length ? 'Fix the problems first' : published ? 'This is the published contract' : undefined}
              data-testid="contract-publish"
            >
              {busy === 'publish' ? <Spinner /> : <LuSend />} Publish…
            </Button>
          </div>
        </div>
      </DialogContent>
      {dialog}
    </Dialog>
  )
}
