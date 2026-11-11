import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { deflateSync } from 'node:zlib'
import { afterAll, describe, expect, it } from 'vitest'
import { buildSession } from '@shared/scatt/session'
import { SCATT_TARGETS } from '@shared/scatt/trace'
import { decodeTraceBlob, parseKeys, readScattFile } from './read'

// A made-up SCATT file, scrambled with a made-up key: SCATT's real keys are a server secret, never in the code.
const KEY = [0x11, 0x22, 0x33, 0x44, 0x55]
const dir = mkdtempSync(join(tmpdir(), 'scatt-test-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

function checksum(data: Uint8Array): number {
  let crc = 0xffff
  for (const b of data) {
    crc ^= b
    for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0x8408 : crc >>> 1
  }
  return ~crc & 0xffff
}

/** A trace blob as SCATT writes one: samples, compressed, checksummed, then scrambled with `key`. */
function traceBlob(points: [number, number][], key: number[]): Uint8Array {
  const raw = new Uint8Array(15 + points.length * 8)
  const dv = new DataView(raw.buffer)
  dv.setInt32(0, 0x0a0b0c0d, false)
  dv.setInt32(4, 0x10000010, false)
  dv.setInt32(8, 1, false)
  dv.setUint16(12, points.length, false)
  dv.setInt8(14, 0)
  points.forEach(([x, y], i) => {
    dv.setFloat32(15 + i * 8, x, false)
    dv.setFloat32(19 + i * 8, y, false)
  })
  const z = deflateSync(raw)
  const comp = new Uint8Array(4 + z.length)
  new DataView(comp.buffer).setUint32(0, raw.length, false)
  comp.set(z, 4)
  const crc = checksum(comp)
  const plain = new Uint8Array([0x5a, crc >> 8, crc & 0xff, ...comp])
  const blob = new Uint8Array(plain.length + 1)
  blob[0] = 1
  let prev = 0
  for (let i = 1; i < blob.length; i++) {
    blob[i] = plain[i - 1] ^ key[(i - 1) % key.length] ^ prev
    prev = blob[i]
  }
  return blob
}

/** An aim settling on (x, y), SCATT's way (y down), at 120 samples a second. */
const settle = (x: number, y: number): [number, number][] => Array.from({ length: 840 }, (_, i) => (i < 600 ? [20 + ((x - 20) * i) / 600, 20 + ((y - 20) * i) / 600] : [x, y]))

function makeFile(name: string, people: string[]): string {
  const path = join(dir, name)
  const db = new DatabaseSync(path)
  db.exec(`
    CREATE TABLE persons (person_id INTEGER, name TEXT, name_uppercase TEXT);
    CREATE TABLE sessions (session_id INTEGER, uuid TEXT, person_id INTEGER, target_uuid TEXT, distanceUnits INTEGER, distance REAL,
      caliberUnits INTEGER, caliber REAL, timer INTEGER, shot_count INTEGER, match_shot_count INTEGER, sample_rate INTEGER, position INTEGER,
      comments TEXT, properties BLOB, result INTEGER, F INTEGER);
    CREATE TABLE traces (trace_id INTEGER, session_id INTEGER, timer INTEGER, timer_enter INTEGER, data BLOB, properties BLOB);
    CREATE TABLE shots (shot_id INTEGER, trace_id INTEGER, timer INTEGER, trace_offset INTEGER, phase REAL, match_shot INTEGER, deleted INTEGER,
      favorite INTEGER, missed INTEGER, comments TEXT, properties BLOB);
  `)
  const target = Object.keys(SCATT_TARGETS)[0]
  const start = Date.UTC(2026, 9, 31, 14, 0, 0)
  people.forEach((p, i) => {
    db.prepare('INSERT INTO persons VALUES (?, ?, ?)').run(i + 1, p, p.toUpperCase())
    db.prepare('INSERT INTO sessions (session_id, uuid, person_id, target_uuid, distanceUnits, distance, caliberUnits, caliber, timer, sample_rate, position) VALUES (?, ?, ?, ?, 2, 10, 6, 4.5, ?, 120, 3)').run(
      i + 1,
      `{SESSION-${i + 1}}`,
      i + 1,
      target,
      start + i * 3_600_000,
    )
    db.prepare('INSERT INTO traces VALUES (?, ?, ?, ?, ?, NULL)').run(i * 10 + 1, i + 1, start + i * 3_600_000 + 1000, start + i * 3_600_000 + 1500, traceBlob(settle(1, -1), KEY))
    db.prepare('INSERT INTO shots (shot_id, trace_id, timer, trace_offset, match_shot, deleted, missed) VALUES (?, ?, ?, 700, 1, 0, 0)').run(i * 10 + 1, i * 10 + 1, start + i * 3_600_000 + 8000)
    // An aim without a shot: not kept.
    db.prepare('INSERT INTO traces VALUES (?, ?, ?, ?, ?, NULL)').run(i * 10 + 2, i + 1, start + i * 3_600_000 + 9000, 0, traceBlob(settle(5, 5), KEY))
  })
  db.close()
  return path
}

describe('reading a SCATT file', () => {
  it('reads the keys as the secret holds them', () => {
    expect(parseKeys('1122334455, AABB\nnot-hex')).toEqual([KEY, [0xaa, 0xbb]])
    expect(parseKeys('')).toEqual([])
  })

  it('unscrambles a trace with the right key, and refuses every wrong one', () => {
    const blob = traceBlob(
      [
        [1.5, -2.25],
        [3, 4],
      ],
      KEY,
    )
    expect(decodeTraceBlob(blob, [[9, 9, 9], KEY]).map(([x, y]) => [x, y])).toEqual([
      [1.5, -2.25],
      [3, 4],
    ])
    expect(() => decodeTraceBlob(blob, [[9, 9, 9]])).toThrow('can’t be read')
  })

  it('gives every session with its shots, ready for the session builder', () => {
    const file = readScattFile(makeFile('one.scatt-basic', ['Made-up Athlete']), [KEY])
    expect(file.persons).toEqual([{ id: 1, name: 'Made-up Athlete' }])
    expect(file.sessions).toHaveLength(1)
    const s = file.sessions[0]
    expect(s).toMatchObject({ uuid: '{SESSION-1}', personId: 1, sampleRate: 120, position: 3, caliber: 4.5 })
    expect(s.traces).toHaveLength(1)
    expect(s.traces[0].shots).toEqual([{ timer: expect.any(Number), offset: 700, match: true, deleted: false, missed: false }])
    const built = buildSession(s, { studentId: 's1', studentName: 'Made-up Athlete', fileId: 'f1', timeZone: 'UTC' })
    if (!('session' in built)) throw new Error('skipped')
    expect(built.session.position).toBe('standing')
    expect(built.session.shots[0].x).toBeCloseTo(1, 1)
    expect(built.session.shots[0].y).toBeCloseTo(1, 1)
  })

  it('keeps each person apart in a file with several', () => {
    const file = readScattFile(makeFile('two.scatt-basic', ['First Made-up', 'Second Made-up']), [KEY])
    expect(file.persons.map((p) => p.name)).toEqual(['First Made-up', 'Second Made-up'])
    expect(file.sessions.map((s) => s.personId)).toEqual([1, 2])
  })
})
