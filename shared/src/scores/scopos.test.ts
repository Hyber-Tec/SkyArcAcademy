import { describe, expect, it } from 'vitest'
import { athleteId, athleteName, isAcademyTeam, nameKey, onlineResults, type ScoposResultCof, type ScoposShot, seriesOf } from './scopos'

// Made-up results in the results site's shapes: no real athlete's.
const shot = (seq: number, label: string, d: number, at: { X: number; Y: number } | null = { X: 1, Y: 0 }, time = '2026-10-31T14:00:00Z'): ScoposShot => ({
  EventName: `${label[0]}${seq}`,
  StageLabel: label,
  Sequence: seq,
  Score: { D: d, I: Math.floor(d), S: d, X: d >= 10.2 ? 1 : 0 },
  Location: at,
  TimeScored: time,
  BulletDiameter: 4.5,
})

function cof(shots: ScoposShot[], over: Partial<ScoposResultCof> = {}): ScoposResultCof {
  return {
    ResultCOFID: 'r-1',
    MatchID: 'm-1',
    MatchName: 'Made-up October 3P',
    LocalDate: '2026-10-31',
    Status: 'OFFICIAL',
    ScoreConfigName: 'Integer',
    Participant: { GivenName: 'Avery', FamilyName: 'Stone', CompetitorNumber: '100', TeamName: 'ARC 10.9' },
    Shots: Object.fromEntries(shots.map((s) => [String(s.Sequence), s])),
    ...over,
  }
}

describe('results from the results site', () => {
  it('reads each series label', () => {
    expect(seriesOf('KN 2')).toEqual({ position: 'kneeling', n: 2 })
    expect(seriesOf('ST 6')).toEqual({ position: 'standing', n: 6 })
    expect(seriesOf('SI 1')).toBeNull()
    expect(seriesOf('EL 3')).toBeNull()
    expect(seriesOf(undefined)).toBeNull()
  })

  it('makes one result per position, each series in firing order, counted as the match counts', () => {
    const r = cof(
      [
        shot(3, 'KN 2', 9.6, { X: 0, Y: -3 }),
        shot(1, 'KN 1', 10.4, { X: 0.5, Y: 0.5 }, '2026-10-31T13:20:00Z'),
        shot(2, 'KN 1', 8.7, { X: -6, Y: 0 }),
        shot(4, 'PR 1', 10.1),
        shot(5, 'ST 1', 7.9, null),
        shot(6, 'SI 1', 9.9),
      ],
      { EventScores: { Kneeling: { EventName: 'Kneeling', EventType: 'STAGE', Score: { D: 28.7, I: 27, S: 27, X: 1 } } } },
    )
    const out = onlineResults(r, 'America/New_York')
    expect(out.map((p) => p.position)).toEqual(['kneeling', 'prone', 'standing'])
    const kn = out[0]
    // An integer match counts whole numbers; each shot keeps its tenths, as the sheet prints them. Series in order,
    // shots by their firing order.
    expect(kn.decimal).toBe(false)
    expect(kn.series.map((s) => s.n)).toEqual([1, 2])
    expect(kn.series[0].shots.map((s) => s.v)).toEqual([10.4, 8.7])
    expect(kn.series[0].total).toBe(18)
    expect(kn.series[0].shots[0]).toMatchObject({ x: 0.5, y: 0.5, a: 45, r: 2.25, inner: true })
    // The stage's totals as the site gives them; the first shot's time in the academy's zone (13:20 UTC is 9:20 AM, before the clocks go back).
    expect(kn).toMatchObject({ total: 27, wholeTotal: 27, innerTens: 1, shots: 3, timeMin: 9 * 60 + 20, dateKey: '2026-10-31', problems: [] })
    // Without the site's totals, the shots' whole scores add up.
    expect(out[1]).toMatchObject({ total: 10, wholeTotal: 10, innerTens: 0 })
    expect(out[1].series[0]).toMatchObject({ total: 10, shots: [{ v: 10.1 }] })
    // A shot typed in by hand has no place.
    expect(out[2].problems).toEqual(['1 of 1 shots have no place on the target.'])
    expect(out[2].series[0].shots[0]).toEqual({ v: 7.9, a: null, inner: false })
  })

  it('keeps tenths in a decimal match, and says when it isn’t official yet', () => {
    const out = onlineResults(cof([shot(1, 'ST 1', 10.4), shot(2, 'ST 1', 9.8)], { ScoreConfigName: 'Decimal', Status: 'UNOFFICIAL' }), 'America/New_York')
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ decimal: true, total: 20.2, wholeTotal: 19, innerTens: 1 })
    expect(out[0].series[0].shots.map((s) => s.v)).toEqual([10.4, 9.8])
    expect(out[0].problems[0]).toBe('Not official yet on the results site (unofficial): it may still change.')
  })

  it('skips what isn’t a shot', () => {
    const r = cof([shot(1, 'ST 1', 10)])
    r.Shots['…'] = '48 more shots'
    expect(onlineResults(r, 'UTC')[0].shots).toBe(1)
  })

  it('names athletes the same way at every host', () => {
    expect(athleteName({ GivenName: 'Avery', FamilyName: 'Stone' })).toBe('Avery Stone')
    expect(athleteName({ DisplayName: 'Stone, Avery' })).toBe('Avery Stone')
    expect(nameKey('Zoë O’Neil-Park')).toBe('zoeoneilpark')
    expect(athleteId({ DisplayName: 'Stone, Avery' })).toBe(athleteId({ GivenName: 'avery', FamilyName: 'STONE' }))
  })

  it('knows the academy’s teams by its patterns', () => {
    const patterns = ['ARC 10.9*', 'ARC *']
    expect(isAcademyTeam('ARC 10.9', patterns)).toBe(true)
    expect(isAcademyTeam('arc 10.9 P', patterns)).toBe(true)
    expect(isAcademyTeam('ARC  Rangers - Precision', patterns)).toBe(true)
    expect(isAcademyTeam('Arcadia Rifle Club', patterns)).toBe(false)
    expect(isAcademyTeam('', patterns)).toBe(false)
  })
})
