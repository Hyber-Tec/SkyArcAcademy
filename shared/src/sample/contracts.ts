import { type ContractDocument, academyChecks, familyFields, pricedChoice } from '../contracts/document'
import { type ContractValues, checkPreset, suggestedOption, usDate } from '../contracts/fill'
import type { ContractLinkStatus, SignedVia, SignerRelation } from '../contracts/types'
import type { Lang } from '../i18n'
import { COL, DOC } from '../paths'
import type { RgbaImage } from '../targets/image'
import { type DateKey, addDays, toInstant } from '../time'
import { type SampleDoc, sampleStudentId } from './data'
import { hashSeed, rng } from './random'

/**
 * The sample's enrollment contracts (docs/DECISIONS.md §34 and §35), for showing the demo academy: what the office sent
 * each family over the last weeks and what became of it, on the academy's own contract (the demo's, set up by
 * scripts/contract.ts). The Hwang family's two children (the parent of the demo logins) and a few new students are
 * waiting for a signature, one contract was withdrawn and sent again with its discount fixed, one withdrawn for a
 * student who paused, most were signed (in the app, on the website, or with the link's QR code at the front desk), and
 * an adult signed on paper. The program suggested follows each student's level, and the discount for their own rifle
 * goes to those who bring one. scripts/seed-sample.ts builds the signed PDFs (functions/src/contractPdf.ts), files them
 * in each student's Contracts folder and writes the records; this plans them, with made-up network addresses
 * (documentation ranges) and signatures drawn from the signers' names.
 */

type Via = Exclude<SignedVia, 'paper'>

interface Plan {
  key: string
  state: 'sent' | 'signed' | 'withdrawn' | 'paper'
  /** Days before today it was sent, and signed. */
  sent: number
  signed?: number
  via?: Via
  /** Sent before with a discount checked by mistake, withdrawn, and sent again (Change and send again). */
  resent?: boolean
  /** The family chose another program than the one suggested. */
  other?: boolean
  /** The office also checked the contract's other discount (not the one for one's own rifle). */
  extra?: boolean
  /** The parent read it in Korean (docs/DECISIONS.md §36): its PDF has the Korean too, once the contract has it. */
  ko?: boolean
  note?: string
}

const PLAN: Plan[] = [
  // The demo logins' family: both children's contracts wait, so the parent signs them on the phone or the website.
  { key: 'jiwoo-hwang', state: 'sent', sent: 1 },
  { key: 'minjun-hwang', state: 'sent', sent: 1 },
  { key: 'leo-carter', state: 'sent', sent: 2 },
  { key: 'isla-quinn', state: 'sent', sent: 4, extra: true },
  { key: 'lucas-ortiz', state: 'sent', sent: 3, resent: true },
  { key: 'bella-vance', state: 'withdrawn', sent: 9 },
  { key: 'seoyeon-lim', state: 'signed', sent: 20, signed: 19, via: 'app', ko: true },
  { key: 'isaac-brooks', state: 'signed', sent: 18, signed: 18, via: 'web', other: true },
  { key: 'grace-ellis', state: 'signed', sent: 16, signed: 15, via: 'app' },
  { key: 'sophie-novak', state: 'signed', sent: 14, signed: 14, via: 'link' },
  { key: 'arin-tak', state: 'signed', sent: 12, signed: 11, via: 'app', extra: true },
  { key: 'theo-tak', state: 'signed', sent: 12, signed: 11, via: 'app', extra: true },
  { key: 'elijah-hayes', state: 'signed', sent: 10, signed: 10, via: 'link' },
  { key: 'sua-jang', state: 'signed', sent: 9, signed: 7, via: 'web', ko: true },
  { key: 'samuel-jang', state: 'signed', sent: 9, signed: 7, via: 'web', ko: true },
  { key: 'haneul-moon', state: 'signed', sent: 6, signed: 6, via: 'link', ko: true },
  { key: 'yuna-chung', state: 'signed', sent: 5, signed: 3, via: 'link' },
  { key: 'wesley-hart', state: 'paper', sent: 13, signed: 13, note: 'Signed on paper at the front desk' },
]

