import { DatabaseSync } from 'node:sqlite'
import { inflateSync } from 'node:zlib'
import type { RawSession, RawShot, RawTrace } from '@shared/scatt/session'
import type { RawPoint } from '@shared/scatt/trace'

/**
 * Reads a SCATT session file (`.scatt-basic`, `.scatt-expert`): an SQLite database of people, sessions, traces and
 * shots, each trace's samples compressed and scrambled with SCATT's product key (the fourth meeting's R2 decoded the
 * format; the keys are a server secret, never in the code). Every trace carries SCATT's own checksum, so a wrong key,
 * or a damaged file, is never read as numbers.
 */

/** "43fd15…,e300e9…": SCATT's keys, as the secret holds them (hex, comma between keys). */
export function parseKeys(text: string): number[][] {
  return (text ?? '')
    .split(/[\s,;]+/)
    .map((k) => k.trim().toLowerCase())
    .filter((k) => /^([0-9a-f]{2})+$/.test(k))
    .map((k) => k.match(/../g)!.map((h) => parseInt(h, 16)))
}

/** Qt's checksum (CRC-16/X.25), which SCATT puts before each compressed trace. */
function qChecksum(data: Uint8Array): number {
  let crc = 0xffff
  for (const b of data) {
    crc ^= b
    for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0x8408 : crc >>> 1
  }
  return ~crc & 0xffff
}

/** Each byte XOR the key's byte XOR the scrambled byte before it, after a version byte. */
function unscramble(blob: Uint8Array, key: readonly number[]): Uint8Array {
  const out = new Uint8Array(blob.length - 1)
  let prev = 0
  for (let i = 1; i < blob.length; i++) {
    const c = blob[i]
    out[i - 1] = c ^ key[(i - 1) % key.length] ^ prev
    prev = c
  }
  return out
}

/** A trace's samples: x and y (mm, y down), the rifle's tilt and weight flag when recorded. */
export function decodeTraceBlob(blob: Uint8Array, keys: readonly number[][]): RawPoint[] {
  if (!blob.length || blob[0] !== 1) throw new Error('This SCATT file’s traces are in a version the app doesn’t know.')
  for (const key of keys) {
    const p = unscramble(blob, key)
    const comp = p.subarray(3)
    if (comp.length < 5 || qChecksum(comp) !== ((p[1] << 8) | p[2])) continue
    const size = new DataView(comp.buffer, comp.byteOffset, 4).getUint32(0, false)
    const raw = new Uint8Array(inflateSync(comp.subarray(4)))
    if (raw.length !== size) throw new Error('A trace in this SCATT file is damaged.')
    const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength)
    if (dv.getInt32(0, false) !== 0x0a0b0c0d || dv.getInt32(4, false) !== 0x10000010) throw new Error('A trace in this SCATT file is damaged.')
    const count = dv.getUint16(12, false)
    const flags = dv.getInt8(14)
    const per = 8 + (flags & 1 ? 4 : 0) + (flags & 2 ? 2 : 0)
    if (15 + count * per !== raw.length) throw new Error('A trace in this SCATT file is damaged.')
    const points: RawPoint[] = []
    let o = 15
    for (let k = 0; k < count; k++) {
      const x = dv.getFloat32(o, false)
      const y = dv.getFloat32(o + 4, false)
      o += 8
      let a = Number.NaN
      let w = -1
      if (flags & 1) {
        a = dv.getFloat32(o, false)
        o += 4
      }
      if (flags & 2) {
        w = dv.getInt16(o, false)
        o += 2
      }
      points.push([x, y, a, w])
    }
    return points
  }
  throw new Error('This SCATT file’s traces can’t be read: it may come from a SCATT the app doesn’t know.')
}

type Row = Record<string, unknown>
const num = (v: unknown) => (typeof v === 'bigint' ? Number(v) : Number(v ?? 0))

/** The file's people (their names, to tell whose sessions are whose; never kept) and sessions, with every trace. */
export function readScattFile(path: string, keys: readonly number[][]): { persons: { id: number; name: string }[]; sessions: RawSession[] } {
  const db = new DatabaseSync(path, { readOnly: true })
  try {
    const persons = (db.prepare('SELECT person_id, name FROM persons ORDER BY person_id').all() as Row[]).map((r) => ({ id: num(r.person_id), name: String(r.name ?? '') }))
    const qTraces = db.prepare('SELECT trace_id, timer, timer_enter, data FROM traces WHERE session_id = ? ORDER BY timer')
    const qShots = db.prepare('SELECT timer, trace_offset, match_shot, deleted, missed FROM shots WHERE trace_id = ? ORDER BY timer')
    const sessions: RawSession[] = []
    for (const s of db.prepare('SELECT * FROM sessions ORDER BY timer').all() as Row[]) {
      const traces: RawTrace[] = []
      for (const t of qTraces.all(num(s.session_id)) as Row[]) {
        const shots: RawShot[] = (qShots.all(num(t.trace_id)) as Row[]).map((r) => ({
          timer: num(r.timer),
          offset: num(r.trace_offset),
          match: !!num(r.match_shot),
          deleted: !!num(r.deleted),
          missed: !!num(r.missed),
        }))
        // Aims without a shot aren't kept: nothing to replay.
        if (!shots.length) continue
        traces.push({ timer: num(t.timer), timerEnter: num(t.timer_enter), points: decodeTraceBlob(t.data as Uint8Array, keys), shots })
      }
      sessions.push({
        uuid: String(s.uuid ?? ''),
        personId: num(s.person_id),
        timer: num(s.timer),
        targetUuid: String(s.target_uuid ?? ''),
        caliber: num(s.caliber),
        caliberUnits: num(s.caliberUnits),
        position: num(s.position),
        sampleRate: num(s.sample_rate) || 120,
        traces,
      })
    }
    return { persons, sessions }
  } finally {
    db.close()
  }
}
