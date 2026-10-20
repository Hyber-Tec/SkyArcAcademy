import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { type RulesTestEnvironment, assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore'
import { deleteObject, getBytes, ref, uploadBytes } from 'firebase/storage'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

let env: RulesTestEnvironment
const A = 'alpha-academy'
const B = 'beta-academy'
const PHOTOS = `branches/${A}/websitePhotos`
const POSTS = `branches/${A}/websitePosts`
const MESSAGES = `branches/${A}/websiteMessages`
const LIMITS = `branches/${A}/websiteLimits`
const CONTENT = `branches/${A}/public/website`
const ANN = `branches/${A}/announcements`
// A picture already on the website, in Storage.
const SHOWN = `branches/${A}/website/photos/shown/640.webp`

const member = (email: string, role: string, extra: Record<string, unknown> = {}) => ({
  email,
  displayName: email.split('@')[0],
  role,
  status: 'active',
  staffId: null,
  studentId: null,
  studentIds: [],
  restrictions: [],
  uid: null,
  ...extra,
})

const ctx = (email: string) => env.authenticatedContext(email.split('@')[0], { email, email_verified: true })
const db = (email: string) => ctx(email).firestore()
const storage = (email: string) => ctx(email).storage()
const anon = () => env.unauthenticatedContext()

// Everyone but the academy's admins: the public, its coaches and families, and another academy's admin.
const outsiders = () => [anon().firestore(), db('coach@a.test'), db('parent@a.test'), db('student@a.test'), db('admin@b.test')]

// A picture resized for the website (shared/src/website/types.ts), with made-up values.
const image = (folder: string) => ({
  folder,
  format: 'webp',
  widths: [640, 1280],
  width: 1280,
  height: 853,
  color: '#4a4a4a',
  blur: 'data:image/webp;base64,UklGRg==',
})

const photo = (id: string, extra: Record<string, unknown> = {}) => ({
  ...image(`branches/${A}/website/photos/${id}`),
  album: 'training',
  caption: 'Prone practice',
  alt: 'An athlete aiming in the prone position',
  focus: '50% 40%',
  order: 1,
  hidden: false,
  createdAt: serverTimestamp(),
  createdBy: 'admin@a.test',
  updatedAt: serverTimestamp(),
  updatedBy: 'admin@a.test',
  ...extra,
})

const news = () => ({
  slug: 'match-day-ab12cd',
  title: 'Match day',
  html: '<p>Every athlete shot a new best.</p>',
  excerpt: 'Every athlete shot a new best.',
  category: 'results',
  cover: null,
  pinned: false,
  publishedAt: new Date(),
  updatedAt: new Date(),
})

const message = () => ({
  kind: 'contact',
  status: 'new',
  lang: 'en',
  name: 'Pat Example',
  email: 'pat@example.test',
  phone: '',
  topic: 'general',
  message: 'Do you have classes on Sundays?',
  athlete: null,
  days: [],
  createdAt: new Date(),
})

const content = (extra: Record<string, unknown> = {}) => ({
  places: { 'home.hero': 'shown' },
  team: [],
  testimonials: [],
  hours: [{ id: 'h1', days: 'Saturday', time: '9 AM–12 PM', note: '' }],
  instagram: '',
  ...extra,
})

// The same post as the announcement tests (comms.test.ts).
const post = (extra: Record<string, unknown> = {}) => ({
  title: 'Hello',
  contentHtml: '<p>Hi</p>',
  contentText: 'Hi',
  category: 'General',
  audienceType: 'all',
  audienceKeys: [],
  commentsEnabled: true,
  pinned: false,
  pinnedAt: null,
  archived: false,
  notifyRequestedAt: null,
  attachments: [],
  authorKey: 'admin@a.test',
  authorName: 'Admin',
  readCount: 0,
  commentCount: 0,
  ...extra,
})

const onSite = (extra: Record<string, unknown> = {}) => ({ on: true, category: 'results', cover: null, slug: 'match-day-ab12cd', ...extra })

// A few bytes stand for a picture: the rules look only at the type and the size.
const IMAGE = new Uint8Array([0x52, 0x49, 0x46, 0x46])
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46])

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-skyarc',
    firestore: { rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8080 },
    storage: { rules: readFileSync(resolve(__dirname, '../../storage.rules'), 'utf8'), host: '127.0.0.1', port: 9199 },
  })
})