/** Where each kind of signing came from: documentation addresses (RFC 5737), and a browser or the app, as recorded. */
const FROM: Record<Via, { ip: string; userAgent: string }> = {
  link: { ip: '203.0.113.', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1' },
  app: { ip: '198.51.100.', userAgent: 'Sky Arc app 1.1.0 (9) on iPhone, iOS 26.1' },
  web: { ip: '192.0.2.', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36' },
}

export interface SampleSigning {
  at: Date
  via: Via
  /** What the family filled in, before the office's boxes are added (checked with `checkContractSigning`). */
  values: ContractValues
  name: string
  relation: SignerRelation
  /** The account that signed (in the app or on the website), or none (the link). */
  signerEmail: string | null
  /** The language they read it in. */
  lang: Lang
  ip: string
  userAgent: string
}

export interface SampleContractSent {
  preset: ContractValues
  at: Date
  status: ContractLinkStatus
  canceledAt: Date | null
  signed: SampleSigning | null
}

export interface SampleContract {
  studentId: string
  studentName: string
  /** The contracts sent to the family, oldest first. */
  sent: SampleContractSent[]
  /** Signed on paper instead: when the office marked it, and its note. */
  paper: { at: Date; note: string } | null
}

export interface SampleContractsInput {
  /** The academy's current contract. */
  doc: ContractDocument
  /** The sample data (shared/src/sample/data.ts): its students, their families and the parents' sign-ins. */
  docs: readonly SampleDoc[]
  academyId: string
  timezone: string
  today: DateKey
  /** Students with a contract already (sent, or signed): left as they are. */
  skip: ReadonlySet<string>
}

type Parent = { name: string; email: string; phone: string }

/** The sample's contracts, by plan, for the students it has and that have none yet. */
export function buildSampleContracts(input: SampleContractsInput): SampleContract[] {
  const { doc, academyId, timezone, today } = input
  const base = `branches/${academyId}`
  const byPath = new Map(input.docs.map((d) => [d.path, d.data]))
  const members = input.docs.filter((d) => d.path.startsWith(`${base}/${COL.members}/`) && d.data.role === 'parent')
  const at = (days: number, minutes: number) => toInstant(addDays(today, -days), minutes, timezone)
  const out: SampleContract[] = []
  for (const p of PLAN) {
    const studentId = sampleStudentId(p.key)
    const student = byPath.get(`${base}/${COL.students}/${studentId}`)
    const profile = byPath.get(`${base}/${COL.students}/${studentId}/private/${DOC.privateProfile}`)
    if (!student || !profile || input.skip.has(studentId)) continue
    const name = String(student.name)
    const parents = ((profile.parents ?? []) as Parent[]).filter((x) => x.name && x.email)
    const preset = presetFor(doc, { level: student.level as string | null, program: student.program as string | null, ownRifle: !student.rifle, extra: !!p.extra })
    const sentAt = at(p.sent, 10 * 60 + Math.floor(rng(hashSeed(studentId, 'sent'))() * 90))
    if (p.state === 'paper') {
      out.push({ studentId, studentName: name, sent: [], paper: { at: at(p.signed ?? p.sent, 16 * 60 + 20), note: p.note ?? '' } })
      continue
    }
    const sent: SampleContractSent[] = []
    if (p.resent) {
      // A discount checked by mistake: withdrawn the next morning, and sent again without it.
      const wrong = withMistake(doc, preset)
      const fixedAt = at(p.sent - 1, 9 * 60 + 40)
      sent.push({ preset: wrong, at: sentAt, status: 'canceled', canceledAt: fixedAt, signed: null })
      sent.push({ preset, at: new Date(fixedAt.getTime() + 60_000), status: 'sent', canceledAt: null, signed: null })
    } else if (p.state === 'withdrawn') {
      sent.push({ preset, at: sentAt, status: 'canceled', canceledAt: at(p.sent - 2, 11 * 60 + 5), signed: null })
    } else if (p.state === 'sent') {
      sent.push({ preset, at: sentAt, status: 'sent', canceledAt: null, signed: null })
    } else {
      const via = p.via ?? 'link'
      // In the app or on the website, the parent who signs in; with the link, the first parent on the record.
      const login = members.find((m) => Array.isArray(m.data.studentIds) && (m.data.studentIds as string[]).includes(studentId))
      const loginEmail = login ? login.path.slice(login.path.lastIndexOf('/') + 1) : null
      const signer = (via !== 'link' && parents.find((x) => x.email === loginEmail)) || parents[0]
      if (!signer) continue
      const signedAt = at(p.signed ?? p.sent, 19 * 60 + Math.floor(rng(hashSeed(studentId, 'signed'))() * 120))
      const where = FROM[via]
      sent.push({
        preset,
        at: sentAt,
        status: 'signed',
        canceledAt: null,
        signed: {
          at: signedAt,
          via,
          values: familyValues(doc, { preset, other: !!p.other, studentName: name, dob: (profile.dob as string | null) ?? null, address: String(profile.address ?? ''), signer, signedOn: addDays(today, -(p.signed ?? p.sent)) }),
          name: signer.name,
          relation: 'parent',
          signerEmail: via === 'link' ? null : signer.email,
          lang: p.ko ? 'ko' : 'en',
          ip: `${where.ip}${10 + (hashSeed(studentId) % 200)}`,
          userAgent: where.userAgent,
        },
      })
    }
    out.push({ studentId, studentName: name, sent, paper: null })
  }
  return out
}

/**
 * What the office sets: the program the student's level names, the discount for their own rifle, and the other one,
 * each where it applies to that program.
 */
function presetFor(doc: ContractDocument, s: { level: string | null; program: string | null; ownRifle: boolean; extra: boolean }): ContractValues {
  const choice = pricedChoice(doc)
  const preset: ContractValues = {}
  const suggested = suggestedOption(doc, [s.level, s.program])
  if (choice && suggested) preset[choice.id] = suggested
  for (const box of academyChecks(doc)) {
    const own = box.options.find((o) => /\bown\b/i.test(o.text))
    const other = box.options.find((o) => o !== own)
    // Never one the program suggested is left out of ("excludes Precision").
    preset[box.id] = box.options.filter((o) => !o.except.includes(suggested) && ((o === own && s.ownRifle) || (o === other && s.extra))).map((o) => o.id)
  }
  const checked = checkPreset(doc, preset)
  return checked.ok ? checked.value : {}
}

/** The same, with a discount the student doesn't get checked too. */
function withMistake(doc: ContractDocument, preset: ContractValues): ContractValues {
  const out = { ...preset }
  for (const box of academyChecks(doc)) {
    const on = Array.isArray(out[box.id]) ? (out[box.id] as string[]) : []
    const wrong = box.options.find((o) => !on.includes(o.id))
    if (wrong) return { ...out, [box.id]: box.options.map((o) => o.id).filter((id) => on.includes(id) || id === wrong.id) }
  }
  return out
}

/** The contract as the family fills it in: the program, every box of theirs, their initials and each field. */
function familyValues(
  doc: ContractDocument,
  f: { preset: ContractValues; other: boolean; studentName: string; dob: string | null; address: string; signer: Parent; signedOn: DateKey },
): ContractValues {
  const values: ContractValues = {}
  const initials = f.signer.name
    .split(/\s+/)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase()
  for (const part of familyFields(doc)) {
    if (part.kind === 'choose') {
      const options = part.block.options
      const suggested = typeof f.preset[part.id] === 'string' ? (f.preset[part.id] as string) : (options[0]?.id ?? '')
      const at = options.findIndex((o) => o.id === suggested)
      values[part.id] = f.other ? (options[(at + 1) % options.length]?.id ?? suggested) : suggested
    } else if (part.kind === 'check') values[part.id] = part.block.options.map((o) => o.id)
    else if (part.kind === 'initials') values[part.id] = initials
    else if (part.fill === 'student') values[part.id] = f.studentName
    else if (part.fill === 'signer') values[part.id] = f.signer.name
    else if (part.fill === 'phone') values[part.id] = f.signer.phone
    else if (part.fill === 'email') values[part.id] = f.signer.email
    else if (part.fill === 'date') values[part.id] = usDate(/birth/i.test(part.label) && f.dob ? f.dob : f.signedOn)
    else values[part.id] = /address/i.test(part.label) && f.address ? f.address : 'None'
  }
  return values
}

/**
 * A made-up signature for a name: a pen's path, one loop or hump a letter along a slanted line, with a stroke under it,
 * drawn in dark ink on white (520 × 150), the same for the same name.
 */
export function drawSampleSignature(name: string, width = 520, height = 150): RgbaImage {
  const r = rng(hashSeed('signature', name))
  const strokes: [number, number][][] = []
  let x = 0
  for (const word of name.split(/\s+/).filter(Boolean)) {
    const pts: [number, number][] = []
    for (const ch of word.replace(/[^A-Za-z]/g, '')) {
      const tall = /[A-Zbdfhklt]/.test(ch)
      const h = (tall ? 0.95 : 0.5) * (0.85 + 0.3 * r())
      const w = (tall ? 0.55 : 0.42) * (0.85 + 0.3 * r())
      for (let t = 0; t <= 1.0001; t += 0.04) {
        // Up and over (a loop for the tall ones), forward along the line.
        pts.push([x + w * t - (tall ? 0.18 * Math.sin(t * Math.PI * 2) : 0), -h * Math.sin(t * Math.PI) * (1 - 0.15 * t)])
      }
      x += w * 0.92
    }
    if (pts.length) strokes.push(pts)
    x += 0.45
  }
  // A stroke under the name, from near its start to past its end.
  const under: [number, number][] = []
  for (let t = 0; t <= 1.0001; t += 0.02) under.push([0.1 + (x + 0.2) * t, 0.32 + 0.12 * Math.sin(t * Math.PI) - 0.1 * t])
  strokes.push(under)
  // Slanted, then fitted into the picture with a margin.
  const slanted = strokes.map((s) => s.map(([px, py]): [number, number] => [px - py * 0.28, py]))
  const all = slanted.flat()
  const [minX, maxX] = [Math.min(...all.map((p) => p[0])), Math.max(...all.map((p) => p[0]))]
  const [minY, maxY] = [Math.min(...all.map((p) => p[1])), Math.max(...all.map((p) => p[1]))]
  const scale = Math.min((width - 40) / (maxX - minX || 1), (height - 30) / (maxY - minY || 1))
  const ink = new Float32Array(width * height)
  const pen = 1.7
  const dot = (cx: number, cy: number) => {
    for (let yy = Math.floor(cy - pen - 1); yy <= Math.ceil(cy + pen + 1); yy++) {
      for (let xx = Math.floor(cx - pen - 1); xx <= Math.ceil(cx + pen + 1); xx++) {
        if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue
        const a = Math.min(1, Math.max(0, pen + 0.5 - Math.hypot(xx - cx, yy - cy)))
        if (a > ink[yy * width + xx]) ink[yy * width + xx] = a
      }
    }
  }
  for (const s of slanted) {
    const px = s.map(([a, b]): [number, number] => [20 + (a - minX) * scale, 15 + (b - minY) * scale])
    for (let i = 1; i < px.length; i++) {
      const [x0, y0] = px[i - 1]
      const [x1, y1] = px[i]
      const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.6))
      for (let k = 0; k <= n; k++) dot(x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n)
    }
  }
  // Dark blue-black ink on white.
  const data = new Uint8ClampedArray(width * height * 4)
  const color = [22, 27, 51]
  for (let i = 0; i < ink.length; i++) {
    for (let c = 0; c < 3; c++) data[i * 4 + c] = Math.round(255 - ink[i] * (255 - color[c]))
    data[i * 4 + 3] = 255
  }
  return { width, height, data }
}
