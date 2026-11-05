import { type Lang, dateText, durationText, timeRangeText, timeText } from '@shared/i18n'
import { type DateKey, type DateKeyStyle, formatDuration, formatMinutes, formatTimeRange } from '@shared/time'

/**
 * Times, dates and lengths in the page's language: English exactly as the app always wrote them ("4:30 PM – 5:30 PM"),
 * Korean the way Korean apps do ("오후 4:30~5:30", "11월 5일 (목)", "1시간"): shared/src/i18n.ts.
 */
export const timeIn = (minutes: number, lang: Lang): string => (lang === 'ko' ? timeText(minutes, 'ko') : formatMinutes(minutes))

export const timeRangeIn = (startMin: number, endMin: number, lang: Lang): string => (lang === 'ko' ? timeRangeText(startMin, endMin, 'ko') : formatTimeRange(startMin, endMin))

export const durationIn = (minutes: number, lang: Lang): string => (lang === 'ko' ? durationText(minutes, 'ko') : formatDuration(minutes))

export const dateIn = (key: DateKey, style: DateKeyStyle, lang: Lang): string => dateText(key, style, lang)

/** "Thursday, November 5" (no year), "11월 5일 목요일". */
export const dayLongIn = (key: DateKey, lang: Lang): string => (lang === 'ko' ? dateText(key, 'weekdayLong', 'ko').replace(/^\d{4}년 /, '') : dateText(key, 'weekdayLong', 'en').replace(/, \d{4}$/, ''))