afterAll(async () => {
  await env.cleanup()
})

beforeEach(async () => {
  await env.clearFirestore()
  await env.clearStorage()
  await env.withSecurityRulesDisabled(async (c) => {
    const d = c.firestore()
    for (const b of [A, B]) await setDoc(doc(d, `branches/${b}`), { name: b, status: 'active', timezone: 'America/New_York', settings: {} })
    await setDoc(doc(d, `branches/${A}/members/owner@a.test`), member('owner@a.test', 'owner'))
    await setDoc(doc(d, `branches/${A}/members/admin@a.test`), member('admin@a.test', 'admin'))
    await setDoc(doc(d, `branches/${A}/members/coach@a.test`), member('coach@a.test', 'coach', { staffId: 'c1' }))
    await setDoc(doc(d, `branches/${A}/members/parent@a.test`), member('parent@a.test', 'parent', { studentIds: ['s1'] }))
    await setDoc(doc(d, `branches/${A}/members/student@a.test`), member('student@a.test', 'student', { studentId: 's1' }))
    await setDoc(doc(d, `branches/${B}/members/admin@b.test`), member('admin@b.test', 'admin'))
    await setDoc(doc(d, `${PHOTOS}/shown`), photo('shown'))
    await setDoc(doc(d, `${PHOTOS}/hidden`), photo('hidden', { hidden: true, order: 2 }))
    await setDoc(doc(d, `${POSTS}/p1`), news())
    await setDoc(doc(d, `${MESSAGES}/m1`), message())
    await setDoc(doc(d, `${LIMITS}/k1`), { count: 1, since: new Date() })
    await setDoc(doc(d, CONTENT), content())
    await setDoc(doc(d, `${ANN}/everyone`), post())
  })
  await env.withSecurityRulesDisabled(async (c) => {
    await uploadBytes(ref(c.storage(), SHOWN), IMAGE, { contentType: 'image/webp' })
  })
})

describe('website photos', () => {
  it('anyone reads the photos on the website, with a query that asks only for them', async () => {
    const pub = anon().firestore()
    await assertSucceeds(getDoc(doc(pub, `${PHOTOS}/shown`)))
    await assertSucceeds(getDocs(query(collection(pub, PHOTOS), where('hidden', '==', false))))
    await assertSucceeds(getDocs(query(collection(db('parent@a.test'), PHOTOS), where('hidden', '==', false))))
    await assertFails(getDocs(collection(pub, PHOTOS)))
    await assertFails(getDocs(query(collection(pub, PHOTOS), where('album', '==', 'training'))))
    await assertFails(getDocs(collection(db('coach@a.test'), PHOTOS)))
  })

  it('keeps a hidden photo from everyone but the academy’s admins', async () => {
    for (const d of outsiders()) await assertFails(getDoc(doc(d, `${PHOTOS}/hidden`)))
    await assertFails(getDocs(query(collection(anon().firestore(), PHOTOS), where('hidden', '==', true))))
    for (const who of ['owner@a.test', 'admin@a.test']) {
      await assertSucceeds(getDoc(doc(db(who), `${PHOTOS}/hidden`)))
      await assertSucceeds(getDocs(collection(db(who), PHOTOS)))
    }
  })

  it('admins (owners too) add, change and delete photos', async () => {
    for (const who of ['owner@a.test', 'admin@a.test']) {
      const d = db(who)
      const id = `new-${who.split('@')[0]}`
      await assertSucceeds(setDoc(doc(d, `${PHOTOS}/${id}`), photo(id, { createdBy: who, updatedBy: who })))
      await assertSucceeds(updateDoc(doc(d, `${PHOTOS}/${id}`), { caption: 'Kneeling practice', hidden: true, order: 3, updatedAt: serverTimestamp(), updatedBy: who }))
      await assertSucceeds(deleteDoc(doc(d, `${PHOTOS}/${id}`)))
    }
    await assertSucceeds(updateDoc(doc(db('admin@a.test'), `${PHOTOS}/shown`), { album: 'competition', focus: '50% 30%', format: 'jpeg' }))
    // A photo for the pages only (a banner, a portrait): on the website, not in the gallery.
    await assertSucceeds(updateDoc(doc(db('admin@a.test'), `${PHOTOS}/shown`), { album: 'pages' }))
    await assertSucceeds(deleteDoc(doc(db('admin@a.test'), `${PHOTOS}/hidden`)))
  })

  it('nobody else adds, changes or deletes them', async () => {
    for (const d of outsiders()) {
      await assertFails(setDoc(doc(d, `${PHOTOS}/x`), photo('x')))
      await assertFails(updateDoc(doc(d, `${PHOTOS}/shown`), { caption: 'Changed' }))
      await assertFails(updateDoc(doc(d, `${PHOTOS}/hidden`), { hidden: false }))
      await assertFails(deleteDoc(doc(d, `${PHOTOS}/shown`)))
    }
  })

  it('takes only a photo in the website’s shape, kept in its own folder', async () => {
    const d = db('admin@a.test')
    const bad = [
      { stray: true },
      { folder: `branches/${A}/website/photos/shown` },
      { folder: `branches/${B}/website/photos/p2` },
      { folder: `branches/${A}/drive/p2` },
      { album: 'family' },
      { blur: 'x'.repeat(4001) },
      { format: 'png' },
      { widths: [] },
      { hidden: 'no' },
      { caption: 'x'.repeat(201) },
    ]
    for (const extra of bad) await assertFails(setDoc(doc(d, `${PHOTOS}/p2`), photo('p2', extra)))
    await assertSucceeds(setDoc(doc(d, `${PHOTOS}/p2`), photo('p2', { blur: 'x'.repeat(4000) })))
    await assertFails(updateDoc(doc(d, `${PHOTOS}/p2`), { folder: `branches/${A}/website/photos/shown` }))
    await assertFails(updateDoc(doc(d, `${PHOTOS}/p2`), { studentId: 's1' }))
  })
})

