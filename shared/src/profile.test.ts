import { describe, expect, it } from 'vitest'
import { cleanDetails, detailChanges, detailsDiffer, detailsOf, notificationAudit, notificationsSummary, prefOn } from './profile'

describe('a coach’s contact details', () => {
  const saved = detailsOf({ phone: '(555) 010-1234', dob: '1990-04-02', address: '' })

  it('reads a record with missing fields as empty', () => {
    expect(detailsOf({})).toEqual({ phone: '', dob: null, address: '' })
    expect(detailsOf(null)).toEqual({ phone: '', dob: null, address: '' })
  })

  it('trims what it saves, and keeps no birth date as null', () => {
    expect(cleanDetails({ phone: ' 555 ', dob: '', address: ' 1 Main St  ' })).toEqual({ phone: '555', dob: null, address: '1 Main St' })
  })

  it('counts only a real change', () => {
    expect(detailsDiffer(saved, { ...saved, phone: '(555) 010-1234 ' })).toBe(false)
    expect(detailsDiffer(saved, { ...saved, address: '   ' })).toBe(false)
    expect(detailsDiffer(saved, { ...saved, dob: null })).toBe(true)
    expect(detailsDiffer(saved, { ...saved, address: '1 Main St' })).toBe(true)
  })

  it('lists the changed fields for the audit log, empty values as none', () => {
    expect(detailChanges(saved, cleanDetails({ phone: '(555) 010-1234', dob: null, address: '1 Main St' }))).toEqual([
      { field: 'dob', label: 'Date of birth', from: '1990-04-02', to: null },
      { field: 'address', label: 'Address', from: null, to: '1 Main St' },
    ])
    expect(detailChanges(saved, saved)).toEqual([])
  })
})

describe('notification switches', () => {
  it('counts a missing switch as on, as the server does', () => {
    expect(prefOn(undefined, 'announcements')).toBe(true)
    expect(prefOn({ sessionCreated: false }, 'sessionCreated')).toBe(false)
    expect(prefOn({ sessionCreated: false }, 'sessionChanged')).toBe(true)
  })

  it('sums them up in a few words', () => {
    expect(notificationsSummary(null)).toBe('All on')
    expect(notificationsSummary({ announcements: false, sessionCreated: false, sessionChanged: false, sessionCanceled: false })).toBe('Off')
    expect(notificationsSummary({ announcements: false, sessionCanceled: false })).toBe('2 of 4 on')
  })

  it('writes the audit entry the website writes', () => {
    expect(notificationAudit('sessionCanceled', false, 'Daniel Reed')).toEqual({
      summary: 'Turned off “Cancellations” notifications for Daniel Reed',
      change: { field: 'notificationPrefs.sessionCanceled', label: 'Cancellations notifications', from: 'On', to: 'Off' },
    })
  })
})
