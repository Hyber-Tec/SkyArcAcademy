import { describe, expect, it } from 'vitest'
import { dateText, durationText, josa, langOf, readingLang, timeRangeText, timeText, weekdayText } from './i18n'

describe('who reads Korean', () => {
  it('follows the first language the phone or browser prefers', () => {
    expect(langOf(['ko-KR', 'en-US'])).toBe('ko')
    expect(langOf(['ko'])).toBe('ko')
    expect(langOf(['en-US', 'ko-KR'])).toBe('en')
    expect(langOf(['kok-IN'])).toBe('en')
    expect(langOf([])).toBe('en')
  })

  it('gives parents their choice or their device’s, and English to students and staff', () => {
    expect(readingLang('parent', null, 'ko')).toBe('ko')
    expect(readingLang('parent', 'en', 'ko')).toBe('en')
    expect(readingLang(null, 'ko', 'en')).toBe('ko')
    for (const role of ['student', 'coach', 'admin', 'owner'] as const) expect(readingLang(role, 'ko', 'ko')).toBe('en')
  })
})

describe('particles', () => {
  it('fits Hangul exactly', () => {
    expect(josa('지우', '이/가')).toBe('지우가')
    expect(josa('민준', '이/가')).toBe('민준이')
    expect(josa('수업', '은/는')).toBe('수업은')
    expect(josa('계약서', '을/를')).toBe('계약서를')
    expect(josa('서울', '으로/로')).toBe('서울로')
    expect(josa('학원', '으로/로')).toBe('학원으로')
    expect(josa('코치', '이에요/예요')).toBe('코치예요')
  })

  it('reads an English name as Korean says it', () => {
    expect(josa('Jiwoo', '이/가')).toBe('Jiwoo가')
    expect(josa('Sam', '이/가')).toBe('Sam이')
    expect(josa('John', '은/는')).toBe('John은')
    expect(josa('Grace', '을/를')).toBe('Grace를')
    expect(josa('Paul', '으로/로')).toBe('Paul로')
    expect(josa('Young', '과/와')).toBe('Young과')
    expect(josa('Jiwoo’', '이/가')).toBe('Jiwoo’가')
  })

  it('reads numbers', () => {
    expect(josa('3', '이/가')).toBe('3이')
    expect(josa('2', '이/가')).toBe('2가')
    expect(josa('7', '으로/로')).toBe('7로')
  })
})

describe('dates and times', () => {
  it('writes dates the way Korean apps do', () => {
    expect(dateText('2026-11-05', 'weekdayMedium', 'ko')).toBe('11월 5일 (목)')
    expect(dateText('2026-11-05', 'weekdayLong', 'ko')).toBe('2026년 11월 5일 목요일')
    expect(dateText('2026-11-05', 'long', 'ko')).toBe('2026년 11월 5일')
    expect(dateText('2026-11-05', 'monthYear', 'ko')).toBe('2026년 11월')
    expect(dateText('2026-11-05', 'weekday', 'ko')).toBe('목요일')
    expect(dateText('2026-11-05', 'weekdayMedium', 'en')).toBe('Thu, Nov 5')
    expect(weekdayText('sunday', 'ko', true)).toBe('일')
    expect(weekdayText('sunday', 'en', true)).toBe('Sun')
  })

  it('writes times and ranges', () => {
    expect(timeText(16 * 60 + 30, 'ko')).toBe('오후 4:30')
    expect(timeText(9 * 60, 'ko')).toBe('오전 9:00')
    expect(timeText(12 * 60, 'ko')).toBe('오후 12:00')
    expect(timeText(16 * 60 + 30, 'en')).toBe('4:30 PM')
    expect(timeRangeText(16 * 60 + 30, 20 * 60, 'ko')).toBe('오후 4:30~8:00')
    expect(timeRangeText(11 * 60, 13 * 60, 'ko')).toBe('오전 11:00~오후 1:00')
    expect(timeRangeText(16 * 60 + 30, 20 * 60, 'en')).toBe('4:30 – 8:00 PM')
    expect(durationText(110, 'ko')).toBe('1시간 50분')
    expect(durationText(45, 'ko')).toBe('45분')
    expect(durationText(120, 'en')).toBe('2h')
  })
})