describe('website news', () => {
  it('anyone reads the news; only the server writes it, admins included', async () => {
    const pub = anon().firestore()
    await assertSucceeds(getDoc(doc(pub, `${POSTS}/p1`)))
    await assertSucceeds(getDocs(collection(pub, POSTS)))
    await assertSucceeds(getDocs(query(collection(pub, POSTS), where('slug', '==', 'match-day-ab12cd'))))
    for (const d of [pub, db('owner@a.test'), db('admin@a.test'), db('coach@a.test'), db('parent@a.test')]) {
      await assertFails(setDoc(doc(d, `${POSTS}/p2`), news()))
      await assertFails(updateDoc(doc(d, `${POSTS}/p1`), { title: 'Changed' }))
      await assertFails(deleteDoc(doc(d, `${POSTS}/p1`)))
    }
  })
})

describe('website messages', () => {
  it('admins read and delete them; nobody else reads them', async () => {
    for (const who of ['owner@a.test', 'admin@a.test']) {
      await assertSucceeds(getDoc(doc(db(who), `${MESSAGES}/m1`)))
      await assertSucceeds(getDocs(collection(db(who), MESSAGES)))
      await assertSucceeds(getDocs(query(collection(db(who), MESSAGES), where('status', '==', 'new'))))
    }
    for (const d of outsiders()) {
      await assertFails(getDoc(doc(d, `${MESSAGES}/m1`)))
      await assertFails(getDocs(collection(d, MESSAGES)))
      await assertFails(getDocs(query(collection(d, MESSAGES), where('status', '==', 'new'))))
      await assertFails(deleteDoc(doc(d, `${MESSAGES}/m1`)))
    }
    await assertSucceeds(deleteDoc(doc(db('admin@a.test'), `${MESSAGES}/m1`)))
  })

  it('admins mark one done or new again, and change nothing else', async () => {
    const m = doc(db('admin@a.test'), `${MESSAGES}/m1`)
    await assertSucceeds(updateDoc(m, { status: 'done', doneAt: serverTimestamp(), doneBy: 'admin@a.test' }))
    await assertSucceeds(updateDoc(m, { status: 'new', doneAt: null, doneBy: null }))
    await assertFails(updateDoc(m, { status: 'spam' }))
    await assertFails(updateDoc(m, { email: 'someone@example.test' }))
    await assertFails(updateDoc(m, { status: 'done', message: 'Changed' }))
    for (const d of outsiders()) await assertFails(updateDoc(doc(d, `${MESSAGES}/m1`), { status: 'done' }))
  })

  it('only the server adds one, never the browser, admins included', async () => {
    for (const d of [anon().firestore(), db('owner@a.test'), db('admin@a.test'), db('coach@a.test'), db('parent@a.test')]) {
      await assertFails(setDoc(doc(d, `${MESSAGES}/m2`), message()))
      await assertFails(addDoc(collection(d, MESSAGES), message()))
    }
  })
})

