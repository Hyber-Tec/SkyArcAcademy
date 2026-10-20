import { type WriteBatch, deleteField, doc, orderBy, query, serverTimestamp, where, writeBatch } from 'firebase/firestore'
import { useMemo } from 'react'
import { COL, DOC, ROOT } from '@shared/paths'
import type { AuditChange, AuditStamp, WithId } from '@shared/types'
import {
  EMPTY_WEBSITE_CONTENT,
  WEBSITE_ALBUM_LABELS,
  WEBSITE_PLACES,
  type WebsiteAlbum,
  type WebsiteContent,
  type WebsiteHoursLine,
  type WebsiteMessage,
  type WebsiteMessageStatus,
  type WebsitePhoto,
  type WebsitePlace,
  type WebsiteTeamMember,
  type WebsiteTestimonial,
} from '@shared/website/types'
import { useBranch } from '@/branch/BranchProvider'
import { type Actor, addAudit } from '@/lib/audit'
import { db } from '@/lib/firebase'
import { branchCol, branchDocRef, useDoc, useQuery } from '@/lib/firestore'
import { deleteImageFiles } from './images'

/**
 * The CRM's Website page (docs/DECISIONS.md §18): the public website's photos (`websitePhotos`), what its pages show
 * (`public/website`: the photo in each place, the coaches, the families' quotes, the hours and Instagram) and the
 * messages sent from it (`websiteMessages`). Every change writes an audit entry in the same batch.
 */

export type PhotoRecord = Omit<WebsitePhoto, keyof AuditStamp>

export function websiteContentRef(branchId: string) {
  return doc(db, ROOT.branches, branchId, COL.public, DOC.websiteContent)
}

export function newPhotoId(branchId: string): string {
  return doc(branchCol(branchId, COL.websitePhotos)).id
}

/** A short ID for a coach card, a quote or a line of hours. */
export function newItemId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12)
}

export function placeLabel(place: string): string {
  return WEBSITE_PLACES.find((p) => p.id === place)?.label ?? place
}

/** “Range day” or "a photo", for messages and the audit log. */
export function photoName(p: Pick<WebsitePhoto, 'caption'> | null | undefined): string {
  return p?.caption?.trim() ? `“${p.caption.trim()}”` : 'a photo'
}

