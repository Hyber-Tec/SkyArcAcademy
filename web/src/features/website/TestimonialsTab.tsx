import { useState } from 'react'
import { LuPencil, LuPlus, LuQuote, LuTrash2, LuTriangleAlert } from 'react-icons/lu'
import { toast } from 'sonner'
import type { WebsiteContent, WebsiteTestimonial } from '@shared/website/types'
import { useBranch } from '@/branch/BranchProvider'
import { useConfirm } from '@/components/app/useConfirm'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { diffChanges } from '@/lib/audit'
import { moved, newItemId, saveContentList } from './api'
import { IconAction, MoveButtons } from './parts'

const LABELS = { quote: 'Quote', who: 'Who said it', topic: 'Topic' }

/** "The first words of the quote…", for the audit log and confirmations. */
function opening(t: Pick<WebsiteTestimonial, 'quote'>): string {
  const words = t.quote.trim().split(/\s+/)
  return `“${words.slice(0, 8).join(' ')}${words.length > 8 ? '…' : ''}”`
}

/** Families' words about the academy, on the website's pages, with their permission. */
export function TestimonialsTab({ content }: { content: WebsiteContent }) {
  const { branchId, actor } = useBranch()
  const list = content.testimonials
  const [editing, setEditing] = useState<WebsiteTestimonial | 'new' | null>(null)
  const { confirm, dialog } = useConfirm()

  const save = (next: WebsiteTestimonial[], log: Parameters<typeof saveContentList>[4]) =>
    saveContentList(branchId, actor, 'testimonials', next, log).catch((e: Error) => {
      toast.error('It couldn’t be saved', { description: e.message })
      throw e
    })

  async function submit(t: WebsiteTestimonial) {
    const old = list.find((x) => x.id === t.id)
    if (old) {
      await save(
        list.map((x) => (x.id === t.id ? t : x)),
        { action: 'testimonial.update', entityId: t.id, summary: `Edited the quote ${opening(t)} on the website`, changes: diffChanges({ ...old }, { ...t }, LABELS) },
      )
      toast.success('The quote is saved.')
    } else {
      await save([...list, t], { action: 'testimonial.add', entityId: t.id, summary: `Added the quote ${opening(t)} (${t.who}) to the website, with the family’s permission` })
      toast.success('The quote is on the website.')
    }
  }

  async function remove(t: WebsiteTestimonial) {
    const ok = await confirm({
      title: 'Delete this quote?',
      description: `${opening(t)} comes off the website.${list.length === 1 ? ' With no quotes left, the website shows its sample quotes, marked Sample.' : ''}`,
      confirmLabel: 'Delete quote',
      destructive: true,
    })
    if (ok) await save(list.filter((x) => x.id !== t.id), { action: 'testimonial.delete', entityId: t.id, summary: `Deleted the quote ${opening(t)} from the website` }).catch(() => undefined)
  }

  const move = (from: number, to: number) =>
    void save(moved(list, from, to), { action: 'testimonial.move', entityId: list[from].id, summary: `Moved the quote ${opening(list[from])} ${to < from ? 'earlier' : 'later'} on the website` }).catch(
      () => undefined,
    )

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Families’ words about the academy, shown on the website in this order. Until you add one, the website shows sample quotes marked Sample.
        </p>
        <Button className="shrink-0" onClick={() => setEditing('new')}>
          <LuPlus /> Add a quote
        </Button>
      </div>
      <Alert role="note">
        <LuTriangleAlert />
        <AlertTitle>Never make up a quote.</AlertTitle>
        <AlertDescription>Add only what a family said or wrote, with their permission, and without a child’s name.</AlertDescription>
      </Alert>
      {list.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <LuQuote />
            </EmptyMedia>
            <EmptyTitle>No quotes yet</EmptyTitle>
            <EmptyDescription>The website shows sample quotes, marked Sample, until the first one is added here.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="space-y-3">
          {list.map((t, i) => (
            <Card key={t.id} className="gap-2 p-4" data-testid="website-testimonial">
              <blockquote className="text-sm leading-relaxed whitespace-pre-line">“{t.quote}”</blockquote>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <p className="min-w-0 flex-1 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{t.who}</span>
                  {t.topic ? ` · ${t.topic}` : ''}
                </p>
                <div className="-my-1 flex shrink-0">
                  <MoveButtons index={i} count={list.length} onMove={(to) => move(i, to)} />
                  <IconAction icon={LuPencil} label="Edit" onClick={() => setEditing(t)} />
                  <IconAction icon={LuTrash2} label="Delete quote" danger onClick={() => void remove(t)} />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      {editing ? <QuoteDialog quote={editing === 'new' ? null : editing} onSave={submit} onClose={() => setEditing(null)} /> : null}
      {dialog}
    </div>
  )
}

function QuoteDialog({ quote, onSave, onClose }: { quote: WebsiteTestimonial | null; onSave: (t: WebsiteTestimonial) => Promise<void>; onClose: () => void }) {
  const [text, setText] = useState(quote?.quote ?? '')
  const [who, setWho] = useState(quote?.who ?? '')
  const [topic, setTopic] = useState(quote?.topic ?? '')
  // Not stored: a new quote can't be saved without it.
  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)
  const ready = text.trim() !== '' && who.trim() !== '' && (quote !== null || agreed)

  async function submit() {
    if (!ready || busy) return
    setBusy(true)
    try {
      // Quotation marks are the website's to add.
      await onSave({ id: quote?.id ?? newItemId(), quote: text.trim().replace(/^["“”]+|["“”]+$/g, '').trim(), who: who.trim(), topic: topic.trim() })
      onClose()
    } catch {
      // Said in a toast; the dialog stays open.
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{quote ? 'Edit the quote' : 'Add a family’s quote'}</DialogTitle>
          <DialogDescription>Their words as they said or wrote them. Never make up a quote.</DialogDescription>
        </DialogHeader>
        <form
          id="quote"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel htmlFor="quote-text">Quote</FieldLabel>
              <Textarea id="quote-text" autoFocus rows={4} maxLength={600} value={text} onChange={(e) => setText(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="quote-who">Who said it</FieldLabel>
              <Input id="quote-who" maxLength={120} value={who} placeholder="Parent of a Development athlete" onChange={(e) => setWho(e.target.value)} />
              <FieldDescription>Without the child’s name.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="quote-topic">
                Topic <span className="font-normal text-muted-foreground">(optional)</span>
              </FieldLabel>
              <Input id="quote-topic" maxLength={60} value={topic} placeholder="The coaches" onChange={(e) => setTopic(e.target.value)} />
            </Field>
            {quote ? null : (
              <Field orientation="horizontal" className="items-start rounded-lg border p-3">
                <Checkbox id="quote-agreed" checked={agreed} onCheckedChange={(v) => setAgreed(v === true)} className="mt-0.5" />
                <FieldLabel htmlFor="quote-agreed" className="font-normal">
                  This family agreed to have their words on the website.
                </FieldLabel>
              </Field>
            )}
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="quote" disabled={!ready || busy}>
            {busy ? <Spinner /> : null} {quote ? 'Save' : 'Add quote'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
