import { describe, expect, it } from 'vitest'
import { appTargetOf, channelFor } from './push'

describe('where a notification leads in the app', () => {
  it('opens an announcement, or the list', () => {
    expect(appTargetOf('coach/announcements/abc')).toEqual({ screen: 'announcement', announcementId: 'abc' })
    expect(appTargetOf('coach/announcements')).toEqual({ screen: 'announcements' })
  })

  it('opens the session, else the schedule at its date', () => {
    expect(appTargetOf('coach/schedule?date=2026-10-07', { sessionId: 's1', dateKey: '2026-10-07' })).toEqual({ screen: 'schedule', dateKey: '2026-10-07', sessionId: 's1' })
    expect(appTargetOf('coach/schedule?date=2026-10-07')).toEqual({ screen: 'schedule', dateKey: '2026-10-07', sessionId: null })
  })

  it('opens a family’s classes, scores, report or news post', () => {
    expect(appTargetOf('parent/classes?date=2026-11-03', { sessionId: 's2' })).toEqual({ screen: 'classes', dateKey: '2026-11-03', sessionId: 's2' })
    expect(appTargetOf('student/scores?score=e1')).toEqual({ screen: 'scores', evaluationId: 'e1' })
    expect(appTargetOf('report/r9')).toEqual({ screen: 'report', reportId: 'r9' })
    expect(appTargetOf('parent/news/p4')).toEqual({ screen: 'announcement', announcementId: 'p4' })
  })

  it('falls back to Today', () => {
    expect(appTargetOf('')).toEqual({ screen: 'today' })
  })

  it('files pushes under Sessions or Announcements', () => {
    expect(channelFor('announcement_updated')).toBe('announcements')
    expect(channelFor('session_time_changed')).toBe('sessions')
  })
})
