import { describe, expect, it } from 'vitest'
import { showsDemo } from './academy'

const active = { status: 'active' }
const paused = { status: 'disabled' }

describe('which academy someone sees', () => {
  it('shows the demo to its members who are not in the real academy', () => {
    expect(showsDemo(null, active)).toBe(true)
    expect(showsDemo(undefined, active)).toBe(true)
  })

  it('shows the real academy to its members, paused ones too', () => {
    expect(showsDemo(active, active)).toBe(false)
    expect(showsDemo(paused, active)).toBe(false)
    expect(showsDemo(active, null)).toBe(false)
  })

  it('shows the demo to someone in both only when they chose it', () => {
    expect(showsDemo(active, active, true)).toBe(true)
    expect(showsDemo(active, paused, true)).toBe(false)
  })

  it('never shows a demo access that is paused, or none', () => {
    expect(showsDemo(null, paused)).toBe(false)
    expect(showsDemo(null, null)).toBe(false)
  })
})
