import { useState } from 'react'
import { LuLock, LuUsers } from 'react-icons/lu'
import { type DriveIndex, accessNote, accessRefusal } from '@shared/drive/model'
import { DRIVE_ACCESS_LABELS, type DriveAccess, accessOf } from '@shared/drive/types'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel, FieldTitle } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Spinner } from '@/components/ui/spinner'

const ACCESS_HELP: Record<DriveAccess, string> = {
  staff: 'Owners, admins and coaches.',
  admins: 'Coaches don’t see it, or anything in it.',
}

/**
 * "Who can see it": everyone on staff, or owners and admins only (admins choose, for a folder; it covers everything in
 * it). An option that can't be chosen says why; the choice says what it covers.
 */
export function AccessDialog({ index, folderId, onSave, onClose }: { index: DriveIndex; folderId: string; onSave: (access: DriveAccess) => Promise<void>; onClose: () => void }) {
  const folder = index.folderOf(folderId)
  const current = accessOf(folder)
  const [choice, setChoice] = useState<DriveAccess>(current)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const refusal = (a: DriveAccess) => (a === current ? null : accessRefusal(index, folderId, a))
  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      await onSave(choice)
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
          <DialogTitle>Who can see “{folder?.name ?? 'this folder'}”?</DialogTitle>
          <DialogDescription>It covers everything in the folder, and what’s added to it later.</DialogDescription>
        </DialogHeader>
        <RadioGroup value={choice} onValueChange={(v) => setChoice(v as DriveAccess)} className="grid gap-2">
          {(['staff', 'admins'] as const).map((a) => {
            const why = refusal(a)
            const Icon = a === 'admins' ? LuLock : LuUsers
            return (
              <FieldLabel key={a} htmlFor={`access-${a}`} className="has-data-[state=checked]:border-primary has-data-[state=checked]:bg-muted/40">
                <Field orientation="horizontal" data-disabled={!!why || undefined}>
                  <FieldContent>
                    <FieldTitle>
                      <Icon className="size-4" aria-hidden /> {DRIVE_ACCESS_LABELS[a]}
                      {a === current ? <span className="text-xs font-normal text-muted-foreground">(now)</span> : null}
                    </FieldTitle>
                    <FieldDescription>{why ?? ACCESS_HELP[a]}</FieldDescription>
                  </FieldContent>
                  <RadioGroupItem value={a} id={`access-${a}`} disabled={!!why} />
                </Field>
              </FieldLabel>
            )
          })}
        </RadioGroup>
        {choice !== current && !refusal(choice) ? <p className="text-sm text-muted-foreground">{accessNote(index, folderId, choice)}</p> : null}
        {error ? <FieldError>{error}</FieldError> : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={choice === current || !!refusal(choice) || busy}>
            {busy ? <Spinner /> : null} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

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
