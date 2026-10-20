import { useState } from 'react'
import { LuImage, LuInstagram, LuPencil, LuPlus, LuRotateCw, LuTrash2, LuX } from 'react-icons/lu'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { MESSAGE_LIMITS } from '@shared/website/messages'
import type { WithId } from '@shared/types'
import { WEBSITE_PLACES, type WebsiteContent, type WebsiteHoursLine, type WebsitePhoto } from '@shared/website/types'
import { useBranch } from '@/branch/BranchProvider'
import { useConfirm } from '@/components/app/useConfirm'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Spinner } from '@/components/ui/spinner'
import { instagramUrl, moved, newItemId, photoName, saveContentList, saveInstagram, setPlacePhoto } from './api'
import { PhotoChooser } from './PhotoChooser'
import { IconAction, MoveButtons, PhotoSlot, UploadPreview } from './parts'
import { type PhotoUpload, releasePlace, removePhotoUpload, retryPhotoUpload, startPhotoUploads, usePhotoUploads } from './uploads'

type PlaceDef = (typeof WEBSITE_PLACES)[number]

/** The places, by the page they're on. */
const PAGES = WEBSITE_PLACES.reduce<{ page: string; places: PlaceDef[] }[]>((out, p) => {
  const group = out.find((g) => g.page === p.page)
  if (group) group.places.push(p)
  else out.push({ page: p.page, places: [p] })
  return out
}, [])

/** A line of hours as the trial form sends it ("Monday · 4:30–8 PM") must stay within the server's limit. */
const HOURS_FIELD_MAX = Math.floor((MESSAGE_LIMITS.day - 3) / 2)

/**
 * What the website's pages show besides the gallery: the photo in each place, the hours and the Instagram link. Each
 * change saves at once (the hours and Instagram from their own dialog or field).
 */
export function PagesTab({ photos, content }: { photos: WithId<WebsitePhoto>[]; content: WebsiteContent }) {
  return (
    <div className="max-w-4xl space-y-4">
      <PlacesCard photos={photos} content={content} />
      <HoursCard content={content} />
      <InstagramCard key={content.instagram} content={content} />
    </div>
  )
}

// ---------------------------------------------------------------- places

