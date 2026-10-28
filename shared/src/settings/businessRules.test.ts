import { describe, expect, it } from 'vitest'
import { DEFAULT_BUSINESS_RULES, payModelOn, resolveBusinessRules } from './businessRules'

describe('business rules', () => {
  it('fills gaps with the defaults and clamps nonsense', () => {
    expect(resolveBusinessRules(undefined)).toEqual(DEFAULT_BUSINESS_RULES)
    expect(resolveBusinessRules({ maxStudentsPerCoach: 0 }).maxStudentsPerCoach).toBe(5)
    expect(resolveBusinessRules({ maxStudentsPerCoach: 99 }).maxStudentsPerCoach).toBe(6)
    expect(resolveBusinessRules({ maxStudentsPerCoach: 2 }).maxStudentsPerCoach).toBe(2)
    expect(resolveBusinessRules({ seatsPerClass: 99 }).seatsPerClass).toBe(12)
    expect(payModelOn(resolveBusinessRules(undefined), '2026-10-15')).toBe('hourly')
  })

  it('pays Hourly whatever was stored (the other models are gone)', () => {
    const r = resolveBusinessRules({
      payModels: [
        { model: 'teaching_only', from: '2026-10-15' },
        { model: 'classes', from: '2000-01-01' },
      ],
    })
    expect(r.payModels).toEqual([{ model: 'hourly', from: '2000-01-01' }])
    expect(payModelOn(r, '2026-10-14')).toBe('hourly')
    expect(payModelOn(r, '2026-10-15')).toBe('hourly')
  })
})
