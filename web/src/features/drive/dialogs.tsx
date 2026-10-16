import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'

/** A name to type: a new folder, or renaming a folder or a file (the extension stays selected out). */
export function NameDialog({
  title,
  description,
  label = 'Name',
  initial = '',
  confirmLabel = 'Save',
  maxLength = 120,
  selectStem = false,
  onSubmit,
  onClose,
}: {
  title: string
  description?: string
  label?: string
  initial?: string
  confirmLabel?: string
  maxLength?: number
  /** Select the name without its extension, so typing keeps ".pdf". */
  selectStem?: boolean
  onSubmit: (name: string) => Promise<void>
  onClose: () => void
}) {
  const [name, setName] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submit = async () => {
    if (!name.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      await onSubmit(name)
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <Field data-invalid={!!error}>
          <FieldLabel htmlFor="drive-name">{label}</FieldLabel>
          <Input
            id="drive-name"
            value={name}
            maxLength={maxLength}
            autoFocus
            onFocus={(e) => {
              if (!selectStem) return e.currentTarget.select()
              const dot = e.currentTarget.value.lastIndexOf('.')
              e.currentTarget.setSelectionRange(0, dot > 0 ? dot : e.currentTarget.value.length)
            }}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void submit()}
          />
          {error ? <FieldError>{error}</FieldError> : null}
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={!name.trim() || busy}>
            {busy ? <Spinner /> : null} {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** The files a drop couldn't take, each with its reason. */
export function RefusedDialog({ refused, added, onClose }: { refused: { name: string; reason: string }[]; added: number; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{refused.length === 1 ? 'One file wasn’t added' : `${refused.length} files weren’t added`}</DialogTitle>
          <DialogDescription>
            {added ? `${added} other ${added === 1 ? 'file is' : 'files are'} uploading. ` : ''}The Drive takes PDFs, photos, documents, spreadsheets and short videos, up to 100 MB each.
          </DialogDescription>
        </DialogHeader>
        <ul className="max-h-72 divide-y overflow-y-auto rounded-lg border text-sm">
          {refused.map((r, i) => (
            <li key={`${r.name}-${i}`} className="px-3 py-2">
              <div className="truncate font-medium">{r.name}</div>
              <div className="text-xs text-muted-foreground">{r.reason}</div>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button onClick={onClose}>OK</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
