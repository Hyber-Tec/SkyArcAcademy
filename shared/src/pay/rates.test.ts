import { describe, expect, it } from 'vitest'
import { coachesNeedAdminRate, hourlyRate, missingRates, needsRate, rateMissing, rateName, rateRecord, requiredRates } from './rates'

describe('one hourly rate', () => {
  it('reads the rate, or an older admin record’s', () => {
    expect(hourlyRate({ teaching: 28, admin: 28 })).toBe(28)
    expect(hourlyRate({ teaching: 0, admin: 22.5 })).toBe(22.5)
    expect(hourlyRate({ teaching: 30, admin: 15 })).toBe(30)
    expect(hourlyRate(null)).toBe(0)
    expect(hourlyRate({ teaching: Number.NaN, admin: 0 })).toBe(0)
  })

  it('saves it in both until the phone app’s update', () => {
    expect(rateRecord(26)).toEqual({ teaching: 26, admin: 26 })
  })

  it('is needed by coaches and admins, so their time is never paid $0', () => {
    expect(needsRate('coach')).toBe(true)
    expect(needsRate('admin')).toBe(true)
    expect(needsRate('owner')).toBe(false)
    expect(rateMissing('coach', null)).toBe(true)
    expect(rateMissing('coach', { teaching: 0, admin: 0 })).toBe(true)
    expect(rateMissing('admin', { teaching: 0, admin: 22.5 })).toBe(false)
    expect(rateMissing('owner', null)).toBe(false)
  })

  it('keeps the phone’s older calls working', () => {
    expect(coachesNeedAdminRate({ payModels: [] }, '2026-10-28')).toBe(false)
    expect(requiredRates('coach', true)).toEqual(['teaching'])
    expect(missingRates('admin', { teaching: 0, admin: 0 }, true)).toEqual(['teaching'])
    expect(missingRates('coach', { teaching: 30, admin: 0 }, true)).toEqual([])
    expect(rateName('admin', 'coach')).toBe('hourly rate')
  })
})
