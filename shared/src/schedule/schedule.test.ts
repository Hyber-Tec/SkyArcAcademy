import { describe, expect, it } from 'vitest'
import { occursOn, layoutEventLanes, type ScheduleEvent } from './events'
import { layoutLanes, peakConcurrency, visibleLaneCount } from './lanes'

const s = (id: string, startMin: number, endMin: number, extra: Partial<{ coachId: string; status: 'pending' | 'canceled' }> = {}) => ({
  id,
  startMin,
  endMin,
  coachId: extra.coachId ?? 't1',
  status: extra.status ?? ('pending' as const),
})

describe('lanes', () => {
  it('stacks overlapping sessions into lanes', () => {
    const lanes = layoutLanes([s('a', 960, 1070), s('b', 960, 1070), s('c', 1080, 1190), s('d', 1000, 1100)], 3)
    expect(lanes.get('a')).toBe(0)
    expect(lanes.get('b')).toBe(1)
    expect(lanes.get('d')).toBe(2)
    expect(lanes.get('c')).toBe(0)
    expect(visibleLaneCount(lanes, 3, true)).toBe(3)
    expect(visibleLaneCount(new Map(), 3, true)).toBe(1)
  })

  it('counts peak concurrency; back-to-back does not overlap', () => {
    const items = [s('a', 960, 1070), s('b', 1070, 1180), s('c', 1000, 1100)]
    expect(peakConcurrency(items, 960, 1180)).toBe(2)
    expect(peakConcurrency(items, 960, 1180, 'c')).toBe(1)
  })
})

describe('events', () => {
  const ev = (recurrence: ScheduleEvent['recurrence']): ScheduleEvent => ({ title: 'X', dateKey: '2026-09-30', startMin: 840, endMin: 900, notes: '', recurrence })
  it('handles one-off and weekly events', () => {
    expect(occursOn(ev(null), '2026-09-30')).toBe(true)
    expect(occursOn(ev(null), '2026-10-01')).toBe(false)
    const weekly = ev({ frequency: 'weekly', interval: 1, weekdays: ['wednesday', 'friday'], monthDay: null, ends: { type: 'never', endDate: null, occurrences: null } })
    expect(occursOn(weekly, '2026-10-02')).toBe(true)
    expect(occursOn(weekly, '2026-10-01')).toBe(false)
    expect(occursOn(weekly, '2026-09-25')).toBe(false)
  })
  it('respects intervals and end limits', () => {
    const biweekly = ev({ frequency: 'weekly', interval: 2, weekdays: [], monthDay: null, ends: { type: 'after', endDate: null, occurrences: 2 } })
    expect(occursOn(biweekly, '2026-10-07')).toBe(false)
    expect(occursOn(biweekly, '2026-10-14')).toBe(true)
    expect(occursOn(biweekly, '2026-10-28')).toBe(false)
    const monthly = ev({ frequency: 'monthly', interval: 1, weekdays: [], monthDay: null, ends: { type: 'on', endDate: '2026-11-30', occurrences: null } })
    expect(occursOn(monthly, '2026-10-30')).toBe(true)
    expect(occursOn(monthly, '2026-12-30')).toBe(false)
  })
  it('lays out event lanes', () => {
    const lanes = layoutEventLanes([
      { id: 'a', startMin: 840, endMin: 900 },
      { id: 'b', startMin: 860, endMin: 920 },
      { id: 'c', startMin: 900, endMin: 960 },
    ])
    expect([lanes.get('a'), lanes.get('b'), lanes.get('c')]).toEqual([0, 1, 0])
  })
})

describe('scheduled hours', () => {
  it('counts overlapping students once (TE worked example: 3.75h)', async () => {
    const { unionMinutes } = await import('./lanes')
    expect(unionMinutes([s('a', 960, 1070), s('b', 960, 1070), s('c', 960, 1070), s('d', 1080, 1195)])).toBe(225)
  })
})