describe('website limits', () => {
  it('are the server’s alone', async () => {
    for (const d of [anon().firestore(), db('owner@a.test'), db('admin@a.test'), db('coach@a.test'), db('parent@a.test')]) {
      await assertFails(getDoc(doc(d, `${LIMITS}/k1`)))
      await assertFails(getDocs(collection(d, LIMITS)))
      await assertFails(setDoc(doc(d, `${LIMITS}/k2`), { count: 0 }))
      await assertFails(updateDoc(doc(d, `${LIMITS}/k1`), { count: 0 }))
      await assertFails(deleteDoc(doc(d, `${LIMITS}/k1`)))
    }
  })
})

describe('website content', () => {
  it('anyone reads it; the academy’s admins write it', async () => {
    await assertSucceeds(getDoc(doc(anon().firestore(), CONTENT)))
    await assertSucceeds(getDoc(doc(db('parent@a.test'), CONTENT)))
    await assertSucceeds(setDoc(doc(db('admin@a.test'), CONTENT), content({ instagram: 'https://www.instagram.com/example' })))
    await assertSucceeds(updateDoc(doc(db('owner@a.test'), CONTENT), { places: { 'about.hero': 'shown' } }))
    for (const d of outsiders()) {
      await assertFails(setDoc(doc(d, CONTENT), content()))
      await assertFails(updateDoc(doc(d, CONTENT), { instagram: '' }))
    }
  })

  it('keeps its shape: known fields, at most 12 lines of hours, an Instagram address', async () => {
    const d = db('admin@a.test')
    await assertSucceeds(setDoc(doc(d, CONTENT), content({ instagram: 'https://www.instagram.com/arc_10.9/' })))
    await assertSucceeds(setDoc(doc(d, CONTENT), { places: { menu: 'shown' }, updatedAt: serverTimestamp(), updatedBy: 'admin@a.test' }, { merge: true }))
    await assertFails(setDoc(doc(d, CONTENT), content({ instagram: 'https://evil.example.test/arc' })))
    await assertFails(setDoc(doc(d, CONTENT), content({ instagram: 'javascript:alert(1)' })))
    await assertFails(setDoc(doc(d, CONTENT), content({ hours: Array.from({ length: 13 }, (_, i) => ({ id: `h${i}`, days: 'Monday', time: '5 PM', note: '' })) })))
    await assertFails(setDoc(doc(d, CONTENT), content({ team: 'Matt' })))
    await assertFails(setDoc(doc(d, CONTENT), content({ html: '<script></script>' })))
    // The academy's profile beside it is unchanged by these checks.
    await assertSucceeds(setDoc(doc(d, `branches/${A}/public/profile`), { name: A, status: 'active', anything: true }, { merge: true }))
  })
})

describe('a post’s cover on the website', () => {
  it('lives in the post’s own folder', async () => {
    const d = db('admin@a.test')
    await assertSucceeds(setDoc(doc(d, `${ANN}/c1`), post({ website: onSite({ cover: image(`branches/${A}/website/posts/c1/k9`) }) })))
    await assertFails(setDoc(doc(d, `${ANN}/c2`), post({ website: onSite({ cover: image(`branches/${A}/website/posts/c1`) }) })))
    await assertFails(setDoc(doc(d, `${ANN}/c3`), post({ website: onSite({ cover: image(`branches/${A}/drive/c3`) }) })))
    await assertFails(setDoc(doc(d, `${ANN}/c4`), post({ website: onSite({ cover: image(`branches/${B}/website/posts/c4`) }) })))
  })
})