function PlacesCard({ photos, content }: { photos: WithId<WebsitePhoto>[]; content: WebsiteContent }) {
  const { branchId, actor } = useBranch()
  const uploads = usePhotoUploads()
  const [choosing, setChoosing] = useState<PlaceDef | null>(null)
  const { confirm, dialog } = useConfirm()

  async function choose(place: PlaceDef, photo: WithId<WebsitePhoto>) {
    setChoosing(null)
    releasePlace(place.id)
    try {
      await setPlacePhoto(branchId, actor, place.id, photo)
      toast.success(`The photo for “${place.label}” is chosen.`)
    } catch (e) {
      toast.error('It couldn’t be saved', { description: (e as Error).message })
    }
  }

  function upload(place: PlaceDef, file: File) {
    setChoosing(null)
    releasePlace(place.id)
    startPhotoUploads(branchId, actor, [file], { album: 'training', photos, place: place.id })
  }

  async function clear(place: PlaceDef) {
    const ok = await confirm({
      title: `Remove the photo from “${place.label}”?`,
      description: 'The photo stays in the library. Until you choose another, the website shows a marked placeholder there.',
      confirmLabel: 'Remove photo',
    })
    if (!ok) return
    releasePlace(place.id)
    try {
      await setPlacePhoto(branchId, actor, place.id, null)
    } catch (e) {
      toast.error('It couldn’t be saved', { description: (e as Error).message })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Photos on the pages</CardTitle>
        <CardDescription>The photo shown in each spot of the website. Choose one from the photo library, or upload a new one.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {PAGES.map((g) => (
          <section key={g.page} aria-label={g.page}>
            <h3 className="mb-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{g.page}</h3>
            <div className="divide-y rounded-lg border">
              {g.places.map((place) => (
                <PlaceRow
                  key={place.id}
                  place={place}
                  photoId={content.places[place.id] ?? null}
                  photos={photos}
                  uploads={uploads}
                  incoming={uploads.find((u) => u.place === place.id) ?? null}
                  onChoose={() => setChoosing(place)}
                  onClear={() => void clear(place)}
                />
              ))}
            </div>
          </section>
        ))}
      </CardContent>
      {choosing ? (
        <PhotoChooser
          title={`Photo for “${choosing.label}”`}
          description="Choose a photo from the library, or upload a new one: it’s shown here as soon as it’s up."
          photos={photos}
          current={content.places[choosing.id] ?? null}
          onChoose={(p) => void choose(choosing, p)}
          onUpload={(file) => upload(choosing, file)}
          onClose={() => setChoosing(null)}
        />
      ) : null}
      {dialog}
    </Card>
  )
}

function PlaceRow({
  place,
  photoId,
  photos,
  uploads,
  incoming,
  onChoose,
  onClear,
}: {
  place: PlaceDef
  photoId: string | null
  photos: WithId<WebsitePhoto>[]
  uploads: PhotoUpload[]
  incoming: PhotoUpload | null
  onChoose: () => void
  onClear: () => void
}) {
  const photo = photoId ? (photos.find((p) => p.id === photoId) ?? null) : null
  let status: React.ReactNode
  if (incoming?.stage === 'failed') status = <span className="text-destructive">The new photo didn’t upload: {incoming.error}</span>
  else if (incoming) status = 'Uploading the new photo: it’s shown here once it’s up.'
  else if (photo?.hidden) status = <span className="text-amber-700 dark:text-amber-400">This photo is hidden, so the website shows a placeholder here.</span>
  else if (photo) status = photo.caption ? photoName(photo) : 'A photo from the library'
  else if (photoId) status = 'Its photo was deleted. Choose another.'
  else status = 'No photo yet: the website shows a marked placeholder.'

  return (
    <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center" data-testid={`place-${place.id}`}>
      <div className="aspect-video w-full shrink-0 overflow-hidden rounded-md border bg-muted sm:w-40">
        {incoming ? <UploadPreview upload={incoming} /> : <PhotoSlot photoId={photoId} photos={photos} uploads={uploads} className="size-full rounded-none border-0" empty="Placeholder" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{place.label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{status}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {incoming?.stage === 'failed' ? (
          <>
            {incoming.canRetry ? (
              <Button variant="outline" size="sm" onClick={() => retryPhotoUpload(incoming.id)}>
                <LuRotateCw /> Retry
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" onClick={() => void removePhotoUpload(incoming.id)}>
              <LuX /> Cancel
            </Button>
          </>
        ) : (
          <>
            <Button variant="outline" size="sm" onClick={onChoose}>
              <LuImage /> {photoId ? 'Change' : 'Choose photo'}
            </Button>
            {photoId ? (
              <Button variant="ghost" size="sm" onClick={onClear}>
                <LuX /> Remove
              </Button>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- hours

function hoursLabel(h: Pick<WebsiteHoursLine, 'days' | 'time'>): string {
  return `“${h.days} · ${h.time}”`
}

function HoursCard({ content }: { content: WebsiteContent }) {
  const { branchId, actor } = useBranch()
  const lines = content.hours
  const [editing, setEditing] = useState<WebsiteHoursLine | 'new' | null>(null)
  const { confirm, dialog } = useConfirm()
  const full = lines.length >= MESSAGE_LIMITS.days

  const save = (list: WebsiteHoursLine[], log: { action: string; entityId: string; summary: string }) =>
    saveContentList(branchId, actor, 'hours', list, log).catch((e: Error) => {
      toast.error('It couldn’t be saved', { description: e.message })
      throw e
    })

  async function submit(line: WebsiteHoursLine) {
    const old = lines.find((h) => h.id === line.id)
    if (old) {
      await save(
        lines.map((h) => (h.id === line.id ? line : h)),
        { action: 'hours.update', entityId: line.id, summary: `Changed ${hoursLabel(old)} to ${hoursLabel(line)} in the website’s hours` },
      )
    } else await save([...lines, line], { action: 'hours.add', entityId: line.id, summary: `Added ${hoursLabel(line)} to the website’s hours` })
  }

  async function remove(line: WebsiteHoursLine) {
    const ok = await confirm({
      title: 'Delete this line?',
      description: `${hoursLabel(line)} comes off the website, and families can’t pick it for a trial any more.`,
      confirmLabel: 'Delete line',
      destructive: true,
    })
    if (ok) await save(lines.filter((h) => h.id !== line.id), { action: 'hours.delete', entityId: line.id, summary: `Deleted ${hoursLabel(line)} from the website’s hours` }).catch(() => undefined)
  }

  const move = (from: number, to: number) =>
    void save(moved(lines, from, to), { action: 'hours.move', entityId: lines[from].id, summary: `Moved ${hoursLabel(lines[from])} ${to < from ? 'up' : 'down'} in the website’s hours` }).catch(() => undefined)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Hours on the website</CardTitle>
        <CardDescription>
          The hours the website shows, and the days families pick from when they ask for a trial. This is only what the website says: the schedule’s own opening hours
          stay in{' '}
          <Link to="/admin/settings/schedule" className="underline underline-offset-2 hover:text-foreground">
            Settings
          </Link>
          .
        </CardDescription>
        <CardAction>
          <Button size="sm" variant="outline" disabled={full} onClick={() => setEditing('new')}>
            <LuPlus /> Add a line
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {lines.length === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">No hours yet. Until you add a line, the website leaves the hours out.</p>
        ) : (
          <ul className="divide-y rounded-lg border" aria-label="Hours on the website">
            {lines.map((h, i) => (
              <li key={h.id} className="flex items-center gap-2 py-2 pr-2 pl-3" data-testid="hours-line">
                <div className="grid min-w-0 flex-1 gap-x-4 text-sm sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
                  <span className="truncate font-medium">{h.days}</span>
                  <span className="min-w-0">
                    <span className="tabular-nums">{h.time}</span>
                    {h.note ? <span className="block truncate text-xs text-muted-foreground">{h.note}</span> : null}
                  </span>
                </div>
                <div className="flex shrink-0">
                  <MoveButtons index={i} count={lines.length} onMove={(to) => move(i, to)} />
                  <IconAction icon={LuPencil} label="Edit" onClick={() => setEditing(h)} />
                  <IconAction icon={LuTrash2} label="Delete" danger onClick={() => void remove(h)} />
                </div>
              </li>
            ))}
          </ul>
        )}
        {full ? <p className="mt-2 text-xs text-muted-foreground">{MESSAGE_LIMITS.days} lines at most: the trial form offers each one as a choice.</p> : null}
      </CardContent>
      {editing ? <HoursLineDialog line={editing === 'new' ? null : editing} onSave={submit} onClose={() => setEditing(null)} /> : null}
      {dialog}
    </Card>
  )
}

function HoursLineDialog({ line, onSave, onClose }: { line: WebsiteHoursLine | null; onSave: (line: WebsiteHoursLine) => Promise<void>; onClose: () => void }) {
  const [days, setDays] = useState(line?.days ?? '')
  const [time, setTime] = useState(line?.time ?? '')
  const [note, setNote] = useState(line?.note ?? '')
  const [busy, setBusy] = useState(false)
  const ready = days.trim() !== '' && time.trim() !== ''

  async function submit() {
    if (!ready || busy) return
    setBusy(true)
    try {
      await onSave({ id: line?.id ?? newItemId(), days: days.trim(), time: time.trim(), note: note.trim() })
      onClose()
    } catch {
      // Said in a toast; the dialog stays open.
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{line ? 'Edit the line' : 'Add a line of hours'}</DialogTitle>
          <DialogDescription>As the website shows it: “Monday” and “4:30–8 PM”, or “Friday–Sunday” and “By arrangement”.</DialogDescription>
        </DialogHeader>
        <form
          id="hours-line"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <FieldGroup className="gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="hours-days">Days</FieldLabel>
                <Input id="hours-days" autoFocus value={days} maxLength={HOURS_FIELD_MAX} placeholder="Monday" onChange={(e) => setDays(e.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="hours-time">Time</FieldLabel>
                <Input id="hours-time" value={time} maxLength={HOURS_FIELD_MAX} placeholder="4:30–8 PM" onChange={(e) => setTime(e.target.value)} />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="hours-note">
                Note <span className="font-normal text-muted-foreground">(optional)</span>
              </FieldLabel>
              <Input id="hours-note" value={note} maxLength={100} placeholder="Open range and private coaching" onChange={(e) => setNote(e.target.value)} />
            </Field>
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="hours-line" disabled={!ready || busy}>
            {busy ? <Spinner /> : null} {line ? 'Save' : 'Add line'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------- Instagram

function InstagramCard({ content }: { content: WebsiteContent }) {
  const { branchId, actor } = useBranch()
  const [value, setValue] = useState(content.instagram)
  const [busy, setBusy] = useState(false)
  const [tried, setTried] = useState(false)
  const parsed = instagramUrl(value)
  const changed = (parsed.url ?? value.trim()) !== content.instagram

  async function save(url: string) {
    setBusy(true)
    try {
      await saveInstagram(branchId, actor, url, content.instagram)
      toast.success(url ? 'The Instagram link is saved.' : 'The Instagram link is removed from the website.')
    } catch (e) {
      toast.error('It couldn’t be saved', { description: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Instagram</CardTitle>
        <CardDescription>The academy’s Instagram account, linked on the website’s Contact page and at the bottom of every page. Leave it empty to leave it out.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault()
            setTried(true)
            if (parsed.url !== undefined && changed) void save(parsed.url)
          }}
        >
          <Field data-invalid={tried && !!parsed.error} className="min-w-0 flex-1">
            <InputGroup>
              <InputGroupAddon>
                <LuInstagram />
              </InputGroupAddon>
              <InputGroupInput
                aria-label="Instagram account"
                aria-invalid={tried && !!parsed.error}
                value={value}
                maxLength={200}
                placeholder="https://www.instagram.com/youraccount"
                onChange={(e) => {
                  setValue(e.target.value)
                  setTried(false)
                }}
              />
            </InputGroup>
            {tried && parsed.error ? <FieldError>{parsed.error}</FieldError> : null}
            {!parsed.error && parsed.url && parsed.url !== value.trim() ? <FieldDescription>It’ll link to {parsed.url}</FieldDescription> : null}
          </Field>
          <div className="flex gap-2">
            <Button type="submit" disabled={busy || !changed}>
              {busy ? <Spinner /> : null} Save
            </Button>
            {content.instagram ? (
              <Button type="button" variant="ghost" disabled={busy} onClick={() => void save('')}>
                Remove
              </Button>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
