import { describe, expect, it } from 'vitest'
import { missingRates, rateName, requiredRates, coachesNeedAdminRate } from './rates'

const only = { payModels: [{ model: 'teaching_only' as const, from: '2000-01-01' }] }
const split = { payModels: [{ model: 'teaching_admin' as const, from: '2000-01-01' }] }

describe('required pay rates', () => {
  it('coaches need an admin rate only while admin time is paid (now or later)', () => {
    expect(coachesNeedAdminRate(only, '2026-10-02')).toBe(false)
    expect(coachesNeedAdminRate(split, '2026-10-02')).toBe(true)
    // Switched to Teaching only last year: no admin rate needed any more.
    expect(coachesNeedAdminRate({ payModels: [...split.payModels, { model: 'teaching_only', from: '2025-01-01' }] }, '2026-10-02')).toBe(false)
    // Switching to Teaching + Admin next month: needed already.
    expect(coachesNeedAdminRate({ payModels: [...only.payModels, { model: 'teaching_admin', from: '2026-11-01' }] }, '2026-10-02')).toBe(true)
  })

  it('by role', () => {
    expect(requiredRates('coach', false)).toEqual(['teaching'])
    expect(requiredRates('coach', true)).toEqual(['teaching', 'admin'])
    expect(requiredRates('admin', true)).toEqual(['admin'])
    expect(requiredRates('owner', true)).toEqual([])
  })

  it('unset and $0 rates are missing', () => {
    expect(missingRates('coach', null, false)).toEqual(['teaching'])
    expect(missingRates('coach', { teaching: 0, admin: 0 }, true)).toEqual(['teaching', 'admin'])
    expect(missingRates('coach', { teaching: 32, admin: 0 }, false)).toEqual([])
    expect(missingRates('coach', { teaching: 32, admin: 0 }, true)).toEqual(['admin'])
    expect(missingRates('admin', { teaching: 0, admin: 22.5 }, true)).toEqual([])
    expect(missingRates('owner', null, true)).toEqual([])
  })

  it('names the rate the way the role sees it', () => {
    expect(rateName('teaching', 'coach')).toBe('teaching rate')
    expect(rateName('admin', 'coach')).toBe('admin rate')
    expect(rateName('admin', 'admin')).toBe('hourly rate')
  })
})