/** "A, B and C". */
export function joinList(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

/** Where a photo is used on the website: its places, then the coach cards showing it. */
export function photoUses(content: WebsiteContent, photoId: string): string[] {
  return [
    ...WEBSITE_PLACES.filter((p) => content.places[p.id] === photoId).map((p) => p.label),
    ...content.team.filter((m) => m.photoId === photoId).map((m) => `${m.name || 'A coach'}’s card`),
  ]
}

/** Paths on instagram.com that aren't an account. */
const NOT_ACCOUNTS = new Set(['p', 'reel', 'reels', 'stories', 'explore', 'tv', 'accounts', 'direct'])

/** The account's address from what was typed: "@name", "name", "instagram.com/name" or a full address. */
export function instagramUrl(input: string): { url: string; error?: undefined } | { url?: undefined; error: string } {
  const value = input.trim()
  if (!value) return { url: '' }
  let handle = /^@?([A-Za-z0-9._]{1,30})$/.exec(value)?.[1] ?? ''
  if (!handle) {
    try {
      const u = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`)
      if (!/(^|\.)instagram\.com$/i.test(u.hostname)) return { error: 'That isn’t an Instagram address. It looks like https://www.instagram.com/youraccount' }
      handle = u.pathname.split('/').filter(Boolean)[0] ?? ''
    } catch {
      return { error: 'Type the academy’s Instagram account (@youraccount) or its address.' }
    }
  }
  if (NOT_ACCOUNTS.has(handle.toLowerCase())) return { error: 'That’s the address of a post. Use the account’s own address, https://www.instagram.com/youraccount' }
  if (!/^[A-Za-z0-9._]{1,30}$/.test(handle)) return { error: 'Type the academy’s Instagram account (@youraccount) or its address.' }
  return { url: `https://www.instagram.com/${handle}/` }
}

// ---------------------------------------------------------------- live data

export function useWebsiteContent() {
  const { branchId } = useBranch()
  const ref = useMemo(() => websiteContentRef(branchId), [branchId])
  const { data, loading, error } = useDoc<WebsiteContent>(ref)
  const content = useMemo<WebsiteContent>(
    () => ({
      ...EMPTY_WEBSITE_CONTENT,
      ...(data ?? {}),
      places: data?.places ?? {},
      team: data?.team ?? [],
      testimonials: data?.testimonials ?? [],
      hours: data?.hours ?? [],
      instagram: data?.instagram ?? '',
    }),
    [data],
  )
  return { content, loading, error }
}

/** Every photo, hidden ones too, in the gallery's order. */
export function useWebsitePhotos() {
  const { branchId } = useBranch()
  const q = useMemo(() => query(branchCol(branchId, COL.websitePhotos), orderBy('order', 'asc')), [branchId])
  return useQuery<WebsitePhoto>(q, `website-photos-${branchId}`)
}

/** Trial requests and questions, newest first. */
export function useWebsiteMessages() {
  const { branchId } = useBranch()
  const q = useMemo(() => query(branchCol(branchId, COL.websiteMessages), orderBy('createdAt', 'desc')), [branchId])
  return useQuery<WebsiteMessage>(q, `website-messages-${branchId}`)
}

/** How many messages are waiting (the sidebar's count). */
export function useNewWebsiteMessageCount(enabled: boolean): number {
  const { branchId } = useBranch()
  const q = useMemo(() => (enabled ? query(branchCol(branchId, COL.websiteMessages), where('status', '==', 'new')) : null), [branchId, enabled])
  return useQuery<WebsiteMessage>(q, `website-messages-new-${branchId}`).data.length
}

// ---------------------------------------------------------------- writes

function audit(batch: WriteBatch, branchId: string, actor: Actor, action: string, entityType: string, entityId: string, summary: string, changes?: AuditChange[]) {
  addAudit(batch, branchId, actor, { action: `website.${action}`, category: 'website', entityType, entityId, summary, changes })
}

function stamp(actor: Actor) {
  return { updatedAt: serverTimestamp(), updatedBy: actor.email }
}

/**
 * Writes part of `public/website`, merged, so people editing different parts at once don't undo each other. A place
 * is its own field (`places` is a map), so choosing one photo never touches the others.
 */
function setContent(batch: WriteBatch, branchId: string, actor: Actor, patch: Record<string, unknown>) {
  batch.set(websiteContentRef(branchId), { ...patch, ...stamp(actor) }, { merge: true })
}

/** The content changes that forget a photo: its places emptied, the coach cards showing it left without one. */
function forgetPhoto(content: WebsiteContent, photoId: string): Record<string, unknown> | null {
  const places = WEBSITE_PLACES.filter((p) => content.places[p.id] === photoId).map((p) => p.id)
  const team = content.team.some((m) => m.photoId === photoId) ? content.team.map((m) => (m.photoId === photoId ? { ...m, photoId: null } : m)) : null
  if (!places.length && !team) return null
  return {
    ...(places.length ? { places: Object.fromEntries(places.map((p) => [p, deleteField()])) } : {}),
    ...(team ? { team } : {}),
  }
}

// messages

function messageName(m: WebsiteMessage): string {
  return `${m.name || 'Someone'}’s ${m.kind === 'trial' ? 'trial request' : 'question'}`
}

export async function setMessageStatus(branchId: string, actor: Actor, m: WithId<WebsiteMessage>, status: WebsiteMessageStatus) {
  const batch = writeBatch(db)
  batch.update(
    branchDocRef(branchId, COL.websiteMessages, m.id),
    status === 'done' ? { status, doneAt: serverTimestamp(), doneBy: actor.email } : { status, doneAt: null, doneBy: null },
  )
  audit(batch, branchId, actor, status === 'done' ? 'message.done' : 'message.reopen', 'websiteMessage', m.id, `Marked ${messageName(m)} from the website as ${status === 'done' ? 'done' : 'new'}`)
  await batch.commit()
}

export async function deleteMessage(branchId: string, actor: Actor, m: WithId<WebsiteMessage>) {
  const batch = writeBatch(db)
  batch.delete(branchDocRef(branchId, COL.websiteMessages, m.id))
  audit(batch, branchId, actor, 'message.delete', 'websiteMessage', m.id, `Deleted ${messageName(m)} from the website`)
  await batch.commit()
}

// photos

/** "the website’s Training album", or the pages only. */
const albumName = (album: WebsiteAlbum) => (album === 'pages' ? 'the website’s pages only (not the gallery)' : `the website’s ${WEBSITE_ALBUM_LABELS[album]} album`)

/** Saves a new photo's record once its files are up; `place`: also show it there (chosen while it uploaded). */
export async function addPhoto(branchId: string, actor: Actor, id: string, record: PhotoRecord, fileName: string, place: WebsitePlace | null) {
  const batch = writeBatch(db)
  batch.set(branchDocRef(branchId, COL.websitePhotos, id), {
    ...record,
    createdAt: serverTimestamp(),
    createdBy: actor.email,
    ...stamp(actor),
  })
  if (place) setContent(batch, branchId, actor, { places: { [place]: id } })
  const where = place ? ` and chose it for “${placeLabel(place)}”` : ''
  audit(batch, branchId, actor, 'photo.add', 'websitePhoto', id, `Added the photo “${fileName}” to ${albumName(record.album)}${where}`)
  await batch.commit()
}

type PhotoPatch = Partial<Pick<WebsitePhoto, 'caption' | 'alt' | 'album' | 'focus' | 'hidden'>>

export async function updatePhoto(branchId: string, actor: Actor, photo: WithId<WebsitePhoto>, patch: PhotoPatch, summary: string, changes?: AuditChange[]) {
  const batch = writeBatch(db)
  batch.update(branchDocRef(branchId, COL.websitePhotos, photo.id), { ...patch, ...stamp(actor) })
  audit(batch, branchId, actor, 'photo.update', 'websitePhoto', photo.id, summary, changes)
  await batch.commit()
}

export function setPhotoAlbum(branchId: string, actor: Actor, photo: WithId<WebsitePhoto>, album: WebsiteAlbum) {
  return updatePhoto(branchId, actor, photo, { album }, `Moved ${photoName(photo)} to ${albumName(album)}`, [
    { field: 'album', label: 'Album', from: WEBSITE_ALBUM_LABELS[photo.album] ?? photo.album, to: WEBSITE_ALBUM_LABELS[album] },
  ])
}

/**
 * Moves a photo to a new spot in the gallery: it takes an order between its new neighbours, or, when there's no room
 * between them, the whole gallery is numbered again.
 */
export async function movePhoto(branchId: string, actor: Actor, photos: WithId<WebsitePhoto>[], from: number, to: number) {
  if (from === to || to < 0 || to >= photos.length) return
  const moved = photos[from]
  const next = [...photos]
  next.splice(from, 1)
  next.splice(to, 0, moved)
  const before = next[to - 1]?.order
  const after = next[to + 1]?.order
  let order: number | null = null
  if (before === undefined && after !== undefined) order = after - 1
  else if (after === undefined && before !== undefined) order = before + 1
  else if (before !== undefined && after !== undefined && after - before > 1e-6) order = (before + after) / 2
  const batch = writeBatch(db)
  if (order !== null) batch.update(branchDocRef(branchId, COL.websitePhotos, moved.id), { order, ...stamp(actor) })
  else {
    next.forEach((p, i) => {
      if (p.order !== i) batch.update(branchDocRef(branchId, COL.websitePhotos, p.id), { order: i, ...stamp(actor) })
    })
  }
  audit(batch, branchId, actor, 'photo.move', 'websitePhoto', moved.id, `Moved ${photoName(moved)} ${to < from ? 'earlier' : 'later'} in the website’s gallery (to place ${to + 1} of ${photos.length})`)
  await batch.commit()
}

/** Deletes a photo: its record, its use in places and coach cards (one batch), then its files. */
export async function deletePhoto(branchId: string, actor: Actor, photo: WithId<WebsitePhoto>, content: WebsiteContent) {
  const uses = photoUses(content, photo.id)
  const batch = writeBatch(db)
  batch.delete(branchDocRef(branchId, COL.websitePhotos, photo.id))
  const forget = forgetPhoto(content, photo.id)
  if (forget) setContent(batch, branchId, actor, forget)
  audit(batch, branchId, actor, 'photo.delete', 'websitePhoto', photo.id, `Deleted ${photoName(photo)} from the website${uses.length ? ` (it was used for ${uses.join(', ')})` : ''}`)
  await batch.commit()
  await deleteImageFiles(photo).catch((e) => console.warn('A website photo’s files weren’t all deleted', e))
}

/** A photo that never finished uploading is dropped: forget it wherever it was already named (a coach card). */
export async function forgetUnsavedPhoto(branchId: string, actor: Actor, photoId: string, content: WebsiteContent) {
  const forget = forgetPhoto(content, photoId)
  if (!forget) return
  const batch = writeBatch(db)
  setContent(batch, branchId, actor, forget)
  audit(batch, branchId, actor, 'photo.discard', 'websitePhoto', photoId, 'Removed a photo that didn’t upload from the website’s coach cards')
  await batch.commit()
}

// content

export async function setPlacePhoto(branchId: string, actor: Actor, place: WebsitePlace, photo: WithId<WebsitePhoto> | null) {
  const batch = writeBatch(db)
  setContent(batch, branchId, actor, { places: { [place]: photo ? photo.id : deleteField() } })
  audit(
    batch,
    branchId,
    actor,
    photo ? 'place.set' : 'place.clear',
    'websitePlace',
    place,
    photo ? `Chose ${photoName(photo)} for “${placeLabel(place)}” on the website` : `Removed the photo from “${placeLabel(place)}” on the website`,
  )
  await batch.commit()
}

export interface ContentLists {
  team: WebsiteTeamMember[]
  testimonials: WebsiteTestimonial[]
  hours: WebsiteHoursLine[]
}

const LIST_ENTITY: Record<keyof ContentLists, string> = { team: 'websiteCoach', testimonials: 'websiteTestimonial', hours: 'websiteHours' }

/** Saves one list of the website's content (the coaches, the quotes or the hours) as a whole. */
export async function saveContentList<K extends keyof ContentLists>(
  branchId: string,
  actor: Actor,
  field: K,
  list: ContentLists[K],
  log: { action: string; entityId: string; summary: string; changes?: AuditChange[] },
) {
  const batch = writeBatch(db)
  setContent(batch, branchId, actor, { [field]: list })
  audit(batch, branchId, actor, log.action, LIST_ENTITY[field], log.entityId, log.summary, log.changes)
  await batch.commit()
}

export async function saveInstagram(branchId: string, actor: Actor, url: string, before: string) {
  const batch = writeBatch(db)
  setContent(batch, branchId, actor, { instagram: url })
  audit(batch, branchId, actor, 'instagram', 'websiteContent', DOC.websiteContent, url ? 'Set the website’s Instagram link' : 'Removed the website’s Instagram link', [
    { field: 'instagram', label: 'Instagram', from: before || null, to: url || null },
  ])
  await batch.commit()
}

/** Moves an item of a list from one index to another (a copy). */
export function moved<T>(list: T[], from: number, to: number): T[] {
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}