describe('announcements on the website', () => {
  it('a post only for the website or for families may leave the staff audience empty', async () => {
    const d = db('admin@a.test')
    const nobody = { audienceType: 'members', audienceKeys: [] }
    await assertSucceeds(setDoc(doc(d, `${ANN}/site-only`), post({ ...nobody, website: onSite() })))
    await assertSucceeds(setDoc(doc(d, `${ANN}/families-only`), post({ ...nobody, families: true })))
    await assertFails(setDoc(doc(d, `${ANN}/nobody`), post(nobody)))
    await assertFails(setDoc(doc(d, `${ANN}/nobody`), post({ ...nobody, families: false, website: onSite({ on: false }) })))
    // Admins still see it; coaches and families don't.
    await assertSucceeds(getDoc(doc(d, `${ANN}/site-only`)))
    await assertFails(getDoc(doc(db('coach@a.test'), `${ANN}/site-only`)))
    await assertFails(getDoc(doc(db('parent@a.test'), `${ANN}/site-only`)))
  })

  it('takes a valid website part, and refuses a bad address, category or field', async () => {
    const d = db('admin@a.test')
    await assertSucceeds(setDoc(doc(d, `${ANN}/a1`), post({ website: onSite() })))
    await assertSucceeds(setDoc(doc(d, `${ANN}/a2`), post({ website: onSite({ on: false, category: 'training' }) })))
    await assertSucceeds(setDoc(doc(d, `${ANN}/a3`), post({ website: onSite({ cover: image(`branches/${A}/website/posts/a3`) }) })))
    const bad = [
      onSite({ slug: 'Match-Day-AB12CD' }),
      onSite({ slug: 'match day ab12cd' }),
      onSite({ slug: 'match-day-' }),
      onSite({ slug: '' }),
      onSite({ slug: 'a'.repeat(81) }),
      onSite({ category: 'news' }),
      onSite({ on: 'yes' }),
      onSite({ cover: 'https://example.test/cover.jpg' }),
      onSite({ html: '<p>Hi</p>' }),
    ]
    for (const website of bad) await assertFails(setDoc(doc(d, `${ANN}/bad`), post({ website })))
    await assertSucceeds(updateDoc(doc(d, `${ANN}/everyone`), { website: onSite() }))
    await assertFails(updateDoc(doc(d, `${ANN}/everyone`), { website: onSite({ slug: 'Match Day' }) }))
    await assertFails(updateDoc(doc(d, `${ANN}/everyone`), { 'website.stray': true }))
  })
})

describe('website pictures in Storage', () => {
  const file = (name: string) => `branches/${A}/website/photos/p2/${name}`

  it('anyone reads them', async () => {
    await assertSucceeds(getBytes(ref(anon().storage(), SHOWN)))
    await assertSucceeds(getBytes(ref(storage('coach@a.test'), SHOWN)))
    await assertSucceeds(getBytes(ref(storage('admin@b.test'), SHOWN)))
  })

  it('admins upload resized pictures: WebP or JPEG, up to 8 MB', async () => {
    const s = storage('admin@a.test')
    await assertSucceeds(uploadBytes(ref(s, file('640.webp')), IMAGE, { contentType: 'image/webp' }))
    await assertSucceeds(uploadBytes(ref(s, file('640.jpg')), IMAGE, { contentType: 'image/jpeg' }))
    await assertSucceeds(uploadBytes(ref(storage('owner@a.test'), `branches/${A}/website/posts/a1/640.webp`), IMAGE, { contentType: 'image/webp' }))
    await assertSucceeds(uploadBytes(ref(s, file('1920.webp')), new Uint8Array(8 * 1024 * 1024), { contentType: 'image/webp' }))
    await assertFails(uploadBytes(ref(s, file('big.webp')), new Uint8Array(8 * 1024 * 1024 + 1), { contentType: 'image/webp' }))
    await assertFails(uploadBytes(ref(s, file('result.pdf')), PDF, { contentType: 'application/pdf' }))
    await assertFails(uploadBytes(ref(s, file('640.png')), IMAGE, { contentType: 'image/png' }))
    await assertFails(uploadBytes(ref(s, file('640.svg')), IMAGE, { contentType: 'image/svg+xml' }))
    // A type that only mentions an allowed one is still a web page.
    await assertFails(uploadBytes(ref(s, file('page.html')), IMAGE, { contentType: 'text/html; x=image/jpeg' }))
  })

  it('nobody else uploads or deletes them; admins delete', async () => {
    for (const s of [anon().storage(), storage('coach@a.test'), storage('parent@a.test'), storage('student@a.test'), storage('admin@b.test')]) {
      await assertFails(uploadBytes(ref(s, file('640.webp')), IMAGE, { contentType: 'image/webp' }))
      await assertFails(uploadBytes(ref(s, SHOWN), IMAGE, { contentType: 'image/webp' }))
      await assertFails(deleteObject(ref(s, SHOWN)))
    }
    await assertSucceeds(deleteObject(ref(storage('admin@a.test'), SHOWN)))
  })
})
