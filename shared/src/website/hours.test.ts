import { describe, expect, it } from 'vitest'
import { weekdayIn, weekdaysOf } from './hours'

describe('the website hours', () => {
  it('reads the days a line names', () => {
    expect(weekdaysOf('Monday')).toEqual([1])
    expect(weekdaysOf('Friday–Sunday').sort()).toEqual([0, 5, 6])
    expect(weekdaysOf('Tue - Thu').sort()).toEqual([2, 3, 4])
    expect(weekdaysOf('Tuesday & Wednesday').sort()).toEqual([2, 3])
    expect(weekdaysOf('Mon to Wed').sort()).toEqual([1, 2, 3])
    expect(weekdaysOf('Weekends')).toEqual([])
  })

  it('knows the weekday in the academy’s time zone', () => {
    // 02:00 UTC on a Tuesday is still Monday evening in Georgia.
    expect(weekdayIn('America/New_York', new Date('2026-10-20T02:00:00Z'))).toBe(1)
    expect(weekdayIn('UTC', new Date('2026-10-20T02:00:00Z'))).toBe(2)
  })
})
