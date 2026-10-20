import { useState } from 'react'
import { LuCheck, LuImage, LuPencil, LuPlus, LuTrash2, LuUsers, LuX } from 'react-icons/lu'
import { toast } from 'sonner'
import type { WithId } from '@shared/types'
import type { WebsiteContent, WebsitePhoto, WebsiteTeamMember } from '@shared/website/types'
import { useBranch } from '@/branch/BranchProvider'
import { useConfirm } from '@/components/app/useConfirm'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { diffChanges } from '@/lib/audit'
import { moved, newItemId, saveContentList } from './api'
import { PhotoChooser } from './PhotoChooser'
import { IconAction, MoveButtons, PhotoSlot } from './parts'
import { startPhotoUploads, usePhotoUploads } from './uploads'

const MAX_CREDENTIALS = 12
const CREDENTIAL_MAX = 160
const LABELS = { name: 'Name', role: 'Role', focus: 'Focus', credentials: 'Credentials' }

/** The About page's coach cards, in this order. */
export function CoachesTab({ photos, content }: { photos: WithId<WebsitePhoto>[]; content: WebsiteContent }) {
  const { branchId, actor } = useBranch()
  const uploads = usePhotoUploads()
  const team = content.team
  const [editing, setEditing] = useState<WebsiteTeamMember | 'new' | null>(null)
  const { confirm, dialog } = useConfirm()

  const save = (list: WebsiteTeamMember[], log: Parameters<typeof saveContentList>[4]) =>
    saveContentList(branchId, actor, 'team', list, log).catch((e: Error) => {
      toast.error('It couldn’t be saved', { description: e.message })
      throw e
    })

  /** A photo as the audit log names it: its caption, or the file still uploading. */
  const photoLabel = (id: string | null, fallback: string) => {
    if (!id) return null
    const photo = photos.find((p) => p.id === id)
    return photo?.caption ? `“${photo.caption}”` : (uploads.find((u) => u.id === id)?.name ?? fallback)
  }

  async function submit(m: WebsiteTeamMember) {
    const old = team.find((x) => x.id === m.id)
    if (old) {
      const changes = diffChanges({ ...old }, { ...m }, LABELS)
      if (old.photoId !== m.photoId) changes.push({ field: 'photoId', label: 'Photo', from: photoLabel(old.photoId, 'a photo'), to: photoLabel(m.photoId, old.photoId ? 'another photo' : 'a photo') })
      await save(
        team.map((x) => (x.id === m.id ? m : x)),
        { action: 'coach.update', entityId: m.id, summary: `Edited ${m.name}’s card on the website’s About page`, changes },
      )
      toast.success(`${m.name}’s card is saved.`)
    } else {
      await save([...team, m], { action: 'coach.add', entityId: m.id, summary: `Added ${m.name}’s card to the website’s About page` })
      toast.success(`${m.name}’s card is on the website.`)
    }
  }

  async function remove(m: WebsiteTeamMember) {
    const ok = await confirm({
      title: `Delete ${m.name}’s card?`,
      description: 'It comes off the website’s About page. Its photo stays in the library.',
      confirmLabel: 'Delete card',
      destructive: true,
    })
    if (ok) await save(team.filter((x) => x.id !== m.id), { action: 'coach.delete', entityId: m.id, summary: `Deleted ${m.name}’s card from the website’s About page` }).catch(() => undefined)
  }

  const move = (from: number, to: number) =>
    void save(moved(team, from, to), {
      action: 'coach.move',
      entityId: team[from].id,
      summary: `Moved ${team[from].name}’s card ${to < from ? 'earlier' : 'later'} on the website’s About page`,
    }).catch(() => undefined)

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="text-sm text-muted-foreground">The coach cards on the website’s About page, in this order: each coach’s photo, role, focus and credentials.</p>
        <Button className="shrink-0" onClick={() => setEditing('new')}>
          <LuPlus /> Add a coach
        </Button>
      </div>
      {team.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <LuUsers />
            </EmptyMedia>
            <EmptyTitle>No coach cards yet</EmptyTitle>
            <EmptyDescription>Add a card for each coach the website should introduce.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {team.map((m, i) => (
            <Card key={m.id} className="flex-row gap-4 p-3 sm:p-4" data-testid="website-coach">
              <PhotoSlot photoId={m.photoId} photos={photos} uploads={uploads} className="aspect-[4/5] w-20 self-start sm:w-24" empty="No photo" />
              <div className="flex min-w-0 flex-1 flex-col">
                <h3 className="truncate text-base font-semibold">{m.name}</h3>
                {m.role ? <p className="text-sm text-muted-foreground">{m.role}</p> : null}
                {m.focus ? <p className="mt-2 w-fit max-w-full rounded-md bg-muted px-2 py-1 text-xs">{m.focus}</p> : null}
                {m.credentials.length ? (
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {m.credentials.slice(0, 3).map((c, k) => (
                      <li key={k} className="flex gap-1.5">
                        <LuCheck className="mt-0.5 size-3 shrink-0" />
                        <span className="line-clamp-2">{c}</span>
                      </li>
                    ))}
                    {m.credentials.length > 3 ? <li className="pl-4.5">and {m.credentials.length - 3} more</li> : null}
                  </ul>
                ) : null}
                <div className="mt-auto flex items-center gap-0.5 pt-2">
                  <Button variant="outline" size="sm" className="mr-auto" onClick={() => setEditing(m)}>
                    <LuPencil /> Edit
                  </Button>
                  <MoveButtons index={i} count={team.length} onMove={(to) => move(i, to)} />
                  <IconAction icon={LuTrash2} label="Delete card" danger onClick={() => void remove(m)} />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      {editing ? <CoachDialog member={editing === 'new' ? null : editing} photos={photos} onSave={submit} onClose={() => setEditing(null)} /> : null}
      {dialog}
    </div>
  )
}

function CoachDialog({
  member,
  photos,
  onSave,
  onClose,
}: {
  member: WebsiteTeamMember | null
  photos: WithId<WebsitePhoto>[]
  onSave: (m: WebsiteTeamMember) => Promise<void>
  onClose: () => void
}) {
  const { branchId, actor } = useBranch()
  const uploads = usePhotoUploads()
  const [draft, setDraft] = useState<WebsiteTeamMember>(() => member ?? { id: newItemId(), name: '', role: '', focus: '', credentials: [], photoId: null })
  const [credentials, setCredentials] = useState(() => (member?.credentials ?? []).join('\n'))
  const [choosing, setChoosing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (patch: Partial<WebsiteTeamMember>) => setDraft((d) => ({ ...d, ...patch }))
  const lines = credentials
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)

  async function submit() {
    if (!draft.name.trim()) return setError('Type the coach’s name.')
    if (lines.length > MAX_CREDENTIALS) return setError(`${MAX_CREDENTIALS} credentials at most.`)
    if (lines.some((l) => l.length > CREDENTIAL_MAX)) return setError(`Each credential fits in ${CREDENTIAL_MAX} characters.`)
    setError(null)
    setBusy(true)
    try {
      await onSave({ ...draft, name: draft.name.trim(), role: draft.role.trim(), focus: draft.focus.trim(), credentials: lines })
      onClose()
    } catch {
      // Said in a toast; the dialog stays open.
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{member ? `Edit ${member.name}’s card` : 'Add a coach'}</DialogTitle>
          <DialogDescription>As it appears on the website’s About page.</DialogDescription>
        </DialogHeader>
        <form
          id="coach-card"
          className="grid gap-4 sm:grid-cols-[8.5rem_minmax(0,1fr)]"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <div className="flex items-end gap-3 sm:flex-col sm:items-stretch">
            <PhotoSlot photoId={draft.photoId} photos={photos} uploads={uploads} className="aspect-[4/5] w-28 sm:w-full" empty="No photo" />
            <div className="flex flex-col gap-1.5">
              <Button type="button" variant="outline" size="sm" onClick={() => setChoosing(true)}>
                <LuImage /> {draft.photoId ? 'Change photo' : 'Choose photo'}
              </Button>
              {draft.photoId ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => set({ photoId: null })}>
                  <LuX /> Remove photo
                </Button>
              ) : null}
            </div>
          </div>
          <FieldGroup className="gap-4">
            <Field data-invalid={!!error && !draft.name.trim()}>
              <FieldLabel htmlFor="coach-name">Name</FieldLabel>
              <Input id="coach-name" autoFocus value={draft.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="coach-role">Role</FieldLabel>
              <Input id="coach-role" value={draft.role} maxLength={80} placeholder="Head Coach" onChange={(e) => set({ role: e.target.value })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="coach-focus">Focus</FieldLabel>
              <Input id="coach-focus" value={draft.focus} maxLength={120} placeholder="Safety · Mental performance" onChange={(e) => set({ focus: e.target.value })} />
              <FieldDescription>One line: what they focus on.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="coach-credentials">Credentials</FieldLabel>
              <Textarea id="coach-credentials" rows={4} value={credentials} placeholder="One per line" onChange={(e) => setCredentials(e.target.value)} />
              <FieldDescription>One per line.</FieldDescription>
            </Field>
            {error ? <FieldError>{error}</FieldError> : null}
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="coach-card" disabled={busy}>
            {busy ? <Spinner /> : null} {member ? 'Save' : 'Add coach'}
          </Button>
        </DialogFooter>
        {choosing ? (
          <PhotoChooser
            title="The coach’s photo"
            description="The About page shows it upright (4:5) beside the card. Choose one from the library, or upload a new one."
            photos={photos}
            current={draft.photoId}
            onChoose={(p) => {
              set({ photoId: p.id })
              setChoosing(false)
            }}
            onUpload={(file) => {
              // A portrait belongs on its card, not in the gallery.
              const [id] = startPhotoUploads(branchId, actor, [file], { album: 'pages', photos })
              set({ photoId: id })
              setChoosing(false)
            }}
            onClose={() => setChoosing(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
