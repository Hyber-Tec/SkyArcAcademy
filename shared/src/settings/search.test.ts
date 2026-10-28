import { describe, expect, it } from 'vitest'
import { type Find, searchFinds, searchWords } from './search'

const finds: Find[] = [
  { key: 'a', label: 'Paid time starts this long before a coach’s first class', text: 'paid time starts arrival early clock in pay & time clock', page: 'pay', find: 'timeClock.arrivalMinutes' },
  { key: 'b', label: 'Families can cancel up to', text: 'families can cancel up to cancellation cutoff deadline classes & families', page: 'classes', find: 'schedule.autoConfirm.hoursBefore' },
  { key: 'c', label: 'Closed days and other hours', text: 'closed days and other hours holiday special', page: 'hours', find: 'date-hours' },
  { key: 'd', label: 'Pay & time clock', text: 'pay & time clock payroll', page: 'pay', find: null },
]

describe('finding a setting', () => {
  it('reads words plainly', () => {
    expect(searchWords('Coaches’ Availability!')).toBe('coaches availability')
    expect(searchWords('Café')).toBe('cafe')
  })

  it('finds by any of its words, each word starting a word of theirs', () => {
    expect(searchFinds(finds, 'holiday').map((f) => f.key)).toEqual(['c'])
    expect(searchFinds(finds, 'cancel').map((f) => f.key)).toEqual(['b'])
    expect(searchFinds(finds, 'cancella').map((f) => f.key)).toEqual(['b'])
    expect(searchFinds(finds, 'clock early').map((f) => f.key)).toEqual(['a'])
    expect(searchFinds(finds, 'ancel')).toEqual([])
    expect(searchFinds(finds, '  ')).toEqual([])
  })

  it('lists what’s named so first', () => {
    expect(searchFinds(finds, 'pay').map((f) => f.key)).toEqual(['d', 'a'])
  })
})
